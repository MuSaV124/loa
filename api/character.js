const LOSTARK_BASE_URL = 'https://developer-lostark.game.onstove.com';
const VERSION = '1.1.0';

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

function preview(value, max = 260) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return cleanText(value).slice(0, max);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value).slice(0, max); } catch { return String(value).slice(0, max); }
}

function typeOf(value) {
  if (Array.isArray(value)) return `array(${value.length})`;
  if (value === null) return 'null';
  return typeof value;
}

function listFieldPaths(value, path = 'ArkPassive', rows = [], depth = 0) {
  if (rows.length >= 160 || depth > 6) return rows;

  const row = { path, type: typeOf(value), sample: preview(value, 180) };
  rows.push(row);

  if (!value || typeof value !== 'object') return rows;

  if (Array.isArray(value)) {
    if (value.length > 0) listFieldPaths(value[0], `${path}[0]`, rows, depth + 1);
    return rows;
  }

  for (const [key, child] of Object.entries(value)) {
    listFieldPaths(child, `${path}.${key}`, rows, depth + 1);
  }
  return rows;
}

function findLikelyNodeObjects(value, path = 'ArkPassive', rows = [], depth = 0) {
  if (rows.length >= 80 || depth > 8 || value === null || value === undefined) return rows;

  if (Array.isArray(value)) {
    value.forEach((item, index) => findLikelyNodeObjects(item, `${path}[${index}]`, rows, depth + 1));
    return rows;
  }

  if (typeof value !== 'object') return rows;

  const keys = Object.keys(value);
  const text = [value.Name, value.name, value.Type, value.type, value.Description, value.description, value.Tooltip, value.tooltip]
    .filter(Boolean)
    .map((item) => preview(item, 220))
    .join(' ');

  const hasName = keys.some((key) => /name|title|type/i.test(key));
  const hasTooltip = keys.some((key) => /description|tooltip|effect|value/i.test(key));
  const hasPassiveWord = /진화|깨달음|도약|노드|Ark|Passive|Evolution|Enlightenment|Leap|Lv\.?|레벨|피해|치명|속도/i.test(text);

  if ((hasName && hasTooltip) || hasPassiveWord) {
    rows.push({
      path,
      keys: keys.slice(0, 16),
      name: cleanText(value.Name || value.name || value.Title || value.title || value.Type || value.type || ''),
      level: value.Level ?? value.level ?? value.NodeLevel ?? value.nodeLevel ?? value.Grade ?? value.grade ?? null,
      sample: text.slice(0, 500)
    });
  }

  for (const [key, child] of Object.entries(value)) {
    findLikelyNodeObjects(child, `${path}.${key}`, rows, depth + 1);
  }
  return rows;
}

function analyzeArkPassive(arkpassive) {
  if (!arkpassive) {
    return {
      available: false,
      message: 'ArkPassive 응답이 없습니다.',
      rootKeys: [],
      points: [],
      fieldPaths: [],
      likelyNodeObjects: []
    };
  }

  return {
    available: true,
    message: 'Open API ArkPassive 원본 구조 분석 결과입니다. 이 결과로 노드명/레벨 위치를 확정합니다.',
    rootKeys: Object.keys(arkpassive),
    points: Array.isArray(arkpassive.Points) ? arkpassive.Points : [],
    fieldPaths: listFieldPaths(arkpassive),
    likelyNodeObjects: findLikelyNodeObjects(arkpassive),
    rawPreview: JSON.stringify(arkpassive, null, 2).slice(0, 12000)
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
    analysis: analyzeArkPassive(arkpassive),
    apiErrors: {
      profile: null,
      arkpassive: arkpassiveResult.ok ? null : arkpassiveResult.error
    }
  });
}
