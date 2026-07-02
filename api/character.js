const BASE_URL = 'https://developer-lostark.game.onstove.com';

const ENDPOINTS = {
  profile: '/armories/characters/{name}/profiles',
  equipment: '/armories/characters/{name}/equipment',
  engravings: '/armories/characters/{name}/engravings',
  gems: '/armories/characters/{name}/gems',
  cards: '/armories/characters/{name}/cards',
  arkpassive: '/armories/characters/{name}/arkpassive',
  combatSkills: '/armories/characters/{name}/combat-skills'
};

const EFFECT_RULES = [
  {
    key: 'evolutionDamage',
    label: '진화형 피해',
    aliases: ['진화형 피해']
  },
  {
    key: 'damageToEnemy',
    label: '적에게 주는 피해량',
    aliases: ['적에게 주는 피해량', '적에게 주는 피해', '적에게 주는 데미지']
  },
  {
    key: 'additionalDamage',
    label: '추가 피해',
    aliases: ['추가 피해', '추가피해']
  },
  {
    key: 'critRate',
    label: '치명타 적중률',
    aliases: ['치명타 적중률', '치명타 적중', '치명타 확률', '치명타 발생률']
  },
  {
    key: 'critDamage',
    label: '치명타 피해',
    aliases: ['치명타 피해량', '치명타 피해']
  },
  {
    key: 'attackSpeed',
    label: '공격속도',
    aliases: ['공격속도', '공격 속도']
  },
  {
    key: 'moveSpeed',
    label: '이동속도',
    aliases: ['이동속도', '이동 속도']
  }
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
  const groups = [
    ['진화', arkpassive?.Effects],
    ['깨달음', arkpassive?.ArkPassiveEffects || arkpassive?.EnlightenmentEffects],
    ['도약', arkpassive?.LeapEffects]
  ];

  for (const [groupName, list] of groups) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      sources.push({
        area: groupName,
        name: item.Name || item.NameTag || item.Title || groupName,
        level: item.Level || item.Grade || item.Point || '',
        text: cleanText(item.Description || item.Tooltip || item)
      });
    }
  }

  // API 응답 구조가 바뀌어도 최소한 전체 arkpassive 텍스트에서 한 번 더 추출되도록 보조 소스 추가
  sources.push({
    area: '아크패시브 전체',
    name: '전체 텍스트',
    level: '',
    text: cleanText(arkpassive)
  });

  return sources;
}

function collectTripodSources(combatSkills) {
  const sources = [];
  const skills = Array.isArray(combatSkills) ? combatSkills : combatSkills?.Skills || [];

  for (const skill of skills) {
    const skillName = skill.Name || skill.SkillName || '스킬';
    const tripods = skill.Tripods || skill.Tripod || skill.Runes || [];
    if (Array.isArray(tripods)) {
      for (const tripod of tripods) {
        // 선택된 트라이포드만 우선 추출. selected 필드가 없으면 레벨이 있는 항목만 포함.
        const isSelected = tripod.IsSelected === true || tripod.Selected === true || parseNumber(tripod.Level) > 0;
        if (!isSelected) continue;
        sources.push({
          area: '트라이포드',
          name: `${skillName} - ${tripod.Name || tripod.TripodName || '트라이포드'}`,
          level: tripod.Level || '',
          text: cleanText(tripod.Description || tripod.Tooltip || tripod)
        });
      }
    }

    sources.push({
      area: '스킬',
      name: skillName,
      level: skill.Level || '',
      text: cleanText(skill.Description || skill.Tooltip || '')
    });
  }

  return sources;
}

function extractEffectFromText(text, rule) {
  const hits = [];
  const clean = cleanText(text);
  if (!clean) return hits;

  for (const alias of rule.aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`${escaped}[^0-9+\-]{0,35}([+\-]?\\d+(?:\\.\\d+)?)\\s*%`, 'g'),
      new RegExp(`([+\-]?\\d+(?:\\.\\d+)?)\\s*%[^가-힣]{0,20}${escaped}`, 'g')
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

function getSentence(text, index) {
  const start = Math.max(0, text.lastIndexOf('.', index), text.lastIndexOf('。', index), text.lastIndexOf('\\n', index));
  const endCandidates = ['.', '。', '\\n'].map((ch) => text.indexOf(ch, index)).filter((v) => v >= 0);
  const end = endCandidates.length ? Math.min(...endCandidates) : Math.min(text.length, index + 140);
  return text.slice(start, end).replace(/^\W+/, '').trim().slice(0, 180);
}

function extractEffects({ arkpassive, combatSkills }) {
  const sources = [
    ...collectArkPassiveSources(arkpassive),
    ...collectTripodSources(combatSkills)
  ];

  const result = {};
  for (const rule of EFFECT_RULES) {
    result[rule.key] = {
      label: rule.label,
      total: 0,
      hits: []
    };
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

function makeRecommendation({ profile, equipment, engravings, gems, arkpassive, combatSkills }) {
  const itemLevel = parseNumber(profile?.ItemMaxLevel || profile?.ItemAvgLevel);
  const critical = getStat(profile, '치명');
  const specialization = getStat(profile, '특화');
  const swiftness = getStat(profile, '신속');
  const evolution = getArkPoint(arkpassive, '진화');
  const enlightenment = getArkPoint(arkpassive, '깨달음');
  const leap = getArkPoint(arkpassive, '도약');
  const extractedEffects = extractEffects({ arkpassive, combatSkills });

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
      effects: extractedEffects,
      accessories: accessories.map((item) => ({ type: item.Type, name: item.Name, grade: item.Grade, quality: item.Quality })),
      gemsCount,
      engravingCount
    },
    warnings,
    note: '진피/적주피/추피/치적/치피/공속/이속은 아크패시브와 선택 트라이포드 설명문에서 추출합니다. API 툴팁 문구 차이에 따라 누락이 있으면 원본 확인용 JSON에서 문구를 보고 파서 규칙을 추가하면 됩니다.'
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
      combatSkills: data.combatSkills,
      recommendation
    });
  } catch (error) {
    return json({ error: error.message || '서버 오류가 발생했습니다.' }, 500);
  }
}
