const API_VERSION = '5.3.7';
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
    if (mode === 'auctionOptions') return res.status(200).json(await getAuctionOptions(apiKey));
    return res.status(400).json({ ok: false, error: 'mode는 accessory/gem/gemList/engraving/engravingList/auctionOptions 중 하나여야 합니다.' });
  } catch (error) {
    return res.status(500).json({ ok: false, apiVersion: API_VERSION, error: '시세 조회 실패', message: error?.message || String(error) });
  }
}


let auctionOptionCache = { expiresAt: 0, data: null };

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
  // v5.3.7:
  // 공식 API의 ACCESSORY_UPGRADE 값 필터는 중옵 조합에서 정확히 AND로 동작하지 않는 케이스가 확인됐다.
  // 그래서 먼저 3연마 후보를 줄이기 위해 ARK_PASSIVE "깨달음 13"을 함께 걸고,
  // 상상/상중/중상은 한쪽 핵심 상옵션 또는 양옵션 후보를 받은 뒤 Options의 실제 ACCESSORY_UPGRADE 값으로만 최종 판정한다.
  const fallback = AUCTION_ETC_OPTION_FALLBACK[partKey] || {};
  // v5.3.7: 악세 조회 타임아웃 방지. 목걸이는 검증된 fallback 코드(적주피/추피)를 우선 사용해서
  // auctions/options 선행 호출 1회를 제거한다. 필요한 부위에서만 options 메타를 조회한다.
  let optionData = null;
  let primaryOption = fallback.primary || null;
  let secondaryOption = fallback.secondary || null;
  let enlightenmentOption = null;
  if (!primaryOption || !secondaryOption) {
    optionData = await getAuctionOptionDataCached(apiKey);
    primaryOption = primaryOption || findAuctionEtcOption(optionData, target.primary.label) || null;
    secondaryOption = secondaryOption || findAuctionEtcOption(optionData, target.secondary.label) || null;
    enlightenmentOption = findAuctionEtcOption(optionData, '깨달음') || null;
  }
  const plans = [];
  const categoryList = [...new Set(rule.categoryCandidates.filter(code => code !== null && code !== undefined))].slice(0, 1);

  const exactEtc = (option, targetOption) => option ? {
    FirstOption: option.firstOption,
    SecondOption: option.secondOption,
    MinValue: Number(targetOption.value),
    MaxValue: Number(targetOption.value)
  } : null;

  const broadEtc = (option) => option ? {
    FirstOption: option.firstOption,
    SecondOption: option.secondOption,
    MinValue: 0,
    MaxValue: 999999
  } : null;

  const enlightenmentEtc = enlightenmentOption ? {
    FirstOption: enlightenmentOption.firstOption,
    SecondOption: enlightenmentOption.secondOption,
    MinValue: 13,
    MaxValue: 13
  } : null;

  const withRefine = (arr) => [...arr.filter(Boolean), ...(enlightenmentEtc ? [enlightenmentEtc] : [])];
  const addPlan = (categoryCode, type, sortCondition, etcOptions, optionSearch, maxPages = 30) => {
    const clean = etcOptions.filter(Boolean);
    if (!clean.length) return;
    plans.push({ type, categoryCode, sortCondition, etcOptions: clean, optionSearch, maxPages });
  };

  for (const categoryCode of categoryList) {
    const primaryExact = exactEtc(primaryOption, target.primary);
    const secondaryExact = exactEtc(secondaryOption, target.secondary);
    const primaryBroad = broadEtc(primaryOption);
    const secondaryBroad = broadEtc(secondaryOption);

    if (comboKey === 'highHigh') {
      // v5.3.7: 공식 API의 양옵션 EtcOptions는 AND로 안정 동작하지 않아 노이즈가 많다.
      // 그래서 한쪽 핵심 옵션 후보를 먼저 보고, 실제 Options로 선택 옵션 보유 여부를 직접 판정한다.
      // 양옵션 검색은 보조 fallback으로만 짧게 사용한다.
      if (primaryExact) addPlan(categoryCode, 'accessory-highhigh-primary-high-refine-asc', 'ASC', withRefine([primaryExact]), `${target.primary.label} ${target.primary.value}% 후보 후 직접 판정`, 8);
      if (secondaryExact) addPlan(categoryCode, 'accessory-highhigh-secondary-high-refine-asc', 'ASC', withRefine([secondaryExact]), `${target.secondary.label} ${target.secondary.value}% 후보 후 직접 판정`, 8);
      if (primaryExact) addPlan(categoryCode, 'accessory-highhigh-primary-high-refine-desc', 'DESC', withRefine([primaryExact]), `${target.primary.label} ${target.primary.value}% 후보 DESC 후 직접 판정`, 3);
      if (secondaryExact) addPlan(categoryCode, 'accessory-highhigh-secondary-high-refine-desc', 'DESC', withRefine([secondaryExact]), `${target.secondary.label} ${target.secondary.value}% 후보 DESC 후 직접 판정`, 3);
      if (primaryExact && secondaryExact) {
        addPlan(categoryCode, 'accessory-highhigh-exact-both-refine-asc-short', 'ASC', withRefine([primaryExact, secondaryExact]), `${target.primary.label} ${target.primary.value}% + ${target.secondary.label} ${target.secondary.value}% 후보`, 2);
      }
      continue;
    }

    // 상중/중상: 3연마 여부는 보지 않고, 선택한 두 옵션 값이 같이 붙은 매물을 직접 판정한다.
    // 양옵션 exact는 공식 API가 완전한 AND로 동작하지 않을 수 있어 짧은 우선 후보로만 사용한다.
    if (primaryExact && secondaryExact) {
      addPlan(categoryCode, `accessory-${comboKey}-exact-both-asc`, 'ASC', withRefine([primaryExact, secondaryExact]), `${target.primary.label} ${target.primary.value}% + ${target.secondary.label} ${target.secondary.value}% 후보`, 4);
      addPlan(categoryCode, `accessory-${comboKey}-exact-both-desc`, 'DESC', withRefine([primaryExact, secondaryExact]), `${target.primary.label} ${target.primary.value}% + ${target.secondary.label} ${target.secondary.value}% 후보 DESC`, 2);
    }

    const highSide = target.primary.grade === 'high'
      ? { exact: primaryExact, label: target.primary.label, value: target.primary.value, side: 'primary-high' }
      : { exact: secondaryExact, label: target.secondary.label, value: target.secondary.value, side: 'secondary-high' };
    const midSide = target.primary.grade === 'mid'
      ? { exact: primaryExact, label: target.primary.label, value: target.primary.value, side: 'primary-mid' }
      : { exact: secondaryExact, label: target.secondary.label, value: target.secondary.value, side: 'secondary-mid' };

    if (highSide.exact) {
      addPlan(categoryCode, `accessory-${comboKey}-${highSide.side}-refine-asc`, 'ASC', withRefine([highSide.exact]), `${highSide.label} ${highSide.value}% 후보 후 직접 판정`, 8);
      addPlan(categoryCode, `accessory-${comboKey}-${highSide.side}-refine-desc`, 'DESC', withRefine([highSide.exact]), `${highSide.label} ${highSide.value}% 후보 DESC 후 직접 판정`, 4);
    }

    // 중옵 쪽 정확 필터도 깨달음 13과 함께 한 번 더 시도한다. 최종 판정은 여전히 직접 한다.
    if (midSide.exact) {
      addPlan(categoryCode, `accessory-${comboKey}-${midSide.side}-refine-asc`, 'ASC', withRefine([midSide.exact]), `${midSide.label} ${midSide.value}% 후보 후 직접 판정`, 6);
    }

    // 옵션 존재 범위 검색은 마지막 fallback. 깨달음 13이 잡힐 때만 사용해서 저가 1~2연마를 최대한 제거한다.
    if (enlightenmentEtc && primaryBroad && secondaryBroad) {
      addPlan(categoryCode, `accessory-${comboKey}-two-option-broad-refine-asc`, 'ASC', [primaryBroad, secondaryBroad, enlightenmentEtc], `${target.primary.label}/${target.secondary.label} 존재 후보 후 직접 판정`, 6);
    }
  }
  return plans;
}

function findAuctionEtcOption(data, label) {
  if (!data) return null;
  const labelCompact = normalizeText(label).replace(/\s+/g, '');
  const found = [];
  walkOptionTree(data, [], found, labelCompact);
  return found[0] || null;
}

function walkOptionTree(node, path, found, labelCompact) {
  if (!node || found.length) return;
  if (Array.isArray(node)) {
    for (const child of node) walkOptionTree(child, path, found, labelCompact);
    return;
  }
  if (typeof node !== 'object') return;

  const text = normalizeText(node.Text ?? node.Name ?? node.OptionName ?? node.Label ?? node.ValueName ?? '').replace(/\s+/g, '');
  const value = Number(node.Value ?? node.Id ?? node.Code ?? node.Option ?? node.OptionCode);
  const nextPath = Number.isFinite(value) ? [...path, value] : path;
  if (text && text.includes(labelCompact) && nextPath.length >= 2) {
    found.push({ firstOption: nextPath[nextPath.length - 2], secondOption: nextPath[nextPath.length - 1], text });
    return;
  }

  for (const key of Object.keys(node)) walkOptionTree(node[key], nextPath, found, labelCompact);
}

async function searchAccessory(apiKey, query) {
  const part = String(query.part || 'necklace');
  const combo = String(query.combo || 'highHigh');
  const rule = ACCESSORY_RULES[part] || ACCESSORY_RULES.necklace;
  const comboRule = COMBO_RULES[combo] || COMBO_RULES.highHigh;
  const maxPages = clamp(Number(query.pages || 10), 1, 16);
  const target = makeAccessoryTarget(rule, comboRule);
  const tried = [];
  const matchedMap = new Map();
  const debugPayloads = [];
  const debugSamples = [];
  const filterStats = {};
  const startedAt = Date.now();
  const timeBudgetMs = 8500;

  // v5.3.7: 3연마 판정은 포기하고, 공식 API에서 옵션 후보를 받은 뒤 ACCESSORY_UPGRADE 실제 Value 두 개만 최종 판정한다.
  const searchPlans = await makeAccessorySearchPlans(apiKey, rule, target, combo, part);
  for (const plan of searchPlans) {
    if (Date.now() - startedAt > timeBudgetMs) break;
    const pagesForPlan = Math.min(maxPages, Number(plan.maxPages || maxPages));
    for (let pageNo = 1; pageNo <= pagesForPlan; pageNo += 1) {
      if (Date.now() - startedAt > timeBudgetMs) break;
      const payload = {
        Sort: 'BUY_PRICE',
        SortCondition: plan.sortCondition || 'ASC',
        CategoryCode: plan.categoryCode ?? undefined,
        ItemTier: 4,
        ItemGrade: '고대',
        ItemName: rule.label,
        PageNo: pageNo,
        EtcOptions: Array.isArray(plan.etcOptions) && plan.etcOptions.length ? plan.etcOptions : undefined
      };
      stripUndefined(payload);
      debugPayloads.push({ ...payload });
      const result = await fetchAuctionPage(apiKey, payload);
      tried.push({ type: plan.type, keyword: rule.label, categoryCode: plan.categoryCode, pageNo, optionSearch: plan.optionSearch || null, count: result.items.length, totalCount: result.totalCount, error: result.error || null });

      for (const item of result.items) {
        const normalized = normalizeAuctionItem(item);
        const reasons = accessoryRejectReasons(normalized, rule, target);
        if (debugSamples.length < 5) {
          debugSamples.push(makeAccessoryDebugSample(item, normalized, reasons));
        }
        if (reasons.length) {
          for (const reason of reasons) filterStats[reason] = (filterStats[reason] || 0) + 1;
          continue;
        }
        const key = normalized.id || `${normalized.name}-${normalized.price}-${normalized.quality}`;
        if (!matchedMap.has(key)) matchedMap.set(key, { ...normalized, part: rule.label, combo: comboRule.label, refineCount: normalized.refineCount, targetOptions: [target.primary, target.secondary] });
      }

      const pageSize = result.pageSize || result.items.length || 10;
      const totalCount = result.totalCount || 0;
      if (!result.items.length || (totalCount && pageNo * pageSize >= totalCount)) break;
      if (matchedMap.size >= 3 || Date.now() - startedAt > timeBudgetMs) break;
    }
    if (matchedMap.size >= 3 || Date.now() - startedAt > timeBudgetMs) break;
  }

  const matched = [...matchedMap.values()].sort((a, b) => a.price - b.price);
  return {
    ok: true,
    apiVersion: API_VERSION,
    source: 'auctions/items',
    mode: 'accessory',
    part,
    partLabel: rule.label,
    combo,
    comboLabel: comboRule.label,
    targetOptions: [target.primary, target.secondary],
    items: matched.slice(0, 10),
    lowest: matched[0] || null,
    tried,
    debug: summarizeTried(tried),
    accessoryDebug: {
      note: 'v5.3.7 악세 디버그: 3연마/STAT 컷을 사용하지 않고, 선택한 두 옵션이 붙은 매물 중 최저가를 ACCESSORY_UPGRADE 실제 Value 기준으로 판정합니다.',
      requestPayloads: debugPayloads.slice(0, 8),
      filterStats,
      samples: debugSamples
    }
  };
}

function accessoryRejectReasons(normalized, rule, target) {
  const reasons = [];
  if (!normalized.price) reasons.push('가격 없음');
  if (normalized.tier && Number(normalized.tier) !== 4) reasons.push(`티어 불일치: ${normalized.tier}`);
  if (normalized.grade && normalized.grade !== '고대') reasons.push(`등급 불일치: ${normalized.grade}`);
  if (!isAccessoryPart(`${normalized.name} ${normalized.fullText}`, rule.label)) reasons.push('부위 불일치');

  // v5.3.7: 사용자가 3연마 판정을 포기하고, 선택한 두 딜러 옵션이 붙은 매물 중 최저가만 보길 원함.
  // 따라서 ItemUpgradeLevel, ACCESSORY_UPGRADE 개수, 힘/민첩/지능 STAT 컷은 필터에서 제외한다.
  const upgrades = normalized.upgradeOptions || [];
  if (!hasUpgradeOption(upgrades, target.primary)) reasons.push(`필수옵션 없음: ${target.primary.label} ${target.primary.value}%`);
  if (!hasUpgradeOption(upgrades, target.secondary)) reasons.push(`필수옵션 없음: ${target.secondary.label} ${target.secondary.value}%`);
  return reasons;
}

function getAccessoryStatThreshold(partLabel) {
  const label = normalizeText(partLabel);
  if (label.includes('목걸이')) return 16500;
  if (label.includes('귀걸이')) return 12800;
  if (label.includes('반지')) return 11900;
  return 0;
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
  const levels = [10, 9, 8, 7, 6, 5];
  const rows = [];
  const tried = [];
  for (const level of levels) {
    const damage = await searchGem(apiKey, { gem: 'damage', level });
    const cooldown = await searchGem(apiKey, { gem: 'cooldown', level });
    tried.push(...(damage.tried || []), ...(cooldown.tried || []));
    rows.push({
      level,
      damage: damage.lowest ? { ...damage.lowest, gem: '겁화', level } : null,
      cooldown: cooldown.lowest ? { ...cooldown.lowest, gem: '작열', level } : null
    });
  }
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
  const seen = new Map();
  const tried = [];
  for (const categoryCode of [40000, 40010, null]) {
    for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
      const payload = { Sort: 'CURRENT_MIN_PRICE', SortCondition: 'DESC', CategoryCode: categoryCode ?? undefined, ItemGrade: '유물', ItemName: '각인서', PageNo: pageNo };
      stripUndefined(payload);
      const result = await fetchMarketPage(apiKey, payload);
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
  const timeout = setTimeout(() => controller.abort(), 2800);
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
  const mainStat = extractAccessoryMainStat(item.Options, fullText);
  return {
    id: item.Id || item.ItemId || null,
    name: item.Name || '',
    grade: item.Grade || '',
    tier: Number(item.Tier || 0),
    level: Number(item.Level || 0),
    icon: normalizeIconUrl(item.Icon || item.IconPath || findIconPath(item.Tooltip) || ''),
    price,
    bidStartPrice: Number(auctionInfo.BidStartPrice || 0),
    tradeAllowCount: Number(item.TradeAllowCount ?? item.TradeRemainCount ?? 0),
    quality: findQuality(item, fullText),
    mainStat,
    refineCount: upgradeOptions.length,
    upgradeOptions,
    fullText
  };
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

  // 일부 응답은 ACCESSORY_UPGRADE가 Options에 없고 Tooltip/EtcOptions 텍스트로만 남을 수 있어 보조 파싱한다.
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

function extractAccessoryMainStat(options, fullText = '') {
  const statNames = ['힘', '민첩', '지능'];
  let maxStat = 0;
  if (Array.isArray(options)) {
    for (const option of options) {
      if (String(option?.Type || '').toUpperCase() !== 'STAT') continue;
      const name = normalizeText(option?.OptionName || '');
      if (!statNames.some(stat => name.includes(stat))) continue;
      const value = Number(option?.Value ?? 0);
      if (Number.isFinite(value)) maxStat = Math.max(maxStat, value);
    }
  }
  if (maxStat > 0) return maxStat;

  const text = normalizeText(fullText);
  for (const stat of statNames) {
    const regex = new RegExp(`${stat}\\s*(?:\\+)?\\s*([0-9]{4,6})`, 'g');
    let match;
    while ((match = regex.exec(text))) {
      const value = Number(match[1]);
      if (Number.isFinite(value)) maxStat = Math.max(maxStat, value);
    }
  }
  return maxStat;
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
