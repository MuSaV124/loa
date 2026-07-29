import assert from 'node:assert/strict';
import { ARMGUARD_HONING_ROWS, armguardExpectedPityCount, armguardHoningRowForCurrentStage, armguardHoningRowsBetween, armguardPityProbability } from '../public/armguard-honing.js';

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
  '운명의 돌파석': 30,
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
assert.equal(last.attemptMaterials['골드'], 13160);
assert.equal(last.attemptMaterials['실링'], 240000);
assert.equal(armguardHoningRowForCurrentStage(25), null);

assert.deepEqual(armguardHoningRowsBetween(0, 25).map(row => row.stage), Array.from({ length: 25 }, (_, index) => index + 1));
assert.deepEqual(armguardHoningRowsBetween(10, 15).map(row => row.stage), [11, 12, 13, 14, 15]);
assert.deepEqual(armguardHoningRowsBetween(24, 25).map(row => row.stage), [25]);
assert.deepEqual(armguardHoningRowsBetween(20, 20).map(row => row.stage), [21]);
assert.ok(Math.abs(armguardPityProbability(15) - 0.08477009984753305) < 1e-12);
assert.ok(Math.abs(armguardExpectedPityCount(0, 25) - 2.4200610360786188) < 1e-12);
assert.ok(armguardExpectedPityCount(10, 15) > 0);

console.log('armguard honing tests passed');
