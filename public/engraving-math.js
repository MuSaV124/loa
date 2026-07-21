export const ADRENALINE_ENGRAVING_NAME = '아드레날린';

const EMPTY_EFFECT = Object.freeze({
  critRate: 0,
  critDamage: 0,
  critHitDamage: 0,
  additionalDamage: 0,
  enemyDamage: 0,
  attackPower: 0,
  attackSpeed: 0,
  conditionalDamage: 0
});

export const RELIC_ENGRAVING_RULES = Object.freeze({
  '원한': { legendary4: { enemyDamage: 18 }, relic4: { enemyDamage: 21 } },
  '저주받은 인형': { legendary4: { enemyDamage: 14 }, relic4: { enemyDamage: 17 } },
  '아드레날린': { legendary4: { attackPower: 5.4, critRate: 14 }, relic4: { attackPower: 5.4, critRate: 20 } },
  '예리한 둔기': { legendary4: { critDamage: 44 }, relic4: { critDamage: 52 } },
  '질량 증가': { legendary4: { enemyDamage: 16 }, relic4: { enemyDamage: 19 } },
  '돌격대장': { legendary4: { conditionalDamage: 16 }, relic4: { conditionalDamage: 19 } },
  '기습의 대가': { legendary4: { conditionalDamage: 19.8 }, relic4: { conditionalDamage: 22.6 } },
  '결투의 대가': { legendary4: { conditionalDamage: 19.8 }, relic4: { conditionalDamage: 22.6 } },
  '타격의 대가': { legendary4: { conditionalDamage: 14 }, relic4: { conditionalDamage: 17 } },
  '바리케이드': { legendary4: { conditionalDamage: 14 }, relic4: { conditionalDamage: 17 } },
  '안정된 상태': { legendary4: { conditionalDamage: 14 }, relic4: { conditionalDamage: 17 } },
  '속전속결': { legendary4: { conditionalDamage: 18 }, relic4: { conditionalDamage: 21 } },
  '슈퍼 차지': { legendary4: { conditionalDamage: 18 }, relic4: { conditionalDamage: 21 } },
  '마나 효율 증가': { legendary4: { conditionalDamage: 13 }, relic4: { conditionalDamage: 16 } }
});

export function clampRelicBookLevel(level) {
  return Math.max(0, Math.min(4, Math.floor(Number(level) || 0)));
}

export function relicEngravingEffect(name, level) {
  const rule = RELIC_ENGRAVING_RULES[name];
  if (!rule) return { ...EMPTY_EFFECT };
  const ratio = clampRelicBookLevel(level) / 4;
  const result = { ...EMPTY_EFFECT };
  const keys = new Set([...Object.keys(rule.legendary4 || {}), ...Object.keys(rule.relic4 || {})]);
  for (const key of keys) {
    const from = Number(rule.legendary4?.[key] || 0);
    const to = Number(rule.relic4?.[key] || 0);
    result[key] = Math.round((from + (to - from) * ratio) * 100) / 100;
  }
  return result;
}

export function addEngravingEffects(base = {}, delta = {}, multiplier = 1) {
  const result = { ...EMPTY_EFFECT, ...base };
  for (const key of Object.keys(EMPTY_EFFECT)) {
    result[key] = Math.round((Number(result[key] || 0) + Number(delta?.[key] || 0) * multiplier) * 100) / 100;
  }
  return result;
}

export function adjustedEngravingEffects(baseEffects, options = {}) {
  const {
    originalHasAdrenaline = false,
    adrenalineEnabled = false,
    replacementName = '',
    replacementBookLevel = 0,
    originalReplacementEffect = null
  } = options;
  let result = addEngravingEffects(baseEffects);
  const replacementEffect = relicEngravingEffect(replacementName, replacementBookLevel);

  if (originalHasAdrenaline) {
    if (!adrenalineEnabled) result = addEngravingEffects(result, replacementEffect);
  } else if (originalReplacementEffect) {
    result = addEngravingEffects(result, originalReplacementEffect, -1);
    if (!adrenalineEnabled) result = addEngravingEffects(result, replacementEffect);
  }

  return { effects: result, replacementEffect };
}

export function describeEngravingEffect(effect = {}) {
  const parts = [];
  if (effect.critRate) parts.push(`치명타 적중률 +${effect.critRate}%`);
  if (effect.critDamage) parts.push(`치명타 피해 +${effect.critDamage}%`);
  if (effect.enemyDamage) parts.push(`적에게 주는 피해 +${effect.enemyDamage}%`);
  if (effect.conditionalDamage) parts.push(`조건부 피해 +${effect.conditionalDamage}%`);
  if (effect.attackPower) parts.push(`공격력 +${effect.attackPower}%`);
  return parts.join(' · ');
}
