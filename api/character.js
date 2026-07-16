const API_VERSION = '5.7.10';
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
  const powerSnapshot = buildPowerSnapshot({ profile, equipment, gems, accessoryEffects, braceletEffects, abilityStoneEffects, engravingEffects, arkGridEffects, arkGrid: arkGrid.data });

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

function buildPowerSnapshot({ profile, equipment, gems, accessoryEffects, braceletEffects, abilityStoneEffects, engravingEffects, arkGridEffects, arkGrid }) {
  const equipmentSnapshot = extractEquipmentSnapshot(equipment);
  const gemSnapshot = extractGemSnapshot(gems);
  const arkGridSnapshot = extractArkGridSnapshot(arkGrid);
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
    arkGrid: arkGridSnapshot,
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

const ARK_GRID_CORE_ORDER = [
  { side: '질서', symbol: '해' },
  { side: '질서', symbol: '달' },
  { side: '질서', symbol: '별' },
  { side: '혼돈', symbol: '해' },
  { side: '혼돈', symbol: '달' },
  { side: '혼돈', symbol: '별' }
];

function extractArkGridSnapshot(arkGrid) {
  const slots = Array.isArray(arkGrid?.Slots) ? arkGrid.Slots : [];
  if (!slots.length) return { slots: [], gemSummary: [] };
  const usedSlotIndexes = new Set();
  const rows = ARK_GRID_CORE_ORDER.map((order, index) => {
    const found = findArkGridSlot(slots, order, index, usedSlotIndexes);
    const slot = found?.slot || null;
    if (Number.isInteger(found?.index)) usedSlotIndexes.add(found.index);
    const text = arkGridTooltipText(slot?.Tooltip);
    const activeTexts = activeArkGridOptionTexts(text, Number(slot?.Point || 0));
    const name = cleanArkGridCoreName(stripHtml(slot?.Name || ''), order);
    return {
      side: order.side,
      symbol: order.symbol,
      name,
      grade: slot?.Grade || '',
      point: firstFiniteNumber([slot?.Point, matchNumber(text, [/([0-9]+)\s*P/])]) || 0,
      icon: normalizeIconUrl(slot?.Icon || slot?.IconPath || findIconPath(slot?.Tooltip) || ''),
      gemName: stripHtml(slot?.GemName || slot?.JewelName || slot?.Gem?.Name || slot?.Jewel?.Name || ''),
      gemIcon: normalizeIconUrl(slot?.GemIcon || slot?.JewelIcon || slot?.Gem?.Icon || slot?.Jewel?.Icon || ''),
      activeTexts: activeTexts.map(row => row.slice(0, 180)),
      rawKnownKeys: Object.keys(slot || {}).sort()
    };
  });
  return { slots: rows, gemSummary: parseArkGridGemSummary(arkGrid, rows) };
}

function cleanArkGridCoreName(name, order) {
  const fallback = `${order.side} ${order.symbol}`;
  const cleaned = stripHtml(name || '')
    .replace(/(?:질서|혼돈)\s*의?\s*(?:해|달|별)\s*코어/g, '')
    .replace(/^(?:질서|혼돈)\s*의?\s*(?:해|달|별)\s*[-:·|]?\s*/g, '')
    .replace(/^(?:질서|혼돈)\s*[-:·|]?\s*/g, '')
    .replace(/\s*(?:해|달|별)\s*코어\s*$/g, '')
    .replace(/\s*코어\s*$/g, '')
    .replace(/^[\s\-:·|]+|[\s\-:·|]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

function findArkGridSlot(slots, order, fallbackIndex, usedSlotIndexes = new Set()) {
  const indexed = slots.map((slot, index) => ({ slot, index })).filter(row => !usedSlotIndexes.has(row.index));
  const nameMatch = indexed.find(({ slot }) => isArkGridCoreMatch(`${slot?.Name || ''} ${slot?.Grade || ''}`, order));
  if (nameMatch) return nameMatch;
  const textMatch = indexed.find(({ slot }) => isArkGridCoreMatch(`${slot?.Name || ''} ${slot?.Grade || ''} ${arkGridTooltipText(slot?.Tooltip)}`, order));
  if (textMatch) return textMatch;
  if (!usedSlotIndexes.has(fallbackIndex) && slots[fallbackIndex]) return { slot: slots[fallbackIndex], index: fallbackIndex };
  return indexed[0] || null;
}

function isArkGridCoreMatch(text, order) {
  const source = stripHtml(text || '').replace(/\s+/g, ' ');
  const side = escapeRegExp(order.side);
  const symbol = escapeRegExp(order.symbol);
  return new RegExp(`${side}\\s*의?\\s*${symbol}\\s*코어|${side}.{0,12}${symbol}|${symbol}\\s*코어.{0,12}${side}`).test(source);
}

function parseArkGridGemSummary(arkGrid, rows) {
  const text = [
    ...collectAllTextDeep(arkGrid),
    ...rows.flatMap(row => row.activeTexts || [])
  ].join(' ');
  const entries = [
    ['공격력', [/아크\s*그리드\s*젬.{0,120}(?<!무기\s*)공격력\s*(\d{1,2})(?![\d.%])/g, /(?<!무기\s*)공격력\s*(\d{1,2})(?![\d.%])/g]],
    ['보스 피해', [/보스\s*피해\s*(\d{1,2})(?![\d.%])/g, /(\d{1,2})(?![\d.%])\s*보스\s*피해/g]],
    ['추가 피해', [/추가\s*피해\s*(\d{1,2})(?![\d.%])/g, /(\d{1,2})(?![\d.%])\s*추가\s*피해/g]],
    ['아군 공격 강화', [/아군\s*공격(?:력)?\s*강화\s*(\d{1,2})(?![\d.%])/g, /(\d{1,2})(?![\d.%])\s*아군\s*공격(?:력)?\s*강화/g]],
    ['아군 피해 강화', [/아군\s*피해(?:량)?\s*강화\s*(\d{1,2})(?![\d.%])/g, /(\d{1,2})(?![\d.%])\s*아군\s*피해(?:량)?\s*강화/g]],
    ['낙인력', [/낙인력\s*(\d{1,2})(?![\d.%])/g, /(\d{1,2})(?![\d.%])\s*낙인력/g]]
  ];
  return entries.map(([label, regexList]) => ({ label, value: maxIntegerRegexValue(text, regexList) }));
}

function collectAllTextDeep(value, bucket = []) {
  if (value == null) return bucket;
  if (typeof value === 'string') {
    const clean = stripHtml(value);
    if (clean) bucket.push(clean);
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try { collectAllTextDeep(JSON.parse(trimmed), bucket); } catch {}
    }
    return bucket;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    bucket.push(String(value));
    return bucket;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectAllTextDeep(item, bucket);
    return bucket;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) collectAllTextDeep(item, bucket);
  }
  return bucket;
}

function sumRegexNumbers(text, regexList) {
  let best = 0;
  const seen = new Set();
  for (const re of regexList) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      const token = `${match.index}:${match[0]}`;
      if (seen.has(token)) continue;
      seen.add(token);
      best = Math.max(best, Number(parseNumber(match[1]) || 0));
    }
  }
  return round2(best);
}

function maxIntegerRegexValue(text, regexList) {
  let best = 0;
  const seen = new Set();
  for (const re of regexList) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      const token = `${match.index}:${match[0]}`;
      if (seen.has(token)) continue;
      seen.add(token);
      const value = Number(String(match[1] || '').replace(/,/g, ''));
      if (!Number.isInteger(value) || value < 0 || value > 99) continue;
      best = Math.max(best, value);
    }
  }
  return best;
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
  const result = { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, attackPowerFlat: 0, weaponPowerFlat: 0, attackPowerPercent: 0, weaponPowerPercent: 0, strength: 0, dexterity: 0, intelligence: 0, critStat: 0, swiftStat: 0, specStat: 0, items: [] };
  const accessoryTypes = new Set(['목걸이', '귀걸이', '반지']);
  for (const item of Array.isArray(equipment) ? equipment : []) {
    if (!accessoryTypes.has(item?.Type)) continue;
    const text = tooltipText(item.Tooltip);
    const effects = parseAccessoryText(text, item.Type, item.Grade);
    result.critRate += effects.critRate;
    result.critDamage += effects.critDamage;
    result.critHitDamage += effects.critHitDamage;
    result.enemyDamage += effects.enemyDamage;
    result.additionalDamage += effects.additionalDamage;
    result.attackPowerFlat += effects.attackPowerFlat;
    result.weaponPowerFlat += effects.weaponPowerFlat;
    result.attackPowerPercent += effects.attackPowerPercent;
    result.weaponPowerPercent += effects.weaponPowerPercent;
    result.strength += effects.strength;
    result.dexterity += effects.dexterity;
    result.intelligence += effects.intelligence;
    result.critStat += effects.critStat;
    result.swiftStat += effects.swiftStat;
    result.specStat += effects.specStat;
    result.items.push({ type: item.Type, name: item.Name, grade: item.Grade, effects });
  }
  for (const key of ['critRate', 'critDamage', 'critHitDamage', 'enemyDamage', 'additionalDamage', 'attackPowerFlat', 'weaponPowerFlat', 'attackPowerPercent', 'weaponPowerPercent', 'strength', 'dexterity', 'intelligence', 'critStat', 'swiftStat', 'specStat']) result[key] = Math.round(result[key] * 100) / 100;
  return result;
}

function extractBraceletEffects(equipment) {
  const result = { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, attackPowerFlat: 0, weaponPowerFlat: 0, attackPowerPercent: 0, weaponPowerPercent: 0, strength: 0, dexterity: 0, intelligence: 0, critStat: 0, swiftStat: 0, specStat: 0, attackMoveSpeed: 0, resourceRecovery: 0, maxHp: 0, items: [] };
  for (const item of Array.isArray(equipment) ? equipment : []) {
    if (item?.Type !== '팔찌') continue;
    const text = tooltipText(item.Tooltip);
    const effects = parseAccessoryText(text, item.Type, item.Grade);
    result.critRate += effects.critRate;
    result.critDamage += effects.critDamage;
    result.critHitDamage += effects.critHitDamage;
    result.enemyDamage += effects.enemyDamage;
    result.additionalDamage += effects.additionalDamage;
    result.attackPowerFlat += effects.attackPowerFlat;
    result.weaponPowerFlat += effects.weaponPowerFlat;
    result.attackPowerPercent += effects.attackPowerPercent;
    result.weaponPowerPercent += effects.weaponPowerPercent;
    result.strength += effects.strength;
    result.dexterity += effects.dexterity;
    result.intelligence += effects.intelligence;
    result.critStat += effects.critStat;
    result.swiftStat += effects.swiftStat;
    result.specStat += effects.specStat;
    result.attackMoveSpeed += effects.attackMoveSpeed;
    result.resourceRecovery += effects.resourceRecovery;
    result.maxHp += effects.maxHp;
    result.items.push({ type: item.Type, name: item.Name, grade: item.Grade, effects });
  }
  for (const key of ['critRate', 'critDamage', 'critHitDamage', 'enemyDamage', 'additionalDamage', 'attackPowerFlat', 'weaponPowerFlat', 'attackPowerPercent', 'weaponPowerPercent', 'strength', 'dexterity', 'intelligence', 'critStat', 'swiftStat', 'specStat', 'attackMoveSpeed', 'resourceRecovery', 'maxHp']) result[key] = Math.round(result[key] * 100) / 100;
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

const ACCESSORY_OPTION_GRADE_VALUES = {
  '목걸이': {
    enemyDamage: { high: 2.00, mid: 1.20, low: 0.55 },
    additionalDamage: { high: 2.60, mid: 1.60, low: 0.60 },
    attackPowerFlat: { high: 390, mid: 195, low: 80 },
    weaponPowerFlat: { high: 960, mid: 480, low: 195 },
    identityGain: { high: 6.00, mid: 3.60, low: 1.60 },
    brandPower: { high: 8.00, mid: 4.80, low: 2.15 }
  },
  '귀걸이': {
    attackPowerPercent: { high: 1.55, mid: 0.95, low: 0.40 },
    weaponPowerPercent: { high: 3.00, mid: 1.80, low: 0.80 },
    attackPowerFlat: { high: 390, mid: 195, low: 80 },
    weaponPowerFlat: { high: 960, mid: 480, low: 195 },
    partyHeal: { high: 3.50, mid: 2.10, low: 0.95 },
    partyShield: { high: 3.50, mid: 2.10, low: 0.95 }
  },
  '반지': {
    critDamage: { high: 4.00, mid: 2.40, low: 1.10 },
    critRate: { high: 1.55, mid: 0.95, low: 0.40 },
    attackPowerFlat: { high: 390, mid: 195, low: 80 },
    weaponPowerFlat: { high: 960, mid: 480, low: 195 },
    allyAttackBuff: { high: 5.00, mid: 3.00, low: 1.35 },
    allyDamageBuff: { high: 7.50, mid: 4.50, low: 2.00 }
  }
};

const BRACELET_OPTION_GRADE_VALUES = {
  relic: {
    critRate: [{ high: 4.20, mid: 3.40, low: 2.60 }],
    critDamage: [{ high: 8.40, mid: 6.80, low: 5.20 }],
    attackMoveSpeed: [{ high: 6.00, mid: 5.00, low: 4.00 }],
    resourceRecovery: [{ high: 12.00, mid: 10.00, low: 8.00 }],
    enemyDamage: [
      { high: 2.50, mid: 2.00, low: 1.50 },
      { high: 5.00, mid: 4.50, low: 4.00 },
      { high: 3.00, mid: 2.50, low: 2.00 }
    ],
    additionalDamage: [
      { high: 3.00, mid: 2.50, low: 2.00 },
      { high: 3.50, mid: 3.00, low: 2.50 }
    ],
    weaponPowerFlat: [
      { high: 1320, mid: 1160, low: 1000 },
      { high: 8100, mid: 7200, low: 6300 },
      { high: 7800, mid: 6900, low: 6000 },
      { high: 2200, mid: 2000, low: 1800 },
      { high: 140, mid: 130, low: 120 }
    ]
  },
  ancient: {
    critRate: [{ high: 5.00, mid: 4.20, low: 3.40 }],
    critDamage: [{ high: 10.00, mid: 8.40, low: 6.80 }],
    attackMoveSpeed: [{ high: 6.00, mid: 5.00, low: 4.00 }],
    resourceRecovery: [{ high: 12.00, mid: 10.00, low: 8.00 }],
    enemyDamage: [
      { high: 3.00, mid: 2.50, low: 2.00 },
      { high: 5.50, mid: 5.00, low: 4.50 },
      { high: 3.50, mid: 3.00, low: 2.50 }
    ],
    additionalDamage: [
      { high: 3.50, mid: 3.00, low: 2.50 },
      { high: 4.00, mid: 3.50, low: 3.00 }
    ],
    weaponPowerFlat: [
      { high: 1480, mid: 1320, low: 1160 },
      { high: 9000, mid: 8100, low: 7200 },
      { high: 8700, mid: 7800, low: 6900 },
      { high: 2400, mid: 2200, low: 2000 },
      { high: 150, mid: 140, low: 130 }
    ]
  },
  common: {
    critRate: [{ high: 5.00, mid: 4.20, low: 3.40 }, { high: 4.20, mid: 3.40, low: 2.60 }],
    critDamage: [{ high: 10.00, mid: 8.40, low: 6.80 }, { high: 8.40, mid: 6.80, low: 5.20 }],
    attackMoveSpeed: [{ high: 6.00, mid: 5.00, low: 4.00 }],
    resourceRecovery: [{ high: 12.00, mid: 10.00, low: 8.00 }],
    enemyDamage: [
      { high: 3.00, mid: 2.50, low: 2.00 },
      { high: 2.50, mid: 2.00, low: 1.50 },
      { high: 5.50, mid: 5.00, low: 4.50 },
      { high: 5.00, mid: 4.50, low: 4.00 },
      { high: 3.50, mid: 3.00, low: 2.50 },
      { high: 3.00, mid: 2.50, low: 2.00 }
    ],
    additionalDamage: [
      { high: 4.00, mid: 3.50, low: 3.00 },
      { high: 3.50, mid: 3.00, low: 2.50 },
      { high: 3.00, mid: 2.50, low: 2.00 }
    ],
    weaponPowerFlat: [
      { high: 1480, mid: 1320, low: 1160 },
      { high: 1320, mid: 1160, low: 1000 },
      { high: 9000, mid: 8100, low: 7200 },
      { high: 8100, mid: 7200, low: 6300 },
      { high: 8700, mid: 7800, low: 6900 },
      { high: 7800, mid: 6900, low: 6000 },
      { high: 2400, mid: 2200, low: 2000 },
      { high: 2200, mid: 2000, low: 1800 },
      { high: 150, mid: 140, low: 130 },
      { high: 140, mid: 130, low: 120 }
    ]
  }
};

function parseAccessoryText(text, itemType = '', itemGrade = '') {
  const out = { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, attackPowerFlat: 0, weaponPowerFlat: 0, attackPowerPercent: 0, weaponPowerPercent: 0, strength: 0, dexterity: 0, intelligence: 0, critStat: 0, swiftStat: 0, specStat: 0, identityGain: 0, brandPower: 0, allyAttackBuff: 0, allyDamageBuff: 0, partyHeal: 0, partyShield: 0, maxHp: 0, maxMana: 0, statusDuration: 0, combatHpRegen: 0, attackMoveSpeed: 0, seedDamage: 0, seedDamageReduction: 0, physicalDefense: 0, magicDefense: 0, resourceRecovery: 0, spaceCooldown: 0, optionGrades: {} };
  const source = stripHtml(text);

  // 팔찌/악세 툴팁은 문장형, 축약형(+), HTML 조각이 섞여 들어와서
  // "치명타 적중률이 2.6% 증가한다", "치명타 적중률 +2.6%"를 모두 잡도록 처리합니다.
  addMatches(out, 'critRate', source, [
    /치명타\s*적중률(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /치명타\s*확률(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ], source, itemType, itemGrade);

  addMatches(out, 'critDamage', source, [
    /치명타\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ], source, itemType, itemGrade);

  addMatches(out, 'additionalDamage', source, [
    /추가\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ], source, itemType, itemGrade);

  addMatches(out, 'weaponPowerPercent', source, [
    /무기\s*공격력(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ], source, itemType, itemGrade);

  addMatches(out, 'attackPowerPercent', source, [
    /(?<!무기\s*)공격력(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ], source, itemType, itemGrade);

  addMatches(out, 'weaponPowerFlat', source, [
    /무기\s*공격력(?:이)?\s*(?:\+)?(\d[\d,]*)(?![\d,.]*\s*%)/g
  ], source, itemType, itemGrade);

  addMatches(out, 'attackPowerFlat', source, [
    /(?<!무기\s*)공격력(?:이)?\s*(?:\+)?(\d[\d,]*)(?![\d,.]*\s*%)/g
  ], source, itemType, itemGrade);

  addMatches(out, 'strength', source, [
    /힘\s*(?:\+)?(\d[\d,]*)/g
  ], source, itemType, itemGrade);

  addMatches(out, 'dexterity', source, [
    /민첩\s*(?:\+)?(\d[\d,]*)/g
  ], source, itemType, itemGrade);

  addMatches(out, 'intelligence', source, [
    /지능\s*(?:\+)?(\d[\d,]*)/g
  ], source, itemType, itemGrade);

  addMatches(out, 'critStat', source, [
    /(?:^|\s)치명\s*(?:\+)?(\d[\d,]*)/g
  ], source, itemType, itemGrade);

  addMatches(out, 'swiftStat', source, [
    /(?:^|\s)신속\s*(?:\+)?(\d[\d,]*)/g
  ], source, itemType, itemGrade);

  addMatches(out, 'specStat', source, [
    /(?:^|\s)특화\s*(?:\+)?(\d[\d,]*)/g
  ], source, itemType, itemGrade);

  addMatches(out, 'identityGain', source, [
    /(?:아덴|아이덴티티|서폿\s*아덴|세레나데,\s*신앙,\s*조화\s*게이지)\s*획득량(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ], source, itemType, itemGrade);

  addMatches(out, 'brandPower', source, [
    /낙인력(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ], source, itemType, itemGrade);

  addMatches(out, 'allyAttackBuff', source, [
    /아군\s*공격력\s*강화\s*효과(?:가|는)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ], source, itemType, itemGrade);

  addMatches(out, 'allyDamageBuff', source, [
    /아군\s*피해량\s*강화\s*효과(?:가|는)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ], source, itemType, itemGrade);

  addMatches(out, 'partyHeal', source, [
    /파티원\s*회복\s*효과(?:가|는)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /파티원\s*보호\s*및\s*회복\s*효과(?:가|는)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ], source, itemType, itemGrade);

  addMatches(out, 'partyShield', source, [
    /파티원\s*보호막\s*효과(?:가|는)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /보호\s*효과가\s*적용된\s*대상이\s*\d+초\s*동안\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ], source, itemType, itemGrade);

  addMaxHpMatches(out, source, itemType, itemGrade);

  addMatches(out, 'maxMana', source, [
    /최대\s*마나\s*(?:\+)?(\d[\d,]*)/g
  ], source, itemType, itemGrade);

  addMatches(out, 'statusDuration', source, [
    /상태이상\s*공격\s*지속시간(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ], source, itemType, itemGrade);

  addMatches(out, 'combatHpRegen', source, [
    /전투\s*중\s*생명력\s*회복량\s*(?:\+)?(\d[\d,]*)/g
  ], source, itemType, itemGrade);

  addMatches(out, 'attackMoveSpeed', source, [
    /공격\s*및\s*이동\s*속도(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /공이속\s*(?:\+)?(\d+(?:\.\d+)?)%/g
  ], source, itemType, itemGrade);

  addMatches(out, 'seedDamage', source, [
    /시드\s*등급\s*이하\s*몬스터에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ], source, itemType, itemGrade);

  addMatches(out, 'seedDamageReduction', source, [
    /시드\s*등급\s*이하\s*몬스터에게\s*받는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:감소)?/g
  ], source, itemType, itemGrade);

  addMatches(out, 'physicalDefense', source, [
    /물리\s*방어력\s*(?:\+)?(\d[\d,]*)/g
  ], source, itemType, itemGrade);

  addMatches(out, 'magicDefense', source, [
    /마법\s*방어력\s*(?:\+)?(\d[\d,]*)/g
  ], source, itemType, itemGrade);

  addMatches(out, 'resourceRecovery', source, [
    /전투\s*자원\s*(?:자연\s*)?회복량(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /전투자원회복량\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ], source, itemType, itemGrade);

  addMatches(out, 'spaceCooldown', source, [
    /이동기\s*및\s*기상기\s*재사용\s*대기\s*시간(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:감소)?/g
  ], source, itemType, itemGrade);

  // 치명타 적중 시 적주피는 일반 적주피가 아니라 치명타 배율 안에서 별도 곱연산으로 계산합니다.
  addMatches(out, 'critHitDamage', source, [
    /공격이\s*치명타로\s*적중\s*시\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ], source, itemType, itemGrade);

  const enemyDamageSource = source.replace(/공격이\s*치명타로\s*적중\s*시\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?\d+(?:\.\d+)?%\s*(?:증가)?/g, '');

  // "무력화 상태의 적에게 주는 피해"와 치명타 적중 시 피해는 별도 조건부라 제외하고,
  // 일반 적주피/쿨증 적주피/백·헤드·비방향성 적주피는 각 출처별 곱연산으로 계산합니다.
  addMatches(out, 'enemyDamage', enemyDamageSource, [
    /(?<!무력화\s*상태의\s*)(?<!치명타로\s*적중\s*시\s*)적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /백어택\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /헤드어택\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /방향성\s*공격이\s*아닌\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ], enemyDamageSource, itemType, itemGrade);

  if (itemType === '팔찌') adjustBraceletStackedEffects(source, out);
  if (itemType === '팔찌') out.optionSlots = extractBraceletOptionSlots(source, out, itemGrade);

  for (const key of Object.keys(out)) {
    if (key === 'optionGrades' || key === 'optionSlots') continue;
    out[key] = Math.round(out[key] * 100) / 100;
  }
  return out;
}

function adjustBraceletStackedEffects(source, out) {
  const sixStack = source.match(/매\s*초\s*마다.{0,40}무기\s*공격력(?:이)?\s*(?:\+)?(\d[\d,]*).{0,80}공격\s*및\s*이동\s*속도(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%.{0,80}최대\s*6\s*중첩/s);
  if (sixStack) {
    const weapon = Number(String(sixStack[1]).replace(/,/g, ''));
    const speed = Number(sixStack[2]);
    if (Number.isFinite(weapon)) out.weaponPowerFlat += weapon * 5;
    if (Number.isFinite(speed)) out.attackMoveSpeed += speed * 5;
  }
  const thirtyStack = source.match(/무기\s*공격력(?:이)?\s*(?:\+)?(\d[\d,]*).{0,120}무기\s*공격력(?:이)?\s*(?:\+)?(\d[\d,]*).{0,80}최대\s*30\s*중첩/s);
  if (thirtyStack) {
    const perStack = Number(String(thirtyStack[2]).replace(/,/g, ''));
    if (Number.isFinite(perStack)) out.weaponPowerFlat += perStack * 29;
  }
}

function addMaxHpMatches(out, source, itemType = '', itemGrade = '') {
  const regexList = itemType === '팔찌'
    ? [/최대\s*생명력\s*(?:\+)?(\d[\d,]*)/g, /체력\s*(?:\+)?(\d[\d,]*)/g]
    : [/최대\s*생명력\s*(?:\+)?(\d[\d,]*)/g];
  const seen = new Set();
  for (const re of regexList) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(source)) !== null) {
      if (itemType !== '팔찌' && !isAccessoryRefiningContext(source, match.index)) continue;
      const value = Number(String(match[1] || 0).replace(/,/g, ''));
      if (!Number.isFinite(value)) continue;
      const token = `${match.index}:${match[0]}`;
      if (seen.has(token)) continue;
      seen.add(token);
      out.maxHp += value;
      const grade = optionGradeByValue('maxHp', value, itemType, itemGrade) || optionGradeNearMatch(source, match.index);
      if (grade && !out.optionGrades.maxHp) out.optionGrades.maxHp = grade;
    }
  }
}

function isAccessoryRefiningContext(text, index) {
  const start = Math.max(0, Number(index || 0) - 160);
  const end = Math.min(String(text || '').length, Number(index || 0) + 160);
  const near = String(text || '').slice(start, end);
  if (/연마|옵션|상\s*옵션|중\s*옵션|하\s*옵션|ACCESSORY_UPGRADE/i.test(near)) return true;
  return Boolean(optionGradeNearMatch(text, index));
}

function extractBraceletOptionSlots(text, effects, itemGrade = '') {
  const source = String(text || '');
  const slots = [];
  const push = (key, label, value, gradeKey = key, extraText = '') => {
    const grade = optionGradeByValue(gradeKey, value, '팔찌', itemGrade) || effects?.optionGrades?.[gradeKey] || '';
    const isFlat = key.endsWith('Flat') || ['maxHp', 'maxMana', 'critStat', 'swiftStat', 'specStat', 'strength', 'dexterity', 'intelligence'].includes(key);
    const main = isFlat ? `${label} +${Number(value).toLocaleString('ko-KR')}` : `${label} ${pctForServer(value)}`;
    const text = extraText ? `${main} / ${extraText}` : main;
    if (slots.some(slot => slot.key === key && slot.text === text)) return;
    slots.push({ key, text, grade });
  };

  for (const match of source.matchAll(/치명타\s*적중률(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*증가한다\.\s*공격이\s*치명타로\s*적중\s*시\s*(?:적에게\s*주는\s*)?피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%/gi)) {
    push('critRate', '이중 치적', Number(match[1]), 'critRate', `치명타 적중 주피 ${pctForServer(Number(match[2]))}`);
  }
  for (const match of source.matchAll(/치명타\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*증가한다\.\s*공격이\s*치명타로\s*적중\s*시\s*(?:적에게\s*주는\s*)?피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%/gi)) {
    push('critDamage', '이중 치피', Number(match[1]), 'critDamage', `치명타 적중 주피 ${pctForServer(Number(match[2]))}`);
  }

  const sourceWithoutDualCrit = source
    .replace(/치명타\s*적중률(?:이)?\s*(?:\+)?\d+(?:\.\d+)?%\s*증가한다\.\s*공격이\s*치명타로\s*적중\s*시\s*(?:적에게\s*주는\s*)?피해(?:가)?\s*(?:\+)?\d+(?:\.\d+)?%/gi, '')
    .replace(/치명타\s*피해(?:가)?\s*(?:\+)?\d+(?:\.\d+)?%\s*증가한다\.\s*공격이\s*치명타로\s*적중\s*시\s*(?:적에게\s*주는\s*)?피해(?:가)?\s*(?:\+)?\d+(?:\.\d+)?%/gi, '');
  for (const match of sourceWithoutDualCrit.matchAll(/치명타\s*적중률(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/gi)) {
    push('critRate', '치적', Number(match[1]), 'critRate');
  }
  for (const match of sourceWithoutDualCrit.matchAll(/치명타\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/gi)) {
    push('critDamage', '치피', Number(match[1]), 'critDamage');
  }

  const cooldownEnemyDamage = firstMatchNumber(source, [/재사용\s*대기시간(?:이)?\s*\d+(?:\.\d+)?%\s*증가하지만.{0,50}적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%/i]);
  if (cooldownEnemyDamage) push('enemyDamage', '쿨증 적주피', cooldownEnemyDamage, 'enemyDamage');

  for (const match of source.matchAll(/적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*증가하며\s*,?\s*무력화\s*상태의\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%/gi)) {
    push('enemyDamage', '이중 적주피', Number(match[1]), 'enemyDamage', `무력화 피해 ${pctForServer(Number(match[2]))}`);
  }
  const sourceWithoutDualEnemy = source.replace(/적에게\s*주는\s*피해(?:가)?\s*(?:\+)?\d+(?:\.\d+)?%\s*증가하며\s*,?\s*무력화\s*상태의\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?\d+(?:\.\d+)?%/gi, '');
  for (const match of sourceWithoutDualEnemy.matchAll(/(?<!무력화\s*상태의\s*)적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/gi)) {
    push('enemyDamage', '적주피', Number(match[1]), 'enemyDamage');
  }

  const backAttack = firstMatchNumber(source, [/백어택\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%/i]);
  if (backAttack) push('enemyDamage', '백어택 주피', backAttack, 'enemyDamage');
  const headAttack = firstMatchNumber(source, [/헤드어택\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%/i]);
  if (headAttack) push('enemyDamage', '헤드어택 주피', headAttack, 'enemyDamage');
  const nonDirectional = firstMatchNumber(source, [/방향성\s*공격이\s*아닌\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%/i]);
  if (nonDirectional) push('enemyDamage', '비방향성 주피', nonDirectional, 'enemyDamage');

  for (const match of source.matchAll(/추가\s*피해(?:가|\s*\+)?\s*(?:\+)?(\d+(?:\.\d+)?)\s*%/gi)) {
    const near = source.slice(match.index, Math.min(source.length, match.index + 120));
    const demon = firstMatchNumber(near, [/악마\s*및\s*대악마\s*계열\s*피해량(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%/i]);
    push('additionalDamage', '추피', Number(match[1]), 'additionalDamage', demon ? `악마 피해 ${pctForServer(demon)}` : '');
  }

  const attackMoveSpeed = firstMatchNumber(source, [
    /공격\s*및\s*이동\s*속도(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/i,
    /공이속\s*(?:\+)?(\d+(?:\.\d+)?)%/i
  ]);
  if (attackMoveSpeed) push('attackMoveSpeed', '공이속', attackMoveSpeed, 'attackMoveSpeed');

  const resourceRecovery = firstMatchNumber(source, [
    /전투\s*자원\s*(?:자연\s*)?회복량(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/i,
    /전투자원회복량\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/i
  ]);
  if (resourceRecovery) push('resourceRecovery', '자원 회복', resourceRecovery, 'resourceRecovery');

  const maxHp = firstMatchNumber(source, [
    /최대\s*생명력\s*(?:\+)?(\d[\d,]*)/i,
    /체력\s*(?:\+)?(\d[\d,]*)/i
  ]);
  if (maxHp) push('maxHp', '체력', maxHp, 'maxHp');

  const weaponValues = [...source.matchAll(/무기\s*공격력(?:이)?\s*(?:\+)?(\d[\d,]*)(?![\d,.]*\s*%)/g)]
    .map(match => Number(String(match[1]).replace(/,/g, '')))
    .filter(Number.isFinite);
  if (weaponValues.length) {
    const stacked = braceletStackedWeaponPower(source, weaponValues);
    const main = stacked || weaponValues[0];
    const extra = weaponValues.slice(1).map(v => `조건부 무공 +${v.toLocaleString('ko-KR')}`).join(' / ');
    const label = stacked ? '이중 무공' : '무공';
    push('weaponPowerFlat', label, main, 'weaponPowerFlat', extra);
  }

  return slots;
}

function braceletStackedWeaponPower(source, weaponValues) {
  const six = source.match(/최대\s*6\s*중첩/);
  if (six && weaponValues[0]) return weaponValues[0] * 6;
  const thirty = source.match(/최대\s*30\s*중첩/);
  if (thirty && weaponValues.length >= 2) return weaponValues[0] + weaponValues[1] * 30;
  return 0;
}

function firstMatchNumber(text, regexList) {
  for (const re of regexList) {
    const match = String(text || '').match(re);
    if (!match) continue;
    const n = Number(String(match[1] || '').replace(/,/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function pctForServer(value) {
  const n = Number(value || 0);
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function addMatches(out, key, text, regexList, sourceText = text, itemType = '', itemGrade = '') {
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
      const grade = optionGradeByValue(key, value, itemType, itemGrade) || optionGradeNearMatch(sourceText, match.index);
      if (grade && !out.optionGrades[key]) out.optionGrades[key] = grade;
    }
  }
}

function optionGradeByValue(key, value, itemType = '', itemGrade = '') {
  const gradeKey = String(itemGrade || '').includes('고대') ? 'ancient' : String(itemGrade || '').includes('유물') ? 'relic' : 'common';
  const table = itemType === '팔찌' ? (BRACELET_OPTION_GRADE_VALUES[gradeKey] || BRACELET_OPTION_GRADE_VALUES.common) : ACCESSORY_OPTION_GRADE_VALUES[itemType];
  const entries = Array.isArray(table?.[key]) ? table[key] : (table?.[key] ? [table[key]] : []);
  for (const entry of entries) {
    for (const grade of ['high', 'mid', 'low']) {
      if (Math.abs(Number(entry[grade]) - Number(value)) < 0.001) return ({ high: '상', mid: '중', low: '하' })[grade];
    }
  }
  return '';
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
