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

    return res.status(200).json({ ok: true, apiVersion: '4.8.1-fixed', profile, arkPassive, equipment, accessoryEffects, braceletEffects, abilityStoneEffects, engravingEffects, raw: data });
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


const ENGRAVING_RULES = {
  '결투의 대가': { book: { enemyDamage: [0, 4, 4.8, 7.6] }, stone: { enemyDamage: [0, 2.7, 3.4, 4.7, 5.4] } },
  '기습의 대가': { book: { enemyDamage: [0, 4, 4.8, 7.6] }, stone: { enemyDamage: [0, 2.7, 3.4, 4.7, 5.4] } },
  '돌격대장': { book: { raidCaptainRate: [0, 32, 40, 48] }, stone: { raidCaptainRate: [0, 7.5, 9.4, 13.2, 15] } },
  '마나 효율 증가': { book: { enemyDamage: [0, 11, 13, 16] }, stone: { enemyDamage: [0, 3, 3.75, 5.25, 6] } },
  '바리케이드': { book: { enemyDamage: [0, 11, 14, 17] }, stone: { enemyDamage: [0, 3, 3.75, 5.25, 6] } },
  '속전속결': { book: { enemyDamage: [0, 16, 18, 21] }, stone: { enemyDamage: [0, 3, 3.75, 5.25, 6] } },
  '슈퍼 차지': { book: { enemyDamage: [0, 16, 18, 21] }, stone: { enemyDamage: [0, 3, 3.75, 5.25, 6] } },
  '아드레날린': { book: { attackPower: [0, 1.8, 3.6, 5.4], critRate: [0, 8, 14, 20] }, stone: { attackPower: [0, 2.88, 3.6, 4.98, 5.7] } },
  '안정된 상태': { book: { enemyDamage: [0, 11, 14, 17] }, stone: { enemyDamage: [0, 3, 3.75, 5.25, 6] } },
  '예리한 둔기': { book: { critDamage: [0, 36, 44, 52] }, stone: { critDamage: [0, 7.5, 9.4, 13.2, 15] } },
  '원한': { book: { enemyDamage: [0, 15, 18, 21] }, stone: { enemyDamage: [0, 3, 3.75, 5.25, 6] } },
  '저주받은 인형': { book: { enemyDamage: [0, 11, 14, 17] }, stone: { enemyDamage: [0, 3, 3.75, 5.25, 6] } },
  '질량 증가': { book: { enemyDamage: [0, 13, 16, 19] }, stone: { enemyDamage: [0, 3, 3.75, 5.25, 6] } },
  '타격의 대가': { book: { enemyDamage: [0, 11, 14, 17] }, stone: { enemyDamage: [0, 3, 3.75, 5.25, 6] } }
};
const ENGRAVING_NAMES = Object.keys(ENGRAVING_RULES).sort((a, b) => b.length - a.length);

function emptyEngravingEffects() {
  return { critRate: 0, critDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0, raidCaptainRate: 0 };
}

function addRuleEffects(out, name, level, kind) {
  const rules = ENGRAVING_RULES[name]?.[kind];
  if (!rules) return {};
  const applied = {};
  for (const [key, values] of Object.entries(rules)) {
    const value = Number(values[level] || 0);
    if (!Number.isFinite(value) || value === 0) continue;
    out[key] = Number(out[key] || 0) + value;
    applied[key] = value;
  }
  return applied;
}

function roundEngravingEffects(effects) {
  for (const key of Object.keys(effects)) effects[key] = Math.round(Number(effects[key] || 0) * 100) / 100;
  return effects;
}

function findKnownEngravingLevels(text, maxLevel = 3) {
  const source = stripHtml(text || '').replace(/\s+/g, ' ');
  const found = [];
  const seen = new Set();
  for (const name of ENGRAVING_NAMES) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`(?:\\[)?${escaped}(?:\\])?[^가-힣A-Za-z0-9]{0,40}(?:Lv\\.?|레벨)\\s*([0-9]+)`, 'g'),
      new RegExp(`${escaped}\\s*([0-9]+)단계`, 'g')
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(source)) !== null) {
        const level = Number(m[1] || 0);
        if (!level || level > maxLevel) continue;
        const key = `${name}:${level}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({ name, level });
      }
    }
  }
  return found;
}

function extractAbilityStoneEffects(equipment) {
  const result = { attackPower: 0, engravings: [], effects: emptyEngravingEffects(), items: [] };
  for (const item of Array.isArray(equipment) ? equipment : []) {
    if (item?.Type !== '어빌리티 스톤') continue;
    const text = tooltipText(item.Tooltip);
    const engravings = findKnownEngravingLevels(text, 4);
    const itemEffects = emptyEngravingEffects();
    for (const e of engravings) {
      // 방어력 감소 같은 디버프는 ENGRAVING_RULES에 없으므로 자동 제외됩니다.
      const applied = addRuleEffects(result.effects, e.name, e.level, 'stone');
      addRuleEffects(itemEffects, e.name, e.level, 'stone');
      e.effects = applied;
    }
    const atkMatch = text.match(/기본\s*공격력\s*\+(\d+(?:\.\d+)?)%/);
    const attackPower = atkMatch ? Number(atkMatch[1]) : 0;
    result.attackPower += Number.isFinite(attackPower) ? attackPower : 0;
    result.engravings.push(...engravings);
    result.items.push({ type: item.Type, name: item.Name, grade: item.Grade, attackPower, engravings, effects: roundEngravingEffects(itemEffects) });
  }
  result.attackPower = Math.round(result.attackPower * 100) / 100;
  roundEngravingEffects(result.effects);
  return result;
}

function extractEngravingEffects(engravingData) {
  const result = { rawText: '', items: [], effects: emptyEngravingEffects() };
  if (!engravingData) return result;
  const rawText = tooltipText(engravingData);
  result.rawText = rawText.slice(0, 5000);

  // 각인서는 툴팁 문장의 숫자를 범용 정규식으로 긁지 않고,
  // 딜러 각인명 + 레벨을 먼저 판정한 뒤 고정 규칙 테이블로만 계산합니다.
  // 아드레날린은 6중첩 기준 공격력/치적을 반영하며, 원한의 보스/레이드 피해는 적주피로 환산합니다.
  const items = findKnownEngravingLevels(rawText, 3);
  const seenName = new Set();
  for (const item of items) {
    // 같은 각인이 중복 노출될 경우 가장 높은 레벨만 남깁니다.
    const prev = result.items.find(x => x.name === item.name);
    if (prev) {
      if (item.level > prev.level) prev.level = item.level;
      continue;
    }
    result.items.push({ name: item.name, level: item.level });
    seenName.add(item.name);
  }
  for (const item of result.items) {
    item.effects = addRuleEffects(result.effects, item.name, item.level, 'book');
  }
  roundEngravingEffects(result.effects);
  return result;
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
