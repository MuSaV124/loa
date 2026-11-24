export function calculateBluntSpike(rawCritRate, effect = {}) {
  const critCap = Number(effect.critCap ?? NaN);
  const raw = Number.isFinite(Number(rawCritRate)) ? Number(rawCritRate) : 0;
  if (!Number.isFinite(critCap)) {
    return { effectiveCritRate: raw, overCrit: 0, convertedEvolutionDamage: 0 };
  }

  const overCrit = Math.max(0, raw - critCap);
  const convertedEvolutionDamage = Math.min(
    overCrit * Number(effect.overCritToEvolutionDamageRate || 0),
    Number(effect.overCritEvolutionDamageCap ?? Infinity)
  );

  return {
    effectiveCritRate: Math.min(raw, critCap),
    overCrit,
    convertedEvolutionDamage
  };
}

const SHIFT_POINT_STEP_BY_TIER = { 1: 10, 2: 20, 3: 20, 4: 20, 5: 30 };

export function shiftClickTargetLevel(currentLevel, node = {}, direction = 1) {
  const maxLevel = Math.max(0, Number(node.maxLevel || 0));
  const current = Math.max(0, Math.min(maxLevel, Number(currentLevel || 0)));
  const pointStep = Number(SHIFT_POINT_STEP_BY_TIER[Number(node.tier)] || 0);
  if (!pointStep) return current;
  const costPerLevel = Math.max(1, Number(node.costPerLevel || 1));
  const levelStep = Math.max(1, Math.floor(pointStep / costPerLevel));
  const signedStep = Number(direction) < 0 ? -levelStep : levelStep;
  return Math.max(0, Math.min(maxLevel, current + signedStep));
}

export function calculateSonicBreakEvolutionDamage(attackSpeed, moveSpeed, effect = {}) {
  const attack = Number(attackSpeed || 100);
  const move = Number(moveSpeed || 100);
  const attackIncrease = Math.max(0, attack - 100);
  const moveIncrease = Math.max(0, move - 100);
  const cappedIncrease = Math.min(attackIncrease, 40) + Math.min(moveIncrease, 40);
  let damage = cappedIncrease * Number(effect.rate || 0);

  // 상한 보너스와 상한 초과 환산은 공속과 이속이 모두 140%를 넘은 경우에만 적용됩니다.
  if (attack > 140 && move > 140) {
    const overCap = (attack - 140) + (move - 140);
    damage += Number(effect.overCapBonus || 0) + overCap * Number(effect.overCapRate || 0);
  }

  return Math.min(damage, Number(effect.maxEvolutionDamage ?? Infinity));
}

export function maintainedEvolutionDamage(effect) {
  const standing = effect.standingStriker;
  return (effect.evolutionDamage || 0) + (standing ? standing.maxStacks * standing.damagePerStack : 0)
    + (effect.inFightingDamage || 0);
}

export const EVOLUTION_TIER_LIMITS = { 1: 40, 2: 30, 3: 20, 4: 20, 5: 30 };
const PRIOR_TIER_POINTS = { 2: 40, 3: 20, 4: 20, 5: 20 };

export function* evolutionAllocations(nodes, fixedEntries, pointBudget) {
  const tier1Points = fixedEntries.reduce((sum, entry) => sum + entry.points, 0);
  if (!Number.isInteger(pointBudget) || tier1Points > pointBudget || tier1Points > EVOLUTION_TIER_LIMITS[1]) return;
  const tiers = [2, 3, 4, 5];
  const options = tiers.map(tier => nodes.filter(node => node.tier === tier));
  const entries = [];
  const levels = new Map();

  function* walkTier(index, budget, priorPoints) {
    if (index === tiers.length) {
      if (entries.length) yield [...entries];
      return;
    }
    const tier = tiers[index];
    const maxPoints = priorPoints >= PRIOR_TIER_POINTS[tier] ? Math.min(budget, EVOLUTION_TIER_LIMITS[tier]) : 0;
    yield* walkNode(0, 0);

    function* walkNode(nodeIndex, points) {
      if (nodeIndex === options[index].length) {
        yield* walkTier(index + 1, budget - points, points);
        return;
      }
      const node = options[index][nodeIndex];
      const eligible = !node.requires || (levels.get(node.requires.name) || 0) >= node.requires.level;
      const max = eligible ? Math.min(node.maxLevel, Math.floor((maxPoints - points) / node.costPerLevel)) : 0;
      yield* walkNode(nodeIndex + 1, points);
      for (let level = 1; level <= max; level++) {
        entries.push({ name: node.name, tier, level });
        levels.set(node.name, level);
        yield* walkNode(nodeIndex + 1, points + level * node.costPerLevel);
        entries.pop();
      }
      levels.delete(node.name);
    }
  }

  yield* walkTier(0, pointBudget - tier1Points, tier1Points);
}
