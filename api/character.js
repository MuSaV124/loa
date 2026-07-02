export default async function handler(req, res) {
  try {
    const name = String(req.query.name || '').trim();

    if (!name) return res.status(400).json({ error: '캐릭터명을 입력하세요.' });

    const apiKey = process.env.LOSTARK_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Vercel 환경변수 LOSTARK_API_KEY가 없습니다.' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    const url = `https://developer-lostark.game.onstove.com/armories/characters/${encodeURIComponent(name)}?filters=profiles+equipment+arkpassive`;

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

    return res.status(200).json({ ok: true, apiVersion: '2.3.0', profile, arkPassive, equipment, accessoryEffects, braceletEffects, raw: data });
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
  const result = { critRate: 0, critDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
  const accessoryTypes = new Set(['목걸이', '귀걸이', '반지']);
  for (const item of Array.isArray(equipment) ? equipment : []) {
    if (!accessoryTypes.has(item?.Type)) continue;
    const text = tooltipText(item.Tooltip);
    const effects = parseAccessoryText(text);
    result.critRate += effects.critRate;
    result.critDamage += effects.critDamage;
    result.enemyDamage += effects.enemyDamage;
    result.additionalDamage += effects.additionalDamage;
    result.items.push({ type: item.Type, name: item.Name, grade: item.Grade, effects });
  }
  for (const key of ['critRate', 'critDamage', 'enemyDamage', 'additionalDamage']) result[key] = Math.round(result[key] * 100) / 100;
  return result;
}

function extractBraceletEffects(equipment) {
  const result = { critRate: 0, critDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
  for (const item of Array.isArray(equipment) ? equipment : []) {
    if (item?.Type !== '팔찌') continue;
    const text = tooltipText(item.Tooltip);
    const effects = parseAccessoryText(text);
    result.critRate += effects.critRate;
    result.critDamage += effects.critDamage;
    result.enemyDamage += effects.enemyDamage;
    result.additionalDamage += effects.additionalDamage;
    result.items.push({ type: item.Type, name: item.Name, grade: item.Grade, effects });
  }
  for (const key of ['critRate', 'critDamage', 'enemyDamage', 'additionalDamage']) result[key] = Math.round(result[key] * 100) / 100;
  return result;
}

function parseAccessoryText(text) {
  const out = { critRate: 0, critDamage: 0, enemyDamage: 0, additionalDamage: 0 };
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

  // "무력화 상태의 적에게 주는 피해"는 별도 조건부라 제외하고,
  // 일반 적주피/쿨증 적주피/치명타 적중 시 적주피/백·헤드·비방향성 적주피는 자동 합산합니다.
  addMatches(out, 'enemyDamage', source, [
    /(?<!무력화\s*상태의\s*)적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /공격이\s*치명타로\s*적중\s*시\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
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
      const token = `${key}:${match.index}:${match[0]}`;
      if (seen.has(token)) continue;
      seen.add(token);
      out[key] += value;
    }
  }
}
