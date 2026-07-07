const API_VERSION = '4.9.8';
const MARKET_ENDPOINT = 'https://developer-lostark.game.onstove.com/markets/items';
const CDN_PREFIX = 'https://cdn-lostark.game.onstove.com/';
const PARTS = ['머리', '상의', '하의', '무기'];
const LEGEND_NAMES = ['영원', '도약', '결속', '약속'];
const MARKET_OPTIONS_ENDPOINT = 'https://developer-lostark.game.onstove.com/markets/options';
// 거래소 아바타는 공식 예시에서 자주 쓰이는 20000 계열이 우선이다.
// 잘못된 후보가 섞여도 개별 호출 실패는 무시하고 다음 후보를 시도한다.
const FALLBACK_MARKET_AVATAR_CATEGORY_CANDIDATES = [20000, 20005, 20010, 20015, 20020, null];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const job = String(req.query.job || '').trim();
    if (!job) return res.status(400).json({ error: '직업을 선택하세요.' });

    const apiKey = process.env.LOSTARK_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Vercel 환경변수 LOSTARK_API_KEY가 없습니다.' });

    const pageLimit = Math.max(1, Math.min(30, Number(req.query.pageLimit || 12)));
    const { items, totalCount, categoryCode, strategy } = await fetchLegendAvatarMarketItems(apiKey, job, pageLimit);
    const result = await buildLegendAvatarSet(apiKey, items, job);

    return res.status(200).json({
      ok: true,
      apiVersion: API_VERSION,
      source: 'markets/items',
      job,
      scanned: items.length,
      totalCount,
      pageLimit,
      categoryCode,
      strategy,
      ...result
    });
  } catch (error) {
    const message = error.name === 'AbortError' ? '거래소 API 응답 시간이 길어서 중단했습니다.' : error.message;
    return res.status(500).json({ error: '서버 함수 오류', message });
  }
}

async function fetchLegendAvatarMarketItems(apiKey, job, pageLimit) {
  const tried = [];
  const categoryCandidates = await getMarketAvatarCategoryCandidates(apiKey);

  // 1차: /markets/options에서 찾은 아바타 카테고리 + 직업 필터.
  for (const categoryCode of categoryCandidates) {
    for (const useClassFilter of [true, false]) {
      const basePayload = {
        Sort: 'CURRENT_MIN_PRICE',
        SortCondition: 'ASC',
        ItemTier: null,
        ItemGrade: '전설',
        ItemName: '',
        PageNo: 1
      };
      if (categoryCode) basePayload.CategoryCode = categoryCode;
      if (useClassFilter) basePayload.CharacterClass = job;

      const result = await fetchMarketPages(apiKey, basePayload, pageLimit);
      tried.push({ categoryCode, classFilter: useClassFilter, count: result.items.length, totalCount: result.totalCount, errors: result.errors?.slice(0, 2) });
      const avatarItems = result.items.filter(isLikelyLegendAvatarListItem);
      if (avatarItems.length) {
        return { ...result, items: avatarItems, categoryCode, strategy: useClassFilter ? 'options-category+class+grade' : 'options-category+grade', tried };
      }
    }
  }

  // 2차: 전설 아바타 시즌/접두 키워드로 보강 검색. Tooltip의 "직업 전용"은 리스트가 아니라 상세에서 판별한다.
  const merged = new Map();
  let totalCount = 0;
  let categoryCode = categoryCandidates[0] ?? null;
  for (const keyword of LEGEND_NAMES) {
    for (const useClassFilter of [true, false]) {
      const payload = {
        Sort: 'CURRENT_MIN_PRICE',
        SortCondition: 'ASC',
        ItemTier: null,
        ItemGrade: '전설',
        ItemName: keyword,
        PageNo: 1
      };
      if (categoryCode) payload.CategoryCode = categoryCode;
      if (useClassFilter) payload.CharacterClass = job;

      const result = await fetchMarketPages(apiKey, payload, Math.min(pageLimit, 5));
      tried.push({ keyword, categoryCode, classFilter: useClassFilter, count: result.items.length, totalCount: result.totalCount, errors: result.errors?.slice(0, 2) });
      totalCount += result.totalCount || 0;
      for (const item of result.items.filter(isLikelyLegendAvatarListItem)) {
        merged.set(String(item.Id || item.ItemId || item.Name), item);
      }
      if (merged.size >= 20) break;
    }
  }

  // 3차: 직업명 자체로 검색. 일부 전설 아바타는 이름에 직업명이 없지만, 공식 거래소 검색 동작 확인용/예외 대응용이다.
  if (!merged.size) {
    for (const keyword of [job, `${job} 전용`, '전설']) {
      const payload = {
        Sort: 'CURRENT_MIN_PRICE',
        SortCondition: 'ASC',
        CategoryCode: categoryCode || 20000,
        CharacterClass: job,
        ItemTier: null,
        ItemGrade: '전설',
        ItemName: keyword,
        PageNo: 1
      };
      const result = await fetchMarketPages(apiKey, payload, Math.min(pageLimit, 5));
      tried.push({ keyword, categoryCode: payload.CategoryCode, classFilter: true, count: result.items.length, totalCount: result.totalCount, errors: result.errors?.slice(0, 2) });
      for (const item of result.items.filter(isLikelyLegendAvatarListItem)) {
        merged.set(String(item.Id || item.ItemId || item.Name), item);
      }
      if (merged.size) break;
    }
  }

  return { items: [...merged.values()], totalCount, categoryCode, strategy: 'keyword-fallback', tried };
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

async function buildLegendAvatarSet(apiKey, items, job) {
  const parts = { 머리: null, 상의: null, 하의: null, 무기: null };
  const matched = [];
  const detailCache = new Map();

  for (const listItem of items) {
    const detail = await getMarketDetail(apiKey, listItem, detailCache);
    const item = mergeMarketItem(listItem, detail);
    const price = Number(item.CurrentMinPrice || item.MinPrice || item.LowestPrice || item?.AuctionInfo?.BuyPrice || 0);
    if (!price) continue;

    const text = itemFullText(item);
    if (!isJobOnly(text, job)) continue;

    const part = detectPart(item, text);
    if (!part || !(part in parts)) continue;

    const normalized = {
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
    matched.push(normalized);

    if (!parts[part] || price < parts[part].price) parts[part] = normalized;
  }

  const complete = Object.values(parts).every(Boolean);
  const totalPrice = Object.values(parts).reduce((sum, item) => sum + Number(item?.price || 0), 0);
  return { parts, totalPrice, complete, matchedCount: matched.length, matched };
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
  const timeout = setTimeout(() => controller.abort(), 9000);
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
  return /아바타|avatar|shop_icon|영원|도약|결속|약속|냉혹한|고요한/.test(text);
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

  if (/전설\s*(무기|건랜스|대검|해머|창|한손검|건틀릿|헤비\s*건틀릿|엘리멘탈\s*건틀릿|기공패|창|할버드|데빌헌터|총|핸드건|런처|활|드론|마법덱|하프|스태프|마법봉|우산|붓|데스사이드|블레이드|대거|데모닉웨폰)\s*아바타/.test(all)) return '무기';
  if (/무기\s*아바타|할버드|건틀릿|기공패|건랜스|런처|마법덱|하프|스태프|마법봉|우산|붓|데스사이드/.test(all)) return '무기';
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
