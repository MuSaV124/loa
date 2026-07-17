import assert from 'node:assert/strict';
import {
  ADVANCED_HONING_OUTCOMES,
  advancedHoningStageForLevel,
  optimizeAdvancedHoning,
  summarizeAdvancedHoningStrategy
} from '../public/advanced-honing-math.js';

for (const outcomes of Object.values(ADVANCED_HONING_OUTCOMES)) {
  const probability = outcomes.reduce((sum, row) => sum + row.probability, 0);
  assert.ok(Math.abs(probability - 1) < 0.000001);
}

assert.equal(advancedHoningStageForLevel(0), 1);
assert.equal(advancedHoningStageForLevel(9), 1);
assert.equal(advancedHoningStageForLevel(10), 2);
assert.equal(advancedHoningStageForLevel(20), 3);
assert.equal(advancedHoningStageForLevel(39), 4);

const expensiveSupport = optimizeAdvancedHoning({
  stage: 1,
  levels: 10,
  baseGold: 100,
  breathGold: 10000,
  bookGold: 10000
});
assert.ok(expensiveSupport.expectedGoldPerLevel > 0);
assert.ok(expensiveSupport.expectedAttemptsPerLevel > 0);
assert.match(summarizeAdvancedHoningStrategy(expensiveSupport.usage), /일반 보조 없음/);

const freeSupport = optimizeAdvancedHoning({
  stage: 1,
  levels: 10,
  baseGold: 100,
  breathGold: 0,
  bookGold: 0
});
assert.ok(freeSupport.expectedGoldPerLevel < expensiveSupport.expectedGoldPerLevel);
assert.ok(freeSupport.expectedAttemptsPerLevel < expensiveSupport.expectedAttemptsPerLevel);

const lateStage = optimizeAdvancedHoning({
  stage: 3,
  levels: 10,
  baseGold: 100,
  breathGold: 0,
  bookGold: 0
});
assert.ok(lateStage.usage['ancestor:both'] > 0);
assert.ok(lateStage.usage['enhanced:both'] > 0);
assert.match(summarizeAdvancedHoningStrategy(lateStage.usage), /강화 선조의 가호 풀숨\+책/);
assert.equal(lateStage.ancestorOrbGain, 2);

console.log('advanced honing math tests passed');
