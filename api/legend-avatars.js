const API_VERSION = '5.7.49';
const MARKET_ENDPOINT = 'https://developer-lostark.game.onstove.com/markets/items';
const CDN_PREFIX = 'https://cdn-lostark.game.onstove.com/';

const PARTS = ['머리', '상의', '하의', '무기'];
const PART_CATEGORY_CODES = {
  '무기': 20005,
  '머리': 20010,
  '상의': 20050,
  '하의': 20060
};

const JOB_CLASS_IDS = {
  '버서커': 102,
  '디스트로이어': 103,
  '워로드': 104,
  '홀리나이트': 105,
  '슬레이어': 112,
  '발키리': 113,
  '아르카나': 202,
  '서머너': 203,
  '바드': 204,
  '소서리스': 205,
  '배틀마스터': 302,
  '인파이터': 303,
  '기공사': 304,
  '창술사': 305,
  '스트라이커': 312,
  '브레이커': 313,
  '블레이드': 402,
  '데모닉': 403,
  '리퍼': 404,
  '소울이터': 405,
  '호크아이': 502,
  '데빌헌터': 503,
  '블래스터': 504,
  '스카우터': 505,
  '건슬링어': 512,
  '도화가': 602,
  '기상술사': 603,
  '환수사': 604,
  '차원술사': 612,
  '가디언나이트': 702
};

const JOB_GROUPS = [
  { group: '전사', jobs: ['디스트로이어','발키리','버서커','슬레이어','워로드','홀리나이트'] },
  { group: '무도가', jobs: ['기공사','배틀마스터','브레이커','스트라이커','인파이터','창술사'] },
  { group: '헌터', jobs: ['건슬링어','데빌헌터','블래스터','스카우터','호크아이'] },
  { group: '마법사', jobs: ['바드','서머너','소서리스','아르카나'] },
  { group: '암살자', jobs: ['데모닉','리퍼','블레이드','소울이터'] },
  { group: '스페셜리스트', jobs: ['기상술사','도화가','환수사','차원술사'] },
  { group: '오리지널', jobs: ['가디언나이트'] }
];

const JOBS = JOB_GROUPS.flatMap(g => g.jobs);
const JOB_CACHE = globalThis.__legendAvatarJobCacheV508 || (globalThis.__legendAvatarJobCacheV508 = new Map());
const CACHE_TTL_MS = 1000 * 60 * 5;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const apiKey = process.env.LOSTARK_API_KEY;
    if (!apiKey) return res.status(500).json({ ok: false, error: 'Vercel 환경변수 LOSTARK_API_KEY가 없습니다.' });

    const job = String(req.query.job || '').trim();
    const part = String(req.query.part || '').trim();
    const all = String(req.query.all || '').trim() === '1';
    const force = String(req.query.force || '').trim() === '1';

    if (all && !job) {
      return res.status(200).json({
        ok: true,
        apiVersion: API_VERSION,
        source: 'markets/items',
        mode: 'ready',
        message: '직업을 선택하면 해당 직업의 전설 아바타 최저가를 조회합니다.',
        jobs: JOBS,
        groups: JOB_GROUPS,
        partCategoryCodes: PART_CATEGORY_CODES,
        jobClassIds: JOB_CLASS_IDS
      });
    }

    if (!job) return res.status(400).json({ ok: false, error: '조회할 직업을 선택하세요.' });
    if (!JOB_CLASS_IDS[job]) return res.status(400).json({ ok: false, error: `${job}의 characterClass ID가 없습니다.` });

    const cacheKey = `${job}:${part || 'set'}`;
    const cached = JOB_CACHE.get(cacheKey);
    if (!force && cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
      return res.status(200).json({ ...cached.data, cached: true });
    }

    let body;
    if (part && PARTS.includes(part)) {
      const result = await fetchLegendAvatarPart(apiKey, job, part);
      body = {
        ok: true,
        apiVersion: API_VERSION,
        source: 'markets/items',
        strategy: 'direct-part-category+official-characterClass',
        mode: 'single-job-part',
        job,
        part,
        ...result
      };
    } else {
      const partResults = await Promise.all(PARTS.map(p => fetchLegendAvatarPart(apiKey, job, p).then(r => [p, r])));
      const parts = { 머리: null, 상의: null, 하의: null, 무기: null };
      const tried = [];
      let scanned = 0;
      for (const [p, r] of partResults) {
        parts[p] = r.item || null;
        tried.push(...(r.tried || []));
        scanned += Number(r.scanned || 0);
      }
      const matched = Object.values(parts).filter(Boolean);
      body = {
        ok: true,
        apiVersion: API_VERSION,
        source: 'markets/items',
        strategy: 'direct-part-category+official-characterClass',
        mode: 'single-job-set',
        job,
        jobClassId: JOB_CLASS_IDS[job],
        partCategoryCodes: PART_CATEGORY_CODES,
        parts,
        totalPrice: matched.reduce((sum, item) => sum + Number(item.price || 0), 0),
        complete: PARTS.every(p => !!parts[p]),
        matchedCount: matched.length,
        matched,
        scanned,
        tried
      };
    }

    JOB_CACHE.set(cacheKey, { createdAt: Date.now(), data: body });
    return res.status(200).json(body);
  } catch (error) {
    const message = error.name === 'AbortError' ? '거래소 API 응답 시간이 길어서 중단했습니다.' : error.message;
    return res.status(500).json({ ok: false, error: '서버 함수 오류', message });
  }
}

async function fetchLegendAvatarPart(apiKey, job, part) {
  const jobClassId = JOB_CLASS_IDS[job];
  const categoryCode = PART_CATEGORY_CODES[part];
  const tried = [];

  // 5.0.8: 공식 홈페이지 Form Data에서 확인한 구조를 Open API 형식에 맞춰 적용한다.
  // 홈페이지: firstCategory=20000, secondCategory=부위코드, characterClass=직업ID, grade=4, tier=0, sortType=7
  // Open API: CategoryCode=secondCategory, CharacterClass=직업명 우선, ItemGrade='전설', ItemTier=0/null, Sort='CURRENT_MIN_PRICE'
  // 핵심 변경점: 부위별 CategoryCode를 이미 신뢰하므로 결과명/Tooltip 부위 정규식으로 다시 걸러내지 않는다.
  const payloadBatches = [
    [
      makePayload(categoryCode, job, '', 0),
      makePayload(categoryCode, job, '', null)
    ],
    [
      makePayload(categoryCode, jobClassId, '', 0),
      makePayload(categoryCode, String(jobClassId), '', 0),
      makePayload(categoryCode, undefined, '', 0)
    ],
    [
      makePayload(20000, job, part, 0),
      makePayload(20000, jobClassId, part, 0),
      makePayload(20000, String(jobClassId), part, 0)
    ]
  ];

  for (const payloads of payloadBatches) {
    const settled = await Promise.allSettled(payloads.map(payload => fetchMarketPage(apiKey, payload).then(result => ({ payload, result }))));
    const candidates = [];
    for (let i = 0; i < settled.length; i += 1) {
      const payload = payloads[i];
      const entry = settled[i];
      const result = entry.status === 'fulfilled' ? entry.value.result : { items: [], totalCount: 0, pageSize: 0, error: entry.reason?.message || String(entry.reason || '요청 실패') };
      tried.push({ part, categoryCode: payload.CategoryCode, characterClass: payload.CharacterClass ?? null, itemTier: payload.ItemTier ?? null, itemName: payload.ItemName || '', count: result.items.length, totalCount: result.totalCount, error: result.error || null });
      if (result.error || !result.items.length) continue;
      const picked = pickLowestPartItem(result.items, job, part, payload.CharacterClass != null, payload.CategoryCode === categoryCode);
      if (picked) candidates.push({ item: picked, result });
    }
    candidates.sort((a, b) => marketPrice(a.item) - marketPrice(b.item));
    const best = candidates[0];
    if (best) {
      const normalized = normalizeAvatarItem(best.item, part);
      return {
        item: normalized,
        parts: { 머리: null, 상의: null, 하의: null, 무기: null, [part]: normalized },
        totalPrice: marketPrice(best.item),
        complete: true,
        matchedCount: 1,
        matched: [normalized],
        scanned: best.result.items.length,
        totalCount: best.result.totalCount,
        categoryCode,
        jobClassId,
        tried
      };
    }
  }

  return {
    item: null,
    parts: { 머리: null, 상의: null, 하의: null, 무기: null },
    totalPrice: 0,
    complete: false,
    matchedCount: 0,
    matched: [],
    scanned: tried.reduce((sum, row) => sum + Number(row.count || 0), 0),
    totalCount: Math.max(0, ...tried.map(row => Number(row.totalCount || 0))),
    categoryCode,
    jobClassId,
    tried
  };
}

function makePayload(categoryCode, characterClass, itemName = '', itemTier = 0) {
  const payload = {
    Sort: 'CURRENT_MIN_PRICE',
    SortCondition: 'ASC',
    CategoryCode: categoryCode,
    ItemTier: itemTier,
    ItemGrade: '전설',
    ItemName: itemName,
    PageNo: 1
  };
  if (characterClass !== undefined && characterClass !== null) payload.CharacterClass = characterClass;
  return payload;
}

async function fetchMarketPage(apiKey, payload) {
  try {
    const data = await requestLostArk(apiKey, MARKET_ENDPOINT, { method: 'POST', body: payload });
    return {
      items: Array.isArray(data?.Items) ? data.Items : [],
      totalCount: Number(data?.TotalCount || 0),
      pageSize: Number(data?.PageSize || 0)
    };
  } catch (error) {
    return { items: [], totalCount: 0, pageSize: 0, error: error.message };
  }
}

function pickLowestPartItem(items, job, part, trustedClassFilter, trustedPartCategory) {
  const filtered = (items || [])
    .filter(item => marketPrice(item) > 0)
    .filter(item => item.Grade ? item.Grade === '전설' : true)
    // 부위 전용 CategoryCode(20005/20010/20050/20060)로 조회한 결과는 부위가 이미 확정된 것으로 본다.
    // 일부 무기명(건, 랜스, 장검 등)과 방어구 Tooltip 누락 때문에 여기서 다시 정규식 필터링하면 정상 매물이 빠진다.
    .filter(item => trustedPartCategory || isAvatarPart(item, part))
    .filter(item => trustedClassFilter || isJobOnly(itemFullText(item), job));

  filtered.sort((a, b) => marketPrice(a) - marketPrice(b));
  return filtered[0] || null;
}

function isAvatarPart(item, part) {
  const text = normalizeText([item.Name, item.Type, item.ItemType, item.Grade, tooltipText(item.Tooltip)].join(' '));
  if (!/아바타|영원|도약|결속|약속|shop_icon/i.test(text)) return false;
  if (part === '무기') return /무기|건랜스|대검|해머|한손검|건틀릿|헤비\s*건틀릿|엘리멘탈\s*건틀릿|기공패|창|할버드|핸드건|런처|활|드론|마법덱|하프|스태프|마법봉|우산|붓|데스사이드|블레이드|대거|데모닉웨폰|차원패|오브|마법구/.test(text);
  if (part === '머리') return /머리/.test(text);
  if (part === '상의') return /상의/.test(text);
  if (part === '하의') return /하의/.test(text);
  return false;
}

function normalizeAvatarItem(item, part) {
  const price = marketPrice(item);
  const grade = item.Grade || '전설';
  const tradeRemainCount = Number(item.TradeRemainCount ?? item.TradeCount ?? 0);
  return {
    id: item.Id || item.ItemId || null,
    name: item.Name || '',
    grade,
    part,
    price,
    icon: normalizeIconUrl(item.Icon || item.IconPath || item.Image || findIconPath(item.Tooltip) || ''),
    yDayAvgPrice: Number(item.YDayAvgPrice || item.YesterdayAvgPrice || 0),
    recentPrice: Number(item.RecentPrice || 0),
    bundleCount: Number(item.BundleCount || 1),
    tradeRemainCount,
    pheonCost: avatarPheonCost(grade, tradeRemainCount),
    rawType: item.Type || item.ItemType || findTitleText(item.Tooltip) || ''
  };
}

function avatarPheonCost(grade, tradeRemainCount) {
  if (Number(tradeRemainCount || 0) >= 3) return 0;
  if (/영웅/.test(String(grade || ''))) return 10;
  if (/전설/.test(String(grade || ''))) return 30;
  return 0;
}

function marketPrice(item) {
  return Number(item.CurrentMinPrice || item.MinPrice || item.LowestPrice || item.LowPrice || item?.AuctionInfo?.BuyPrice || 0);
}

async function requestLostArk(apiKey, url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  const init = {
    method: options.method || 'GET',
    headers: {
      Authorization: `bearer ${apiKey}`,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    signal: controller.signal
  };
  if (options.body) init.body = JSON.stringify(options.body);

  const response = await fetch(url, init).finally(() => clearTimeout(timeout));
  const text = await response.text();
  if (!response.ok) {
    const label = url.includes('/markets/items') ? '로스트아크 거래소 API 호출 실패' : '로스트아크 API 호출 실패';
    throw new Error(`${label} (${response.status}): ${text.slice(0, 300)}`);
  }
  try { return text ? JSON.parse(text) : null; } catch { throw new Error(`거래소 API 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`); }
}

function isJobOnly(text, job) {
  const compact = normalizeText(text).replace(/\s+/g, '');
  const jobCompact = normalizeText(job).replace(/\s+/g, '');
  return compact.includes(`${jobCompact}전용`) || compact.includes(`전용${jobCompact}`) || compact.includes(`CharacterClass:${jobCompact}`);
}

function itemFullText(item) {
  return normalizeText([
    item?.Name,
    item?.Type,
    item?.ItemType,
    item?.Grade,
    tooltipText(item?.Tooltip),
    JSON.stringify(item?.Options || '')
  ].join(' '));
}

function tooltipText(tooltip) {
  if (!tooltip) return '';
  if (typeof tooltip === 'string') {
    try { return normalizeText(JSON.stringify(JSON.parse(tooltip))); } catch { return normalizeText(tooltip); }
  }
  return normalizeText(JSON.stringify(tooltip));
}

function findIconPath(tooltip) {
  const raw = typeof tooltip === 'string' ? tooltip : JSON.stringify(tooltip || '');
  const decoded = decodeEntities(raw);
  const match = decoded.match(/"iconPath"\s*:\s*"([^"]+)"/) || decoded.match(/iconPath['"]?\s*[:=]\s*['"]([^'"]+)['"]/i);
  return match?.[1] || '';
}

function findTitleText(tooltip) {
  const text = tooltipText(tooltip);
  const match = text.match(/전설\s*[^\s<>]{1,12}\s*아바타/);
  return match?.[0] || '';
}

function normalizeIconUrl(value) {
  const icon = String(value || '').trim();
  if (!icon) return null;
  if (/^https?:\/\//i.test(icon)) return icon;
  return `${CDN_PREFIX}${icon.replace(/^\/+/, '')}`;
}

function normalizeText(value) {
  return decodeEntities(String(value ?? ''))
    .replace(/<br\s*\/?>(\n)?/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#40;/g, '(')
    .replace(/&#41;/g, ')');
}
