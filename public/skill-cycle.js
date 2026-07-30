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

function knownTargetBefore(text, cooldownIndex, knownTargets = []) {
  const start = Math.max(0, cooldownIndex - 180);
  const prefix = text.slice(start, cooldownIndex);
  const normalizedPrefix = normalizeSkillCycleName(prefix);
  let selected = '';
  let selectedIndex = -1;
  for (const raw of knownTargets || []) {
    const name = String(raw || '').trim();
    if (!name) continue;
    const index = normalizedPrefix.lastIndexOf(normalizeSkillCycleName(name));
    if (index < 0) continue;
    if (index > selectedIndex || (index === selectedIndex && name.length > selected.length)) {
      selected = name;
      selectedIndex = index;
    }
  }
  return selected;
}

function rawTargetBefore(text, cooldownIndex) {
  const prefix = text.slice(Math.max(0, cooldownIndex - 100), cooldownIndex).trim();
  const possessive = prefix.match(/([가-힣A-Za-z0-9·:]+(?:\s+[가-힣A-Za-z0-9·:]+){0,5})의\s*$/);
  if (possessive) return possessive[1].trim();
  const plain = prefix.match(/([가-힣A-Za-z0-9·:]+(?:\s+[가-힣A-Za-z0-9·:]+){0,5})\s*$/);
  return String(plain?.[1] || '').replace(/(?:시|마다|동안)\s*$/, '').trim();
}

function isSentenceBoundary(text, index) {
  const char = text[index];
  if (char === '!' || char === '?') return true;
  if (char !== '.') return false;
  return !(/\d/.test(text[index - 1] || '') && /\d/.test(text[index + 1] || ''));
}

function sentenceBounds(text, index) {
  let start = 0;
  let end = text.length;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (isSentenceBoundary(text, i)) { start = i + 1; break; }
  }
  for (let i = index; i < text.length; i += 1) {
    if (isSentenceBoundary(text, i)) { end = i; break; }
  }
  return { start, end };
}

export function parseArkGridCooldownRules(value, { knownTargets = [] } = {}) {
  const rows = Array.isArray(value) ? value : [value];
  const rules = [];
  for (const raw of rows) {
    const text = String(raw || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!/재사용\s*대기시간|쿨타임|쿨다운/i.test(text)) continue;
    const pattern = /재사용\s*대기시간|쿨타임|쿨다운/gi;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const cooldownIndex = match.index;
      const bounds = sentenceBounds(text, cooldownIndex);
      const clause = text.slice(bounds.start, bounds.end).trim();
      const scopeMatch = clause.match(/((?:모든|전체|[가-힣A-Za-z0-9·:]+(?:\s*(?:및|과|와)\s*[가-힣A-Za-z0-9·:]+)?)\s*스킬)의\s*재사용\s*대기시간/i);
      const namedTarget = knownTargetBefore(text, cooldownIndex, knownTargets);
      const scope = String(namedTarget || scopeMatch?.[1] || rawTargetBefore(text, cooldownIndex) || '알 수 없는 대상').replace(/\s+/g, ' ').trim();
      const conditional = /적중\s*시|발동\s*시|사용\s*시|일정\s*확률|확률로|때마다|마다|동안|상태에서|효과를\s*보유/i.test(clause);
      const effect = cooldownEffectAfter(text, cooldownIndex);
      if (!effect.percentReduction && !effect.flatSeconds && !effect.reset) continue;
      rules.push({
        scope,
        percentReduction: effect.percentReduction,
        flatSeconds: effect.flatSeconds,
        reset: effect.reset,
        conditional,
        appliedDirectly: !conditional,
        text: clause
      });
    }
  }
  return rules;
}

function uniqueNames(values) {
  return [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))];
}

function lastTriggerIndex(text, endIndex) {
  const prefix = text.slice(0, endIndex);
  const pattern = /(?:사용|적중|발동)\s*시(?:마다)?/g;
  let match;
  let index = -1;
  while ((match = pattern.exec(prefix)) !== null) index = match.index;
  return index;
}

function namesNearTrigger(text, triggerIndex, knownNames) {
  if (triggerIndex < 0) return [];
  const prefix = text.slice(Math.max(0, triggerIndex - 100), triggerIndex);
  const normalizedPrefix = normalizeSkillCycleName(prefix);
  return uniqueNames(knownNames.filter(name => normalizedPrefix.includes(normalizeSkillCycleName(name))));
}

function selectorAroundTrigger(text, triggerIndex) {
  if (triggerIndex < 0) return '';
  const prefix = text.slice(Math.max(0, triggerIndex - 180), triggerIndex);
  const boundary = Math.max(prefix.lastIndexOf('.'), prefix.lastIndexOf(':'));
  return prefix.slice(boundary + 1).trim();
}

function cooldownEffectAfter(text, cooldownIndex) {
  const rawTail = text.slice(cooldownIndex, cooldownIndex + 120);
  const tail = rawTail.split(/[!?]|\.(?=\s|$)/)[0];
  const reset = /(?:초기화|100\s*%\s*감소)/i.test(tail);
  const firstEffect = tail.match(/(\d+(?:\.\d+)?)\s*(%|초)\s*(감소|증가|줄어|늘어)/i);
  return {
    reset,
    percentReduction: firstEffect?.[2] === '%' ? round3(number(firstEffect[1]) * cooldownDirection(firstEffect[3])) : 0,
    flatSeconds: firstEffect?.[2] === '초' ? round3(number(firstEffect[1]) * cooldownDirection(firstEffect[3])) : 0
  };
}

function fateTriggerSources(texts, knownNames) {
  const sources = [];
  for (const text of texts) {
    const fateIndex = text.search(/["'‘’]?운명["'‘’]?\s*(?:이|가)?\s*발동/i);
    if (fateIndex < 0) continue;
    const useIndex = text.slice(0, fateIndex).search(/사용\s*시/i);
    if (useIndex < 0) continue;
    sources.push(...namesNearTrigger(text, useIndex, knownNames));
  }
  return uniqueNames(sources);
}

export function parseArkGridCycleLinks(value, { items = [], shareNames = [] } = {}) {
  const texts = (Array.isArray(value) ? value : [value])
    .map(raw => String(raw || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const itemNames = items.map(item => String(item?.name || '').trim()).filter(Boolean);
  const categoryNames = items.map(item => String(item?.category || '').trim()).filter(Boolean);
  const knownNames = uniqueNames([...itemNames, ...shareNames]).sort((a, b) => b.length - a.length);
  const knownTargets = uniqueNames([...knownNames, ...categoryNames]).sort((a, b) => b.length - a.length);
  const fateSources = fateTriggerSources(texts, knownNames);
  const links = [];

  for (const text of texts) {
    const cooldownPattern = /재사용\s*대기시간|쿨타임|쿨다운/gi;
    let cooldownMatch;
    while ((cooldownMatch = cooldownPattern.exec(text)) !== null) {
      const cooldownIndex = cooldownMatch.index;
      const bounds = sentenceBounds(text, cooldownIndex);
      const clause = text.slice(bounds.start, bounds.end).trim();
      const target = knownTargetBefore(text, cooldownIndex, knownTargets) || rawTargetBefore(text, cooldownIndex);
      if (!target) continue;
      const effect = cooldownEffectAfter(text, cooldownIndex);
      if (!effect.reset && !(effect.percentReduction > 0) && !(effect.flatSeconds > 0)) continue;

      const stackContextStart = Math.max(0, cooldownIndex - 500);
      const stackContext = text.slice(stackContextStart, cooldownIndex);
      const stackTriggers = [...stackContext.matchAll(/사용\s*시마다/gi)];
      const stackMatches = [...stackContext.matchAll(/(\d+)\s*중첩\s*시/gi)];
      const latestStackTrigger = stackTriggers.at(-1);
      const latestStackMatch = stackMatches.at(-1);
      const stackTriggerIndex = latestStackTrigger ? stackContextStart + latestStackTrigger.index : -1;
      const stackMatch = latestStackTrigger && latestStackMatch && latestStackMatch.index > latestStackTrigger.index ? latestStackMatch : null;
      const localTriggerIndex = lastTriggerIndex(clause, cooldownIndex - bounds.start);
      const triggerIndex = localTriggerIndex >= 0 ? bounds.start + localTriggerIndex : -1;
      let sourceNames = namesNearTrigger(text, triggerIndex, knownNames).filter(name => normalizeSkillCycleName(name) !== normalizeSkillCycleName(target));
      let sourceSelector = selectorAroundTrigger(text, triggerIndex);
      let stackThreshold = 0;

      if (stackTriggerIndex >= 0 && stackMatch && stackTriggerIndex < cooldownIndex) {
        stackThreshold = Math.max(1, Math.trunc(number(stackMatch[1], 1)));
        sourceSelector = selectorAroundTrigger(text, stackTriggerIndex);
        sourceNames = namesNearTrigger(text, stackTriggerIndex, knownNames)
          .filter(name => !/제외한[^.]{0,120}$/i.test(text.slice(Math.max(0, stackTriggerIndex - 180), stackTriggerIndex)))
          .filter(name => normalizeSkillCycleName(name) !== normalizeSkillCycleName(target));
      } else if (/운명["'‘’]?\s*(?:이|가)?\s*발동\s*시/i.test(text.slice(Math.max(0, triggerIndex - 30), triggerIndex + 20))) {
        sourceNames = fateSources;
        sourceSelector = '운명 발동';
      }

      const conditional = stackThreshold > 0 || triggerIndex >= 0 || /일정\s*확률|확률로|동안|상태에서|효과를\s*보유/i.test(clause);
      if (!conditional) continue;
      const chanceContext = clause;
      const chanceMatch = chanceContext.match(/(\d+(?:\.\d+)?)\s*%\s*확률로/i);
      links.push({
        target,
        sourceNames: uniqueNames(sourceNames),
        sourceSelector,
        stackThreshold,
        reset: effect.reset,
        percentReduction: effect.percentReduction,
        flatSeconds: effect.flatSeconds,
        procChance: chanceMatch ? clamp(number(chanceMatch[1]) / 100, 0, 1) : 1,
        stochastic: /일정\s*확률/i.test(chanceContext) && !chanceMatch,
        text
      });
    }
  }
  return links;
}

function scopeMatches(item, scope) {
  const normalizedScope = normalizeSkillCycleName(scope);
  const groupScope = normalizedScope.endsWith('스킬');
  const target = normalizedScope.replace(/스킬$/, '');
  if (!target || /모든|전체/.test(target)) return true;
  const name = normalizeSkillCycleName(item?.name);
  const category = normalizeSkillCycleName(item?.category).replace(/스킬$/, '');
  return target === name
    || target.includes(name)
    || (groupScope && name.includes(target))
    || Boolean(category && (target === category || target.includes(category) || category.includes(target)));
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
  const passive = item?.cooldownEligible === false ? 0 : clamp(passiveReduction, 0, 95);
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

function shareGroupMatchesItem(item, shareName) {
  const normalizedShare = normalizeSkillCycleName(shareName);
  if (!normalizedShare.endsWith('스킬')) return false;
  const group = normalizedShare.replace(/스킬$/, '');
  const itemName = normalizeSkillCycleName(item?.name);
  const category = normalizeSkillCycleName(item?.category).replace(/스킬$/, '');
  if (!group) return false;
  return Boolean(
    (category && (category === group || category.includes(group) || group.includes(category)))
    || itemName.startsWith(group)
  );
}

function allocateAnalyzerShares(items, skillShares) {
  const allocations = new Map();
  const allocatedShareNames = new Set();
  const shareTargets = new Map();
  for (const [shareName, rawShare] of Object.entries(skillShares || {})) {
    const share = number(rawShare);
    if (!(share > 0)) continue;
    const normalizedShare = normalizeSkillCycleName(shareName);
    let targets = items.filter(item => normalizeSkillCycleName(item?.name) === normalizedShare);
    if (!targets.length) targets = items.filter(item => shareGroupMatchesItem(item, shareName));
    if (!targets.length) continue;
    allocatedShareNames.add(normalizedShare);
    shareTargets.set(normalizedShare, targets.map(item => normalizeSkillCycleName(item?.name)));
    const portion = share / targets.length;
    for (const item of targets) {
      const key = normalizeSkillCycleName(item?.name);
      allocations.set(key, number(allocations.get(key)) + portion);
    }
  }
  return { allocations, allocatedShareNames, shareTargets };
}

function isIdentityDrivenShare(name, { specialSkillSet, catalogNameSet, secondClass }) {
  const normalized = normalizeSkillCycleName(name);
  if (specialSkillSet.has(normalized)) return false;
  return normalized === secondClass
    || /기본공격$|스킬$/.test(normalized)
    || !catalogNameSet.has(normalized);
}

export function buildSkillCycleModel({ skillEffects, snapshot, shares, identitySkills = [], analyzerTag = '', analyzerMatch = '', windowSeconds = DEFAULT_WINDOW_SECONDS, realization = DEFAULT_REALIZATION } = {}) {
  const rawItems = Array.isArray(skillEffects?.cycleItems) && skillEffects.cycleItems.length
    ? skillEffects.cycleItems
    : (skillEffects?.items || []).filter(item => item?.currentTree !== false && number(item?.baseCooldownSeconds) > 0 && (item?.currentTree || number(item?.level) > 1));
  const swift = swiftCooldownReduction(snapshot);
  const activeGridTexts = gridText(snapshot);
  const shareNames = Object.keys(positiveShares(shares));
  const knownTargets = uniqueNames([
    ...(skillEffects?.items || []).map(item => item?.name),
    ...(skillEffects?.items || []).map(item => item?.category),
    ...shareNames
  ]);
  const gridRules = parseArkGridCooldownRules(activeGridTexts, { knownTargets });
  const conditionalGridRules = gridRules.filter(rule => rule.conditional);
  let skillShares = positiveShares(shares);
  let shareSource = Object.keys(skillShares).length ? 'combat-analyzer' : 'equipped-tree-estimate';
  if (!Object.keys(skillShares).length) skillShares = derivedShares(rawItems, snapshot);
  const totalShare = Object.values(skillShares).reduce((sum, value) => sum + number(value), 0);
  const specialSkillSet = new Set(identitySkills.map(normalizeSkillCycleName).filter(Boolean));
  const catalogNameSet = new Set((skillEffects?.items || []).map(item => normalizeSkillCycleName(item?.name)).filter(Boolean));
  const secondClass = normalizeSkillCycleName(snapshot?.profile?.secondClass);
  const shareAllocation = allocateAnalyzerShares(rawItems, skillShares);
  const identityDriverShareNames = Object.keys(skillShares)
    .filter(name => !shareAllocation.allocatedShareNames.has(normalizeSkillCycleName(name)))
    .filter(name => isIdentityDrivenShare(name, { specialSkillSet, catalogNameSet, secondClass }));
  const identityDriverSet = new Set(identityDriverShareNames.map(normalizeSkillCycleName));
  const unmodeledShareNames = Object.keys(skillShares)
    .filter(name => !shareAllocation.allocatedShareNames.has(normalizeSkillCycleName(name)))
    .filter(name => !identityDriverSet.has(normalizeSkillCycleName(name)));
  const gridCycleLinks = parseArkGridCycleLinks(activeGridTexts, {
    items: skillEffects?.items || [],
    shareNames: Object.keys(skillShares)
  });

  const items = rawItems.map(item => {
    const grid = gridAdjustment(item, gridRules);
    const row = {
      ...item,
      share: number(shareAllocation.allocations.get(normalizeSkillCycleName(item.name))),
      normalizedShare: totalShare > 0 ? number(shareAllocation.allocations.get(normalizeSkillCycleName(item.name))) / totalShare : 0,
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
    ? Object.entries(skillShares).reduce((sum, [name, share]) => sum + (specialSkillSet.has(normalizeSkillCycleName(name)) ? number(share) / totalShare : 0), 0)
    : 0;
  const weightedCooldownSeconds = mappedShare > 0
    ? items.reduce((sum, item) => sum + item.effectiveCooldownSeconds * item.normalizedShare, 0) / mappedShare
    : 0;
  const weightedGemCooldown = mappedShare > 0
    ? items.reduce((sum, item) => sum + item.gemCooldownReduction * item.normalizedShare, 0) / mappedShare
    : 0;
  const model = {
    items,
    shareSource,
    analyzerTag,
    analyzerMatch,
    totalShare,
    mappedShare,
    mappedSharePercent: round3(mappedShare * 100),
    modeledSharePercent: round3(Math.min(100, mappedShare * 100 + (totalShare > 0 ? identityDriverShareNames.reduce((sum, name) => sum + number(skillShares[name]) / totalShare, 0) * 100 : 0))),
    identitySharePercent: round3(identityShare * 100),
    mappedSkillCount: items.filter(item => item.share > 0).length,
    usedSkillCount: items.length,
    swiftCooldownReduction: swift.value,
    swiftExact: swift.exact,
    weightedCooldownSeconds: round3(weightedCooldownSeconds),
    weightedGemCooldown: round3(weightedGemCooldown),
    gemCooldownMultiplier: 1,
    gemCooldownAffectedSharePercent: 0,
    gridRules,
    conditionalGridRules,
    gridCycleLinks,
    identityDriverShareNames,
    identityDriverSharePercent: round3(totalShare > 0 ? identityDriverShareNames.reduce((sum, name) => sum + number(skillShares[name]) / totalShare, 0) * 100 : 0),
    unmodeledShareNames,
    unmodeledSharePercent: round3(totalShare > 0 ? unmodeledShareNames.reduce((sum, name) => sum + number(skillShares[name]) / totalShare, 0) * 100 : 0),
    skillShares,
    shareRows: Object.entries(skillShares).map(([name, share]) => ({
      name,
      share: number(share),
      normalizedShare: totalShare > 0 ? number(share) / totalShare : 0,
      targetNames: shareAllocation.shareTargets.get(normalizeSkillCycleName(name)) || []
    })),
    stochasticRuneCount: items.filter(item => item?.rune?.stochastic && number(item?.rune?.cooldownPercent) > 0).length,
    windowSeconds,
    realization
  };
  const deterministicLinks = model.gridCycleLinks.filter(link => !link?.stochastic);
  model.appliedCycleLinks = deterministicLinks.filter(link => linkSourceItems(model, link).length && linkHasModeledTarget(model, link));
  model.unresolvedCycleLinks = deterministicLinks.filter(link => !model.appliedCycleLinks.includes(link));
  model.appliedCycleLinkCount = model.appliedCycleLinks.length;
  model.unresolvedCycleLinkCount = model.unresolvedCycleLinks.length;
  model.stochasticCycleLinkCount = model.gridCycleLinks.filter(link => link?.stochastic).length;
  const gemCooldown = evaluateGemCooldown(model);
  model.gemCooldownMultiplier = gemCooldown.multiplier;
  model.gemCooldownAffectedSharePercent = gemCooldown.affectedSharePercent;
  return model;
}

export function skillCooldownSeconds(item, passiveReduction = 0, { withoutGem = false } = {}) {
  if (!item) return 0;
  return secondsWith(item, {
    gemReduction: withoutGem ? 0 : item.gemCooldownReduction,
    passiveReduction
  });
}

function itemMatchesSelector(item, selector) {
  const text = String(selector || '').replace(/\s+/g, ' ').trim();
  if (!text || /운명\s*발동/.test(text)) return false;
  const name = String(item?.name || '').trim();
  const category = String(item?.category || '').replace(/\s*스킬\s*$/, '').trim();
  const excludedPart = text.includes('제외한') ? text.split('제외한')[0] : '';
  const includedPart = text.includes('제외한') ? text.split('제외한').slice(1).join('제외한') : text;
  if (excludedPart && (excludedPart.includes(name) || (category && excludedPart.includes(category)))) return false;
  if (/모든\s*(?:일반\s*)?스킬|전체\s*스킬/.test(includedPart)) return item?.cooldownEligible !== false;
  if (/일반\s*스킬/.test(includedPart) && item?.cooldownEligible !== false) return true;
  return Boolean((name && includedPart.includes(name)) || (category && includedPart.includes(category)));
}

function linkSourceItems(model, link) {
  const explicit = new Set((link?.sourceNames || []).map(normalizeSkillCycleName));
  const rows = (model?.items || []).filter(item => {
    if (explicit.size && explicit.has(normalizeSkillCycleName(item?.name))) return true;
    return itemMatchesSelector(item, link?.sourceSelector);
  });
  return rows.filter(item => normalizeSkillCycleName(item?.name) !== normalizeSkillCycleName(link?.target));
}

function linkTargetItems(model, link) {
  return (model?.items || []).filter(item => scopeMatches(item, link?.target));
}

function linkHasModeledTarget(model, link) {
  if (linkTargetItems(model, link).length) return true;
  const target = normalizeSkillCycleName(link?.target);
  if (!target) return false;
  return (model?.shareRows || []).some(row => {
    const shareName = normalizeSkillCycleName(row?.name);
    return shareName === target || shareName.includes(target) || target.includes(shareName);
  });
}

function directOpportunityMap(model, passiveReduction, { withoutGems = false } = {}) {
  return new Map((model?.items || []).map(item => {
    const seconds = secondsWith(item, { gemReduction: withoutGems ? 0 : item.gemCooldownReduction, passiveReduction });
    return [normalizeSkillCycleName(item?.name), {
      item,
      seconds,
      count: opportunityCount(seconds, model?.windowSeconds, model?.realization)
    }];
  }));
}

function linkContribution(link, sourceCount, targetSeconds) {
  if (!(sourceCount > 0) || !(targetSeconds > 0)) return 0;
  const threshold = Math.max(1, number(link?.stackThreshold, 1));
  const triggerCount = sourceCount / threshold * clamp(link?.procChance ?? 1, 0, 1);
  if (link?.reset) return triggerCount;
  if (number(link?.flatSeconds) > 0) return triggerCount * Math.min(1, number(link.flatSeconds) / targetSeconds);
  if (number(link?.percentReduction) > 0) return triggerCount * Math.min(1, number(link.percentReduction) / 100);
  return 0;
}

function conditionalOpportunityMap(model, passiveReduction, options = {}) {
  const direct = directOpportunityMap(model, passiveReduction, options);
  let counts = new Map([...direct.entries()].map(([key, row]) => [key, row.count]));
  const virtualRatios = new Map();
  const activeLinks = (model?.gridCycleLinks || [])
    .filter(link => !link?.stochastic)
    .map(link => ({ link, sources: linkSourceItems(model, link) }))
    .filter(row => row.sources.length);

  for (let iteration = 0; iteration < 8; iteration += 1) {
    const extras = new Map();
    for (const { link, sources } of activeLinks) {
      const sourceCount = sources.reduce((sum, item) => sum + number(counts.get(normalizeSkillCycleName(item?.name))), 0);
      for (const targetItem of linkTargetItems(model, link)) {
        const targetKey = normalizeSkillCycleName(targetItem?.name);
        const targetRow = direct.get(targetKey);
        if (targetRow) extras.set(targetKey, number(extras.get(targetKey)) + linkContribution(link, sourceCount, targetRow.seconds));
      }
    }
    let largestChange = 0;
    const next = new Map(counts);
    for (const [key, row] of direct) {
      const cap = row.count * 8 + Math.max(1, number(model?.windowSeconds, DEFAULT_WINDOW_SECONDS));
      const calculated = Math.min(cap, row.count + number(extras.get(key)));
      const damped = iteration ? number(counts.get(key)) * 0.35 + calculated * 0.65 : calculated;
      largestChange = Math.max(largestChange, Math.abs(damped - number(counts.get(key))));
      next.set(key, damped);
    }
    counts = next;
    if (largestChange < 0.00001) break;
  }

  for (const [key, row] of direct) row.count = number(counts.get(key), row.count);
  const linkedVirtualKeys = new Set();
  for (const { link, sources } of activeLinks) {
    if (linkTargetItems(model, link).length) continue;
    const targetKey = normalizeSkillCycleName(link?.target);
    const sourceCount = sources.reduce((sum, item) => sum + number(counts.get(normalizeSkillCycleName(item?.name))), 0);
    if (sourceCount > 0) {
      linkedVirtualKeys.add(targetKey);
      virtualRatios.set(targetKey, number(virtualRatios.get(targetKey)) + sourceCount);
    }
  }
  const driverCount = [...direct.values()]
    .filter(row => row.item?.cooldownEligible !== false)
    .reduce((sum, row) => sum + number(row.count), 0);
  for (const shareName of model?.identityDriverShareNames || []) {
    const key = normalizeSkillCycleName(shareName);
    if (!linkedVirtualKeys.has(key) && driverCount > 0) virtualRatios.set(key, driverCount);
  }
  return { direct, virtualRatios };
}

function compareOpportunityMaps(model, before, after) {
  let affectedShare = 0;
  const multiplier = (model?.shareRows || []).reduce((factor, shareRow) => {
    const key = normalizeSkillCycleName(shareRow?.name);
    const targetNames = Array.isArray(shareRow?.targetNames) ? shareRow.targetNames : [];
    const beforeCount = targetNames.reduce((sum, target) => sum + number(before.direct.get(target)?.count), 0);
    const afterCount = targetNames.reduce((sum, target) => sum + number(after.direct.get(target)?.count), 0);
    const beforeRow = targetNames.length ? { count: beforeCount } : before.direct.get(key);
    const afterRow = targetNames.length ? { count: afterCount } : after.direct.get(key);
    let ratio = 1;
    if (beforeRow?.count > 0 && afterRow?.count > 0) ratio = afterRow.count / beforeRow.count;
    else {
      const beforeVirtual = number(before.virtualRatios.get(key));
      const afterVirtual = number(after.virtualRatios.get(key));
      if (beforeVirtual > 0 && afterVirtual > 0) ratio = afterVirtual / beforeVirtual;
    }
    if (Math.abs(ratio - 1) > 0.000001) affectedShare += number(shareRow.normalizedShare);
    return factor + number(shareRow.normalizedShare) * (ratio - 1);
  }, 1);
  return { multiplier, affectedSharePercent: round3(affectedShare * 100) };
}

function evaluateGemCooldown(model) {
  if (!model?.items?.some(item => number(item?.gemCooldownReduction) > 0)) {
    return { multiplier: 1, affectedSharePercent: 0 };
  }
  return compareOpportunityMaps(
    model,
    conditionalOpportunityMap(model, 0, { withoutGems: true }),
    conditionalOpportunityMap(model, 0)
  );
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
  const before = conditionalOpportunityMap(model, 0);
  const after = conditionalOpportunityMap(model, reduction);
  const comparison = compareOpportunityMaps(model, before, after);
  return {
    multiplier: comparison.multiplier,
    affectedSharePercent: comparison.affectedSharePercent,
    modeled: true,
    cycleLinkCount: number(model.appliedCycleLinkCount)
  };
}

export function findSkillCycleItem(model, names) {
  const targets = (Array.isArray(names) ? names : [names]).map(normalizeSkillCycleName);
  return (model?.items || []).find(item => targets.includes(normalizeSkillCycleName(item?.name))) || null;
}
