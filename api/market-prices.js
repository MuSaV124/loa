const API_VERSION = '5.7.49';
const MARKET_ENDPOINT = 'https://developer-lostark.game.onstove.com/markets/items';
const AUCTION_ENDPOINT = 'https://developer-lostark.game.onstove.com/auctions/items';
const CDN_PREFIX = 'https://cdn-lostark.game.onstove.com/';

const ACCESSORY_RULES = {
  necklace: {
    label: '목걸이', categoryCandidates: [200010, 200000, null], icon: 'https://cdn-lostark.game.onstove.com/efui_iconatlas/acc/acc_215.png',
    options: { primary: { key: 'enemyDamage', label: '적에게 주는 피해', values: { high: 2.00, mid: 1.20, low: 0.55 } }, secondary: { key: 'additionalDamage', label: '추가 피해', values: { high: 2.60, mid: 1.60, low: 0.70 } } }
  },
  earring: {
    label: '귀걸이', categoryCandidates: [200020, 200000, null], icon: 'https://cdn-lostark.game.onstove.com/efui_iconatlas/acc/acc_115.png',
    options: { primary: { key: 'attackPowerPercent', label: '공격력', values: { high: 1.55, mid: 0.95, low: 0.40 } }, secondary: { key: 'weaponPowerPercent', label: '무기 공격력', values: { high: 3.00, mid: 1.80, low: 0.80 } } }
  },
  ring: {
    label: '반지', categoryCandidates: [200030, 200000, null], icon: 'https://cdn-lostark.game.onstove.com/efui_iconatlas/acc/acc_22.png',
    options: { primary: { key: 'critDamage', label: '치명타 피해', values: { high: 4.00, mid: 2.40, low: 1.10 } }, secondary: { key: 'critRate', label: '치명타 적중률', values: { high: 1.55, mid: 0.95, low: 0.40 } } }
  }
};

const COMBO_RULES = {
  highHigh: { label: '상상', primary: 'high', secondary: 'high' },
  highMid: { label: '상중', primary: 'high', secondary: 'mid' },
  reverseHighMid: { label: '리버스 상중', primary: 'mid', secondary: 'high' }
};

const AUCTION_ETC_OPTION_FALLBACK = {
  necklace: {
    primary: { firstOption: 7, secondOption: 42, text: '적에게 주는 피해 증가' },
    secondary: { firstOption: 7, secondOption: 41, text: '추가 피해' }
  },
  earring: {
    primary: { firstOption: 7, secondOption: 45, text: '공격력 %' },
    secondary: { firstOption: 7, secondOption: 46, text: '무기 공격력 %' }
  },
  ring: {
    primary: { firstOption: 7, secondOption: 50, text: '치명타 피해' },
    secondary: { firstOption: 7, secondOption: 49, text: '치명타 적중률' }
  }
};

const ACCESSORY_REFINING_LABELS = [
  '적에게 주는 피해', '추가 피해', '공격력', '무기 공격력', '치명타 피해', '치명타 적중률',
  '최대 생명력', '최대 마나', '아군 공격력 강화 효과', '아군 피해량 강화 효과', '낙인력',
  '상태이상 공격 지속시간', '상태이상 공격 지속 시간', '전투 중 생명력 회복량', '회복 아이덴티티 획득량',
  '무력화 피해', '파티원 보호막 효과', '파티원 회복 효과'
];

const GEM_RULES = {
  damage: { label: '겁화', names: ['겁화'], icon: 'https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_9_70.png' },
  cooldown: { label: '작열', names: ['작열'], icon: 'https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_9_71.png' }
};

const T4_MATERIAL_GROUPS = [
  {
    group: '기본 강화 재료',
    items: ['운명의 파편 주머니(소)', '운명의 파편 주머니(중)', '운명의 파편 주머니(대)', '운명의 돌파석', '위대한 운명의 돌파석', '운명의 파괴석', '운명의 파괴석 결정', '운명의 수호석', '운명의 수호석 결정']
  },
  {
    group: '융화 재료',
    items: ['아비도스 융화제', '상급 아비도스 융화제']
  },
  {
    group: '숨결',
    items: ['빙하의 숨결', '용암의 숨결']
  },
  {
    group: '재봉술',
    items: ['재봉술 : 업화 [11-14]', '재봉술 : 업화 [15-18]', '재봉술 : 업화 [19-20]', '장인의 재봉술 : 1단계', '장인의 재봉술 : 2단계', '장인의 재봉술 : 3단계', '장인의 재봉술 : 4단계']
  },
  {
    group: '야금술',
    items: ['야금술 : 업화 [11-14]', '야금술 : 업화 [15-18]', '야금술 : 업화 [19-20]', '장인의 야금술 : 1단계', '장인의 야금술 : 2단계', '장인의 야금술 : 3단계', '장인의 야금술 : 4단계']
  },
  {
    group: '아크그리드 젬',
    items: ['질서의 젬 : 안정', '질서의 젬 : 견고', '질서의 젬 : 불변', '혼돈의 젬 : 침식', '혼돈의 젬 : 왜곡', '혼돈의 젬 : 붕괴']
  }
];
const DESTINY_SHARD_POUCH_COUNTS = {
  '소': 1000,
  '중': 2000,
  '대': 3000
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    const apiKey = process.env.LOSTARK_API_KEY;
    if (!apiKey) return res.status(500).json({ ok: false, error: 'Vercel 환경변수 LOSTARK_API_KEY가 없습니다.' });
    const mode = String(req.query.mode || '').trim();
    if (mode === 'accessory') return res.status(200).json(await searchAccessory(apiKey, req.query));
    if (mode === 'gem') return res.status(200).json(await searchGem(apiKey, req.query));
    if (mode === 'gemList') return res.status(200).json(await searchGemList(apiKey, req.query));
    if (mode === 'engraving') return res.status(200).json(await searchEngraving(apiKey, req.query));
    if (mode === 'engravingList') return res.status(200).json(await searchEngravingList(apiKey, req.query));
    if (mode === 't4Materials') return res.status(200).json(await searchT4Materials(apiKey, req.query));
    if (mode === 'auctionOptions') return res.status(200).json(await getAuctionOptions(apiKey));
    return res.status(400).json({ ok: false, error: 'mode는 accessory/gem/gemList/engraving/engravingList/t4Materials/auctionOptions 중 하나여야 합니다.' });
  } catch (error) {
    return res.status(500).json({ ok: false, apiVersion: API_VERSION, error: '시세 조회 실패', message: error?.message || String(error) });
  }
}


let auctionOptionCache = { expiresAt: 0, data: null };
const ACCESSORY_CACHE_TTL_MS = 90 * 1000;
const ACCESSORY_SCAN_TIME_BUDGET_MS = 54000;
const LOSTARK_REQUEST_TIMEOUT_MS = 9000;
const accessoryComboCache = new Map();
const accessoryComboInflight = new Map();
const marketListCache = new Map();
const marketListInflight = new Map();
const MARKET_LIST_CACHE_TTL_MS = 120 * 1000;

async function getAuctionOptionDataCached(apiKey) {
  const now = Date.now();
  if (auctionOptionCache.data && auctionOptionCache.expiresAt > now) return auctionOptionCache.data;
  try {
    const data = await requestLostArk(apiKey, 'https://developer-lostark.game.onstove.com/auctions/options', { method: 'GET' });
    auctionOptionCache = { data, expiresAt: now + 10 * 60 * 1000 };
    return data;
  } catch {
    return null;
  }
}

async function makeAccessorySearchPlans(apiKey, rule, target, comboKey, partKey = 'necklace') {
  // v5.4.5: 검증된 공식 연마 옵션 코드로 바로 검색해 cold start 요청 수를 줄인다.
  // 값은 auctionOptions의 EtcValues.Value 규칙(예: 2.00% => 200)을 사용한다.
  // 최종 판정은 응답의 ACCESSORY_UPGRADE 3개와 실제 Value만 사용한다.
  const fallback = AUCTION_ETC_OPTION_FALLBACK[partKey] || {};
  const hasVerifiedFallback = Boolean(fallback.primary && fallback.secondary);
  const optionData = hasVerifiedFallback ? null : await getAuctionOptionDataCached(apiKey);
  const primaryOfficial = optionData ? findAuctionEtcOption(optionData, target.primary.label) : null;
  const secondaryOfficial = optionData ? findAuctionEtcOption(optionData, target.secondary.label) : null;
  const primaryOption = primaryOfficial || fallback.primary || null;
  const secondaryOption = secondaryOfficial || fallback.secondary || null;
  const optionSource = hasVerifiedFallback ? 'verified-static-options' : (primaryOfficial && secondaryOfficial ? 'official-options' : (primaryOfficial || secondaryOfficial ? 'mixed-options' : 'fallback-options'));

  const plans = [];
  const categoryCode = rule.categoryCandidates.find(code => code !== null && code !== undefined);
  const exactEtc = (option, targetOption) => option ? {
    FirstOption: option.firstOption,
    SecondOption: option.secondOption,
    MinValue: resolveAuctionEtcValue(option, targetOption.value),
    MaxValue: resolveAuctionEtcValue(option, targetOption.value)
  } : null;

  const primaryExact = exactEtc(primaryOption, target.primary);
  const secondaryExact = exactEtc(secondaryOption, target.secondary);
  const bothExact = primaryExact && secondaryExact ? [primaryExact, secondaryExact] : [];

  const addPlan = (typeSuffix, sortCondition, etcOptions, maxPages, batchSize, optionSearch) => {
    plans.push({
      type: `accessory-${comboKey}-${typeSuffix}`,
      categoryCode,
      sortCondition,
      etcOptions,
      itemUpgradeLevel: 3,
      maxPages,
      batchSize,
      optionSearch
    });
  };

  if (bothExact.length === 2) {
    addPlan(
      'exact-3refine-asc',
      'ASC',
      bothExact,
      8,
      2,
      `정확 2옵션 · 3연마 · ${target.primary.label} ${target.primary.value}%(${primaryExact.MinValue}) + ${target.secondary.label} ${target.secondary.value}%(${secondaryExact.MinValue}) · ${optionSource}`
    );
  }

  addPlan(
    '3refine-fallback-asc',
    'ASC',
    [],
    bothExact.length === 2 ? 16 : 40,
    8,
    bothExact.length === 2 ? '정확 옵션 0건 보정 · 3연마 후보 검색' : '옵션 코드 탐색 실패 보정 · 3연마 후보 검색'
  );
  return plans;
}

function findAuctionEtcOption(data, label) {
  if (!data) return null;
  const labelCompact = normalizeText(label).replace(/\s+/g, '');
  const matches = [];
  walkOptionTree(data, [], matches, labelCompact);
  return matches.find(match => match.matchType === 'exact') || matches.find(match => match.matchType === 'percent-exact') || matches[0] || null;
}

function walkOptionTree(node, path, matches, labelCompact) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const child of node) walkOptionTree(child, path, matches, labelCompact);
    return;
  }
  if (typeof node !== 'object') return;

  const text = normalizeText(node.Text ?? node.Name ?? node.OptionName ?? node.Label ?? node.ValueName ?? '').replace(/\s+/g, '');
  const value = Number(node.Value ?? node.Id ?? node.Code ?? node.Option ?? node.OptionCode);
  const nextPath = Number.isFinite(value) ? [...path, value] : path;
  if (text && text.includes(labelCompact) && nextPath.length >= 2) {
    const matchType = text === labelCompact ? 'exact' : (text === `${labelCompact}%` ? 'percent-exact' : 'partial');
    matches.push({ firstOption: nextPath[nextPath.length - 2], secondOption: nextPath[nextPath.length - 1], text, matchType, etcValues: Array.isArray(node.EtcValues) ? node.EtcValues : null });
  }

  for (const key of Object.keys(node)) walkOptionTree(node[key], nextPath, matches, labelCompact);
}

function resolveAuctionEtcValue(option, displayValue) {
  const numeric = Number(displayValue);
  const expectedCode = Number.isFinite(numeric) ? Math.round(numeric * 100) : NaN;
  const values = Array.isArray(option?.etcValues) ? option.etcValues : [];
  const matched = values.find(row => Number(row?.Value) === expectedCode)
    || values.find(row => Math.abs(Number(String(row?.DisplayValue || '').replace('%', '')) - numeric) < 0.001);
  if (matched && Number.isFinite(Number(matched.Value))) return Number(matched.Value);
  if (Number.isFinite(expectedCode)) return expectedCode;
  return numeric;
}

async function searchAccessory(apiKey, query) {
  const part = String(query.part || 'necklace');
  const combo = String(query.combo || 'highHigh');
  const rule = ACCESSORY_RULES[part] || ACCESSORY_RULES.necklace;
  const comboRule = COMBO_RULES[combo] || COMBO_RULES.highHigh;
  const target = makeAccessoryTarget(rule, comboRule);
  const force = String(query.force || '') === '1';
  const indexResult = await getAccessoryComboIndex(apiKey, { part, combo, rule, comboRule, target, force });
  const matched = [...indexResult.items].sort((a, b) => a.price - b.price);

  return {
    ok: true,
    apiVersion: API_VERSION,
    source: 'auctions/items-index-cache',
    mode: 'accessory',
    part,
    partLabel: rule.label,
    combo,
    comboLabel: comboRule.label,
    targetOptions: [target.primary, target.secondary],
    items: matched.slice(0, 10),
    lowest: matched[0] || null,
    tried: indexResult.tried,
    debug: summarizeTried(indexResult.tried),
    cached: Boolean(indexResult.cached),
    updatedAt: indexResult.updatedAt,
    index: indexResult.index,
    accessoryDebug: {
      note: 'v5.7.14 악세 디버그: 검증된 공식 연마 옵션 코드와 EtcValues.Value(예: 2.00% => 200)를 사용해 목걸이/귀걸이/반지 공통으로 정확 2옵션 검색을 수행합니다. 최종 통과는 ACCESSORY_UPGRADE가 정확히 3개이면서 목표 옵션 2개가 순서와 관계없이 포함된 경우만 허용합니다.',
      requestPayloads: indexResult.requestPayloads.slice(0, 14),
      filterStats: indexResult.filterStats,
      samples: indexResult.samples
    }
  };
}

async function getAccessoryComboIndex(apiKey, context) {
  const cacheKey = `${context.part}:${context.combo}`;
  const now = Date.now();
  const cached = accessoryComboCache.get(cacheKey);
  if (!context.force && cached && cached.expiresAt > now) return { ...cached.data, cached: true };
  if (!context.force && accessoryComboInflight.has(cacheKey)) {
    const data = await accessoryComboInflight.get(cacheKey);
    return { ...data, cached: true, joinedInflight: true };
  }

  const promise = scanAccessoryComboIndex(apiKey, context).then(data => {
    accessoryComboCache.set(cacheKey, { expiresAt: Date.now() + ACCESSORY_CACHE_TTL_MS, data });
    return data;
  }).finally(() => accessoryComboInflight.delete(cacheKey));
  accessoryComboInflight.set(cacheKey, promise);
  return promise;
}

async function scanAccessoryComboIndex(apiKey, context) {
  const { part, combo, rule, comboRule, target } = context;
  const tried = [];
  const matchedMap = new Map();
  const requestPayloads = [];
  const samples = [];
  const filterStats = {};
  const startedAt = Date.now();
  const timeBudgetMs = ACCESSORY_SCAN_TIME_BUDGET_MS;
  const searchPlans = await makeAccessorySearchPlans(apiKey, rule, target, combo, part);
  let stopReason = 'all-plans-complete';
  let matchedPlan = null;
  let matchedFirstPage = null;

  for (const plan of searchPlans) {
    if (Date.now() - startedAt > timeBudgetMs) { stopReason = 'time-budget-before-plan'; break; }
    const planResult = await scanAccessoryPlan(apiKey, plan, { rule, target, comboRule, tried, matchedMap, requestPayloads, samples, filterStats, startedAt, timeBudgetMs });
    if (planResult.firstMatchPage !== null) {
      matchedPlan = plan.type;
      matchedFirstPage = planResult.firstMatchPage;
      stopReason = 'first-match-page-plus-next-page-complete';
      break;
    }
    if (planResult.stopReason && planResult.stopReason !== 'plan-complete') stopReason = planResult.stopReason;
  }

  const items = [...matchedMap.values()].sort((a, b) => a.price - b.price);
  return {
    items,
    tried,
    requestPayloads,
    samples,
    filterStats,
    updatedAt: new Date().toISOString(),
    index: {
      cacheTtlMs: ACCESSORY_CACHE_TTL_MS,
      scannedItems: tried.reduce((sum, row) => sum + Number(row.count || 0), 0),
      matchedCount: items.length,
      matchedPlan,
      matchedFirstPage,
      stopReason,
      plans: searchPlans.map(plan => ({ type: plan.type, maxPages: plan.maxPages, batchSize: plan.batchSize, itemUpgradeLevel: plan.itemUpgradeLevel ?? null, optionSearch: plan.optionSearch || null, hasEtcOptions: Array.isArray(plan.etcOptions) && plan.etcOptions.length > 0 }))
    }
  };
}

async function scanAccessoryPlan(apiKey, plan, context) {
  const { rule, target, comboRule, tried, matchedMap, requestPayloads, samples, filterStats, startedAt, timeBudgetMs } = context;
  const maxPages = clamp(Number(plan.maxPages || 1), 1, 100);
  const batchSize = clamp(Number(plan.batchSize || 6), 1, 12);
  let firstMatchPage = null;
  let pageNo = 1;
  let stopReason = 'plan-complete';

  while (pageNo <= maxPages) {
    if (Date.now() - startedAt > timeBudgetMs) { stopReason = 'time-budget-in-plan'; break; }
    const pageLimit = firstMatchPage === null ? maxPages : Math.min(maxPages, firstMatchPage + 1);
    const endPage = Math.min(pageLimit, pageNo + batchSize - 1);
    const rows = [];
    for (let p = pageNo; p <= endPage; p += 1) {
      rows.push({ pageNo: p, payload: makeAccessoryPayload(rule, plan, p) });
    }
    if (!rows.length) break;
    for (const row of rows) {
      if (requestPayloads.length < 60) requestPayloads.push({ planType: plan.type, optionSearch: plan.optionSearch || null, ...row.payload });
    }

    const settled = await Promise.allSettled(rows.map(row => fetchAuctionPage(apiKey, row.payload).then(result => ({ row, result }))));
    const batchResults = settled.map((entry, index) => {
      if (entry.status === 'fulfilled') return entry.value;
      return { row: rows[index], result: { items: [], totalCount: 0, pageSize: 0, error: entry.reason?.message || String(entry.reason || '요청 실패') } };
    }).sort((a, b) => a.row.pageNo - b.row.pageNo);

    for (const { row, result } of batchResults) {
      if (firstMatchPage !== null && row.pageNo > firstMatchPage + 1) continue;
      tried.push({
        type: plan.type,
        keyword: rule.label,
        categoryCode: plan.categoryCode,
        pageNo: row.pageNo,
        optionSearch: plan.optionSearch || null,
        itemUpgradeLevel: plan.itemUpgradeLevel ?? null,
        count: result.items.length,
        totalCount: result.totalCount,
        error: result.error || null
      });

      let pageMatched = false;
      for (const item of result.items) {
        const normalized = normalizeAuctionItem(item);
        const reasons = accessoryRejectReasons(normalized, rule, target);
        if (samples.length < 8) samples.push(makeAccessoryDebugSample(item, normalized, reasons));
        if (reasons.length) {
          for (const reason of reasons) filterStats[reason] = (filterStats[reason] || 0) + 1;
          continue;
        }
        pageMatched = true;
        const key = normalized.id || `${normalized.name}-${normalized.price}-${normalized.quality}-${normalized.fullText.slice(0, 80)}`;
        if (!matchedMap.has(key)) matchedMap.set(key, { ...normalized, part: rule.label, combo: comboRule.label, refineCount: normalized.refineCount, targetOptions: [target.primary, target.secondary] });
      }

      if (pageMatched && firstMatchPage === null) firstMatchPage = row.pageNo;
      const pageSize = result.pageSize || result.items.length || 10;
      const totalCount = result.totalCount || 0;
      if (!result.error && (!result.items.length || (totalCount && row.pageNo * pageSize >= totalCount))) {
        stopReason = 'api-last-page';
        return { firstMatchPage, stopReason };
      }
    }

    if (firstMatchPage !== null && endPage >= firstMatchPage + 1) return { firstMatchPage, stopReason: 'first-match-page-plus-next-page-complete' };
    pageNo = endPage + 1;
  }
  return { firstMatchPage, stopReason };
}

function makeAccessoryPayload(rule, plan, pageNo) {
  const payload = {
    Sort: 'BUY_PRICE',
    SortCondition: plan.sortCondition || 'ASC',
    CategoryCode: plan.categoryCode ?? undefined,
    ItemTier: 4,
    ItemGrade: '고대',
    ItemName: rule.label,
    PageNo: pageNo,
    ItemUpgradeLevel: Number.isFinite(Number(plan.itemUpgradeLevel)) ? Number(plan.itemUpgradeLevel) : undefined,
    EtcOptions: Array.isArray(plan.etcOptions) && plan.etcOptions.length ? plan.etcOptions : undefined
  };
  return stripUndefined(payload);
}

function accessoryRejectReasons(normalized, rule, target) {
  const reasons = [];
  if (!normalized.price) reasons.push('가격 없음');
  if (normalized.tier && Number(normalized.tier) !== 4) reasons.push(`티어 불일치: ${normalized.tier}`);
  if (normalized.grade && normalized.grade !== '고대') reasons.push(`등급 불일치: ${normalized.grade}`);
  if (!isAccessoryPart(`${normalized.name} ${normalized.fullText}`, rule.label)) reasons.push('부위 불일치');

  // 실제 연마 옵션은 정확히 3개여야 하며, 목표 옵션 2개의 위치는 무관하다.
  // 힘/민첩/지능과 품질은 표시용 데이터일 뿐 검색/필터 판정에는 사용하지 않는다.
  const upgrades = normalized.upgradeOptions || [];
  if (upgrades.length !== 3) reasons.push(`3연마 아님: ${upgrades.length}개`);
  if (!hasUpgradeOption(upgrades, target.primary)) reasons.push(`필수옵션 없음: ${target.primary.label} ${target.primary.value}%`);
  if (!hasUpgradeOption(upgrades, target.secondary)) reasons.push(`필수옵션 없음: ${target.secondary.label} ${target.secondary.value}%`);
  return reasons;
}

function makeAccessoryDebugSample(raw, normalized, reasons) {
  return {
    name: normalized.name,
    grade: normalized.grade,
    price: normalized.price,
    quality: normalized.quality,
    mainStat: normalized.mainStat,
    refineCount: normalized.refineCount,
    upgradeOptions: normalized.upgradeOptions,
    reasons,
    optionKeys: {
      hasOptions: Array.isArray(raw?.Options),
      optionsLength: Array.isArray(raw?.Options) ? raw.Options.length : null,
      hasEtcOptions: Array.isArray(raw?.EtcOptions),
      etcOptionsLength: Array.isArray(raw?.EtcOptions) ? raw.EtcOptions.length : null,
      tooltipType: typeof raw?.Tooltip
    },
    options: compactJson(raw?.Options, 900),
    etcOptions: compactJson(raw?.EtcOptions, 900),
    textPreview: normalized.fullText.slice(0, 1200)
  };
}

function compactJson(value, max = 700) {
  if (value === undefined || value === null) return null;
  let text = '';
  try { text = JSON.stringify(value); } catch { text = String(value); }
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

async function searchGem(apiKey, query) {
  const gem = String(query.gem || 'damage');
  const level = clamp(Number(query.level || 10), 1, 10);
  const rule = GEM_RULES[gem] || GEM_RULES.damage;
  const tried = [];
  const matchedMap = new Map();
  const exactNames = [`${level}레벨 ${rule.label}의 보석`, `${level}레벨 ${rule.label}`, rule.label];

  // v5.1.5: 보석은 경매장 정확 아이템명 우선 검색 후, 필요 시 카테고리 없는 검색까지 fallback.
  for (const itemName of exactNames) {
    for (const categoryCode of [210000, null, 210010, 210020]) {
      const payload = {
        Sort: 'BUY_PRICE',
        SortCondition: 'ASC',
        CategoryCode: categoryCode ?? undefined,
        ItemTier: 4,
        ItemName: itemName,
        PageNo: 1
      };
      stripUndefined(payload);
      const result = await fetchAuctionPage(apiKey, payload);
      tried.push({ type: 'gem-exact', keyword: itemName, categoryCode, count: result.items.length, totalCount: result.totalCount, error: result.error || null });
      for (const item of result.items) {
        const normalized = normalizeAuctionItem(item);
        if (!normalized.price) continue;
        const text = normalizeText(`${normalized.name} ${normalized.fullText}`);
        if (!text.includes(rule.label)) continue;
        if (!new RegExp(`${level}\s*레벨|Lv\.?\s*${level}|${level}레벨`, 'i').test(text)) continue;
        const key = normalized.id || `${normalized.name}-${normalized.price}`;
        if (!matchedMap.has(key)) matchedMap.set(key, { ...normalized, gem: rule.label, level });
      }
      if (matchedMap.size) break;
    }
    if (matchedMap.size) break;
  }

  const matched = [...matchedMap.values()].sort((a, b) => a.price - b.price);
  return { ok: true, apiVersion: API_VERSION, source: 'auctions/items', mode: 'gem', gem, gemLabel: rule.label, level, items: matched.slice(0, 10), lowest: matched[0] || null, tried, debug: summarizeTried(tried) };
}

async function searchGemList(apiKey, query) {
  const force = String(query.force || '') === '1';
  const cacheKey = 'gemList:v1';
  return getCachedMarketList(cacheKey, force, async () => searchGemListFresh(apiKey));
}

async function searchGemListFresh(apiKey) {
  const levels = [10, 9, 8, 7, 6, 5];
  const tried = [];
  const pairs = await Promise.all(levels.map(async level => {
    const [damage, cooldown] = await Promise.all([
      searchGem(apiKey, { gem: 'damage', level }),
      searchGem(apiKey, { gem: 'cooldown', level })
    ]);
    tried.push(...(damage.tried || []), ...(cooldown.tried || []));
    return {
      level,
      damage: damage.lowest ? { ...damage.lowest, gem: '겁화', level } : null,
      cooldown: cooldown.lowest ? { ...cooldown.lowest, gem: '작열', level } : null
    };
  }));
  const rows = pairs.sort((a, b) => b.level - a.level);
  return { ok: true, apiVersion: API_VERSION, source: 'auctions/items', mode: 'gemList', rows, tried, updatedAt: new Date().toISOString() };
}

async function searchEngraving(apiKey, query) {
  const name = String(query.name || '원한').trim();
  const keyword = name.includes('각인서') ? name : `${name} 각인서`;
  const tried = [];
  const matched = [];
  for (const categoryCode of [40000, 40010, null]) {
    const payload = { Sort: 'CURRENT_MIN_PRICE', SortCondition: 'ASC', CategoryCode: categoryCode ?? undefined, ItemGrade: '유물', ItemName: keyword, PageNo: 1 };
    stripUndefined(payload);
    const result = await fetchMarketPage(apiKey, payload);
    tried.push({ categoryCode, keyword, count: result.items.length, totalCount: result.totalCount, error: result.error || null });
    for (const item of result.items) {
      const normalized = normalizeMarketItem(item);
      const text = normalizeText([normalized.name, normalized.fullText].join(' '));
      if (!normalized.price) continue;
      if (!text.includes(name)) continue;
      if (!text.includes('각인서')) continue;
      if (normalized.grade && normalized.grade !== '유물') continue;
      matched.push({ ...normalized, engraving: name });
    }
    if (matched.length) break;
  }
  matched.sort((a, b) => a.price - b.price);
  return { ok: true, apiVersion: API_VERSION, source: 'markets/items', mode: 'engraving', name, items: matched.slice(0, 10), lowest: matched[0] || null, tried };
}

async function searchEngravingList(apiKey, query) {
  const maxPages = clamp(Number(query.pages || 8), 1, 20);
  const force = String(query.force || '') === '1';
  const cacheKey = `engravingList:v1:pages${maxPages}`;
  return getCachedMarketList(cacheKey, force, async () => searchEngravingListFresh(apiKey, maxPages));
}

async function searchEngravingListFresh(apiKey, maxPages) {
  const seen = new Map();
  const tried = [];
  for (const categoryCode of [40000, 40010, null]) {
    const payloads = [];
    for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
      const payload = { Sort: 'CURRENT_MIN_PRICE', SortCondition: 'DESC', CategoryCode: categoryCode ?? undefined, ItemGrade: '유물', ItemName: '각인서', PageNo: pageNo };
      stripUndefined(payload);
      payloads.push(payload);
    }
    const settled = await Promise.allSettled(payloads.map(payload => fetchMarketPage(apiKey, payload).then(result => ({ payload, result }))));
    for (const entry of settled) {
      const payload = entry.status === 'fulfilled' ? entry.value.payload : payloads[settled.indexOf(entry)];
      const result = entry.status === 'fulfilled' ? entry.value.result : { items: [], totalCount: 0, pageSize: 0, error: entry.reason?.message || String(entry.reason || '요청 실패') };
      const pageNo = payload.PageNo;
      tried.push({ categoryCode, pageNo, count: result.items.length, totalCount: result.totalCount, error: result.error || null });
      for (const item of result.items) {
        const normalized = normalizeMarketItem(item);
        const text = normalizeText([normalized.name, normalized.fullText].join(' '));
        if (!normalized.price) continue;
        if (!text.includes('각인서')) continue;
        if (normalized.grade && normalized.grade !== '유물') continue;
        const key = normalized.name || normalized.id || text.slice(0, 60);
        const prev = seen.get(key);
        if (!prev || normalized.price < prev.price) seen.set(key, normalized);
      }
      const totalCount = Number(result.totalCount || 0);
      const pageSize = Number(result.pageSize || result.items.length || 10) || 10;
      if (!result.items.length || (totalCount && pageNo * pageSize >= totalCount)) break;
    }
    if (seen.size) break;
  }
  const items = [...seen.values()].sort((a, b) => b.price - a.price);
  return { ok: true, apiVersion: API_VERSION, source: 'markets/items', mode: 'engravingList', sort: 'price-desc', items, tried, updatedAt: new Date().toISOString() };
}

async function searchT4Materials(apiKey, query) {
  const force = String(query.force || '') === '1';
  const cacheKey = 't4Materials:v8';
  return getCachedMarketList(cacheKey, force, async () => searchT4MaterialsFresh(apiKey), isUsableT4MaterialList);
}

async function searchT4MaterialsFresh(apiKey) {
  const tasks = T4_MATERIAL_GROUPS.flatMap(group => group.items.map(name => ({ group: group.group, name })));
  const results = await mapWithConcurrency(tasks, 8, task => searchMarketMaterial(apiKey, task.name, task.group));
  const rows = [];
  const tried = [];
  for (let i = 0; i < results.length; i += 1) {
    const entry = results[i];
    const task = tasks[i];
    if (entry.status === 'fulfilled') {
      rows.push(entry.value.item);
      tried.push(...entry.value.tried);
    } else {
      rows.push({ group: task.group, requestedName: task.name, name: task.name, price: 0, unitPrice: 0, bundleCount: 1, error: entry.reason?.message || String(entry.reason || '조회 실패') });
      tried.push({ group: task.group, name: task.name, error: entry.reason?.message || String(entry.reason || '조회 실패') });
    }
  }
  return { ok: true, apiVersion: API_VERSION, source: 'markets/items', mode: 't4Materials', groups: T4_MATERIAL_GROUPS.map(group => group.group), items: rows, tried, updatedAt: new Date().toISOString() };
}

function isUsableT4MaterialList(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  if (!items.length) return false;
  const missingCount = items.filter(item => item?.missing || !Number(item?.price || 0)).length;
  const importantNames = new Set(['아비도스 융화제', '상급 아비도스 융화제', '빙하의 숨결', '용암의 숨결']);
  const importantMissing = items.some(item => importantNames.has(item?.requestedName || item?.name || '') && (item?.missing || !Number(item?.price || 0)));
  return !importantMissing && missingCount < Math.max(3, Math.ceil(items.length * 0.25));
}

async function searchMarketMaterial(apiKey, name, group) {
  const tried = [];
  const matched = [];
  const aliases = materialSearchAliases(name);
  for (const keyword of aliases) {
    for (const categoryCode of [null, 50000, 50010, 50020, 50030, 50040]) {
      const payload = { Sort: 'CURRENT_MIN_PRICE', SortCondition: 'ASC', CategoryCode: categoryCode ?? undefined, ItemName: keyword, PageNo: 1 };
      stripUndefined(payload);
      const result = await fetchMarketPage(apiKey, payload);
      tried.push({ group, name, keyword, categoryCode, count: result.items.length, totalCount: result.totalCount, error: result.error || null });
      for (const raw of result.items) {
        const item = normalizeMarketItem(raw);
        if (!item.price) continue;
        const itemText = normalizeText(`${item.name} ${item.fullText}`);
        if (!isMaterialNameMatch(itemText, name, keyword)) continue;
        const meta = applyMaterialUnitMeta({ ...item, group, requestedName: name, source: 'markets/items' }, name);
        matched.push(isArkGridGemName(name) ? { ...meta, pheonCost: defaultArkGridGemPheonCost(meta.grade) } : meta);
      }
      if (matched.length) break;
    }
    if (matched.length) break;
  }
  matched.sort((a, b) => a.effectiveUnitPrice - b.effectiveUnitPrice || a.unitPrice - b.unitPrice || a.price - b.price);
  const item = matched[0] || applyMaterialUnitMeta({ group, requestedName: name, name, price: 0, unitPrice: 0, bundleCount: 1, icon: '', grade: '', missing: true }, name);
  return { item: { ...item, group, requestedName: name }, tried };
}

function materialSearchAliases(name) {
  const base = String(name || '').trim();
  const aliases = [base];
  if (/운명의\s*파편\s*주머니\((소|중|대)\)/.test(base)) {
    const size = base.match(/\((소|중|대)\)/)?.[1] || '';
    aliases.push(`운명의 파편 주머니 ${size}`);
    aliases.push(`운명의 파편 주머니`);
  }
  if (base === '아비도스 융화제') {
    aliases.push('아비도스 융화 재료', '아비도스 융화재료');
  }
  if (base === '상급 아비도스 융화제') {
    aliases.push('상급 아비도스 융화 재료', '상급 아비도스 융화재료');
  }
  const artisanBook = base.match(/^장인의\s*(재봉술|야금술)\s*:?\s*(\d)단계$/);
  if (artisanBook) {
    const [, type, stage] = artisanBook;
    aliases.push(`장인의 ${type} : ${stage}단계`, `장인의 ${type}: ${stage}단계`, `장인의 ${type} ${stage} 단계`, `장인의 ${type} : 업화 ${stage}단계`, `장인의 ${type}: 업화 ${stage}단계`, `장인의 ${type} 업화 ${stage}단계`);
  }
  const arkGridGem = parseArkGridGemName(base);
  if (arkGridGem) {
    const { order, type } = arkGridGem;
    aliases.push(`${order}의 젬 : ${type}`, `${order}의 젬: ${type}`, `${order}의 젬 ${type}`, `${order} 젬 ${type}`, `${order} ${type}`, `아크그리드 ${order} ${type}`, `아크 그리드 ${order} ${type}`);
  }
  return [...new Set(aliases)];
}

function isArkGridGemName(name) {
  return Boolean(parseArkGridGemName(name));
}

function parseArkGridGemName(name) {
  const text = String(name || '').trim();
  const exact = text.match(/^(질서|혼돈)의?\s*젬\s*:?\s*(안정|견고|불변|침식|왜곡|붕괴)$/);
  if (exact) return { order: exact[1], type: exact[2] };
  const short = text.match(/^(질서|혼돈)(?:의)?\s*(안정|견고|불변|침식|왜곡|붕괴)\s*젬?$/);
  if (short) return { order: short[1], type: short[2] };
  return null;
}

function isMaterialNameMatch(itemText, targetName, keyword) {
  const compactText = normalizeText(itemText).replace(/\s+/g, '');
  const target = normalizeText(targetName).replace(/\s+/g, '');
  const key = normalizeText(keyword).replace(/\s+/g, '');
  const sizeMatch = targetName.match(/운명의\s*파편\s*주머니\((소|중|대)\)/);
  if (sizeMatch) return compactText.includes('운명의파편주머니') && compactText.includes(sizeMatch[1]);
  const artisanBook = targetName.match(/^장인의\s*(재봉술|야금술)\s*:?\s*(\d)단계$/);
  if (artisanBook) {
    const [, type, stage] = artisanBook;
    return compactText.includes('장인의') && compactText.includes(type) && compactText.includes(`${stage}단계`);
  }
  const arkGridGem = parseArkGridGemName(targetName);
  if (arkGridGem) {
    return compactText.includes(arkGridGem.order) && compactText.includes(arkGridGem.type) && compactText.includes('젬');
  }
  return compactText.includes(target) || compactText.includes(key);
}

function defaultArkGridGemPheonCost(grade) {
  const text = normalizeText(grade);
  if (text.includes('영웅')) return 12;
  if (text.includes('희귀')) return 6;
  if (text.includes('고급')) return 3;
  return 0;
}

function materialUnitPrice(item) {
  const bundle = Number(item.bundleCount || 1) || 1;
  return Math.round((Number(item.price || 0) / bundle) * 100) / 100;
}

function destinyShardPouchCount(name) {
  const size = String(name || '').match(/운명의\s*파편\s*주머니\((소|중|대)\)/)?.[1];
  return size ? DESTINY_SHARD_POUCH_COUNTS[size] || 0 : 0;
}

function applyMaterialUnitMeta(item, requestedName) {
  const unitPrice = Number(item.unitPrice || materialUnitPrice(item) || 0);
  const shardCount = destinyShardPouchCount(requestedName);
  if (!shardCount) return { ...item, unitPrice, effectiveUnitPrice: unitPrice };
  const shardUnitPrice = Math.round((unitPrice / shardCount) * 10000) / 10000;
  return {
    ...item,
    unitPrice,
    shardCount,
    shardUnitPrice,
    effectiveUnitPrice: shardUnitPrice
  };
}

async function getCachedMarketList(cacheKey, force, loader, isUsable = () => true) {
  const now = Date.now();
  const cached = marketListCache.get(cacheKey);
  if (!force && cached && cached.expiresAt > now && isUsable(cached.data)) return { ...cached.data, cached: true };
  if (!force && cached && cached.expiresAt > now && !isUsable(cached.data)) marketListCache.delete(cacheKey);
  if (!force && marketListInflight.has(cacheKey)) {
    const data = await marketListInflight.get(cacheKey);
    return { ...data, cached: isUsable(data), joinedInflight: true };
  }
  const promise = loader().then(data => {
    if (isUsable(data)) marketListCache.set(cacheKey, { expiresAt: Date.now() + MARKET_LIST_CACHE_TTL_MS, data });
    return data;
  }).finally(() => marketListInflight.delete(cacheKey));
  marketListInflight.set(cacheKey, promise);
  return promise;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  const workerCount = Math.min(Math.max(Number(limit || 1), 1), items.length || 1);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = { status: 'fulfilled', value: await mapper(items[index], index) };
      } catch (error) {
        results[index] = { status: 'rejected', reason: error };
      }
    }
  }));
  return results;
}

async function getAuctionOptions(apiKey) {
  const data = await requestLostArk(apiKey, 'https://developer-lostark.game.onstove.com/auctions/options', { method: 'GET' });
  return { ok: true, apiVersion: API_VERSION, source: 'auctions/options', data, updatedAt: new Date().toISOString() };
}

function makeAccessoryTarget(rule, comboRule) {
  const primaryValue = rule.options.primary.values[comboRule.primary];
  const secondaryValue = rule.options.secondary.values[comboRule.secondary];
  return {
    primary: { label: rule.options.primary.label, grade: comboRule.primary, value: primaryValue },
    secondary: { label: rule.options.secondary.label, grade: comboRule.secondary, value: secondaryValue }
  };
}

async function fetchAuctionPage(apiKey, payload) {
  try {
    const data = await requestLostArk(apiKey, AUCTION_ENDPOINT, { method: 'POST', body: payload });
    return { items: Array.isArray(data?.Items) ? data.Items : [], totalCount: Number(data?.TotalCount || 0), pageSize: Number(data?.PageSize || 0) };
  } catch (error) { return { items: [], totalCount: 0, pageSize: 0, error: error.message }; }
}

async function fetchMarketPage(apiKey, payload) {
  try {
    const data = await requestLostArk(apiKey, MARKET_ENDPOINT, { method: 'POST', body: payload });
    return { items: Array.isArray(data?.Items) ? data.Items : [], totalCount: Number(data?.TotalCount || 0), pageSize: Number(data?.PageSize || 0) };
  } catch (error) { return { items: [], totalCount: 0, pageSize: 0, error: error.message }; }
}

async function requestLostArk(apiKey, url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOSTARK_REQUEST_TIMEOUT_MS);
  const init = { method: options.method || 'GET', headers: { Authorization: `bearer ${apiKey}`, Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, signal: controller.signal };
  if (options.body) init.body = JSON.stringify(options.body);
  const response = await fetch(url, init).finally(() => clearTimeout(timeout));
  const text = await response.text();
  if (!response.ok) throw new Error(`LostArk API 오류 (${response.status}): ${text.slice(0, 300)}`);
  try { return text ? JSON.parse(text) : null; } catch { throw new Error(`API 응답 JSON 파싱 실패: ${text.slice(0, 300)}`); }
}

function normalizeAuctionItem(item) {
  const auctionInfo = item.AuctionInfo || {};
  const price = Number(auctionInfo.BuyPrice || item.BuyPrice || item.CurrentMinPrice || item.LowestPrice || 0);
  const fullText = normalizeText([item.Name, item.Grade, item.Tier, item.Level, JSON.stringify(item.Options || ''), JSON.stringify(item.EtcOptions || ''), tooltipText(item.Tooltip)].join(' '));
  const upgradeOptions = extractAccessoryUpgradeOptions(item.Options, fullText);
  const grade = item.Grade || '';
  const explicitPheonCost = extractPheonCost(item, fullText);
  return {
    id: item.Id || item.ItemId || null,
    name: item.Name || '',
    grade,
    tier: Number(item.Tier || 0),
    level: Number(item.Level || 0),
    icon: normalizeIconUrl(item.Icon || item.IconPath || findIconPath(item.Tooltip) || ''),
    price,
    bidStartPrice: Number(auctionInfo.BidStartPrice || 0),
    tradeAllowCount: Number(item.TradeAllowCount ?? item.TradeRemainCount ?? 0),
    pheonCost: explicitPheonCost || defaultAuctionPheonCost(grade, fullText),
    quality: findQuality(item, fullText),
    refineCount: upgradeOptions.length,
    upgradeOptions,
    fullText
  };
}

function extractPheonCost(item, fullText = '') {
  const auctionInfo = item?.AuctionInfo || {};
  const direct = [
    item?.Pheon,
    item?.Pheons,
    item?.PheonCost,
    item?.PheonPrice,
    item?.PheonCount,
    auctionInfo?.Pheon,
    auctionInfo?.Pheons,
    auctionInfo?.PheonCost,
    auctionInfo?.PheonPrice,
    auctionInfo?.PheonCount
  ].map(Number).find(value => Number.isFinite(value) && value > 0);
  if (direct) return direct;
  const match = String(fullText || '').match(/페온[^0-9]{0,8}([0-9]{1,4})/);
  return match ? Number(match[1]) : 0;
}

function defaultAuctionPheonCost(grade, fullText = '') {
  const text = normalizeText(`${grade} ${fullText}`);
  if (/어빌리티\s*스톤|어빌리티스톤/.test(text)) return 9;
  if (/고대/.test(text) && /목걸이|귀걸이|반지/.test(text)) return 35;
  return 0;
}

function normalizeMarketItem(item) {
  const price = Number(item.CurrentMinPrice || item.MinPrice || item.LowestPrice || 0);
  const fullText = normalizeText([item.Name, item.Grade, item.Type, item.ItemType, tooltipText(item.Tooltip)].join(' '));
  return { id: item.Id || item.ItemId || null, name: item.Name || '', grade: item.Grade || '', icon: normalizeIconUrl(item.Icon || item.IconPath || findIconPath(item.Tooltip) || ''), price, yDayAvgPrice: Number(item.YDayAvgPrice || 0), recentPrice: Number(item.RecentPrice || 0), bundleCount: Number(item.BundleCount || 1), fullText };
}

function isAccessoryPart(text, label) { return normalizeText(text).includes(label); }
function extractAccessoryUpgradeOptions(options, fullText = '') {
  const parsed = [];
  if (Array.isArray(options)) {
    for (const option of options) {
      if (String(option?.Type || '').toUpperCase() !== 'ACCESSORY_UPGRADE') continue;
      parsed.push({
        name: String(option?.OptionName || '').trim(),
        value: Number(option?.Value ?? 0),
        isPercentage: Boolean(option?.IsValuePercentage)
      });
    }
  }

  // 공식 Options에 ACCESSORY_UPGRADE가 있으면 그것만 사용한다.
  // Tooltip/EtcOptions 병합은 중복 옵션 수를 만들 수 있으므로 Options가 비어 있을 때만 보조 파싱한다.
  if (parsed.length > 0) return parsed.filter(option => option.name);

  const text = normalizeText(fullText);
  for (const label of ACCESSORY_REFINING_LABELS) {
    const escaped = escapeRegExp(label).replace(/\s+/g, '\\s*');
    const regex = new RegExp(`${escaped}\\s*(?:증가|효과)?\\s*(?:\\+)?\\s*([0-9]+(?:\\.[0-9]+)?)\\s*(%)?`, 'gi');
    let match;
    while ((match = regex.exec(text))) {
      const value = Number(match[1]);
      if (!Number.isFinite(value)) continue;
      const isPercentage = Boolean(match[2]);
      const duplicate = parsed.some(option => compactOptionName(option.name) === compactOptionName(label) && Math.abs(Number(option.value) - value) < 0.001 && Boolean(option.isPercentage) === isPercentage);
      if (!duplicate) parsed.push({ name: label, value, isPercentage });
    }
  }
  return parsed.filter(option => option.name);
}

function compactOptionName(value) {
  return normalizeText(value)
    .replace(/증가/g, '')
    .replace(/효과/g, '')
    .replace(/\s+/g, '')
    .trim();
}
function hasUpgradeOption(upgrades, target) {
  const label = typeof target === 'string' ? target : target?.label;
  const expectedValue = typeof target === 'object' ? Number(target.value) : NaN;
  const wanted = compactOptionName(label);
  return upgrades.some(option => {
    const name = compactOptionName(option.name);
    const nameOk = name.includes(wanted) || wanted.includes(name);
    if (!nameOk) return false;

    // 공식 API/외부 캐시 응답에 IsValuePercentage가 누락되는 경우가 있어
    // 최종 판정은 옵션명 + 실제 Value 등급표로 한다. 공격력 +390 같은 flat 옵션은 값이 등급표와 맞지 않아 자동 제외된다.
    if (Number.isFinite(expectedValue)) return Math.abs(Number(option.value) - expectedValue) < 0.001;
    return option.isPercentage !== false || Number(option.value) < 20;
  });
}
function countRefiningOptions(text) {
  const compact = normalizeText(text).replace(/\s+/g, '');
  return ACCESSORY_REFINING_LABELS.reduce((count, label) => count + (compact.includes(label.replace(/\s+/g, '')) ? 1 : 0), 0);
}
function hasThreeRefiningOptions(text, requiredLabels = []) {
  const compact = normalizeText(text).replace(/\s+/g, '');
  const requiredOk = requiredLabels.every(label => compact.includes(String(label).replace(/\s+/g, '')));
  if (!requiredOk) return false;
  const knownCount = countRefiningOptions(text);
  if (knownCount >= 3) return true;
  const refineWordCount = (compact.match(/연마/g) || []).length;
  return knownCount >= 2 && refineWordCount >= 3;
}
function hasOptionValue(text, label, value) {
  const compact = normalizeText(text).replace(/\s+/g, '');
  const labelCompact = label.replace(/\s+/g, '');
  const raw = Number(value);
  const variants = [...new Set([raw.toFixed(2), raw.toFixed(1), String(raw)].map(v => v.replace(/\.00$/, '').replace(/\.0$/, '')))];
  return compact.includes(labelCompact) && variants.some(v => compact.includes(`${v}%`) || compact.includes(`+${v}%`) || compact.includes(`+${v}`));
}
function findQuality(item, text) { return Number(item.Quality || item.GradeQuality || (String(text).match(/품질\s*([0-9]{1,3})/) || [])[1] || 0); }
function marketPrice(item) { return Number(item.CurrentMinPrice || item.MinPrice || item.LowestPrice || item.LowPrice || item?.AuctionInfo?.BuyPrice || 0); }
function tooltipText(tooltip) { if (!tooltip) return ''; if (typeof tooltip === 'string') { try { return normalizeText(JSON.stringify(JSON.parse(tooltip))); } catch { return normalizeText(tooltip); } } return normalizeText(JSON.stringify(tooltip)); }
function findIconPath(tooltip) { const raw = typeof tooltip === 'string' ? tooltip : JSON.stringify(tooltip || ''); const decoded = decodeEntities(raw); const match = decoded.match(/"iconPath"\s*:\s*"([^"]+)"/) || decoded.match(/iconPath['"]?\s*[:=]\s*['"]([^'"]+)['"]/i); return match?.[1] || ''; }
function normalizeIconUrl(value) { const icon = String(value || '').trim(); if (!icon) return null; if (/^https?:\/\//i.test(icon)) return icon; return `${CDN_PREFIX}${icon.replace(/^\/+/, '')}`; }
function normalizeText(value) { return decodeEntities(String(value ?? '')).replace(/<br\s*\/?>(\n)?/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim(); }
function decodeEntities(value) { return String(value ?? '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#40;/g, '(').replace(/&#41;/g, ')'); }
function clamp(value, min, max) { const n = Number(value); if (!Number.isFinite(n)) return min; return Math.max(min, Math.min(max, n)); }
function summarizeTried(tried) {
  const rows = Array.isArray(tried) ? tried : [];
  const totalRequests = rows.length;
  const responseItems = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const responseTotalCount = rows.reduce((sum, row) => sum + Number(row.totalCount || 0), 0);
  const errors = rows.filter(row => row.error).map(row => row.error);
  return { totalRequests, responseItems, responseTotalCount, errors: [...new Set(errors)].slice(0, 5) };
}
function stripUndefined(obj) { Object.keys(obj).forEach(key => obj[key] === undefined && delete obj[key]); return obj; }

function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
