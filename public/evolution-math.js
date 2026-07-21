export function calculateBluntSpike(rawCritRate, effect = {}) {
  const critCap = Number(effect.critCap);
  if (!Number.isFinite(critCap)) {
    return { effectiveCritRate: Number(rawCritRate || 0), overCrit: 0, convertedEvolutionDamage: 0 };
  }

  const raw = Number(rawCritRate || 0);
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

const SHIFT_POINT_STEP_BY_TIER = { 1: 10, 2: 20, 3: 20, 5: 30 };

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

const MANA_STABILITY_BONUS = {
  '끝없는 마나': { 1: 0.5, 2: 1.0 },
  '금단의 주문': { 1: 0.3, 2: 0.6 },
  '무한한 마력': { 1: 0.4, 2: 0.8 }
};

export function calculatePracticalRecommendationScore({
  expectedValue,
  rawCritRate,
  fiveName,
  selection = {},
  singleHitMainSkill = false,
  manaShortageClass = false,
  noManaMainSkill = false
} = {}) {
  const expected = Number(expectedValue || 0);
  const critRate = Number(rawCritRate || 0);
  let multiplier = 1;
  const details = {
    singleHitPenalty: 0,
    critLowPenalty: 0,
    critOverPenalty: 0,
    manaStabilityBonus: 0
  };

  if (critRate < 95) {
    details.critLowPenalty = 0.5;
    multiplier *= 0.995;
  }

  const usefulCritCap = fiveName === '뭉툭한 가시' ? 120 : 100;
  const overCrit = Math.max(0, critRate - usefulCritCap);
  if (overCrit > 0) {
    details.critOverPenalty = overCrit * 0.5;
    multiplier *= Math.max(0, 1 - details.critOverPenalty / 100);
  }

  if (singleHitMainSkill && fiveName === '뭉툭한 가시') {
    details.singleHitPenalty = 2.5;
    multiplier *= 0.975;
  }

  if (manaShortageClass && !noManaMainSkill) {
    for (const [name, levels] of Object.entries(MANA_STABILITY_BONUS)) {
      const level = Math.max(0, Math.min(Number(selection?.[name]?.level || 0), 2));
      details.manaStabilityBonus += Number(levels[level] || 0);
    }
    if (details.manaStabilityBonus > 0) multiplier *= 1 + details.manaStabilityBonus / 100;
  }

  return {
    value: expected * multiplier,
    expectedValue: expected,
    multiplier,
    ...details
  };
}
