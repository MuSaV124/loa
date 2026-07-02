const LOSTARK_BASE_URL = 'https://developer-lostark.game.onstove.com';
const VERSION = '1.0.7';

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

function extractArkEffects(arkpassive) {
  const texts = collectStrings(arkpassive);
  const uniqueTexts = [...new Set(texts)];

  const definitions = {
    evolutionDamage: ['진화형 피해', '진화형 피해량'],
    damageToEnemy: ['적에게 주는 피해', '주는 피해량', '주는 피해'],
    additionalDamage: ['추가 피해', '추가 피해량'],
    critRate: ['치명타 적중률', '치명타 적중', '치명타 확률'],
    critDamage: ['치명타 피해량', '치명타 피해'],
    attackSpeed: ['공격속도', '공격 속도'],
    moveSpeed: ['이동속도', '이동 속도']
  };

  const extracted = {};
  for (const [key, keywords] of Object.entries(definitions)) {
    const matches = uniqueTexts.flatMap((text) => extractPercentNearKeyword(text, keywords));
    extracted[key] = sumUniqueMatches(matches);
  }

  return extracted;
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
