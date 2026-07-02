const BASE_URL = 'https://developer-lostark.game.onstove.com';

// v3: Vercel Hobby 타임아웃 방지용 최소 조회 버전
// 우선 profile + arkpassive만 조회합니다. 스킬/트라이포드는 다음 버전에서 별도 API로 분리 예정.
const ENDPOINTS = {
  profile: '/armories/characters/{name}/profiles',
  arkpassive: '/armories/characters/{name}/arkpassive'
};

const EFFECT_RULES = [
  { key: 'evolutionDamage', label: '진화형 피해', aliases: ['진화형 피해'] },
  { key: 'damageToEnemy', label: '적에게 주는 피해량', aliases: ['적에게 주는 피해량', '적에게 주는 피해', '적에게 주는 데미지'] },
  { key: 'additionalDamage', label: '추가 피해', aliases: ['추가 피해', '추가피해'] },
  { key: 'critRate', label: '치명타 적중률', aliases: ['치명타 적중률', '치명타 적중', '치명타 확률', '치명타 발생률'] },
  { key: 'critDamage', label: '치명타 피해', aliases: ['치명타 피해량', '치명타 피해'] },
  { key: 'attackSpeed', label: '공격속도', aliases: ['공격속도', '공격 속도'] },
  { key: 'moveSpeed', label: '이동속도', aliases: ['이동속도', '이동 속도'] }
];

function json(res, status = 200) {
  return new Response(JSON.stringify(res, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 's-maxage=30, stale-while-revalidate=300'
    }
  });
}

function parseNumber(value) {
  if (value === undefined || value === null) return 0;
  const n = Number(String(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function getStat(profile, statName) {
  const stat = profile?.Stats?.find((s) => s.Type === statName);
  return parseNumber(stat?.Value);
}

function getArkPoint(arkpassive, keyword) {
  const points = arkpassive?.Points || arkpassive?.points || [];
  const found = points.find((p) => String(p.Name || p.Type || '').includes(keyword));
  return parseNumber(found?.Value || found?.Point || found?.Amount);
}

function cleanText(value) {
  if (value === undefined || value === null) return '';
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectArkPassiveSources(arkpassive) {
  const sources = [];

  // 실제 API 구조가 바뀔 수 있어 여러 후보를 모두 훑습니다.
  const buckets = [
    ['진화', arkpassive?.Effects],
    ['진화', arkpassive?.EvolutionEffects],
    ['깨달음', arkpassive?.ArkPassiveEffects],
    ['깨달음', arkpassive?.EnlightenmentEffects],
    ['도약', arkpassive?.LeapEffects]
  ];

  for (const [area, list] of buckets) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      sources.push({
        area,
        name: item.Name || item.NameTag || item.Title || area,
        level: item.Level || item.Grade || item.Point || '',
        text: cleanText(item.Description || item.Tooltip || item)
      });
    }
  }

  // 구조 미확인 대비: 전체 JSON에서도 한 번 더 찾기
  if (arkpassive) {
    sources.push({
      area: '아크패시브 전체',
      name: '전체 텍스트',
      level: '',
      text: cleanText(arkpassive)
    });
  }

  return sources;
}

function getSentence(text, index) {
  const startCandidates = ['.', '。', '\n'].map((ch) => text.lastIndexOf(ch, index)).filter((v) => v >= 0);
  const start = startCandidates.length ? Math.max(...startCandidates) + 1 : 0;
  const endCandidates = ['.', '。', '\n'].map((ch) => text.indexOf(ch, index)).filter((v) => v >= 0);
  const end = endCandidates.length ? Math.min(...endCandidates) : Math.min(text.length, index + 160);
  return text.slice(start, end).replace(/^\W+/, '').trim().slice(0, 200);
}

function extractEffectFromText(text, rule) {
  const hits = [];
  const clean = cleanText(text);
  if (!clean) return hits;

  for (const alias of rule.aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`${escaped}[^0-9+\-]{0,45}([+\-]?\\d+(?:\\.\\d+)?)\\s*%`, 'g'),
      new RegExp(`([+\-]?\\d+(?:\\.\\d+)?)\\s*%[^가-힣]{0,25}${escaped}`, 'g')
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(clean)) !== null) {
        const value = Number(match[1]);
        if (Number.isFinite(value)) {
          hits.push({ value, alias, sentence: getSentence(clean, match.index) });
        }
      }
    }
  }

  return hits;
}

function extractEffects({ arkpassive }) {
  const sources = collectArkPassiveSources(arkpassive);
  const result = {};

  for (const rule of EFFECT_RULES) {
    result[rule.key] = { label: rule.label, total: 0, hits: [] };
  }

  const seen = new Set();
  for (const source of sources) {
    for (const rule of EFFECT_RULES) {
      const hits = extractEffectFromText(source.text, rule);
      for (const hit of hits) {
        const id = `${rule.key}|${source.area}|${source.name}|${source.level}|${hit.value}|${hit.sentence}`;
        if (seen.has(id)) continue;
        seen.add(id);
        result[rule.key].total += hit.value;
        result[rule.key].hits.push({
          value: hit.value,
          area: source.area,
          source: source.name,
          level: source.level,
          matchedBy: hit.alias,
          text: hit.sentence
        });
      }
    }
  }

  return result;
}

function makeRecommendation({ profile = null, arkpassive = null }) {
  const itemLevel = parseNumber(profile?.ItemMaxLevel || profile?.ItemAvgLevel);
  const critical = getStat(profile, '치명');
  const specialization = getStat(profile, '특화');
  const swiftness = getStat(profile, '신속');
  const evolution = getArkPoint(arkpassive, '진화');
  const enlightenment = getArkPoint(arkpassive, '깨달음');
  const leap = getArkPoint(arkpassive, '도약');
  const extractedEffects = extractEffects({ arkpassive });

  const warnings = [];
  if (!profile) warnings.push('프로필 정보를 불러오지 못했습니다.');
  if (!arkpassive) warnings.push('아크패시브 정보를 불러오지 못했습니다.');
  if (itemLevel && itemLevel < 1640) warnings.push('4티어 구간 진입 전이면 추천 정확도가 낮습니다.');
  warnings.push('v3 최소 조회 버전입니다. 현재는 프로필과 아크패시브만 조회하며, 스킬 트라이포드는 다음 버전에서 별도 조회로 추가합니다.');

  let tierText = '기본 추천';
  if (itemLevel >= 1680 || evolution >= 120) tierText = '5티어/상위 세팅 검토 가능';
  else if (itemLevel >= 1640) tierText = '4티어 세팅 우선 최적화';

  return {
    tierText,
    autoInputs: {
      characterClass: profile?.CharacterClassName || '',
      itemLevel,
      critical,
      specialization,
      swiftness,
      evolution,
      enlightenment,
      leap,
      effects: extractedEffects
    },
    warnings,
    note: '진피/적주피/추피/치적/치피/공속/이속은 우선 아크패시브 설명문에서 추출합니다.'
  };
}

async function fetchLostArk(path, apiKey, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        authorization: `bearer ${apiKey}`
      }
    });

    if (res.status === 404) return null;

    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      throw new Error(`LostArk API ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`LostArk API 응답 지연: ${timeoutMs / 1000}초 초과`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(request) {
  try {
    const apiKey = process.env.LOSTARK_API_KEY;
    if (!apiKey) {
      return json({ error: 'LOSTARK_API_KEY 환경변수가 없습니다. Vercel Project Settings > Environment Variables에 추가하세요.' }, 500);
    }

    const url = new URL(request.url);
    const name = url.searchParams.get('name')?.trim();
    if (!name) {
      return json({ error: '캐릭터명을 입력하세요. 예: /api/character?name=캐릭터명' }, 400);
    }

    const encodedName = encodeURIComponent(name);
    const data = {};

    // 순차 조회: 한 API가 느려도 원인 파악이 쉽고, Hobby 타임아웃 위험이 줄어듭니다.
    for (const [key, template] of Object.entries(ENDPOINTS)) {
      const path = template.replace('{name}', encodedName);
      try {
        data[key] = await fetchLostArk(path, apiKey);
      } catch (error) {
        data[key] = { error: error.message };
      }
    }

    const recommendation = makeRecommendation(data);

    return json({
      version: 'v3.0.0-minimal-timeout-fix',
      characterName: name,
      profile: data.profile?.error ? null : data.profile,
      arkpassive: data.arkpassive?.error ? null : data.arkpassive,
      apiErrors: {
        profile: data.profile?.error || null,
        arkpassive: data.arkpassive?.error || null
      },
      equipmentSummary: [],
      recommendation
    });
  } catch (error) {
    return json({ error: error.message || '서버 오류가 발생했습니다.' }, 500);
  }
}
