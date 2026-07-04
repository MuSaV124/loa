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

const DEALER_ENGRAVING_RULES = {
  '결투의 대가': { effectsByLevel: { 1: { enemyDamage: 4 }, 2: { enemyDamage: 4.8 }, 3: { enemyDamage: 7.6 } }, stoneByLevel: { 1: { enemyDamage: 2.7 }, 2: { enemyDamage: 3.4 }, 3: { enemyDamage: 4.7 }, 4: { enemyDamage: 5.4 } } },
  '기습의 대가': { effectsByLevel: { 1: { enemyDamage: 4 }, 2: { enemyDamage: 4.8 }, 3: { enemyDamage: 7.6 } }, stoneByLevel: { 1: { enemyDamage: 2.7 }, 2: { enemyDamage: 3.4 }, 3: { enemyDamage: 4.7 }, 4: { enemyDamage: 5.4 } } },
  '마나 효율 증가': { effectsByLevel: { 1: { enemyDamage: 11 }, 2: { enemyDamage: 13 }, 3: { enemyDamage: 16 } }, stoneByLevel: { 1: { enemyDamage: 3 }, 2: { enemyDamage: 3.75 }, 3: { enemyDamage: 5.25 }, 4: { enemyDamage: 6 } } },
  '바리케이드': { effectsByLevel: { 1: { enemyDamage: 11 }, 2: { enemyDamage: 14 }, 3: { enemyDamage: 17 } }, stoneByLevel: { 1: { enemyDamage: 3 }, 2: { enemyDamage: 3.75 }, 3: { enemyDamage: 5.25 }, 4: { enemyDamage: 6 } } },
  '속전속결': { effectsByLevel: { 1: { enemyDamage: 16 }, 2: { enemyDamage: 18 }, 3: { enemyDamage: 21 } }, stoneByLevel: { 1: { enemyDamage: 3 }, 2: { enemyDamage: 3.75 }, 3: { enemyDamage: 5.25 }, 4: { enemyDamage: 6 } } },
  '슈퍼 차지': { effectsByLevel: { 1: { enemyDamage: 16 }, 2: { enemyDamage: 18 }, 3: { enemyDamage: 21 } }, stoneByLevel: { 1: { enemyDamage: 3 }, 2: { enemyDamage: 3.75 }, 3: { enemyDamage: 5.25 }, 4: { enemyDamage: 6 } } },
  '아드레날린': { effectsByLevel: { 1: { attackPower: 1.8, critRate: 8 }, 2: { attackPower: 3.6, critRate: 14 }, 3: { attackPower: 5.4, critRate: 20 } }, stoneByLevel: { 1: { attackPower: 2.88 }, 2: { attackPower: 3.6 }, 3: { attackPower: 4.98 }, 4: { attackPower: 5.7 } } },
  '안정된 상태': { effectsByLevel: { 1: { enemyDamage: 11 }, 2: { enemyDamage: 14 }, 3: { enemyDamage: 17 } }, stoneByLevel: { 1: { enemyDamage: 3 }, 2: { enemyDamage: 3.75 }, 3: { enemyDamage: 5.25 }, 4: { enemyDamage: 6 } } },
  '예리한 둔기': { effectsByLevel: { 1: { critDamage: 36 }, 2: { critDamage: 44 }, 3: { critDamage: 52 } }, stoneByLevel: { 1: { critDamage: 7.5 }, 2: { critDamage: 9.4 }, 3: { critDamage: 13.2 }, 4: { critDamage: 15 } } },
  '원한': { effectsByLevel: { 1: { enemyDamage: 15 }, 2: { enemyDamage: 18 }, 3: { enemyDamage: 21 } }, stoneByLevel: { 1: { enemyDamage: 3 }, 2: { enemyDamage: 3.75 }, 3: { enemyDamage: 5.25 }, 4: { enemyDamage: 6 } } },
  '저주받은 인형': { effectsByLevel: { 1: { enemyDamage: 11 }, 2: { enemyDamage: 14 }, 3: { enemyDamage: 17 } }, stoneByLevel: { 1: { enemyDamage: 3 }, 2: { enemyDamage: 3.75 }, 3: { enemyDamage: 5.25 }, 4: { enemyDamage: 6 } } },
  '질량 증가': { effectsByLevel: { 1: { enemyDamage: 13 }, 2: { enemyDamage: 16 }, 3: { enemyDamage: 19 } }, stoneByLevel: { 1: { enemyDamage: 3 }, 2: { enemyDamage: 3.75 }, 3: { enemyDamage: 5.25 }, 4: { enemyDamage: 6 } } },
  '타격의 대가': { effectsByLevel: { 1: { enemyDamage: 11 }, 2: { enemyDamage: 14 }, 3: { enemyDamage: 17 } }, stoneByLevel: { 1: { enemyDamage: 3 }, 2: { enemyDamage: 3.75 }, 3: { enemyDamage: 5.25 }, 4: { enemyDamage: 6 } } }
};

const EMPTY_ENGRAVING_EFFECTS = { critRate: 0, critDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0 };
const DEBUFF_ENGRAVING_NAMES = ['방어력 감소', '공격력 감소', '공격속도 감소', '이동속도 감소'];

function normalizeEngravingName(name) {
  return stripHtml(name)
    .replace(/\s+/g, ' ')
    .replace(/^\[|\]$/g, '')
    .trim();
}

function addEffectBucket(target, source) {
  if (!source) return;
  for (const key of Object.keys(EMPTY_ENGRAVING_EFFECTS)) {
    const value = Number(source[key] || 0);
    if (Number.isFinite(value)) target[key] += value;
  }
}

function roundEffectBucket(target) {
  for (const key of Object.keys(EMPTY_ENGRAVING_EFFECTS)) target[key] = Math.round(Number(target[key] || 0) * 100) / 100;
  return target;
}

function parseEngravingNameLevels(text) {
  const found = [];
  const source = stripHtml(text);
  const patterns = [
    /\[([^\]]+)\]\s*(?:Lv\.?|레벨)\s*(\d+)/g,
    /([가-힣A-Za-z\s]+?)\s*(?:Lv\.?|레벨)\s*(\d+)/g
  ];
  const seen = new Set();
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source)) !== null) {
      const name = normalizeEngravingName(m[1]);
      const level = Number(m[2] || 0);
      if (!name || !level || DEBUFF_ENGRAVING_NAMES.some(d => name.includes(d))) continue;
      const canonical = Object.keys(DEALER_ENGRAVING_RULES).find(key => name.includes(key));
      const finalName = canonical || name;
      const token = `${finalName}:${level}`;
      if (seen.has(token)) continue;
      seen.add(token);
      found.push({ name: finalName, level });
    }
  }
  return found;
}

function extractAbilityStoneEffects(equipment) {
  const result = { ...EMPTY_ENGRAVING_EFFECTS, attackPower: 0, baseAttackPower: 0, engravings: [], items: [] };
  for (const item of Array.isArray(equipment) ? equipment : []) {
    if (item?.Type !== '어빌리티 스톤') continue;
    const text = tooltipText(item.Tooltip);
    const engravings = parseEngravingNameLevels(text);
    const effects = { ...EMPTY_ENGRAVING_EFFECTS };
    for (const e of engravings) {
      const rule = DEALER_ENGRAVING_RULES[e.name];
      if (rule?.stoneByLevel?.[e.level]) addEffectBucket(effects, rule.stoneByLevel[e.level]);
    }
    const atkMatch = text.match(/기본\s*공격력\s*\+(\d+(?:\.\d+)?)%/);
    const baseAttackPower = atkMatch ? Number(atkMatch[1]) : 0;
    if (Number.isFinite(baseAttackPower)) {
      effects.attackPower += baseAttackPower;
      result.baseAttackPower += baseAttackPower;
    }
    roundEffectBucket(effects);
    addEffectBucket(result, effects);
    result.engravings.push(...engravings);
    result.items.push({ type: item.Type, name: item.Name, grade: item.Grade, attackPower: baseAttackPower, baseAttackPower, effects, engravings });
  }
  roundEffectBucket(result);
  result.attackPower = Math.round(result.attackPower * 100) / 100;
  result.baseAttackPower = Math.round(result.baseAttackPower * 100) / 100;
  return result;
}

function extractEngravingEffects(engravingData) {
  const result = { rawText: '', items: [], effects: { ...EMPTY_ENGRAVING_EFFECTS } };
  if (!engravingData) return result;
  const rawText = tooltipText(engravingData);
  result.rawText = rawText.slice(0, 5000);

  const items = parseEngravingNameLevels(rawText)
    .filter(item => DEALER_ENGRAVING_RULES[item.name]?.effectsByLevel?.[item.level]);
  const seen = new Set();
  for (const item of items) {
    const token = `${item.name}:${item.level}`;
    if (seen.has(token)) continue;
    seen.add(token);
    result.items.push(item);
    addEffectBucket(result.effects, DEALER_ENGRAVING_RULES[item.name].effectsByLevel[item.level]);
  }

  // 알려진 딜러 각인명을 찾지 못한 경우에만 제한적인 구형 툴팁 파싱을 fallback으로 사용합니다.
  // 이렇게 해야 아드레날린의 "공격력 0.9%, 최대 6중첩" 같은 문장을 +0.9%로 오인식하지 않습니다.
  if (!result.items.length) {
    const parsed = parseAccessoryText(rawText);
    result.effects.critRate += parsed.critRate;
    result.effects.critDamage += parsed.critDamage;
    result.effects.additionalDamage += parsed.additionalDamage;
    result.effects.enemyDamage += parsed.enemyDamage;
  }

  roundEffectBucket(result.effects);
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
