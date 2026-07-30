import assert from 'node:assert/strict';
import {
  isSupportSnapshot,
  snapshotWithAccessoryCandidate,
  snapshotWithGemLevel,
  supportContributionModel,
  supportOfficialAccessoryTransition,
  supportUpgradeImpact
} from '../public/support-power.js';

const accessory = {
  type: '반지',
  name: '테스트 반지',
  effects: {
    allyAttackBuff: 3,
    allyDamageBuff: 4.5,
    optionGrades: { allyAttackBuff: '중', allyDamageBuff: '중' }
  }
};
const snapshot = {
  profile: {
    className: '바드',
    secondClass: '절실한 구원',
    combatPower: 6000,
    stats: [
      { type: '공격력', value: 170000 },
      { type: '신속', value: 1800 },
      { type: '특화', value: 600 }
    ]
  },
  effects: {
    accessory: {
      items: [
        { type: '목걸이', effects: { brandPower: 4.8, identityGain: 3.6 } },
        { type: '귀걸이', effects: { partyHeal: 2.1, partyShield: 2.1 } },
        accessory
      ]
    }
  },
  gems: {
    items: [
      { slot: 0, skillName: '천상의 연주', kind: 'damage', name: '8레벨 겁화', level: 8 },
      { slot: 1, skillName: '천상의 연주', kind: 'cooldown', name: '8레벨 작열', level: 8 },
      { slot: 2, skillName: '음파 진동', kind: 'cooldown', name: '8레벨 작열', level: 8 },
      { slot: 3, skillName: '세레나데 스킬', kind: 'damage', name: '8레벨 겁화', level: 8 }
    ]
  },
  arkGrid: { slots: [] }
};

assert.equal(isSupportSnapshot(snapshot), true);
assert.equal(isSupportSnapshot({ ...snapshot, profile: { ...snapshot.profile, secondClass: '진실된 용맹' } }), false);

const base = supportContributionModel(snapshot, { selection: { 선각자: { level: 1 } } });
assert.ok(base.totalBuffPower > 1);
assert.ok(base.fullBuffPower > base.allTimeBuffPower);
assert.ok(base.detail.overallAttackUptime > 0 && base.detail.overallAttackUptime <= 1);

const ringCandidate = {
  equippedItem: accessory,
  effects: { allyAttackBuff: 5, allyDamageBuff: 7.5 }
};
const officialPercent = supportOfficialAccessoryTransition(ringCandidate);
const expectedOfficial = ((1 + 5 * 0.0075) * (1 + 7.5 * 0.005) / ((1 + 3 * 0.0075) * (1 + 4.5 * 0.005)) - 1) * 100;
assert.ok(Math.abs(officialPercent - expectedOfficial) < 1e-10);

const upgradedRing = supportContributionModel(snapshotWithAccessoryCandidate(snapshot, ringCandidate), { selection: { 선각자: { level: 1 } } });
const ringImpact = supportUpgradeImpact({ before: base, after: upgradedRing, officialPercent });
assert.ok(ringImpact.partyPercent > 0);
assert.ok(ringImpact.combinedPercent > 0);

const attackGem = snapshot.gems.items[0];
const upgradedAttackGem = supportContributionModel(snapshotWithGemLevel(snapshot, attackGem, 9), { selection: { 선각자: { level: 1 } } });
assert.ok(upgradedAttackGem.totalBuffPower > base.totalBuffPower);

const cooldownGem = snapshot.gems.items[1];
const upgradedCooldownGem = supportContributionModel(snapshotWithGemLevel(snapshot, cooldownGem, 9), { selection: { 선각자: { level: 1 } } });
assert.ok(upgradedCooldownGem.detail.uptimeA >= base.detail.uptimeA);
assert.ok(upgradedCooldownGem.totalBuffPower >= base.totalBuffPower);

const invalidGemSnapshot = {
  ...snapshot,
  gems: { items: [{ slot: 9, skillName: '천상의 연주', kind: 'damage', name: '10레벨 겁화', level: 10, attackBonus: true, valid: false }] }
};
const noGemSnapshot = { ...invalidGemSnapshot, gems: { items: [] } };
assert.equal(supportContributionModel(invalidGemSnapshot).totalBuffPower, supportContributionModel(noGemSnapshot).totalBuffPower);

const tier4CooldownSnapshot = { ...snapshot, gems: { items: [{ skillName: '천상의 연주', kind: 'cooldown', level: 8, attackBonus: true, valid: true }] } };
const legacyCooldownSnapshot = { ...snapshot, gems: { items: [{ skillName: '천상의 연주', kind: 'cooldown', level: 8, attackBonus: false, valid: true }] } };
assert.ok(supportContributionModel(tier4CooldownSnapshot).detail.uptimeA > supportContributionModel(legacyCooldownSnapshot).detail.uptimeA);

const exactCombined = supportUpgradeImpact({
  before: { totalBuffPower: 1, carePower: 1 },
  after: { totalBuffPower: 1.02, carePower: 1.03 },
  officialPercent: 1
});
const expectedCombined = (1.01 ** 0.3 * 1.02 ** 0.6 * 1.03 ** 0.1 - 1) * 100;
assert.ok(Math.abs(exactCombined.combinedPercent - expectedCombined) < 1e-10);

console.log('support power tests passed');
