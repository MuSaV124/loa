import assert from 'node:assert/strict';
import { extractProfileAttackBreakdown } from '../api/character.js';
import { ARMGUARD_POWER_ESTIMATE, ARMGUARD_POWER_REFERENCES, armguardPowerEffectAtStage, estimateArmguardCombatPower } from '../public/armguard-power.js';

assert.deepEqual(extractProfileAttackBreakdown({ Stats: [{
  Type: '공격력',
  Value: '208,353',
  Tooltip: [
    "힘, 민첩, 지능과 무기 공격력을 기반으로 증가한 기본 공격력은 <font>200051</font> 입니다.",
    "공격력 증감 효과로 공격력이 <font>8302</font> 증가되었습니다."
  ]
}] }), {
  attackPower: 208353,
  baseAttackPower: 200051,
  attackPowerAdjustment: 8302
});

assert.equal(ARMGUARD_POWER_ESTIMATE.official, false);
assert.equal(ARMGUARD_POWER_ESTIMATE.breakthroughShare, 0.4);
assert.deepEqual(ARMGUARD_POWER_REFERENCES.map(row => row.stage), [0, 10, 15, 20, 25]);
assert.deepEqual(armguardPowerEffectAtStage(10), {
  stage: 10,
  weaponPower: 10969,
  defense: 1456,
  mainStat: 34746,
  vitality: 3072,
  baseAttack: 2030,
  baseAttackPercent: 0
});
assert.equal(armguardPowerEffectAtStage(15).baseAttackPercent, 1);
assert.equal(armguardPowerEffectAtStage(20).mainStat, 60216);
assert.equal(armguardPowerEffectAtStage(25).baseAttackPercent, 3);

const stage11 = armguardPowerEffectAtStage(11);
assert.equal(stage11.weaponPower, 10969 + (14817 - 10969) * 0.4);
assert.equal(stage11.mainStat, 34746 + (47268 - 34746) * 0.4);
assert.equal(stage11.baseAttackPercent, 0);
const stage12 = armguardPowerEffectAtStage(12);
assert.equal(stage12.weaponPower, 10969 + (14817 - 10969) * 0.55);
assert.ok(stage11.weaponPower - armguardPowerEffectAtStage(10).weaponPower > stage12.weaponPower - stage11.weaponPower);

const breakerSnapshot = {
  accuracyTarget: { officialCombatPower: 5449.29 },
  profile: {
    className: '브레이커',
    combatPower: 5449.29,
    baseAttackPower: 200051,
    stats: [{ type: '공격력', value: 208353 }]
  },
  equipment: {
    combat: [{ type: '무기', weaponPower: 229737 }]
  }
};
const breakerEstimate = estimateArmguardCombatPower(breakerSnapshot, 0, 25);
assert.equal(breakerEstimate.available, true);
assert.equal(breakerEstimate.className, '브레이커');
assert.ok(Math.abs(breakerEstimate.gainPercent - 15.380821471821292) < 1e-9);
assert.ok(Math.abs(breakerEstimate.powerGain - 838.1455663818115) < 1e-9);

const otherClassEstimate = estimateArmguardCombatPower({
  ...breakerSnapshot,
  profile: {
    ...breakerSnapshot.profile,
    className: '기상술사',
    combatPower: 4800,
    baseAttackPower: 180000
  },
  equipment: { combat: [{ type: '무기', weaponPower: 205000 }] }
}, 0, 25);
assert.equal(otherClassEstimate.available, true);
assert.equal(otherClassEstimate.className, '기상술사');
assert.notEqual(otherClassEstimate.powerGain, breakerEstimate.powerGain);

const missingBreakdown = estimateArmguardCombatPower({
  profile: { combatPower: 5000, stats: [{ type: '공격력', value: 190000 }] },
  equipment: { combat: [{ type: '무기', weaponPower: 210000 }] }
}, 0, 25);
assert.equal(missingBreakdown.available, false);

console.log('armguard power tests passed');
