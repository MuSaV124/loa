import assert from 'node:assert/strict';
import { ARMGUARD_BREATH_ESTIMATE, ARMGUARD_HONING_ROWS, armguardBreathMaxCombined, armguardBreathMixes, armguardBreathMixesForMode, armguardExpectedPityCount, armguardHoningRowForCurrentStage, armguardHoningRowsBetween, armguardPityProbability } from '../public/armguard-honing.js';

assert.equal(ARMGUARD_HONING_ROWS.length, 25);
assert.deepEqual(ARMGUARD_HONING_ROWS.map(row => row.stage), Array.from({ length: 25 }, (_, index) => index + 1));

const first = armguardHoningRowForCurrentStage(0);
assert.equal(first.stage, 1);
assert.equal(first.ratePercent, 15);
assert.deepEqual(first.growthMaterials, { '운명의 파편': 145000, '실링': 1450000 });
assert.deepEqual(first.attemptMaterials, {
  '운명의 파편': 14500,
  '운명의 파괴석 결정': 600,
  '운명의 수호석 결정': 1800,
  '위대한 운명의 돌파석': 30,
  '상급 아비도스 융화제': 22,
  '골드': 5200,
  '실링': 80000
});

assert.equal(armguardHoningRowForCurrentStage(5).ratePercent, 10);
assert.equal(armguardHoningRowForCurrentStage(10).ratePercent, 5);
assert.equal(armguardHoningRowForCurrentStage(15).ratePercent, 3);
assert.equal(armguardHoningRowForCurrentStage(20).ratePercent, 1.5);

const last = armguardHoningRowForCurrentStage(24);
assert.equal(last.stage, 25);
assert.deepEqual(last.growthMaterials, { '운명의 파편': 607000, '실링': 6070000 });
assert.equal(last.attemptMaterials['운명의 파편'], 38470);
assert.equal(last.attemptMaterials['운명의 파괴석 결정'], 1280);
assert.equal(last.attemptMaterials['운명의 수호석 결정'], 4015);
assert.equal(last.attemptMaterials['위대한 운명의 돌파석'], 94);
assert.equal(last.attemptMaterials['골드'], 13160);
assert.equal(last.attemptMaterials['실링'], 240000);
assert.ok(ARMGUARD_HONING_ROWS.every(row => !Object.hasOwn(row.attemptMaterials, '운명의 돌파석')));
assert.equal(armguardHoningRowForCurrentStage(25), null);

assert.deepEqual(armguardHoningRowsBetween(0, 25).map(row => row.stage), Array.from({ length: 25 }, (_, index) => index + 1));
assert.deepEqual(armguardHoningRowsBetween(10, 15).map(row => row.stage), [11, 12, 13, 14, 15]);
assert.deepEqual(armguardHoningRowsBetween(24, 25).map(row => row.stage), [25]);
assert.deepEqual(armguardHoningRowsBetween(20, 20).map(row => row.stage), [21]);
assert.ok(Math.abs(armguardPityProbability(15) - 0.08477009984753305) < 1e-12);
assert.ok(Math.abs(armguardExpectedPityCount(0, 25) - 2.4200610360786188) < 1e-12);
assert.ok(armguardExpectedPityCount(10, 15) > 0);
assert.equal(ARMGUARD_BREATH_ESTIMATE.official, false);
assert.equal(armguardBreathMaxCombined(1), 20);
assert.equal(armguardBreathMaxCombined(19), 20);
assert.equal(armguardBreathMaxCombined(20), 30);
assert.equal(armguardBreathMaxCombined(23), 30);
assert.equal(armguardBreathMaxCombined(24), 50);
assert.equal(armguardBreathMaxCombined(25), 50);
assert.equal(armguardBreathMixes(19).length, 11);
assert.deepEqual(armguardBreathMixes(19)[4], { lava: 4, glacier: 4, total: 8 });
assert.deepEqual(armguardBreathMixes(20)[10], { lava: 10, glacier: 10, total: 20 });
assert.deepEqual(armguardBreathMixes(25).at(-1), { lava: 25, glacier: 25, total: 50 });
assert.deepEqual(armguardBreathMixesForMode(19, 'none', true), [{ lava: 0, glacier: 0, total: 0 }]);
assert.deepEqual(armguardBreathMixesForMode(20, 'full', false), [{ lava: 15, glacier: 15, total: 30 }]);
assert.deepEqual(armguardBreathMixesForMode(19, 'optimal', true), [
  { lava: 0, glacier: 0, total: 0 },
  { lava: 10, glacier: 10, total: 20 }
]);
assert.deepEqual(armguardBreathMixesForMode(20, 'optimal', true), [
  { lava: 0, glacier: 0, total: 0 },
  { lava: 15, glacier: 15, total: 30 }
]);
assert.deepEqual(armguardBreathMixesForMode(25, 'optimal', true), [
  { lava: 0, glacier: 0, total: 0 },
  { lava: 25, glacier: 25, total: 50 }
]);
assert.deepEqual(armguardBreathMixesForMode(25, 'optimal', false), [{ lava: 0, glacier: 0, total: 0 }]);

console.log('armguard honing tests passed');
