const LOSTARK_BASE_URL = 'https://developer-lostark.game.onstove.com';
const VERSION = '1.0.8';

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function sanitizeErrorBody(text) {
  return String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

async function fetchLostArk(endpoint, apiKey, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${LOSTARK_BASE_URL}${endpoint}`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `bearer ${apiKey}`
      }
    });

    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      return {
        ok: false,
        status: response.status,
        data: null,
        error: `로스트아크 API가 JSON이 아닌 응답을 반환했습니다: ${sanitizeErrorBody(text)}`
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data,
        error: `로스트아크 API 오류 ${response.status}`
      };
    }

    return { ok: true, status: response.status, data, error: null };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error?.name === 'AbortError'
        ? `로스트아크 API 응답 지연: ${timeoutMs / 1000}초 초과`
        : (error?.message || '로스트아크 API 호출 실패')
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseNumber(value) {
  if (value === undefined || value === null) return 0;
  const n = Number(String(value).replace(/,/g, '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function getStat(profile, type) {
  const found = profile?.Stats?.find((item) => item.Type === type);
  return parseNumber(found?.Value);
}

function getArkPoint(arkpassive, name) {
  const points = Array.isArray(arkpassive?.Points) ? arkpassive.Points : [];
  const found = points.find((item) => String(item.Name || item.Type || '').includes(name));
  return parseNumber(found?.Value || found?.Point || found?.Amount);
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function cleanText(text) {
  return decodeHtmlEntities(text)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectStrings(value, out = []) {
  if (value === null || value === undefined) return out;
  if (typeof value === 'string') {
    const cleaned = cleanText(value);
    if (cleaned) out.push(cleaned);
    return out;
  }
  if (typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, out));
    return out;
  }
  Object.values(value).forEach((item) => collectStrings(item, out));
  return out;
}

function extractPercentNearKeyword(text, keywords) {
  const results = [];
  const escaped = keywords.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const keywordGroup = `(?:${escaped.join('|')})`;
  const percent = `([+-]?\\d+(?:\\.\\d+)?)\\s*%`;
  const patterns = [
    new RegExp(`${keywordGroup}[^%]{0,45}${percent}`, 'g'),
    new RegExp(`${percent}[^.。]*${keywordGroup}`, 'g')
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const numberText = match[1];
      const value = Number(numberText);
      if (Number.isFinite(value)) {
        results.push({ value, source: text.slice(Math.max(0, match.index - 40), match.index + match[0].length + 40) });
      }
    }
  }
  return results;
}

function sumUniqueMatches(matches) {
  const seen = new Set();
  let total = 0;
  const sources = [];
  for (const match of matches) {
    const key = `${match.value}|${match.source.replace(/\s+/g, ' ').slice(0, 160)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += match.value;
    if (sources.length < 5) sources.push(match.source.replace(/\s+/g, ' ').trim());
  }
  return {
    value: Math.round(total * 100) / 100,
    count: seen.size,
    sources
  };
}


function sentenceSplit(text) {
  return cleanText(text)
    .split(/(?<=[.!?。])\s+|[\r\n]+|(?=\s*[•\-※])/g)
    .map((item) => item.replace(/^\s*[•\-※]\s*/, '').trim())
    .filter(Boolean);
}

function normalizeSentence(text) {
  return cleanText(text)
    .replace(/\d+(?:\.\d+)?\s*%/g, (m) => m.replace(/\s+/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function readNodeName(obj, fallback = '출처 미확인') {
  if (!obj || typeof obj !== 'object') return fallback;
  return cleanText(obj.Name || obj.name || obj.Title || obj.title || obj.Type || obj.type || fallback) || fallback;
}

function hasEffectTextObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const name = readNodeName(obj, '');
  const fields = ['Description', 'description', 'Tooltip', 'tooltip', 'Effect', 'effect', 'Value', 'value'];
  const hasText = fields.some((key) => typeof obj[key] === 'string' && obj[key].trim());
  return Boolean(name && hasText);
}

function collectEffectNodes(value, path = [], out = []) {
  if (value === null || value === undefined) return out;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectEffectNodes(item, path.concat(String(index)), out));
    return out;
  }
  if (typeof value !== 'object') return out;

  if (hasEffectTextObject(value)) {
    const name = readNodeName(value);
    const level = parseNumber(value.Level || value.level || value.Grade || value.grade || value.Point || value.point);
    const rawStrings = [];
    ['Description', 'description', 'Tooltip', 'tooltip', 'Effect', 'effect', 'Value', 'value'].forEach((key) => {
      if (typeof value[key] === 'string') rawStrings.push(value[key]);
    });
    out.push({
      name,
      level,
      path: path.join('.'),
      text: cleanText(rawStrings.join(' '))
    });
  }

  for (const [key, child] of Object.entries(value)) {
    collectEffectNodes(child, path.concat(key), out);
  }
  return out;
}

function classifySentence(sentence, node) {
  const text = cleanText(sentence);
  const lowerRiskWords = ['증가한다', '증가합니다', '증가', '획득', '적용'];
  const conditionalWords = ['최대', '중첩', '마다', '시마다', '동안', '이하', '이상', '적중 시', '공격 적중', '사용 시', '발동', '유지', '조건', '파티', '아군', '보스 등급'];
  const suspectWords = ['Lv.1', 'Lv.2', 'Lv.3', '레벨별', '다음 레벨', '미리보기', '잠금', '비활성', '선택 가능', 'Rank'];

  const hasConditional = conditionalWords.some((word) => text.includes(word));
  const hasSuspect = suspectWords.some((word) => text.includes(word));
  const hasActiveCue = lowerRiskWords.some((word) => text.includes(word));

  if (hasSuspect) return 'suspect';
  if (hasConditional) return 'conditional';
  if (hasActiveCue || node.level > 0) return 'confirmed';
  return 'suspect';
}

function extractMatchesFromSentence(sentence, keywords) {
  const results = [];
  const escaped = keywords.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const keywordGroup = `(?:${escaped.join('|')})`;
  const percent = `([+-]?\d+(?:\.\d+)?)\s*%`;
  const patterns = [
    new RegExp(`${keywordGroup}[^%]{0,60}${percent}`, 'g'),
    new RegExp(`${percent}[^.。%]{0,60}${keywordGroup}`, 'g')
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(sentence)) !== null) {
      const value = Number(match[1]);
      if (Number.isFinite(value)) results.push(value);
    }
  }
  return results;
}

function createEmptyEffect() {
  return {
    value: 0,
    confirmed: [],
    conditional: [],
    suspect: []
  };
}

function pushEffect(bucket, item) {
  const key = `${item.node}|${item.sentence}|${item.value}|${item.type}`;
  const exists = bucket.some((row) => `${row.node}|${row.sentence}|${row.value}|${row.type}` === key);
  if (!exists) bucket.push(item);
}

function finalizeEffect(effect) {
  const total = effect.confirmed.reduce((sum, item) => sum + item.value, 0);
  effect.value = Math.round(total * 100) / 100;
  effect.confirmed = effect.confirmed.slice(0, 12);
  effect.conditional = effect.conditional.slice(0, 12);
  effect.suspect = effect.suspect.slice(0, 12);
  return effect;
}

function extractArkEffects(arkpassive) {
  const definitions = {
    evolutionDamage: { label: '진화형 피해', keywords: ['진화형 피해', '진화형 피해량'] },
    damageToEnemy: { label: '적에게 주는 피해', keywords: ['적에게 주는 피해', '주는 피해량', '주는 피해'] },
    additionalDamage: { label: '추가 피해', keywords: ['추가 피해', '추가 피해량'] },
    critRate: { label: '치명타 적중률', keywords: ['치명타 적중률', '치명타 적중', '치명타 확률'] },
    critDamage: { label: '치명타 피해', keywords: ['치명타 피해량', '치명타 피해'] },
    attackSpeed: { label: '공격속도', keywords: ['공격속도', '공격 속도'] },
    moveSpeed: { label: '이동속도', keywords: ['이동속도', '이동 속도'] }
  };

  const nodes = collectEffectNodes(arkpassive)
    .filter((node) => node.text && !/비활성|잠금|선택하지 않음|미선택/.test(node.text));

  const extracted = Object.fromEntries(Object.keys(definitions).map((key) => [key, createEmptyEffect()]));
  const seenSentences = new Set();

  for (const node of nodes) {
    const sentences = sentenceSplit(node.text);
    for (const sentence of sentences) {
      const normalized = normalizeSentence(sentence);
      if (!normalized || seenSentences.has(`${node.name}|${normalized}`)) continue;
      seenSentences.add(`${node.name}|${normalized}`);

      for (const [key, definition] of Object.entries(definitions)) {
        const values = extractMatchesFromSentence(sentence, definition.keywords);
        for (const value of values) {
          const type = classifySentence(sentence, node);
          const item = {
            node: node.name,
            level: node.level || null,
            value,
            type,
            sentence: normalized.slice(0, 220)
          };
          pushEffect(extracted[key][type], item);
        }
      }
    }
  }

  for (const key of Object.keys(extracted)) finalizeEffect(extracted[key]);

  return {
    version: 'source-aware-1',
    note: '확정 효과만 합산하고, 조건부/의심 문구는 계산에서 제외했습니다.',
    nodeCount: nodes.length,
    effects: extracted,
    legacy: Object.fromEntries(Object.entries(extracted).map(([key, value]) => [key, { value: value.value }]))
  };
}


export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { version: VERSION, error: 'GET 요청만 지원합니다.' });
  }

  const apiKey = process.env.LOSTARK_API_KEY;
  if (!apiKey) {
    return json(res, 500, {
      version: VERSION,
      error: 'LOSTARK_API_KEY 환경변수가 없습니다. Vercel Settings > Environment Variables에서 추가하세요.'
    });
  }

  const name = String(req.query?.name || '').trim();
  if (!name) {
    return json(res, 400, {
      version: VERSION,
      error: '캐릭터명을 입력하세요. 예: /api/character?name=무사브'
    });
  }

  const encodedName = encodeURIComponent(name);
  const [profileResult, arkpassiveResult] = await Promise.all([
    fetchLostArk(`/armories/characters/${encodedName}/profiles`, apiKey),
    fetchLostArk(`/armories/characters/${encodedName}/arkpassive`, apiKey)
  ]);

  if (!profileResult.ok) {
    const status = profileResult.status === 404 ? 404 : 502;
    return json(res, status, {
      version: VERSION,
      characterName: name,
      error: profileResult.status === 404
        ? '캐릭터를 찾지 못했습니다. 캐릭터명/서버/공개 상태를 확인하세요.'
        : '프로필 조회에 실패했습니다.',
      apiErrors: {
        profile: profileResult.error,
        arkpassive: arkpassiveResult.ok ? null : arkpassiveResult.error
      }
    });
  }

  const profile = profileResult.data;
  const arkpassive = arkpassiveResult.ok ? arkpassiveResult.data : null;

  return json(res, 200, {
    version: VERSION,
    characterName: name,
    profile,
    arkpassive,
    summary: {
      characterClass: profile?.CharacterClassName || '',
      serverName: profile?.ServerName || '',
      itemLevel: profile?.ItemMaxLevel || profile?.ItemAvgLevel || '',
      stats: {
        crit: getStat(profile, '치명'),
        specialization: getStat(profile, '특화'),
        swiftness: getStat(profile, '신속')
      },
      arkPoints: {
        evolution: getArkPoint(arkpassive, '진화'),
        enlightenment: getArkPoint(arkpassive, '깨달음'),
        leap: getArkPoint(arkpassive, '도약')
      }
    },
    extractedEffects: extractArkEffects(arkpassive),
    apiErrors: {
      profile: null,
      arkpassive: arkpassiveResult.ok ? null : arkpassiveResult.error
    }
  });
}
