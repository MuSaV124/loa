const API_VERSION = '5.0.4';
const MARKET_ENDPOINT = 'https://developer-lostark.game.onstove.com/markets/items';
const CDN_PREFIX = 'https://cdn-lostark.game.onstove.com/';
const PARTS = ['머리', '상의', '하의', '무기'];
const LOSTARK_JOBS = [
  '버서커','디스트로이어','워로드','홀리나이트','슬레이어',
  '배틀마스터','인파이터','기공사','창술사','스트라이커','브레이커',
  '데빌헌터','블래스터','호크아이','스카우터','건슬링어',
  '바드','서머너','아르카나','소서리스',
  '블레이드','데모닉','리퍼','소울이터',
  '도화가','기상술사','환수사','차원술사',
  '가디언나이트'
];
const LEGEND_NAMES = ['영원', '도약', '결속', '약속'];
const ARMOR_KEYWORDS = ['머리', '상의', '하의', '무기', '머리 아바타', '상의 아바타', '하의 아바타', '무기 아바타'];
const MARKET_OPTIONS_ENDPOINT = 'https://developer-lostark.game.onstove.com/markets/options';
// 거래소 아바타는 공식 예시에서 자주 쓰이는 20000 계열이 우선이다.
// 잘못된 후보가 섞여도 개별 호출 실패는 무시하고 다음 후보를 시도한다.
const FALLBACK_MARKET_AVATAR_CATEGORY_CANDIDATES = [20000, 20005, 20010, 20015, 20020, null];

const JOB_CACHE = globalThis.__legendAvatarJobCacheV502 || (globalThis.__legendAvatarJobCacheV502 = new Map());
const CACHE_TTL_MS = 1000 * 60 * 5;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const job = String(req.query.job || '').trim();
    const all = String(req.query.all || '').trim() === '1';
    const part = String(req.query.part || '').trim();

    const apiKey = process.env.LOSTARK_API_KEY;
    if (!apiKey) return res.status(500).json({ ok: false, error: 'Vercel 환경변수 LOSTARK_API_KEY가 없습니다.' });

    // 5.0.2부터 전체 직업 일괄 상세 조회는 Vercel 함수 타임아웃 위험이 커서 수행하지 않는다.
    // 탭 진입 시에는 UI만 준비하고, 직업 클릭 시 해당 직업만 조회한다.
    if (all && !job) {
      return res.status(200).json({
        ok: true,
        apiVersion: API_VERSION,
        source: 'markets/items',
        mode: 'ready',
        message: '직업을 선택하면 해당 직업의 전설 아바타 최저가를 조회합니다.',
        jobs: LOSTARK_JOBS
      });
    }

    if (!job) {
      return res.status(400).json({ ok: false, error: '조회할 직업을 선택하세요.' });
    }

    const force = String(req.query.force || '') === '1';
    const pageLimit = Math.max(1, Math.min(12, Number(req.query.pageLimit || 6)));
    const detailLimit = Math.max(8, Math.min(80, Number(req.query.detailLimit || 48)));
    const cacheKey = `${job}:${part || 'set'}:${pageLimit}:${detailLimit}`;
    const cached = JOB_CACHE.get(cacheKey);
    if (!force && cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
      return res.status(200).json({ ...cached.data, cached: true });
    }

    let result;
    let mode = 'single-job';
    if (part && PARTS.includes(part)) {
      result = await buildSingleJobLegendAvatarPart(apiKey, job, part, pageLimit, detailLimit);
      mode = 'single-job-part';
    } else {
      result = await buildSingleJobLegendAvatarSet(apiKey, job, pageLimit, detailLimit);
    }
    const body = {
      ok: true,
      apiVersion: API_VERSION,
      source: 'markets/items',
      mode,
      job,
      part: part || undefined,
      ...result
    };
    JOB_CACHE.set(cacheKey, { createdAt: Date.now(), data: body });
    return res.status(200).json(body);
  } catch (error) {
    const message = error.name === 'AbortError' ? '거래소 API 응답 시간이 길어서 중단했습니다.' : error.message;
    return res.status(500).json({ ok: false, error: '서버 함수 오류', message });
  }
}



async function buildSingleJobLegendAvatarPart(apiKey, job, part, pageLimit, detailLimit) {
  const categoryCandidates = await getMarketAvatarCategoryCandidates(apiKey);
  const categoryCode = categoryCandidates[0] || 20000;
  const tried = [];
  const detailCache = new Map();
  const candidates = await fetchPartCandidates(apiKey, job, part, categoryCode, pageLimit, tried);
  const sorted = uniqueMarketItems(candidates).sort((a, b) => marketPrice(a) - marketPrice(b));
  let detailScanned = 0;

  for (const candidate of sorted.slice(0, detailLimit)) {
    detailScanned += 1;
    const detail = await getMarketDetail(apiKey, candidate, detailCache);
    const item = mergeMarketItem(candidate, detail);
    const text = itemFullText(item);
    const detectedPart = detectPart(item, text);
    const price = marketPrice(item);
    if (!price || detectedPart !== part) continue;

    const jobMatchedByTooltip = isJobOnly(text, job) || detectJobsFromText(text).includes(job);
    const jobMatchedByClassSearch = candidate.__classMatched === true && (part === '무기' || jobMatchedByTooltip);
    if (!jobMatchedByTooltip && !jobMatchedByClassSearch) continue;

    const normalized = normalizeAvatarItem(item, part, price);
    return {
      categoryCode,
      strategy: 'single-part-click+tooltip',
      pageLimit,
      detailLimit,
      scanned: candidates.length,
      detailScanned,
      tried,
      item: normalized,
      parts: { 머리: null, 상의: null, 하의: null, 무기: null, [part]: normalized },
      totalPrice: price,
      complete: true,
      matchedCount: 1,
      matched: [normalized]
    };
  }

  return {
    categoryCode,
    strategy: 'single-part-click+tooltip',
    pageLimit,
    detailLimit,
    scanned: candidates.length,
    detailScanned,
    tried,
    item: null,
    parts: { 머리: null, 상의: null, 하의: null, 무기: null },
    totalPrice: 0,
    complete: false,
    matchedCount: 0,
    matched: []
  };
}

async function buildSingleJobLegendAvatarSet(apiKey, job, pageLimit, detailLimit) {
  const categoryCandidates = await getMarketAvatarCategoryCandidates(apiKey);
  const categoryCode = categoryCandidates[0] || 20000;
  const detailCache = new Map();
  const tried = [];
  const parts = { 머리: null, 상의: null, 하의: null, 무기: null };
  const matched = [];
  let scanned = 0;
  let detailScanned = 0;

  for (const part of PARTS) {
    const candidates = await fetchPartCandidates(apiKey, job, part, categoryCode, pageLimit, tried);
    scanned += candidates.length;
    const sorted = uniqueMarketItems(candidates).sort((a, b) => marketPrice(a) - marketPrice(b));

    for (const candidate of sorted.slice(0, detailLimit)) {
      detailScanned += 1;
      const detail = await getMarketDetail(apiKey, candidate, detailCache);
      const item = mergeMarketItem(candidate, detail);
      const text = itemFullText(item);
      const detectedPart = detectPart(item, text);
      const price = marketPrice(item);
      if (!price || detectedPart !== part) continue;

      const jobMatchedByTooltip = isJobOnly(text, job) || detectJobsFromText(text).includes(job);
      const jobMatchedByClassSearch = candidate.__classMatched === true && (part === '무기' || jobMatchedByTooltip);
      if (!jobMatchedByTooltip && !jobMatchedByClassSearch) continue;

      const normalized = normalizeAvatarItem(item, part, price);
      parts[part] = normalized;
      matched.push(normalized);
      break;
    }
  }

  return {
    categoryCode,
    strategy: 'single-job-click+part-search+tooltip',
    pageLimit,
    detailLimit,
    scanned,
    detailScanned,
    tried,
    ...finalizeJobSet({ job, parts, matched })
  };
}

async function fetchPartCandidates(apiKey, job, part, categoryCode, pageLimit, tried) {
  const queries = [];
  const partKeywords = part === '무기'
    ? ['', '무기', '무기 아바타', ...LEGEND_NAMES]
    : [`${part} 아바타`, part, ...LEGEND_NAMES.map(name => `${name} ${part}`)];

  // 무기는 CharacterClass 조건이 잘 맞는 편이라 우선 조회한다.
  if (part === '무기') {
    for (const keyword of partKeywords) {
      queries.push({ classFilter: true, payload: {
        Sort: 'CURRENT_MIN_PRICE', SortCondition: 'ASC', CategoryCode: categoryCode,
        CharacterClass: job, ItemTier: null, ItemGrade: '전설', ItemName: keyword, PageNo: 1
      }});
    }
  }

  // 방어구는 CharacterClass 조건에서 누락되는 경우가 있어 넓게 검색 후 Tooltip의 "직업 전용"으로 판별한다.
  for (const keyword of partKeywords) {
    queries.push({ classFilter: false, payload: {
      Sort: 'CURRENT_MIN_PRICE', SortCondition: 'ASC', CategoryCode: categoryCode,
      ItemTier: null, ItemGrade: '전설', ItemName: keyword, PageNo: 1
    }});
  }

  const out = [];
  for (const q of queries) {
    const result = await fetchMarketPages(apiKey, q.payload, pageLimit);
    tried.push({ part, keyword: q.payload.ItemName, categoryCode, classFilter: q.classFilter, count: result.items.length, totalCount: result.totalCount, errors: result.errors?.slice(0, 1) });
    for (const item of result.items.filter(isLikelyLegendAvatarListItem)) {
      out.push({ ...item, __classMatched: q.classFilter });
    }
  }
  return out;
}

function uniqueMarketItems(items) {
  const map = new Map();
  for (const item of items || []) {
    const key = marketItemKey(item);
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}

async function fetchLegendAvatarMarketItems(apiKey, job, pageLimit) {
  // 무기는 CharacterClass 검색에서 잘 잡히지만, 머리/상의/하의는 CharacterClass 조건에서 빠지는 경우가 있어
  // 직업 검색 결과와 전체 전설 아바타 스캔 결과를 합쳐서 상세 Tooltip의 "직업 전용" 문구로 최종 판별한다.
  const broad = await fetchBroadLegendAvatarMarketItems(apiKey, pageLimit);
  const merged = new Map();
  for (const item of broad.items) merged.set(marketItemKey(item), item);

  const categoryCode = broad.categoryCode || 20000;
  const classKeywords = new Set(['', ...LEGEND_NAMES, ...ARMOR_KEYWORDS]);
  for (const keyword of classKeywords) {
    const payload = {
      Sort: 'CURRENT_MIN_PRICE',
      SortCondition: 'ASC',
      CategoryCode: categoryCode,
      CharacterClass: job,
      ItemTier: null,
      ItemGrade: '전설',
      ItemName: keyword,
      PageNo: 1
    };
    const result = await fetchMarketPages(apiKey, payload, Math.min(pageLimit, 6));
    broad.tried.push({ job, keyword, categoryCode, classFilter: true, count: result.items.length, totalCount: result.totalCount, errors: result.errors?.slice(0, 2) });
    for (const item of result.items.filter(isLikelyLegendAvatarListItem)) merged.set(marketItemKey(item), item);
  }

  return {
    items: [...merged.values()],
    totalCount: Math.max(Number(broad.totalCount || 0), merged.size),
    categoryCode,
    strategy: 'broad-tooltip+class-weapon-supplement',
    tried: broad.tried
  };
}

async function fetchBroadLegendAvatarMarketItems(apiKey, pageLimit) {
  const tried = [];
  const categoryCandidates = await getMarketAvatarCategoryCandidates(apiKey);
  const merged = new Map();
  let selectedCategory = categoryCandidates[0] ?? 20000;
  let totalCount = 0;

  for (const categoryCode of categoryCandidates) {
    const payload = {
      Sort: 'CURRENT_MIN_PRICE',
      SortCondition: 'ASC',
      ItemTier: null,
      ItemGrade: '전설',
      ItemName: '',
      PageNo: 1
    };
    if (categoryCode) payload.CategoryCode = categoryCode;
    const result = await fetchMarketPages(apiKey, payload, pageLimit);
    tried.push({ categoryCode, classFilter: false, count: result.items.length, totalCount: result.totalCount, errors: result.errors?.slice(0, 2) });
    const avatarItems = result.items.filter(isLikelyLegendAvatarListItem);
    if (avatarItems.length) {
      selectedCategory = categoryCode;
      totalCount = Math.max(totalCount, Number(result.totalCount || 0));
      for (const item of avatarItems) merged.set(marketItemKey(item), item);
      // 첫 아바타 카테고리에서 충분히 가져왔으면 다른 후보는 중복/오류 가능성이 높으므로 멈춘다.
      if (merged.size >= Math.min(Number(result.totalCount || merged.size), pageLimit * Math.max(Number(result.pageSize || 10), 10))) break;
    }
  }

  // 시즌/부위 키워드 보강. 최저가 정렬 첫 페이지에 무기만 몰리는 경우가 있어
  // 머리/상의/하의/무기 키워드를 별도로 검색한다.
  const keywordSet = new Set([
    ...LEGEND_NAMES,
    ...ARMOR_KEYWORDS,
    ...LEGEND_NAMES.flatMap(name => ARMOR_KEYWORDS.map(part => `${name} ${part}`))
  ]);
  for (const keyword of keywordSet) {
    const payload = {
      Sort: 'CURRENT_MIN_PRICE',
      SortCondition: 'ASC',
      CategoryCode: selectedCategory || 20000,
      ItemTier: null,
      ItemGrade: '전설',
      ItemName: keyword,
      PageNo: 1
    };
    const result = await fetchMarketPages(apiKey, payload, Math.min(pageLimit, 8));
    tried.push({ keyword, categoryCode: payload.CategoryCode, classFilter: false, count: result.items.length, totalCount: result.totalCount, errors: result.errors?.slice(0, 2) });
    totalCount = Math.max(totalCount, Number(result.totalCount || 0));
    for (const item of result.items.filter(isLikelyLegendAvatarListItem)) merged.set(marketItemKey(item), item);
  }

  return { items: [...merged.values()], totalCount, categoryCode: selectedCategory, strategy: 'broad-tooltip-scan', tried };
}

async function getMarketAvatarCategoryCandidates(apiKey) {
  const candidates = [];
  try {
    const options = await requestLostArk(apiKey, MARKET_OPTIONS_ENDPOINT, { method: 'GET' });
    collectAvatarCategoryCodes(options, candidates);
  } catch {
    // 옵션 API가 실패해도 하드코딩 후보로 계속 진행한다.
  }

  for (const code of FALLBACK_MARKET_AVATAR_CATEGORY_CANDIDATES) {
    if (!candidates.includes(code)) candidates.push(code);
  }
  return candidates;
}

function collectAvatarCategoryCodes(node, output) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) collectAvatarCategoryCodes(child, output);
    return;
  }

  const name = normalizeText(node.CategoryName || node.Name || node.DisplayName || node.Text || '');
  const code = node.CategoryCode ?? node.Code ?? node.Id ?? node.Value;
  if (name.includes('아바타') && Number.isFinite(Number(code))) {
    const n = Number(code);
    if (!output.includes(n)) output.push(n);
  }

  for (const key of ['Categories', 'SubCategories', 'Children', 'Items']) {
    if (node[key]) collectAvatarCategoryCodes(node[key], output);
  }
}

async function fetchMarketPages(apiKey, basePayload, pageLimit) {
  const items = [];
  let totalCount = 0;
  let pageSize = 0;
  const errors = [];

  for (let page = 1; page <= pageLimit; page += 1) {
    const payload = cleanPayload({ ...basePayload, PageNo: page });
    let data;
    try {
      data = await requestLostArk(apiKey, MARKET_ENDPOINT, { method: 'POST', body: payload });
    } catch (error) {
      // 후보 카테고리/직업 필터/정렬값 중 하나가 API에서 거절될 수 있으므로
      // 전체 서버 함수 오류로 중단하지 않고 다음 전략을 계속 시도한다.
      errors.push({ page, payload, message: error.message });
      break;
    }

    const pageItems = Array.isArray(data?.Items) ? data.Items : [];
    totalCount = Number(data?.TotalCount || totalCount || 0);
    pageSize = Number(data?.PageSize || pageSize || pageItems.length || 10);
    items.push(...pageItems);
    if (!pageItems.length || (totalCount > 0 && page * pageSize >= totalCount)) break;
  }

  return { items, totalCount, pageSize, errors };
}

function cleanPayload(payload) {
  const out = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (value === undefined) continue;
    if (value === '') { out[key] = value; continue; }
    out[key] = value;
  }
  return out;
}

async function buildAllLegendAvatarSets(apiKey, items) {
  const detailCache = new Map();
  const detailed = await mapWithConcurrency(items, 8, async (listItem) => {
    const detail = await getMarketDetail(apiKey, listItem, detailCache);
    return mergeMarketItem(listItem, detail);
  });

  const results = {};
  for (const job of LOSTARK_JOBS) results[job] = emptyJobSet(job);

  for (const item of detailed) {
    const price = marketPrice(item);
    if (!price) continue;
    const text = itemFullText(item);
    const part = detectPart(item, text);
    if (!part || !PARTS.includes(part)) continue;
    const jobs = detectJobsFromText(text);
    for (const job of jobs) {
      const normalized = normalizeAvatarItem(item, part, price);
      const current = results[job]?.parts?.[part];
      if (!current || price < current.price) results[job].parts[part] = normalized;
      results[job].matched.push(normalized);
    }
  }

  return LOSTARK_JOBS.map((job) => finalizeJobSet(results[job] || emptyJobSet(job)));
}

async function buildLegendAvatarSet(apiKey, items, job) {
  const all = await buildAllLegendAvatarSets(apiKey, items);
  const found = all.find(row => row.job === job) || emptyJobSet(job);
  return finalizeJobSet(found);
}

function emptyJobSet(job) {
  return { job, parts: { 머리: null, 상의: null, 하의: null, 무기: null }, matched: [] };
}

function finalizeJobSet(row) {
  const parts = row.parts || { 머리: null, 상의: null, 하의: null, 무기: null };
  const totalPrice = Object.values(parts).reduce((sum, item) => sum + Number(item?.price || 0), 0);
  const complete = PARTS.every(part => !!parts[part]);
  return {
    job: row.job,
    parts,
    totalPrice,
    complete,
    matchedCount: Array.isArray(row.matched) ? row.matched.length : 0,
    matched: row.matched || []
  };
}

function normalizeAvatarItem(item, part, price) {
  return {
    id: item.Id || item.ItemId || null,
    name: item.Name || '',
    grade: item.Grade || '전설',
    part,
    price,
    icon: normalizeIconUrl(item.Icon || item.IconPath || item.Image || findIconPath(item.Tooltip) || ''),
    yDayAvgPrice: Number(item.YDayAvgPrice || item.YesterdayAvgPrice || 0),
    recentPrice: Number(item.RecentPrice || 0),
    bundleCount: Number(item.BundleCount || 1),
    tradeRemainCount: Number(item.TradeRemainCount ?? item.TradeCount ?? 0),
    rawType: item.Type || findTitleText(item.Tooltip) || ''
  };
}

function detectJobsFromText(text) {
  const compact = normalizeText(text).replace(/\s+/g, '');
  return LOSTARK_JOBS.filter(job => {
    const j = normalizeText(job).replace(/\s+/g, '');
    return compact.includes(`${j}전용`) || compact.includes(`CharacterClass:${j}`) || compact.includes(`\"CharacterClass\":\"${j}\"`);
  });
}

function marketPrice(item) {
  return Number(item.CurrentMinPrice || item.MinPrice || item.LowestPrice || item?.AuctionInfo?.BuyPrice || 0);
}

function marketItemKey(item) {
  return String(item?.Id || item?.ItemId || item?.Name || '') + ':' + String(item?.CurrentMinPrice || item?.MinPrice || '');
}

async function mapWithConcurrency(list, limit, mapper) {
  const results = new Array(list.length);
  let index = 0;
  async function worker() {
    while (index < list.length) {
      const current = index++;
      results[current] = await mapper(list[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return results;
}

async function getMarketDetail(apiKey, item, cache) {
  const id = item?.Id || item?.ItemId;
  if (!id) return null;
  const key = String(id);
  if (cache.has(key)) return cache.get(key);
  try {
    const data = await requestLostArk(apiKey, `${MARKET_ENDPOINT}/${encodeURIComponent(id)}`, { method: 'GET' });
    cache.set(key, data);
    return data;
  } catch {
    cache.set(key, null);
    return null;
  }
}

async function requestLostArk(apiKey, url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5500);
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

function mergeMarketItem(listItem, detail) {
  if (!detail) return listItem || {};
  if (Array.isArray(detail)) return { ...(listItem || {}), ...(detail[0] || {}) };
  if (detail.Item) return { ...(listItem || {}), ...detail.Item };
  return { ...(listItem || {}), ...detail };
}

function isLikelyLegendAvatarListItem(item) {
  const text = normalizeText([item?.Name, item?.Grade, item?.Type, item?.ItemType, item?.Icon].join(' '));
  if (item?.Grade && item.Grade !== '전설') return false;
  return /아바타|avatar|shop_icon|영원|도약|결속|약속|냉혹한|고요한|머리|상의|하의/.test(text);
}

function isJobOnly(text, job) {
  const compact = normalizeText(text).replace(/\s+/g, '');
  const jobCompact = normalizeText(job).replace(/\s+/g, '');
  return compact.includes(`${jobCompact}전용`) || compact.includes(`전용${jobCompact}`) || compact.includes(`CharacterClass:${jobCompact}`);
}

function detectPart(item, text) {
  const type = normalizeText(item?.Type || item?.ItemType || findTitleText(item?.Tooltip) || '');
  const name = normalizeText(item?.Name || '');
  const all = normalizeText(`${type} ${name} ${text}`);

  if (/전설\s*(무기|건랜스|대검|해머|창|한손검|건틀릿|헤비\s*건틀릿|엘리멘탈\s*건틀릿|기공패|창|할버드|데빌헌터|총|핸드건|런처|활|드론|마법덱|하프|스태프|마법봉|우산|붓|데스사이드|블레이드|대거|데모닉웨폰|차원패|오브|마법구)\s*아바타/.test(all)) return '무기';
  if (/무기\s*아바타|할버드|건틀릿|기공패|건랜스|런처|마법덱|하프|스태프|마법봉|우산|붓|데스사이드|차원패|오브|마법구/.test(all)) return '무기';
  if (/머리\s*아바타|전설\s*머리/.test(all)) return '머리';
  if (/상의\s*아바타|전설\s*상의/.test(all)) return '상의';
  if (/하의\s*아바타|전설\s*하의/.test(all)) return '하의';
  return null;
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
