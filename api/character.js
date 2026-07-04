export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  try {
    const name = String(req.query.name || '').trim();

    if (!name) return res.status(400).json({ error: '캐릭터명을 입력하세요.' });

    const apiKey = process.env.LOSTARK_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Vercel 환경변수 LOSTARK_API_KEY가 없습니다.' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    const url = `https://developer-lostark.game.onstove.com/armories/characters/${encodeURIComponent(name)}?filters=profiles+equipment+arkpassive+engravings`;

    const response = await fetch(url, {
      headers: { Authorization: `bearer ${apiKey}`, Accept: 'application/json' },
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));

    const text = await response.text();
    if (!response.ok) {
      return res.status(response.status).json({ error: '로스트아크 Open API 호출 실패', status: response.status, body: text.slice(0, 500) });
    }

    let data;
    try { data = JSON.parse(text); } catch { return res.status(502).json({ error: 'Open API 응답이 JSON이 아닙니다.', body: text.slice(0, 500) }); }

    const profile = data.ArmoryProfile || data.Profile || null;
    const arkPassive = data.ArkPassive || data.ArmoryArkPassive || null;
    const equipment = data.ArmoryEquipment || data.Equipment || [];
    const accessoryEffects = extractAccessoryEffects(equipment);
    const braceletEffects = extractBraceletEffects(equipment);
    const abilityStoneEffects = extractAbilityStoneEffects(equipment);
    const engravingEffects = extractEngravingEffects(data.ArmoryEngraving || data.Engravings || data.ArmoryEngravings || null);

    return res.status(200).json({ ok: true, apiVersion: '4.8.1', profile, arkPassive, equipment, accessoryEffects, braceletEffects, abilityStoneEffects, engravingEffects, raw: data });
  } catch (error) {
    const message = error.name === 'AbortError' ? 'Open API 응답 시간이 길어서 중단했습니다.' : error.message;
    return res.status(500).json({ error: '서버 함수 오류', message });
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

function extractAccessoryEffects(equipment) {
  const result = { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
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
    result.items.push({ type: item.Type, name: item.Name, grade: item.Grade, effects });
  }
  for (const key of ['critRate', 'critDamage', 'critHitDamage', 'enemyDamage', 'additionalDamage']) result[key] = Math.round(result[key] * 100) / 100;
  return result;
}

function extractBraceletEffects(equipment) {
  const result = { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
  for (const item of Array.isArray(equipment) ? equipment : []) {
    if (item?.Type !== '팔찌') continue;
    const text = tooltipText(item.Tooltip);
    const effects = parseAccessoryText(text);
    result.critRate += effects.critRate;
    result.critDamage += effects.critDamage;
    result.critHitDamage += effects.critHitDamage;
    result.enemyDamage += effects.enemyDamage;
    result.additionalDamage += effects.additionalDamage;
    result.items.push({ type: item.Type, name: item.Name, grade: item.Grade, effects });
  }
  for (const key of ['critRate', 'critDamage', 'critHitDamage', 'enemyDamage', 'additionalDamage']) result[key] = Math.round(result[key] * 100) / 100;
  return result;
}

function extractAbilityStoneEffects(equipment) {
  const result = { attackPower: 0, engravings: [], items: [] };
  for (const item of Array.isArray(equipment) ? equipment : []) {
    if (item?.Type !== '어빌리티 스톤') continue;
    const text = tooltipText(item.Tooltip);
    const engravings = [];
    const engravingRe = /\[([^\]]+)\]\s*(?:Lv\.?|레벨)\s*(\d+)/g;
    let match;
    while ((match = engravingRe.exec(text)) !== null) {
      const name = stripHtml(match[1]).trim();
      const level = Number(match[2] || 0);
      if (!name || !Number.isFinite(level)) continue;
      engravings.push({ name, level });
    }
    const atkMatch = text.match(/기본\s*공격력\s*\+(\d+(?:\.\d+)?)%/);
    const attackPower = atkMatch ? Number(atkMatch[1]) : 0;
    result.attackPower += Number.isFinite(attackPower) ? attackPower : 0;
    result.engravings.push(...engravings);
    result.items.push({ type: item.Type, name: item.Name, grade: item.Grade, attackPower, engravings });
  }
  result.attackPower = Math.round(result.attackPower * 100) / 100;
  return result;
}

function extractEngravingEffects(engravingData) {
  const result = {
    rawText: '',
    items: [],
    effects: { critRate: 0, critDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0 },
    adrenaline: { adopted: false, level: 0, critRate: 0, attackPower: 0 }
  };
  if (!engravingData) return result;

  const rawText = tooltipText(engravingData);
  result.rawText = rawText.slice(0, 8000);
  const engravings = collectEngravingLevels(engravingData, rawText);
  const seen = new Set();

  for (const e of engravings) {
    const name = normalizeEngravingName(e.name);
    const level = Math.max(1, Math.min(3, Number(e.level || 0)));
    if (!name || !level || seen.has(`${name}:${level}`)) continue;
    seen.add(`${name}:${level}`);
    const rule = DEALER_ENGRAVING_RULES[name];
    if (!rule) continue;
    result.items.push({ name, level });

    const eff = rule[level] || rule[3] || {};
    if (name === '아드레날린') {
      result.adrenaline = {
        adopted: true,
        level,
        critRate: Number(eff.critRate || 0),
        attackPower: Number(eff.attackPower || 0)
      };
      continue; // 아드레날린은 프론트 체크박스로 켜고 끌 수 있게 별도 처리
    }
    for (const key of Object.keys(result.effects)) result.effects[key] += Number(eff[key] || 0);
  }

  for (const key of Object.keys(result.effects)) result.effects[key] = Math.round(Number(result.effects[key] || 0) * 100) / 100;
  result.adrenaline.critRate = Math.round(Number(result.adrenaline.critRate || 0) * 100) / 100;
  result.adrenaline.attackPower = Math.round(Number(result.adrenaline.attackPower || 0) * 100) / 100;
  return result;
}

const DEALER_ENGRAVING_RULES = {
  // 딜러 각인서 본체 효과. 어빌리티 스톤 보너스와 분리.
  // 보스/레이드 몬스터 피해 증가는 계산기 내부에서 적주피(enemyDamage)로 환산한다.
  '원한': { 1: { enemyDamage: 4 }, 2: { enemyDamage: 10 }, 3: { enemyDamage: 21 } },
  '저주받은 인형': { 1: { enemyDamage: 3 }, 2: { enemyDamage: 8 }, 3: { enemyDamage: 17 } },
  '아드레날린': { 1: { attackPower: 1.8, critRate: 5 }, 2: { attackPower: 3.6, critRate: 10 }, 3: { attackPower: 5.4, critRate: 20 } },
  '예리한 둔기': { 1: { critDamage: 10 }, 2: { critDamage: 25 }, 3: { critDamage: 44 } },
  '질량 증가': { 1: { attackPower: 4 }, 2: { attackPower: 10 }, 3: { attackPower: 18 } },
  '돌격대장': { 1: { enemyDamage: 5 }, 2: { enemyDamage: 10 }, 3: { enemyDamage: 18 } },
  '기습의 대가': { 1: { enemyDamage: 7 }, 2: { enemyDamage: 15 }, 3: { enemyDamage: 25 } },
  '결투의 대가': { 1: { enemyDamage: 7 }, 2: { enemyDamage: 15 }, 3: { enemyDamage: 25 } },
  '타격의 대가': { 1: { enemyDamage: 7 }, 2: { enemyDamage: 15 }, 3: { enemyDamage: 25 } },
  '바리케이드': { 1: { enemyDamage: 5 }, 2: { enemyDamage: 10 }, 3: { enemyDamage: 18 } },
  '안정된 상태': { 1: { enemyDamage: 5 }, 2: { enemyDamage: 10 }, 3: { enemyDamage: 20 } },
  '속전속결': { 1: { enemyDamage: 5 }, 2: { enemyDamage: 12 }, 3: { enemyDamage: 20 } },
  '슈퍼 차지': { 1: { enemyDamage: 5 }, 2: { enemyDamage: 12 }, 3: { enemyDamage: 20 } },
  '마나 효율 증가': { 1: { enemyDamage: 5 }, 2: { enemyDamage: 10 }, 3: { enemyDamage: 16 } }
};

function normalizeEngravingName(name) {
  const n = stripHtml(name).replace(/\s+/g, ' ').trim();
  const aliases = {
    '저주 받은 인형': '저주받은 인형',
    '슈퍼차지': '슈퍼 차지',
    '속전 속결': '속전속결',
    '마나효율 증가': '마나 효율 증가'
  };
  return aliases[n] || n;
}

function collectEngravingLevels(data, rawText) {
  const out = [];
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value !== 'object') return;
    const possibleName = value.Name || value.name || value.EngravingName || value.Title || value.title;
    const possibleLevel = value.Level || value.level || value.Lv || value.lv;
    if (possibleName && possibleLevel) out.push({ name: possibleName, level: Number(possibleLevel) });
    for (const v of Object.values(value)) if (v && typeof v === 'object') visit(v);
  };
  visit(data);

  const names = Object.keys(DEALER_ENGRAVING_RULES).sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
  const patterns = [
    new RegExp(`(${names})\\s*(?:Lv\\.?|레벨)\\s*(\\d)`, 'g'),
    new RegExp(`(${names})[^가-힣A-Za-z0-9]{0,20}(?:Lv\\.?|레벨)\\s*(\\d)`, 'g'),
    new RegExp(`(?:Lv\\.?|레벨)\\s*(\\d)[^가-힣A-Za-z0-9]{0,20}(${names})`, 'g')
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(rawText || '')) !== null) {
      if (Number(m[1])) out.push({ name: m[2], level: Number(m[1]) });
      else out.push({ name: m[1], level: Number(m[2]) });
    }
  }
  return out;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseAccessoryText(text) {
  const out = { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0 };
  const source = stripHtml(text);

  // 팔찌/악세 툴팁은 문장형, 축약형(+), HTML 조각이 섞여 들어와서
  // "치명타 적중률이 2.6% 증가한다", "치명타 적중률 +2.6%"를 모두 잡도록 처리합니다.
  addMatches(out, 'critRate', source, [
    /치명타\s*적중률(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /치명타\s*확률(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ]);

  addMatches(out, 'critDamage', source, [
    /치명타\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ]);

  addMatches(out, 'additionalDamage', source, [
    /추가\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ]);

  // 치명타 적중 시 적주피는 일반 적주피가 아니라 치명타 배율 안에서 별도 곱연산으로 계산합니다.
  addMatches(out, 'critHitDamage', source, [
    /공격이\s*치명타로\s*적중\s*시\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ]);

  // "무력화 상태의 적에게 주는 피해"는 별도 조건부라 제외하고,
  // 일반 적주피/쿨증 적주피/백·헤드·비방향성 적주피는 각 출처별 곱연산으로 계산합니다.
  addMatches(out, 'enemyDamage', source, [
    /(?<!무력화\s*상태의\s*)적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /백어택\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /헤드어택\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /방향성\s*공격이\s*아닌\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ]);

  for (const key of Object.keys(out)) out[key] = Math.round(out[key] * 100) / 100;
  return out;
}

function addMatches(out, key, text, regexList) {
  const seen = new Set();
  for (const re of regexList) {
    let match;
    while ((match = re.exec(text)) !== null) {
      const value = Number(match[1] || 0);
      if (!Number.isFinite(value)) continue;
      // 같은 문장을 여러 패턴이 동시에 잡는 경우 중복 합산 방지
      const token = `${key}:${String(match[0]).replace(/\s+/g, ' ').trim()}`;
      if (seen.has(token)) continue;
      seen.add(token);
      out[key] += value;
    }
  }
}
