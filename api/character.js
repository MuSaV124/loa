const API_VERSION = '5.6.3';
const CDN_PREFIX = 'https://cdn-lostark.game.onstove.com/';
const CHARACTER_CACHE_TTL_MS = 60 * 1000;
const CHARACTER_CACHE_MAX_SIZE = 80;
const characterCache = new Map();
const characterInflight = new Map();

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  try {
    const name = String(req.query.name || '').trim();

    if (!name) return res.status(400).json({ error: '캐릭터명을 입력하세요.' });

    const apiKey = process.env.LOSTARK_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Vercel 환경변수 LOSTARK_API_KEY가 없습니다.' });

    const cacheKey = name.toLowerCase();
    const cached = characterCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.status(200).json({ ...cached.data, cached: true });
    }

    let pending = characterInflight.get(cacheKey);
    if (!pending) {
      pending = loadCharacterData(name, apiKey).finally(() => characterInflight.delete(cacheKey));
      characterInflight.set(cacheKey, pending);
    }

    const data = await pending;
    setCharacterCache(cacheKey, data);
    return res.status(200).json({ ...data, cached: false });
  } catch (error) {
    const message = error.name === 'AbortError' ? 'Open API 응답 시간이 길어서 중단했습니다.' : error.message;
    if (error.status) return res.status(error.status).json({ error: message, status: error.status, body: error.body });
    return res.status(500).json({ error: '서버 함수 오류', message });
  }
}

function setCharacterCache(key, data) {
  characterCache.set(key, { data, expiresAt: Date.now() + CHARACTER_CACHE_TTL_MS });
  while (characterCache.size > CHARACTER_CACHE_MAX_SIZE) {
    const oldestKey = characterCache.keys().next().value;
    characterCache.delete(oldestKey);
  }
}

async function loadCharacterData(name, apiKey) {
  const url = `https://developer-lostark.game.onstove.com/armories/characters/${encodeURIComponent(name)}?filters=profiles+equipment+arkpassive+engravings+gems`;
  const arkGridUrl = `https://developer-lostark.game.onstove.com/armories/characters/${encodeURIComponent(name)}/arkgrid`;

  const [response, arkGrid] = await Promise.all([
    fetchJson(url, apiKey, 9000),
    fetchOptionalJson(arkGridUrl, apiKey, 9000)
  ]);

  const data = response.data;
  if (!data || typeof data !== 'object') {
    const error = new Error('Open API 응답에 캐릭터 데이터가 없습니다.');
    error.status = 502;
    throw error;
  }
  const profile = data.ArmoryProfile || data.Profile || null;
  const arkPassive = data.ArkPassive || data.ArmoryArkPassive || null;
  const equipment = data.ArmoryEquipment || data.Equipment || [];
  const gems = data.ArmoryGem || data.ArmoryGems || data.Gems || null;
  const accessoryEffects = extractAccessoryEffects(equipment);
  const braceletEffects = extractBraceletEffects(equipment);
  const abilityStoneEffects = extractAbilityStoneEffects(equipment);
  const engravingEffects = extractEngravingEffects(data.ArmoryEngraving || data.Engravings || data.ArmoryEngravings || null);
  const arkGridEffects = extractArkGridEffects(arkGrid.data);
  const powerSnapshot = buildPowerSnapshot({ profile, equipment, gems, accessoryEffects, braceletEffects, abilityStoneEffects, engravingEffects, arkGridEffects });

  return { ok: true, apiVersion: API_VERSION, profile, arkPassive, equipment, gems, accessoryEffects, braceletEffects, abilityStoneEffects, engravingEffects, arkGrid: arkGrid.data, arkGridEffects, arkGridError: arkGrid.error, powerSnapshot, raw: data };
}

async function fetchJson(url, apiKey, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `bearer ${apiKey}`, Accept: 'application/json' },
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error('로스트아크 Open API 호출 실패');
      error.status = response.status;
      error.body = text.slice(0, 500);
      throw error;
    }
    try { return { data: text ? JSON.parse(text) : null, error: null }; }
    catch {
      const error = new Error('Open API 응답이 JSON이 아닙니다.');
      error.status = 502;
      error.body = text.slice(0, 500);
      throw error;
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOptionalJson(url, apiKey, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `bearer ${apiKey}`, Accept: 'application/json' },
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) return { data: null, error: { status: response.status, body: text.slice(0, 500) } };
    try { return { data: text ? JSON.parse(text) : null, error: null }; }
    catch { return { data: null, error: { status: 502, body: text.slice(0, 500) } }; }
  } catch (error) {
    return { data: null, error: { status: 500, body: error?.name === 'AbortError' ? 'arkgrid timeout' : String(error?.message || error) } };
  } finally {
    clearTimeout(timeout);
  }
}

function stripHtml(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>(\n)?/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function tooltipText(tooltip) {
  if (!tooltip) return '';
  if (typeof tooltip === 'string') {
    try {
      const parsed = JSON.parse(tooltip);
      return stripHtml(JSON.stringify(parsed));
    } catch { return stripHtml(tooltip); }
  }
  return stripHtml(JSON.stringify(tooltip));
}

function parseTooltip(tooltip) {
  if (!tooltip) return null;
  if (typeof tooltip === 'string') {
    try { return JSON.parse(tooltip); } catch { return null; }
  }
  return typeof tooltip === 'object' ? tooltip : null;
}

const COMBAT_EQUIPMENT_TYPES = new Set(['무기', '투구', '상의', '하의', '장갑', '어깨']);
const ACCESSORY_EQUIPMENT_TYPES = new Set(['목걸이', '귀걸이', '반지']);

function buildPowerSnapshot({ profile, equipment, gems, accessoryEffects, braceletEffects, abilityStoneEffects, engravingEffects, arkGridEffects }) {
  const equipmentSnapshot = extractEquipmentSnapshot(equipment);
  const gemSnapshot = extractGemSnapshot(gems);
  return {
    version: API_VERSION,
    source: 'lostark-open-api',
    accuracyTarget: {
      officialCombatPower: parseNumber(profile?.CombatPower),
      officialCombatPowerText: profile?.CombatPower || '',
      basis: '프로필 CombatPower를 기준값으로 두고 장비/보석/효과 파싱 결과를 검증합니다.'
    },
    profile: {
      server: profile?.ServerName || '',
      name: profile?.CharacterName || '',
      className: profile?.CharacterClassName || '',
      itemAvgLevel: parseNumber(profile?.ItemAvgLevel),
      itemMaxLevel: parseNumber(profile?.ItemMaxLevel),
      combatPower: parseNumber(profile?.CombatPower),
      stats: Array.isArray(profile?.Stats) ? profile.Stats.map(row => ({ type: row.Type, value: parseNumber(row.Value), raw: row.Value })) : []
    },
    equipment: equipmentSnapshot,
    gems: gemSnapshot,
    effects: {
      accessory: accessoryEffects,
      bracelet: braceletEffects,
      abilityStone: abilityStoneEffects,
      engraving: engravingEffects,
      arkGrid: arkGridEffects
    },
    coverage: {
      officialCombatPower: Boolean(profile?.CombatPower),
      combatEquipment: equipmentSnapshot.combat.length,
      accessories: equipmentSnapshot.accessories.length,
      bracelet: Boolean(equipmentSnapshot.bracelet),
      abilityStone: Boolean(equipmentSnapshot.abilityStone),
      gems: gemSnapshot.items.length,
      needsVerification: [
        '강화/상급재련은 장비 Tooltip 문구 기반 파싱이라 실제 샘플로 검증이 필요합니다.',
        '보석은 캐릭터 ArmoryGem 응답 기준으로 레벨/종류/스킬 연결을 구조화했습니다.',
        '공식 전투력 산식은 공개값이 아니므로 profile.CombatPower와 샘플 오차 검증으로 보정해야 합니다.'
      ]
    }
  };
}

function extractEquipmentSnapshot(equipment) {
  const items = (Array.isArray(equipment) ? equipment : []).map(parseEquipmentSnapshotItem);
  return {
    all: items,
    combat: items.filter(item => COMBAT_EQUIPMENT_TYPES.has(item.type)),
    accessories: items.filter(item => ACCESSORY_EQUIPMENT_TYPES.has(item.type)),
    bracelet: items.find(item => item.type === '팔찌') || null,
    abilityStone: items.find(item => item.type === '어빌리티 스톤') || null
  };
}

function parseEquipmentSnapshotItem(item) {
  const tooltip = parseTooltip(item?.Tooltip);
  const text = tooltipText(item?.Tooltip);
  const name = stripHtml(item?.Name || '');
  const advancedHoningExcluded = name.includes('전율');
  const quality = firstFiniteNumber([
    item?.Quality,
    findQualityValue(tooltip)
  ]);
  return {
    type: item?.Type || item?.ItemType || '',
    name,
    grade: item?.Grade || '',
    icon: normalizeIconUrl(item?.Icon || item?.IconPath || findIconPath(item?.Tooltip) || ''),
    honingLevel: firstFiniteNumber([
      item?.HoningLevel,
      matchNumber(name, [/^\s*\+([0-9]+)/]),
      matchNumber(text, [/강화\s*단계[^0-9]{0,12}([0-9]+)/, /\+([0-9]+)\s*강/])
    ]),
    advancedHoningLevel: advancedHoningExcluded ? null : firstFiniteNumber([
      item?.AdvancedHoningLevel,
      matchNumber(text, [/상급\s*재련[^0-9]{0,20}([0-9]+)\s*단계/, /상급\s*재련\s*([0-9]+)/])
    ]),
    advancedHoningExcluded,
    itemLevel: firstFiniteNumber([
      item?.ItemLevel,
      item?.Level,
      matchNumber(text, [/아이템\s*레벨[^0-9]{0,12}([0-9,.]+)/])
    ]),
    quality,
    weaponPower: matchNumber(text, [/무기\s*공격력[^0-9+-]{0,12}\+?([0-9,.]+)/]),
    attackPower: matchNumber(text, [/(?<!무기\s*)공격력[^0-9+-]{0,12}\+?([0-9,.]+)/]),
    rawKnownKeys: Object.keys(item || {}).sort()
  };
}

function extractGemSnapshot(gemData) {
  const gems = rawGemItems(gemData);
  const effects = rawGemEffects(gemData);
  const bySlot = new Map(effects.map(effect => [Number(effect?.GemSlot ?? effect?.Slot ?? -1), effect]));
  const items = gems.map(gem => {
    const text = tooltipText(gem?.Tooltip);
    const name = stripHtml(gem?.Name || '');
    const slot = Number(gem?.Slot ?? gem?.GemSlot ?? -1);
    const effect = bySlot.get(slot) || null;
    const effectText = tooltipText(effect?.Tooltip || effect?.Description || effect);
    const level = firstFiniteNumber([
      gem?.Level,
      matchNumber(name, [/([0-9]+)\s*레벨/]),
      matchNumber(text, [/([0-9]+)\s*레벨/])
    ]);
    const kind = classifyGemKind([name, text, effectText].join(' '));
    return {
      slot,
      name,
      level,
      kind,
      grade: gem?.Grade || '',
      icon: normalizeIconUrl(gem?.Icon || gem?.IconPath || findIconPath(gem?.Tooltip) || ''),
      skillName: effect?.Name || parseGemSkillName(effectText),
      effectText: effectText.slice(0, 500)
    };
  }).sort((a, b) => Number(a.slot) - Number(b.slot));
  const damage = items.filter(item => item.kind === 'damage');
  const cooldown = items.filter(item => item.kind === 'cooldown');
  return {
    items,
    effects: effects.map(effect => ({ slot: Number(effect?.GemSlot ?? effect?.Slot ?? -1), name: effect?.Name || '', description: stripHtml(effect?.Description || ''), tooltip: tooltipText(effect?.Tooltip).slice(0, 500) })),
    summary: {
      total: items.length,
      damage: damage.length,
      cooldown: cooldown.length,
      averageLevel: round2(items.reduce((sum, item) => sum + Number(item.level || 0), 0) / Math.max(items.length, 1)),
      levelCounts: items.reduce((acc, item) => {
        const key = `Lv.${Number(item.level || 0)}`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {})
    }
  };
}

function rawGemItems(gemData) {
  if (!gemData) return [];
  if (Array.isArray(gemData)) return gemData;
  if (Array.isArray(gemData.Gems)) return gemData.Gems;
  if (Array.isArray(gemData.gems)) return gemData.gems;
  if (Array.isArray(gemData.Items)) return gemData.Items;
  return [];
}

function rawGemEffects(gemData) {
  if (!gemData || Array.isArray(gemData)) return [];
  if (Array.isArray(gemData.Effects)) return gemData.Effects;
  if (Array.isArray(gemData.effects)) return gemData.effects;
  return [];
}

function classifyGemKind(text) {
  const source = stripHtml(text);
  if (/겁화|멸화|피해|데미지|damage/i.test(source)) return 'damage';
  if (/작열|홍염|재사용|쿨타임|cooldown/i.test(source)) return 'cooldown';
  return 'unknown';
}

function parseGemSkillName(text) {
  const source = stripHtml(text);
  const match = source.match(/['"「]?([가-힣A-Za-z0-9\s]+)['"」]?\s*(?:스킬)?(?:의)?\s*(?:피해|재사용|쿨타임)/);
  return match ? match[1].trim() : '';
}

function findQualityValue(value) {
  const candidates = [];
  const visit = (current, key = '') => {
    if (current == null) return;
    if (typeof current === 'number' || typeof current === 'string') {
      if (/quality/i.test(key)) candidates.push(current);
      return;
    }
    if (Array.isArray(current)) {
      current.forEach(item => visit(item, key));
      return;
    }
    if (typeof current === 'object') {
      for (const [childKey, childValue] of Object.entries(current)) {
        if (/^(quality|qualityValue|quality_value)$/i.test(childKey)) candidates.push(childValue);
        visit(childValue, childKey);
      }
    }
  };
  visit(value);
  for (const candidate of candidates) {
    const n = parseNumber(candidate);
    if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
  }
  return null;
}

function findIconPath(tooltip) {
  const raw = typeof tooltip === 'string' ? tooltip : JSON.stringify(tooltip || '');
  const match = raw.match(/"iconPath"\s*:\s*"([^"]+)"/) || raw.match(/iconPath['"]?\s*[:=]\s*['"]([^'"]+)['"]/i);
  return match?.[1] || '';
}

function normalizeIconUrl(value) {
  const icon = String(value || '').trim();
  if (!icon) return '';
  if (/^https?:\/\//i.test(icon)) return icon;
  return `${CDN_PREFIX}${icon.replace(/^\/+/, '')}`;
}

function firstFiniteNumber(values) {
  for (const value of values) {
    const parsed = parseNumber(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function matchNumber(text, regexList) {
  const source = stripHtml(text);
  for (const re of regexList) {
    re.lastIndex = 0;
    const match = re.exec(source);
    if (!match) continue;
    const value = parseNumber(match[1]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function parseNumber(value) {
  if (value == null || value === '') return null;
  const normalized = String(value).replace(/,/g, '').replace(/[^0-9.+-]/g, '');
  if (!normalized || normalized === '+' || normalized === '-') return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function extractAccessoryEffects(equipment) {
  const result = { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, attackPowerFlat: 0, weaponPowerFlat: 0, attackPowerPercent: 0, weaponPowerPercent: 0, items: [] };
  const accessoryTypes = new Set(['목걸이', '귀걸이', '반지']);
  for (const item of Array.isArray(equipment) ? equipment : []) {
    if (!accessoryTypes.has(item?.Type)) continue;
    const text = tooltipText(item.Tooltip);
    const effects = parseAccessoryText(text);
    result.critRate += effects.critRate;
    result.critDamage += effects.critDamage;
    result.critHitDamage += effects.critHitDamage;
    result.enemyDamage += effects.enemyDamage;
    result.additionalDamage += effects.additionalDamage;
    result.attackPowerFlat += effects.attackPowerFlat;
    result.weaponPowerFlat += effects.weaponPowerFlat;
    result.attackPowerPercent += effects.attackPowerPercent;
    result.weaponPowerPercent += effects.weaponPowerPercent;
    result.items.push({ type: item.Type, name: item.Name, grade: item.Grade, effects });
  }
  for (const key of ['critRate', 'critDamage', 'critHitDamage', 'enemyDamage', 'additionalDamage', 'attackPowerFlat', 'weaponPowerFlat', 'attackPowerPercent', 'weaponPowerPercent']) result[key] = Math.round(result[key] * 100) / 100;
  return result;
}

function extractBraceletEffects(equipment) {
  const result = { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, attackPowerFlat: 0, weaponPowerFlat: 0, attackPowerPercent: 0, weaponPowerPercent: 0, items: [] };
  for (const item of Array.isArray(equipment) ? equipment : []) {
    if (item?.Type !== '팔찌') continue;
    const text = tooltipText(item.Tooltip);
    const effects = parseAccessoryText(text);
    result.critRate += effects.critRate;
    result.critDamage += effects.critDamage;
    result.critHitDamage += effects.critHitDamage;
    result.enemyDamage += effects.enemyDamage;
    result.additionalDamage += effects.additionalDamage;
    result.attackPowerFlat += effects.attackPowerFlat;
    result.weaponPowerFlat += effects.weaponPowerFlat;
    result.attackPowerPercent += effects.attackPowerPercent;
    result.weaponPowerPercent += effects.weaponPowerPercent;
    result.items.push({ type: item.Type, name: item.Name, grade: item.Grade, effects });
  }
  for (const key of ['critRate', 'critDamage', 'critHitDamage', 'enemyDamage', 'additionalDamage', 'attackPowerFlat', 'weaponPowerFlat', 'attackPowerPercent', 'weaponPowerPercent']) result[key] = Math.round(result[key] * 100) / 100;
  return result;
}

function extractAbilityStoneEffects(equipment) {
  const result = { attackPower: 0, effects: { critRate: 0, critDamage: 0, critHitDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0 }, engravings: [], items: [] };
  for (const item of Array.isArray(equipment) ? equipment : []) {
    if (item?.Type !== '어빌리티 스톤') continue;
    const text = tooltipText(item.Tooltip);
    const engravings = [];
    const engravingRe = /\[([^\]]+)\]\s*(?:Lv\.?|레벨)\s*(\d+)/g;
    let match;
    while ((match = engravingRe.exec(text)) !== null) {
      const name = normalizeEngravingName(stripHtml(match[1]).trim());
      const level = Math.max(0, Math.min(4, Number(match[2] || 0)));
      if (!name || !Number.isFinite(level) || /감소/.test(name)) continue;
      engravings.push({ name, level });
    }
    const atkMatch = text.match(/기본\s*공격력\s*\+(\d+(?:\.\d+)?)%/);
    const attackPower = atkMatch ? Number(atkMatch[1]) : 0;
    result.attackPower += Number.isFinite(attackPower) ? attackPower : 0;

    const itemEffects = { critRate: 0, critDamage: 0, critHitDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0 };
    for (const e of engravings) {
      const rule = STONE_ENGRAVING_BONUS_RULES[e.name];
      if (!rule) continue;
      for (const key of Object.keys(itemEffects)) {
        const arr = rule[key];
        if (Array.isArray(arr)) itemEffects[key] += Number(arr[e.level] || 0);
      }
    }
    for (const key of Object.keys(itemEffects)) {
      itemEffects[key] = round2(itemEffects[key]);
      result.effects[key] += itemEffects[key];
    }
    result.engravings.push(...engravings);
    result.items.push({ type: item.Type, name: item.Name, grade: item.Grade, attackPower, engravings, effects: itemEffects });
  }
  result.attackPower = round2(result.attackPower);
  for (const key of Object.keys(result.effects)) result.effects[key] = round2(result.effects[key]);
  return result;
}

function extractEngravingEffects(engravingData) {
  const result = {
    rawText: '',
    items: [],
    effects: { critRate: 0, critDamage: 0, critHitDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0, attackSpeed: 0, conditionalDamage: 0 },
    adrenaline: { adopted: false, level: 0, grade: '', bookLevel: 0, critRate: 0, attackPower: 0 }
  };
  if (!engravingData) return result;

  const rawText = tooltipText(engravingData);
  result.rawText = rawText.slice(0, 8000);
  const books = collectEngravingBooks(engravingData, rawText);
  const seen = new Set();

  for (const e of books) {
    const name = normalizeEngravingName(e.name);
    const grade = normalizeBookGrade(e.grade);
    const bookLevel = normalizeBookLevel(e.bookLevel ?? e.level ?? e.count);
    if (!name || !grade || bookLevel == null || seen.has(`${name}:${grade}:${bookLevel}`)) continue;
    seen.add(`${name}:${grade}:${bookLevel}`);
    const rule = DEALER_ENGRAVING_BOOK_RULES[name];
    if (!rule) continue;

    const eff = evaluateBookRule(rule, grade, bookLevel);
    if (name === '질량 증가') eff.attackSpeed = -10;
    result.items.push({ name, grade, bookLevel, count: bookLevel * 5, effects: eff });

    if (name === '아드레날린') {
      result.adrenaline = {
        adopted: true,
        level: bookLevel,
        grade,
        bookLevel,
        critRate: Number(eff.critRate || 0),
        attackPower: Number(eff.attackPower || 0)
      };
      continue; // 아드레날린은 프론트 체크박스로 켜고 끌 수 있게 별도 처리
    }
    for (const key of Object.keys(result.effects)) result.effects[key] += Number(eff[key] || 0);
  }

  for (const key of Object.keys(result.effects)) result.effects[key] = round2(result.effects[key]);
  result.adrenaline.critRate = round2(result.adrenaline.critRate);
  result.adrenaline.attackPower = round2(result.adrenaline.attackPower);
  return result;
}

// 각인서는 전투 각인 Lv.1~3이 아니라 영웅/전설/유물 등급과 0~4 연마 레벨로 효과가 정해진다.
// 기준점: 영웅 4레벨 / 전설 4레벨(=유물 0레벨) / 유물 4레벨.
const DEALER_ENGRAVING_BOOK_RULES = {
  '원한': { hero4: { enemyDamage: 15 }, legendary4: { enemyDamage: 18 }, relic4: { enemyDamage: 21 } },
  '저주받은 인형': { hero4: { enemyDamage: 11 }, legendary4: { enemyDamage: 14 }, relic4: { enemyDamage: 17 } },
  '아드레날린': { hero4: { attackPower: 5.4, critRate: 8 }, legendary4: { attackPower: 5.4, critRate: 14 }, relic4: { attackPower: 5.4, critRate: 20 } },
  '예리한 둔기': { hero4: { critDamage: 36 }, legendary4: { critDamage: 44 }, relic4: { critDamage: 52 } },
  '질량 증가': { hero4: { enemyDamage: 13 }, legendary4: { enemyDamage: 16 }, relic4: { enemyDamage: 19 } },
  // 아래 각인은 조건부 피해이므로 적주피에 합산하지 않는다.
  '돌격대장': { hero4: { conditionalDamage: 13 }, legendary4: { conditionalDamage: 16 }, relic4: { conditionalDamage: 19 } },
  '기습의 대가': { hero4: { conditionalDamage: 16 }, legendary4: { conditionalDamage: 19.8 }, relic4: { conditionalDamage: 22.6 } },
  '결투의 대가': { hero4: { conditionalDamage: 16 }, legendary4: { conditionalDamage: 19.8 }, relic4: { conditionalDamage: 22.6 } },
  '타격의 대가': { hero4: { conditionalDamage: 11 }, legendary4: { conditionalDamage: 14 }, relic4: { conditionalDamage: 17 } },
  '바리케이드': { hero4: { conditionalDamage: 11 }, legendary4: { conditionalDamage: 14 }, relic4: { conditionalDamage: 17 } },
  '안정된 상태': { hero4: { conditionalDamage: 11 }, legendary4: { conditionalDamage: 14 }, relic4: { conditionalDamage: 17 } },
  '속전속결': { hero4: { conditionalDamage: 16 }, legendary4: { conditionalDamage: 18 }, relic4: { conditionalDamage: 21 } },
  '슈퍼 차지': { hero4: { conditionalDamage: 16 }, legendary4: { conditionalDamage: 18 }, relic4: { conditionalDamage: 21 } },
  '마나 효율 증가': { hero4: { conditionalDamage: 11 }, legendary4: { conditionalDamage: 13 }, relic4: { conditionalDamage: 16 } }
};

const STONE_ENGRAVING_BONUS_RULES = {
  '원한': { enemyDamage: [0, 3.00, 3.75, 5.25, 6.00] },
  '저주받은 인형': { enemyDamage: [0, 3.00, 3.75, 5.25, 6.00] },
  '질량 증가': { enemyDamage: [0, 3.00, 3.75, 5.25, 6.00] },
  '바리케이드': { conditionalDamage: [0, 3.00, 3.75, 5.25, 6.00] },
  '속전속결': { conditionalDamage: [0, 3.00, 3.75, 5.25, 6.00] },
  '슈퍼 차지': { conditionalDamage: [0, 3.00, 3.75, 5.25, 6.00] },
  '마나 효율 증가': { conditionalDamage: [0, 3.00, 3.75, 5.25, 6.00] },
  '안정된 상태': { conditionalDamage: [0, 3.00, 3.75, 5.25, 6.00] },
  '타격의 대가': { conditionalDamage: [0, 3.00, 3.75, 5.25, 6.00] },
  '결투의 대가': { conditionalDamage: [0, 2.70, 3.40, 4.70, 5.40] },
  '기습의 대가': { conditionalDamage: [0, 2.70, 3.40, 4.70, 5.40] },
  '돌격대장': { conditionalDamage: [0, 7.50, 9.40, 13.20, 15.00] },
  '예리한 둔기': { critDamage: [0, 7.50, 9.40, 13.20, 15.00] },
  '아드레날린': { attackPower: [0, 2.88, 3.60, 4.98, 5.70] }
};

function evaluateBookRule(rule, grade, bookLevel) {
  const rank = engravingBookRank(grade, bookLevel);
  const out = { critRate: 0, critDamage: 0, critHitDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0, attackSpeed: 0, conditionalDamage: 0 };
  const keys = new Set([...Object.keys(rule.hero4 || {}), ...Object.keys(rule.legendary4 || {}), ...Object.keys(rule.relic4 || {})]);
  for (const key of keys) {
    const h = Number(rule.hero4?.[key] || 0);
    const l = Number(rule.legendary4?.[key] || 0);
    const r = Number(rule.relic4?.[key] || 0);
    let v;
    if (rank <= 4) v = h * (rank / 4);
    else if (rank <= 8) v = h + (l - h) * ((rank - 4) / 4);
    else v = l + (r - l) * ((rank - 8) / 4);
    out[key] = round2(v);
  }
  return out;
}

function engravingBookRank(grade, bookLevel) {
  const lv = Math.max(0, Math.min(4, Number(bookLevel || 0)));
  if (grade === '영웅') return lv;
  if (grade === '전설') return 4 + lv;
  if (grade === '유물') return 8 + lv;
  return lv;
}

function normalizeBookGrade(value) {
  const text = stripHtml(value).trim();
  if (/유물/.test(text)) return '유물';
  if (/전설/.test(text)) return '전설';
  if (/영웅/.test(text)) return '영웅';
  return '';
}

function normalizeBookLevel(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n)) return null;
  if (n > 4) return Math.max(0, Math.min(4, Math.floor(n / 5))); // 장수로 들어온 경우
  return Math.max(0, Math.min(4, Math.floor(n)));
}

function collectEngravingBooks(data, rawText) {
  const out = [];
  const names = Object.keys(DEALER_ENGRAVING_BOOK_RULES).sort((a, b) => b.length - a.length);
  const hasDealerName = (v) => {
    const t = stripHtml(v);
    return names.find(n => t.includes(n));
  };
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value !== 'object') return;
    const possibleName = value.Name || value.name || value.EngravingName || value.Title || value.title;
    const name = hasDealerName(possibleName || '') || hasDealerName(JSON.stringify(value));
    const grade = normalizeBookGrade(value.Grade || value.grade || value.BookGrade || value.bookGrade || value.Rarity || value.rarity || value.IconGrade || '');
    const lvRaw = value.Level ?? value.level ?? value.BookLevel ?? value.bookLevel ?? value.Lv ?? value.lv ?? value.Count ?? value.count ?? value.ReadCount ?? value.readCount;
    const bookLevel = normalizeBookLevel(lvRaw);
    if (name && grade && bookLevel != null) out.push({ name, grade, bookLevel });
    for (const v of Object.values(value)) if (v && typeof v === 'object') visit(v);
  };
  visit(data);

  const nameRe = names.map(escapeRegExp).join('|');
  const text = rawText || '';
  const patterns = [
    new RegExp(`(${nameRe})[^가-힣A-Za-z0-9]{0,20}(영웅|전설|유물)[^0-9]{0,12}(?:Lv\\.?|레벨)?\\s*([0-4]|[0-9]{1,2})`, 'g'),
    new RegExp(`(영웅|전설|유물)[^가-힣A-Za-z0-9]{0,20}(${nameRe})[^0-9]{0,12}(?:Lv\\.?|레벨)?\\s*([0-4]|[0-9]{1,2})`, 'g'),
    new RegExp(`(${nameRe})[^가-힣A-Za-z0-9]{0,20}(영웅|전설|유물)[^0-9]{0,12}([0-9]{1,2})\\s*장`, 'g'),
    new RegExp(`(영웅|전설|유물)[^가-힣A-Za-z0-9]{0,20}(${nameRe})[^0-9]{0,12}([0-9]{1,2})\\s*장`, 'g')
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const a = m[1], b = m[2], c = m[3];
      if (normalizeBookGrade(a)) out.push({ grade: normalizeBookGrade(a), name: b, bookLevel: normalizeBookLevel(c) });
      else out.push({ name: a, grade: normalizeBookGrade(b), bookLevel: normalizeBookLevel(c) });
    }
  }
  return out;
}

function normalizeEngravingName(name) {
  const n = stripHtml(name).replace(/\\s+/g, ' ').trim();
  const aliases = {
    '저주 받은 인형': '저주받은 인형',
    '슈퍼차지': '슈퍼 차지',
    '속전 속결': '속전속결',
    '마나효율 증가': '마나 효율 증가'
  };
  return aliases[n] || n;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function parseAccessoryText(text) {
  const out = { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, attackPowerFlat: 0, weaponPowerFlat: 0, attackPowerPercent: 0, weaponPowerPercent: 0, optionGrades: {} };
  const source = stripHtml(text);

  // 팔찌/악세 툴팁은 문장형, 축약형(+), HTML 조각이 섞여 들어와서
  // "치명타 적중률이 2.6% 증가한다", "치명타 적중률 +2.6%"를 모두 잡도록 처리합니다.
  addMatches(out, 'critRate', source, [
    /치명타\s*적중률(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /치명타\s*확률(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ], source);

  addMatches(out, 'critDamage', source, [
    /치명타\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ], source);

  addMatches(out, 'additionalDamage', source, [
    /추가\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ], source);

  addMatches(out, 'weaponPowerPercent', source, [
    /무기\s*공격력(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ], source);

  addMatches(out, 'attackPowerPercent', source, [
    /(?<!무기\s*)공격력(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ], source);

  addMatches(out, 'weaponPowerFlat', source, [
    /무기\s*공격력(?:이)?\s*(?:\+)?(\d[\d,]*)(?![\d,.]*\s*%)/g
  ], source);

  addMatches(out, 'attackPowerFlat', source, [
    /(?<!무기\s*)공격력(?:이)?\s*(?:\+)?(\d[\d,]*)(?![\d,.]*\s*%)/g
  ], source);

  // 치명타 적중 시 적주피는 일반 적주피가 아니라 치명타 배율 안에서 별도 곱연산으로 계산합니다.
  addMatches(out, 'critHitDamage', source, [
    /공격이\s*치명타로\s*적중\s*시\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ], source);

  // "무력화 상태의 적에게 주는 피해"는 별도 조건부라 제외하고,
  // 일반 적주피/쿨증 적주피/백·헤드·비방향성 적주피는 각 출처별 곱연산으로 계산합니다.
  addMatches(out, 'enemyDamage', source, [
    /(?<!무력화\s*상태의\s*)(?<!치명타로\s*적중\s*시\s*)적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /백어택\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /헤드어택\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /방향성\s*공격이\s*아닌\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ], source);

  for (const key of Object.keys(out)) {
    if (key === 'optionGrades') continue;
    out[key] = Math.round(out[key] * 100) / 100;
  }
  return out;
}

function addMatches(out, key, text, regexList, sourceText = text) {
  const seen = new Set();
  for (const re of regexList) {
    let match;
    while ((match = re.exec(text)) !== null) {
      const value = Number(String(match[1] || 0).replace(/,/g, ''));
      if (!Number.isFinite(value)) continue;
      // 같은 위치를 여러 패턴이 동시에 잡는 경우만 중복 합산 방지합니다.
      // 팔찌는 서로 다른 옵션 슬롯에 같은 문구가 반복될 수 있으므로
      // 문구 내용만으로 dedupe하면 정상 옵션이 누락됩니다.
      const token = `${key}:${match.index}:${String(match[0]).replace(/\s+/g, ' ').trim()}`;
      if (seen.has(token)) continue;
      seen.add(token);
      out[key] += value;
      const grade = optionGradeNearMatch(sourceText, match.index);
      if (grade && !out.optionGrades[key]) out.optionGrades[key] = grade;
    }
  }
}

function optionGradeNearMatch(text, index) {
  const start = Math.max(0, Number(index || 0) - 80);
  const end = Math.min(String(text || '').length, Number(index || 0) + 80);
  const near = String(text || '').slice(start, end);
  const match = near.match(/(?:^|\s|[([{])([상중하])(?:\s*옵션|\s*연마|\s*등급|\s|[)\]}:：])/);
  return match?.[1] || '';
}

function extractArkGridEffects(arkGrid) {
  const result = { critRate: 0, critDamage: 0, attackSpeed: 0, moveSpeed: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
  const slots = Array.isArray(arkGrid?.Slots) ? arkGrid.Slots : [];
  for (const slot of slots) {
    const point = Number(slot?.Point || 0);
    if (!Number.isFinite(point) || point <= 0) continue;
    const text = arkGridTooltipText(slot?.Tooltip);
    const activeTexts = activeArkGridOptionTexts(text, point);
    const effects = { critRate: 0, critDamage: 0, attackSpeed: 0, moveSpeed: 0, enemyDamage: 0, additionalDamage: 0 };
    for (const activeText of activeTexts) {
      const parsed = parseArkGridOptionText(activeText);
      for (const key of Object.keys(effects)) effects[key] += Number(parsed[key] || 0);
    }
    for (const key of Object.keys(effects)) effects[key] = round2(effects[key]);
    if (Object.values(effects).some(v => Math.abs(Number(v || 0)) > 0.0001)) {
      for (const key of Object.keys(effects)) result[key] += effects[key];
      result.items.push({ index: slot.Index, name: slot.Name, grade: slot.Grade, point, effects, activeTexts });
    }
  }
  for (const key of ['critRate', 'critDamage', 'attackSpeed', 'moveSpeed', 'enemyDamage', 'additionalDamage']) result[key] = round2(result[key]);
  return result;
}

function arkGridTooltipText(tooltip) {
  if (!tooltip) return '';
  try {
    const parsed = typeof tooltip === 'string' ? JSON.parse(tooltip) : tooltip;
    const parts = [];
    collectArkGridText(parsed, parts);
    return stripHtml(parts.join('\n'));
  } catch {
    return stripHtml(String(tooltip));
  }
}

function collectArkGridText(value, parts) {
  if (value == null) return;
  if (typeof value === 'string') {
    if (value.includes('[10P]') || value.includes('[14P]') || /코어 옵션|젬 효과/.test(value)) parts.push(value);
    return;
  }
  if (Array.isArray(value)) { for (const item of value) collectArkGridText(item, parts); return; }
  if (typeof value === 'object') { for (const item of Object.values(value)) collectArkGridText(item, parts); }
}

function activeArkGridOptionTexts(text, point) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!source) return [];
  const re = /\[(\d+)P\]/g;
  const marks = [];
  let match;
  while ((match = re.exec(source)) !== null) marks.push({ point: Number(match[1]), index: match.index, tokenEnd: re.lastIndex });
  if (!marks.length) return point > 0 ? [source] : [];
  const active = [];
  for (let i = 0; i < marks.length; i++) {
    const current = marks[i];
    const next = marks[i + 1];
    if (point < current.point) continue;
    active.push(source.slice(current.tokenEnd, next ? next.index : source.length).trim());
  }
  return active;
}

function parseArkGridOptionText(text) {
  const source = stripHtml(text);
  const out = { critRate: 0, critDamage: 0, attackSpeed: 0, moveSpeed: 0, enemyDamage: 0, additionalDamage: 0 };
  addAllMatches(out, 'critRate', source, [
    /치명타\s*적중률(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가|상승)?/g,
    /치명타\s*확률(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가|상승)?/g
  ]);
  addAllMatches(out, 'critDamage', source, [
    /치명타\s*피해(?:량)?(?:이|가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가|상승)?/g
  ]);
  addAllMatches(out, 'attackSpeed', source, [
    /공격\s*속도(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가|상승)?/g,
    /공속\s*(?:\+)?(\d+(?:\.\d+)?)%/g
  ]);
  addAllMatches(out, 'moveSpeed', source, [
    /이동\s*속도(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가|상승)?/g,
    /이속\s*(?:\+)?(\d+(?:\.\d+)?)%/g
  ]);
  addAllMatches(out, 'enemyDamage', source, [
    /적에게\s*주는\s*(?:모든\s*)?피해(?:량)?(?:이|가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가|상승)?/g
  ]);
  addAllMatches(out, 'additionalDamage', source, [
    /추가\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가|상승)?/g
  ]);
  for (const key of Object.keys(out)) out[key] = round2(out[key]);
  return out;
}

function addAllMatches(out, key, text, regexList) {
  const seen = new Set();
  for (const re of regexList) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      const value = Number(match[1] || 0);
      if (!Number.isFinite(value)) continue;
      const token = `${key}:${value}:${match.index}:${match[0]}`;
      if (seen.has(token)) continue;
      seen.add(token);
      out[key] += value;
    }
  }
}
