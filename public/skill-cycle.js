const TIER4_COOLDOWN = [0, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
const LEGACY_COOLDOWN = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
const DEFAULT_WINDOW_SECONDS = 60;
const DEFAULT_REALIZATION = 0.9;

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, number(value)));
}

function round3(value) {
  return Math.round(number(value) * 1000) / 1000;
}

export function normalizeSkillCycleName(value) {
  return String(value || '')
    .replace(/컴파인/g, '컴바인')
    .replace(/\s+/g, '')
    .replace(/[·:]/g, '')
    .trim();
}

function flattenedShares(value) {
  if (Array.isArray(value)) return Object.assign({}, ...value.filter(item => item && typeof item === 'object'));
  return value && typeof value === 'object' ? value : {};
}

function gemKind(gem) {
  const text = `${gem?.kind || ''} ${gem?.name || ''} ${gem?.effectText || ''}`;
  return /cooldown|작열|홍염|재사용|쿨타임/i.test(text) ? 'cooldown' : /damage|겁화|멸화|피해/i.test(text) ? 'damage' : '';
}

function gemSkillName(gem) {
  return String(gem?.skillName || gem?.skill || '').trim();
}

function gemCooldownPercent(gem) {
  const level = Math.trunc(clamp(gem?.level, 0, 10));
  const tier4 = typeof gem?.attackBonus === 'boolean'
    ? gem.attackBonus
    : /작열|겁화/.test(`${gem?.name || ''} ${gem?.effectText || ''}`);
  if (level > 0) return (tier4 ? TIER4_COOLDOWN : LEGACY_COOLDOWN)[level] || 0;
  const actual = `${gem?.effectText || ''}`.match(/재사용\s*대기시간\s*(\d+(?:\.\d+)?)\s*%\s*감소/i);
  return actual ? clamp(actual[1], 0, 95) : 0;
}

function cooldownGemFor(snapshot, skillName) {
  return Math.max(0, ...(snapshot?.gems?.items || [])
    .filter(gem => gem?.valid !== false && gemKind(gem) === 'cooldown')
    .filter(gem => normalizeSkillCycleName(gemSkillName(gem)) === normalizeSkillCycleName(skillName))
    .map(gemCooldownPercent));
}

function hasDamageGem(snapshot, skillName) {
  return (snapshot?.gems?.items || []).some(gem => gem?.valid !== false
    && gemKind(gem) === 'damage'
    && normalizeSkillCycleName(gemSkillName(gem)) === normalizeSkillCycleName(skillName));
}

function swiftCooldownReduction(snapshot) {
  const rawExact = snapshot?.profile?.swiftCooldownReduction;
  const exact = rawExact === null || rawExact === undefined || rawExact === '' ? NaN : Number(rawExact);
  if (Number.isFinite(exact)) return { value: clamp(exact, 0, 80), exact: true };
  const swift = number((snapshot?.profile?.stats || []).find(row => String(row?.type || '').trim() === '신속')?.value);
  return { value: clamp(swift * 0.0214739, 0, 80), exact: false };
}

function gridText(snapshot) {
  return [
    ...(snapshot?.effects?.arkGrid?.items || []).flatMap(item => item?.activeTexts || []),
    ...(snapshot?.arkGrid?.slots || []).flatMap(item => item?.activeTexts || [])
  ].filter(Boolean);
}

function cooldownDirection(direction) {
  return /증가|늘어/.test(String(direction || '')) ? -1 : 1;
}

export function parseArkGridCooldownRules(value) {
  const rows = Array.isArray(value) ? value : [value];
  const rules = [];
  for (const raw of rows) {
    const text = String(raw || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!/재사용\s*대기시간|쿨타임|쿨다운/i.test(text)) continue;
    const scopeMatch = text.match(/((?:모든|전체|[가-힣A-Za-z0-9·:]+(?:\s*(?:및|과|와)\s*[가-힣A-Za-z0-9·:]+)?)\s*스킬)의\s*재사용\s*대기시간/i);
    const scope = String(scopeMatch?.[1] || '모든 스킬').replace(/\s+/g, ' ').trim();
    const conditional = /적중\s*시|발동\s*시|사용\s*시|일정\s*확률|확률로|때마다|마다|동안/i.test(text);
    const percent = text.match(/재사용\s*대기시간(?:이|을|은|는)?[^%]{0,30}?(\d+(?:\.\d+)?)\s*%\s*(감소|증가|줄어|늘어)/i);
    const flat = text.match(/재사용\s*대기시간(?:이|을|은|는)?[^초%]{0,30}?(\d+(?:\.\d+)?)\s*초\s*(감소|증가|줄어|늘어)/i);
    if (!percent && !flat) continue;
    rules.push({
      scope,
      percentReduction: percent ? round3(number(percent[1]) * cooldownDirection(percent[2])) : 0,
      flatSeconds: flat ? round3(number(flat[1]) * cooldownDirection(flat[2])) : 0,
      conditional,
      appliedDirectly: !conditional,
      text
    });
  }
  return rules;
}

function scopeMatches(item, scope) {
  const target = normalizeSkillCycleName(scope).replace(/스킬$/, '');
  if (!target || /모든|전체/.test(target)) return true;
  const name = normalizeSkillCycleName(item?.name);
  const category = normalizeSkillCycleName(item?.category).replace(/스킬$/, '');
  return target === name || target === category || target.includes(name) || category.includes(target);
}

function gridAdjustment(item, rules) {
  const active = rules.filter(rule => rule.appliedDirectly && scopeMatches(item, rule.scope));
  return {
    percentReduction: round3(100 * (1 - active.reduce((factor, rule) => factor * (1 - number(rule.percentReduction) / 100), 1))),
    flatSeconds: round3(active.reduce((sum, rule) => sum + number(rule.flatSeconds), 0))
  };
}

function tripodBaseSeconds(item) {
  const base = Math.max(0, number(item?.baseCooldownSeconds));
  const setSeconds = number(item?.cooldown?.setSeconds, NaN);
  const changed = Number.isFinite(setSeconds) && setSeconds > 0 ? setSeconds : Math.max(0.1, base - number(item?.cooldown?.flatSeconds));
  return Math.max(0.1, changed * (1 - clamp(item?.cooldown?.percentReduction, -200, 95) / 100));
}

function opportunityCount(seconds, windowSeconds = DEFAULT_WINDOW_SECONDS, realization = DEFAULT_REALIZATION) {
  return 1 + Math.max(0, number(windowSeconds, DEFAULT_WINDOW_SECONDS)) * clamp(realization, 0, 1) / Math.max(0.1, number(seconds, 0.1));
}

function secondsWith(item, { gemReduction, passiveReduction = 0 } = {}) {
  const passive = clamp(passiveReduction, 0, 95);
  const afterMultipliers = tripodBaseSeconds(item)
    * (1 - clamp(item.swiftCooldownReduction, 0, 80) / 100)
    * (1 - clamp(gemReduction, 0, 95) / 100)
    * (1 - passive / 100)
    * (1 - clamp(item.gridPercentReduction, -200, 95) / 100);
  return Math.max(0.1, round3(afterMultipliers - number(item.gridFlatSeconds)));
}

function positiveShares(value) {
  return Object.fromEntries(Object.entries(flattenedShares(value)).filter(([, share]) => number(share) > 0));
}

function derivedShares(items, snapshot) {
  const damageGemItems = items.filter(item => hasDamageGem(snapshot, item.name));
  const highLevelItems = items.filter(item => number(item.level) >= 10);
  const targets = damageGemItems.length ? damageGemItems : highLevelItems.length ? highLevelItems : items;
  if (!targets.length) return {};
  return Object.fromEntries(targets.map(item => [item.name, 1 / targets.length]));
}

export function buildSkillCycleModel({ skillEffects, snapshot, shares, identitySkills = [], analyzerTag = '', analyzerMatch = '', windowSeconds = DEFAULT_WINDOW_SECONDS, realization = DEFAULT_REALIZATION } = {}) {
  const rawItems = Array.isArray(skillEffects?.cycleItems) && skillEffects.cycleItems.length
    ? skillEffects.cycleItems
    : (skillEffects?.items || []).filter(item => item?.currentTree !== false && number(item?.baseCooldownSeconds) > 0 && (item?.currentTree || number(item?.level) > 1));
  const swift = swiftCooldownReduction(snapshot);
  const gridRules = parseArkGridCooldownRules(gridText(snapshot));
  const conditionalGridRules = gridRules.filter(rule => rule.conditional);
  let skillShares = positiveShares(shares);
  let shareSource = Object.keys(skillShares).length ? 'combat-analyzer' : 'equipped-tree-estimate';
  if (!Object.keys(skillShares).length) skillShares = derivedShares(rawItems, snapshot);
  const totalShare = Object.values(skillShares).reduce((sum, value) => sum + number(value), 0);
  const identitySet = new Set(identitySkills.map(normalizeSkillCycleName));

  const items = rawItems.map(item => {
    const shareEntry = Object.entries(skillShares).find(([name]) => normalizeSkillCycleName(name) === normalizeSkillCycleName(item.name));
    const grid = gridAdjustment(item, gridRules);
    const row = {
      ...item,
      share: number(shareEntry?.[1]),
      normalizedShare: totalShare > 0 ? number(shareEntry?.[1]) / totalShare : 0,
      swiftCooldownReduction: swift.value,
      gemCooldownReduction: cooldownGemFor(snapshot, item.name),
      gridPercentReduction: grid.percentReduction,
      gridFlatSeconds: grid.flatSeconds
    };
    row.tripodCooldownSeconds = round3(tripodBaseSeconds(row));
    row.noGemSeconds = secondsWith(row, { gemReduction: 0 });
    row.noPassiveSeconds = secondsWith(row, { gemReduction: row.gemCooldownReduction });
    row.effectiveCooldownSeconds = row.noPassiveSeconds;
    return row;
  });

  const mappedShare = items.reduce((sum, item) => sum + item.normalizedShare, 0);
  const identityShare = totalShare > 0
    ? Object.entries(skillShares).reduce((sum, [name, share]) => sum + (identitySet.has(normalizeSkillCycleName(name)) ? number(share) / totalShare : 0), 0)
    : 0;
  const weightedCooldownSeconds = mappedShare > 0
    ? items.reduce((sum, item) => sum + item.effectiveCooldownSeconds * item.normalizedShare, 0) / mappedShare
    : 0;
  const weightedGemCooldown = mappedShare > 0
    ? items.reduce((sum, item) => sum + item.gemCooldownReduction * item.normalizedShare, 0) / mappedShare
    : 0;
  const gemCooldownMultiplier = items.reduce((factor, item) => {
    if (!(item.normalizedShare > 0)) return factor;
    const ratio = opportunityCount(item.effectiveCooldownSeconds, windowSeconds, realization)
      / opportunityCount(item.noGemSeconds, windowSeconds, realization);
    return factor + item.normalizedShare * (ratio - 1);
  }, 1);

  return {
    items,
    shareSource,
    analyzerTag,
    analyzerMatch,
    totalShare,
    mappedShare,
    mappedSharePercent: round3(mappedShare * 100),
    identitySharePercent: round3(identityShare * 100),
    mappedSkillCount: items.filter(item => item.share > 0).length,
    usedSkillCount: items.length,
    swiftCooldownReduction: swift.value,
    swiftExact: swift.exact,
    weightedCooldownSeconds: round3(weightedCooldownSeconds),
    weightedGemCooldown: round3(weightedGemCooldown),
    gemCooldownMultiplier,
    gridRules,
    conditionalGridRules,
    stochasticRuneCount: items.filter(item => item?.rune?.stochastic && number(item?.rune?.cooldownPercent) > 0).length,
    windowSeconds,
    realization
  };
}

export function skillCooldownSeconds(item, passiveReduction = 0, { withoutGem = false } = {}) {
  if (!item) return 0;
  return secondsWith(item, {
    gemReduction: withoutGem ? 0 : item.gemCooldownReduction,
    passiveReduction
  });
}

export function evaluateEvolutionCooldown(model, passiveReduction, { fallbackSharePercent = 60 } = {}) {
  const reduction = clamp(passiveReduction, 0, 95);
  if (!reduction) return { multiplier: 1, affectedSharePercent: model?.mappedSharePercent || 0, modeled: Boolean(model?.items?.length) };
  if (!model?.items?.length || !(model?.mappedShare > 0)) {
    const share = clamp(fallbackSharePercent, 0, 100) / 100;
    return {
      multiplier: 1 + (1 / (1 - reduction / 100) - 1) * share,
      affectedSharePercent: share * 100,
      modeled: false
    };
  }
  const multiplier = model.items.reduce((factor, item) => {
    if (!(item.normalizedShare > 0)) return factor;
    const currentSeconds = secondsWith(item, { gemReduction: item.gemCooldownReduction, passiveReduction: reduction });
    const ratio = opportunityCount(currentSeconds, model.windowSeconds, model.realization)
      / opportunityCount(item.noPassiveSeconds, model.windowSeconds, model.realization);
    return factor + item.normalizedShare * (ratio - 1);
  }, 1);
  return {
    multiplier,
    affectedSharePercent: model.mappedSharePercent,
    modeled: true
  };
}

export function findSkillCycleItem(model, names) {
  const targets = (Array.isArray(names) ? names : [names]).map(normalizeSkillCycleName);
  return (model?.items || []).find(item => targets.includes(normalizeSkillCycleName(item?.name))) || null;
}
