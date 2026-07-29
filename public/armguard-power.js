const RAW_ARMGUARD_POWER_REFERENCES = [
  // stage, weapon power, physical/magic defense, main stat, vitality, base attack, base attack percent
  [0, 3273, 432, 9702, 870, 0, 0],
  [10, 10969, 1456, 34746, 3072, 2030, 0],
  [15, 14817, 1968, 47268, 4173, 3690, 1],
  [20, 18794, 2488, 60216, 5286, 5980, 2],
  [25, 22940, 3019, 77310, 6414, 9050, 3]
];

export const ARMGUARD_POWER_ESTIMATE = Object.freeze({
  official: false,
  breakthroughShare: 0.4,
  note: '완갑 출시 전 공개된 10/15/20/25강 툴팁과 0강 역산값을 사용한 예상치'
});

export const ARMGUARD_POWER_REFERENCES = Object.freeze(RAW_ARMGUARD_POWER_REFERENCES.map(([
  stage,
  weaponPower,
  defense,
  mainStat,
  vitality,
  baseAttack,
  baseAttackPercent
]) => Object.freeze({
  stage,
  weaponPower,
  defense,
  mainStat,
  vitality,
  baseAttack,
  baseAttackPercent
})));

function clampStage(stage) {
  return Math.max(0, Math.min(25, Math.floor(Number(stage || 0))));
}

function interpolateValue(from, to, ratio, key) {
  return Number(from[key] || 0) + (Number(to[key] || 0) - Number(from[key] || 0)) * ratio;
}

function intervalRatio(stage, fromStage, toStage) {
  if (fromStage === 0) return (stage - fromStage) / (toStage - fromStage);
  const offset = stage - fromStage;
  if (offset <= 0) return 0;
  if (offset >= toStage - fromStage) return 1;
  return ARMGUARD_POWER_ESTIMATE.breakthroughShare + (offset - 1) * ((1 - ARMGUARD_POWER_ESTIMATE.breakthroughShare) / 4);
}

export function armguardPowerEffectAtStage(stage) {
  const target = clampStage(stage);
  const exact = ARMGUARD_POWER_REFERENCES.find(row => row.stage === target);
  if (exact) return exact;

  const upper = ARMGUARD_POWER_REFERENCES.find(row => row.stage > target);
  const lower = [...ARMGUARD_POWER_REFERENCES].reverse().find(row => row.stage < target);
  if (!lower || !upper) return ARMGUARD_POWER_REFERENCES[target <= 0 ? 0 : ARMGUARD_POWER_REFERENCES.length - 1];
  const ratio = intervalRatio(target, lower.stage, upper.stage);
  const baseAttackPercent = target >= 25 ? 3 : target >= 20 ? 2 : target >= 15 ? 1 : 0;
  return Object.freeze({
    stage: target,
    weaponPower: interpolateValue(lower, upper, ratio, 'weaponPower'),
    defense: interpolateValue(lower, upper, ratio, 'defense'),
    mainStat: interpolateValue(lower, upper, ratio, 'mainStat'),
    vitality: interpolateValue(lower, upper, ratio, 'vitality'),
    baseAttack: interpolateValue(lower, upper, ratio, 'baseAttack'),
    baseAttackPercent
  });
}

function profileStat(snapshot, type) {
  const row = (snapshot?.profile?.stats || []).find(item => item?.type === type);
  const value = Number(row?.value || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function currentWeaponPower(snapshot) {
  const weapon = (snapshot?.equipment?.combat || []).find(item => item?.type === '무기');
  const value = Number(weapon?.weaponPower || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function currentArmguardStage(snapshot) {
  const armguard = (snapshot?.equipment?.combat || []).find(item => item?.type === '완갑' || String(item?.name || '').includes('완갑'));
  if (!armguard) return 0;
  return clampStage(armguard?.honingLevel);
}

function attackAtStage(baseMainStat, baseWeaponPower, effect) {
  const mainStat = Math.max(1, Number(baseMainStat || 0) + Number(effect?.mainStat || 0));
  const weaponPower = Math.max(1, Number(baseWeaponPower || 0) + Number(effect?.weaponPower || 0));
  const formulaAttack = Math.sqrt(mainStat * weaponPower / 6);
  return (formulaAttack + Number(effect?.baseAttack || 0)) * (1 + Number(effect?.baseAttackPercent || 0) / 100);
}

export function estimateArmguardCombatPower(snapshot, fromStage = 0, toStage = 25) {
  const from = clampStage(fromStage);
  const to = clampStage(toStage);
  const officialCombatPower = Number(snapshot?.profile?.combatPower || snapshot?.accuracyTarget?.officialCombatPower || 0);
  const displayedAttack = profileStat(snapshot, '공격력');
  const parsedBaseAttack = Number(snapshot?.profile?.baseAttackPower || 0);
  const baseAttackPower = parsedBaseAttack > 0 ? parsedBaseAttack : displayedAttack;
  const weaponPower = currentWeaponPower(snapshot);
  if (!(officialCombatPower > 0) || !(parsedBaseAttack > 0) || !(baseAttackPower > 0) || !(weaponPower > 0) || to <= from) {
    return {
      available: false,
      from,
      to,
      reason: !(parsedBaseAttack > 0) ? '캐릭터 기본 공격력 상세값 확인 필요' : '완갑 전투력 계산 기준값 부족'
    };
  }

  const anchorStage = currentArmguardStage(snapshot);
  const anchorEffect = armguardPowerEffectAtStage(anchorStage);
  const anchorMultiplier = 1 + Number(anchorEffect.baseAttackPercent || 0) / 100;
  const formulaAttackWithArmguard = Math.max(1, baseAttackPower / anchorMultiplier - Number(anchorEffect.baseAttack || 0));
  const totalWeaponPower = weaponPower + Number(anchorEffect.weaponPower || 0);
  const totalMainStat = 6 * formulaAttackWithArmguard ** 2 / totalWeaponPower;
  const baseMainStat = Math.max(1, totalMainStat - Number(anchorEffect.mainStat || 0));

  const fromEffect = armguardPowerEffectAtStage(from);
  const toEffect = armguardPowerEffectAtStage(to);
  const anchorAttack = attackAtStage(baseMainStat, weaponPower, anchorEffect);
  const fromAttack = attackAtStage(baseMainStat, weaponPower, fromEffect);
  const toAttack = attackAtStage(baseMainStat, weaponPower, toEffect);
  const fromPower = officialCombatPower * fromAttack / anchorAttack;
  const toPower = officialCombatPower * toAttack / anchorAttack;
  const gainPercent = (toAttack / fromAttack - 1) * 100;

  return {
    available: true,
    official: false,
    className: snapshot?.profile?.className || '',
    from,
    to,
    anchorStage,
    fromPower,
    toPower,
    powerGain: toPower - fromPower,
    gainPercent,
    baseAttackPower,
    weaponPower,
    usedParsedBaseAttack: parsedBaseAttack > 0,
    basis: ARMGUARD_POWER_ESTIMATE.note
  };
}
