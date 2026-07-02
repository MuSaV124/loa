const LOSTARK_BASE_URL = 'https://developer-lostark.game.onstove.com';
const VERSION = '1.0.5';

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
    apiErrors: {
      profile: null,
      arkpassive: arkpassiveResult.ok ? null : arkpassiveResult.error
    }
  });
}
