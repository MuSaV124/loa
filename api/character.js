const BASE_URL = 'https://developer-lostark.game.onstove.com';

const ENDPOINTS = {
  profile: '/armories/characters/{name}/profiles',
  equipment: '/armories/characters/{name}/equipment',
  engravings: '/armories/characters/{name}/engravings',
  gems: '/armories/characters/{name}/gems',
  cards: '/armories/characters/{name}/cards',
  arkpassive: '/armories/characters/{name}/arkpassive'
};

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

function summarizeEquipment(equipment = []) {
  return equipment.map((item) => ({
    type: item.Type,
    name: item.Name,
    grade: item.Grade,
    quality: item.Quality,
    icon: item.Icon,
    tooltip: item.Tooltip
  }));
}

function makeRecommendation({ profile, equipment, engravings, gems, cards, arkpassive }) {
  const itemLevel = parseNumber(profile?.ItemMaxLevel || profile?.ItemAvgLevel);
  const critical = getStat(profile, '치명');
  const specialization = getStat(profile, '특화');
  const swiftness = getStat(profile, '신속');
  const evolution = getArkPoint(arkpassive, '진화');
  const enlightenment = getArkPoint(arkpassive, '깨달음');
  const leap = getArkPoint(arkpassive, '도약');

  const accessories = equipment.filter((item) => ['목걸이', '귀걸이', '반지'].includes(item.Type));
  const highQualityAccessories = accessories.filter((item) => parseNumber(item.Quality) >= 80).length;
  const gemsCount = gems?.Gems?.length || 0;
  const engravingCount = engravings?.Effects?.length || engravings?.ArkPassiveEffects?.length || 0;

  const warnings = [];
  if (!profile) warnings.push('프로필 정보를 불러오지 못했습니다.');
  if (!equipment?.length) warnings.push('장비 정보를 불러오지 못했습니다.');
  if (itemLevel < 1640) warnings.push('4티어 구간 진입 전이면 추천 정확도가 낮습니다.');
  if (accessories.length && highQualityAccessories < accessories.length) warnings.push('악세 품질 80 미만 부위가 있어 우선 교체 후보입니다.');
  if (gemsCount < 11) warnings.push('보석 개수가 11개보다 적습니다. 누락 여부를 확인하세요.');

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
      accessories: accessories.map((item) => ({ type: item.Type, name: item.Name, grade: item.Grade, quality: item.Quality })),
      gemsCount,
      engravingCount
    },
    warnings,
    note: '추천 로직은 기본 골격입니다. 기존 4티어/5티어 계산식이 있으면 public/app.js의 renderRecommendation 또는 서버의 makeRecommendation에 그대로 연결하면 됩니다.'
  };
}

async function fetchLostArk(path, apiKey) {
  const res = await fetch(`${BASE_URL}${path}`, {
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
    const entries = await Promise.all(
      Object.entries(ENDPOINTS).map(async ([key, template]) => {
        const path = template.replace('{name}', encodedName);
        try {
          return [key, await fetchLostArk(path, apiKey)];
        } catch (error) {
          return [key, { error: error.message }];
        }
      })
    );

    const data = Object.fromEntries(entries);
    const recommendation = makeRecommendation(data);

    return json({
      characterName: name,
      profile: data.profile,
      equipmentSummary: summarizeEquipment(data.equipment || []),
      engravings: data.engravings,
      gems: data.gems,
      cards: data.cards,
      arkpassive: data.arkpassive,
      recommendation
    });
  } catch (error) {
    return json({ error: error.message || '서버 오류가 발생했습니다.' }, 500);
  }
}
