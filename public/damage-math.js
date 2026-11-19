import { calculateBluntSpike } from './evolution-math.js?v=6.0.0';

export const BASE_CRIT_DAMAGE = 200;
export const CRIT_RATE_PER_STAT = 0.03579; // 기존 Lv.70 환산값. 공식 반올림 정밀도는 미검증.
export const NOVEMBER_2026_PATCH_URL = 'https://lostark.game.onstove.com/News/Notice/Views/13598';

function finite(value, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

export function percentFactor(percent) {
  return Math.max(0, 1 + finite(percent) / 100);
}

export function multiplyPercentSources(sources = []) {
  return sources.reduce((product, source) => product * percentFactor(source?.value ?? source), 1);
}

// A tier adds the critical increment only. One attack can trigger on-crit effects at most once.
export function expectedCriticalDamage({
  critRate, critDamage = BASE_CRIT_DAMAGE, critHitMultiplier = 1,
  multiCrit = true, canCrit = true, forcedCrit = false, critRateToDamage = 0
} = {}) {
  const rawRate = Math.max(0, finite(critRate));
  const rate = !canCrit ? 0 : forcedCrit ? 100 : multiCrit ? rawRate : Math.min(rawRate, 100);
  const guaranteedTiers = Math.floor(rate / 100);
  const nextTierChance = rate / 100 - guaranteedTiers;
  const critHitChance = Math.min(rate / 100, 1);
  const critFactor = Math.max(0, finite(critDamage, BASE_CRIT_DAMAGE) / 100);
  const extraTiers = Math.max(0, rate / 100 - 1);
  const convertedDamage = forcedCrit && canCrit ? rawRate * finite(critRateToDamage) : 0;
  const expectedMultiplier = (1 - critHitChance)
    + critHitChance * critFactor * Math.max(0, finite(critHitMultiplier, 1))
    + extraTiers * (critFactor - 1);
  return {
    guaranteedTiers, nextTierChance, critHitChance, convertedDamage,
    multiCritChance: Math.max(0, Math.min(1, rate / 100 - 1)),
    multiplier: Math.max(0, expectedMultiplier) * percentFactor(convertedDamage)
  };
}

export function expectedHitDamage(stats = {}) {
  const rawCritRate = finite(stats.critRate) + finite(stats.skillCritBonus) + finite(stats.adrenalineCritRate);
  const blunt = stats.critCap != null;
  const conversion = calculateBluntSpike(rawCritRate, stats);
  const evolutionDamage = finite(stats.evolutionDamage) + conversion.convertedEvolutionDamage;
  const critHitMultiplier = stats.critHitDamageSources?.length
    ? multiplyPercentSources(stats.critHitDamageSources) : percentFactor(stats.critHitDamage);
  const enemyMultiplier = stats.enemyDamageSources?.length
    ? multiplyPercentSources(stats.enemyDamageSources) : percentFactor(stats.enemyDamage);
  const critical = expectedCriticalDamage({
    critRate: conversion.effectiveCritRate,
    critDamage: stats.critDamage,
    critHitMultiplier,
    multiCrit: !blunt && stats.multiCrit !== false,
    canCrit: stats.canCrit !== false,
    forcedCrit: !blunt && Boolean(stats.forcedCrit),
    critRateToDamage: stats.critRateToDamage
  });
  const skillDamageMultiplier = percentFactor(stats.skillDamage);
  const engravingDamageMultiplier = Math.max(0, finite(stats.engravingDamageMultiplier, 1));
  const value = critical.multiplier * percentFactor(evolutionDamage) * percentFactor(stats.additionalDamage)
    * enemyMultiplier * percentFactor(stats.attributeDamage) * percentFactor(stats.attackPower)
    * skillDamageMultiplier * engravingDamageMultiplier;
  return {
    value: Number.isFinite(value) ? value : 0,
    critical, rawCritRate, ...conversion, evo: evolutionDamage,
    enemyDamage: (enemyMultiplier - 1) * 100,
    critHitDamage: (critHitMultiplier - 1) * 100,
    skillDamageMultiplier, engravingDamageMultiplier
  };
}
