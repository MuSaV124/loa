import { buildSkillCycleModel, normalizeSkillCycleName } from './skill-cycle.js';

const DEFAULT_GEM_TABLES = {
  legacyDamage: [3, 6, 9, 12, 15, 18, 21, 24, 30, 40],
  tier4Damage: [8, 12, 16, 20, 24, 28, 32, 36, 40, 44],
  legacyCooldown: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
  tier4Cooldown: [6, 8, 10, 12, 14, 16, 18, 20, 22, 24]
};

const SECOND_CLASS_ALIASES = new Map([
  ['강화무기', ['전술탄환']],
  ['전술탄환', ['강화무기']],
  ['무상신공', ['세맥타통']],
  ['세맥타통', ['무상신공']],
  ['시간관리자', ['시간의지배자']],
  ['시간의지배자', ['시간관리자']],
  ['공간검사', ['공간의지배자']],
  ['공간의지배자', ['공간검사']],
  ['해방자', ['빛의수호자']],
  ['빛의수호자', ['해방자']]
]);

export function normalizeCombatAnalyzerText(value) {
  return String(value || '').replace(/컴파인/g, '컴바인').replace(/\s+/g, '').replace(/[·:]/g, '').trim();
}

function profileGemKind(gem) {
  const kind = normalizeCombatAnalyzerText(gem?.kind || gem?.type).toLowerCase();
  if (kind === 'cooldown' || kind.includes('작열') || kind.includes('홍염')) return 'cooldown';
  if (kind === 'damage' || kind.includes('겁화') || kind.includes('멸화')) return 'damage';
  const text = `${gem?.name || ''} ${gem?.effectText || ''}`;
  return /작열|홍염/u.test(text) ? 'cooldown' : /겁화|멸화/u.test(text) ? 'damage' : kind;
}

function gemSkillName(gem) {
  return String(gem?.skillName || gem?.skill || '').trim();
}

function isTier4Gem(gem) {
  if (typeof gem?.attackBonus === 'boolean') return gem.attackBonus;
  return /겁화|작열/u.test(`${gem?.name || ''} ${gem?.effectText || ''}`);
}

function secondClassCandidates(value) {
  const normalized = normalizeCombatAnalyzerText(value);
  return [normalized, ...(SECOND_CLASS_ALIASES.get(normalized) || [])];
}

function hasQuickPreparationTripod(skillEffects) {
  return (skillEffects?.items || []).some(skill =>
    normalizeCombatAnalyzerText(skill?.name) === '종말의전조'
    && (skill?.selectedTripods || skill?.tripods || []).some(tripod => normalizeCombatAnalyzerText(tripod?.name) === '빠른준비')
  );
}

function profileConditionsMatch(profile, cores, gems, skillEffects) {
  const coreConditions = Array.isArray(profile?.cores) ? profile.cores : [];
  const gemConditions = Array.isArray(profile?.gems) ? profile.gems : [];
  if (!coreConditions.length && !gemConditions.length) return false;
  const coresMatch = !coreConditions.length || coreConditions.every(condition => {
    const [name, minimumPoint] = Object.entries(condition || {})[0] || [];
    return name && cores.some(core =>
      normalizeCombatAnalyzerText(core?.name).includes(normalizeCombatAnalyzerText(name))
      && Number(core?.point || 0) >= Number(minimumPoint || 0)
    );
  });
  const gemsMatch = !gemConditions.length || gemConditions.every(condition => {
    const [skillName, kind] = Object.entries(condition || {})[0] || [];
    return skillName && gems.some(gem =>
      normalizeCombatAnalyzerText(gemSkillName(gem)) === normalizeCombatAnalyzerText(skillName)
      && profileGemKind(gem) === kind
    );
  });
  if (!coresMatch || !gemsMatch) return false;
  if (profile.tag === '333 전탄') return hasQuickPreparationTripod(skillEffects);
  if (profile.tag === '333 전탄B') return !hasQuickPreparationTripod(skillEffects);
  return true;
}

function fallbackValue(data, secondClass) {
  const entries = Object.entries(data?.fallbackBuilds || {});
  for (const candidate of secondClassCandidates(secondClass)) {
    const found = entries.find(([name]) => normalizeCombatAnalyzerText(name) === candidate);
    if (found) return { tag: found[0], value: found[1] };
  }
  return null;
}

function evenlyDistributedDamageGems(gems) {
  const skills = gems
    .filter(gem => profileGemKind(gem) === 'damage' && gem?.valid !== false && gemSkillName(gem) && gemSkillName(gem) !== '없음')
    .map(gemSkillName);
  if (!skills.length) return {};
  const share = Math.floor((1 / skills.length) * 100) / 100;
  return skills.reduce((result, skill) => {
    result[skill] = Number(result[skill] || 0) + share;
    return result;
  }, {});
}

export function findCombatAnalyzerProfile(data, snapshot, skillEffects, { support = false } = {}) {
  const cores = Array.isArray(snapshot?.arkGrid?.slots) ? snapshot.arkGrid.slots : [];
  const gems = Array.isArray(snapshot?.gems?.items) ? snapshot.gems.items : [];
  const exact = (data?.presets || []).find(profile => profileConditionsMatch(profile, cores, gems, skillEffects));
  if (exact) return { ...exact, fallback: false, match: 'ark-grid' };
  const fallback = fallbackValue(data, snapshot?.profile?.secondClass);
  if (fallback) return { tag: fallback.tag, cores: [], gems: [], value: fallback.value, fallback: true, match: 'second-class' };
  return {
    tag: support ? '서포트' : '장착 보석 균등 추정',
    cores: [],
    gems: [],
    value: support ? {} : evenlyDistributedDamageGems(gems),
    fallback: !support,
    match: support ? 'support' : 'gem-fallback'
  };
}

export function combatAnalyzerSkillShares(value) {
  if (Array.isArray(value)) return Object.assign({}, ...value.filter(item => item && typeof item === 'object'));
  return value && typeof value === 'object' ? value : {};
}

function gemBonus(gem, tables, kind) {
  const rawLevel = Number(gem?.level || 0);
  if (!Number.isFinite(rawLevel) || rawLevel <= 0) return 0;
  const level = Math.max(1, Math.min(10, rawLevel));
  const tier4 = isTier4Gem(gem);
  const key = `${tier4 ? 'tier4' : 'legacy'}${kind === 'damage' ? 'Damage' : 'Cooldown'}`;
  return Number((tables[key] || DEFAULT_GEM_TABLES[key])?.[level - 1] || 0);
}

export function combatAnalyzerGemFactors(data, snapshot, skillEffects, options = {}) {
  const support = Boolean(options.support);
  const profile = findCombatAnalyzerProfile(data, snapshot, skillEffects, { support });
  const shares = combatAnalyzerSkillShares(profile.value);
  const skillNames = Object.keys(shares).filter(name => Number(shares[name] || 0) > 0);
  const gems = Array.isArray(snapshot?.gems?.items) ? snapshot.gems.items : [];
  const tables = { ...DEFAULT_GEM_TABLES, ...(data?.gemTables || {}) };
  const totalShare = skillNames.reduce((sum, name) => sum + Number(shares[name] || 0), 0);
  const weightedDamage = skillNames.reduce((sum, name) => {
    const gem = gems.find(item =>
      normalizeCombatAnalyzerText(gemSkillName(item)) === normalizeCombatAnalyzerText(name)
      && profileGemKind(item) === 'damage'
      && item?.valid !== false
    );
    return sum + (gem ? gemBonus(gem, tables, 'damage') * Number(shares[name] || 0) : 0);
  }, 0);
  const damageFactor = totalShare > 0 ? 1 + (weightedDamage / totalShare) / 100 : 1;
  const cooldownGems = gems.filter(gem => profileGemKind(gem) === 'cooldown' && gem?.valid !== false);
  let cooldownWeight = 0;
  const weightedCooldown = cooldownGems.reduce((sum, gem) => {
    const weight = 2 ** Math.max(0, Number(gem?.level || 1) - 1);
    cooldownWeight += weight;
    return sum + gemBonus(gem, tables, 'cooldown') * weight;
  }, 0);
  let averageCooldown = cooldownWeight > 0 ? weightedCooldown / cooldownWeight : 0;
  let cooldownFactor = 1 / (1 - 0.9 * averageCooldown / 100);
  const cycle = buildSkillCycleModel({
    skillEffects,
    snapshot,
    shares,
    identitySkills: data?.identitySkills || [],
    analyzerTag: profile.tag,
    analyzerMatch: profile.match
  });
  if (cycle.items.length && cycle.mappedShare > 0) {
    cooldownFactor = cycle.gemCooldownMultiplier;
    averageCooldown = cycle.weightedGemCooldown;
  }
  return { profile, shares, damageFactor, cooldownFactor, totalFactor: damageFactor * cooldownFactor, averageCooldown, cycle };
}

export function gemUpgradeEfficiency({ data, snapshot, skillEffects, gem, nextLevel, support = false } = {}) {
  if (!data || !snapshot || !gem || support) return null;
  const slot = Number(gem.slot ?? -1);
  const gems = Array.isArray(snapshot?.gems?.items) ? snapshot.gems.items : [];
  const before = combatAnalyzerGemFactors(data, snapshot, skillEffects, { support });
  const upgradedItems = gems.map((item, index) => {
    const sameGem = slot >= 0 ? Number(item.slot ?? -2) === slot : item === gem || index === gems.indexOf(gem);
    return sameGem ? { ...item, level: Number(nextLevel || Number(item.level || 0) + 1) } : item;
  });
  const afterSnapshot = { ...snapshot, gems: { ...(snapshot.gems || {}), items: upgradedItems } };
  const after = combatAnalyzerGemFactors(data, afterSnapshot, skillEffects, { support });
  const kind = profileGemKind(gem);
  const beforeFactor = kind === 'cooldown' ? before.cooldownFactor : before.damageFactor;
  const afterFactor = kind === 'cooldown' ? after.cooldownFactor : after.damageFactor;
  const gainPercent = beforeFactor > 0 ? (afterFactor / beforeFactor - 1) * 100 : 0;
  const skillName = gemSkillName(gem);
  const normalizedSkillName = normalizeSkillCycleName(skillName);
  const skillShare = Object.entries(before.shares).find(([name]) => normalizeSkillCycleName(name) === normalizedSkillName)?.[1] || 0;
  return {
    gainPercent,
    kind,
    analyzerTag: before.profile.tag,
    match: before.profile.match,
    fallback: before.profile.fallback,
    skillShare: Number(skillShare),
    beforeFactor,
    afterFactor,
    averageCooldownBefore: before.averageCooldown,
    averageCooldownAfter: after.averageCooldown
  };
}
