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

const levelEffects = (key, values, extra = {}) => values.map(value => ({ [key]: value, ...extra }));

// 유물 각인서 0/5/10/15/20장에 대응하는 Lv.0~4의 실제 단계값이다.
// 단계 사이를 계산으로 보간하지 않고, 아래 표에 있는 값만 사용한다.
export const RELIC_ENGRAVING_RULES = Object.freeze({
  '원한': { levels: levelEffects('enemyDamage', [18, 18.75, 19.5, 20.25, 21]) },
  '저주받은 인형': { levels: levelEffects('enemyDamage', [14, 14.75, 15.5, 16.25, 17]) },
  '아드레날린': { levels: [14, 15.5, 17, 18.5, 20].map(critRate => ({ attackPower: 5.4, critRate })) },
  '예리한 둔기': { levels: levelEffects('critDamage', [44, 46, 48, 50, 52]) },
  '질량 증가': { levels: levelEffects('enemyDamage', [16, 16.75, 17.5, 18.25, 19], { attackSpeed: -10 }) },
  '돌격대장': { levels: levelEffects('conditionalDamage', [16, 16.8, 17.6, 18.4, 19.2]) },
  '기습의 대가': { levels: levelEffects('conditionalDamage', [19.8, 20.5, 21.2, 21.9, 22.6]) },
  '결투의 대가': { levels: levelEffects('conditionalDamage', [19.8, 20.5, 21.2, 21.9, 22.6]) },
  '타격의 대가': { levels: levelEffects('conditionalDamage', [14, 14.75, 15.5, 16.25, 17]) },
  '바리케이드': { levels: levelEffects('conditionalDamage', [14, 14.75, 15.5, 16.25, 17]) },
  '안정된 상태': { levels: levelEffects('conditionalDamage', [14, 14.75, 15.5, 16.25, 17]) },
  '속전속결': { levels: levelEffects('conditionalDamage', [18, 18.75, 19.5, 20.25, 21]) },
  '슈퍼 차지': { levels: levelEffects('conditionalDamage', [18, 18.75, 19.5, 20.25, 21]) },
  '마나 효율 증가': { levels: levelEffects('conditionalDamage', [13, 13.75, 14.5, 15.25, 16]) }
});

export function clampRelicBookLevel(level) {
  return Math.max(0, Math.min(4, Math.floor(Number(level) || 0)));
}

export function relicEngravingEffect(name, level) {
  const effect = RELIC_ENGRAVING_RULES[name]?.levels?.[clampRelicBookLevel(level)];
  return { ...EMPTY_EFFECT, ...(effect || {}) };
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
  if (effect.attackSpeed) parts.push(`공격 속도 ${effect.attackSpeed}%`);
  return parts.join(' · ');
}
