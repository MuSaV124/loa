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
