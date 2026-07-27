import assert from 'node:assert/strict';
import {
  allocateOwnedMaterials,
  buildHoningScenarioMaterials,
  buildUpgradePlan,
  decodeSpecScenario,
  encodeSpecScenario,
  mergeMaterials,
  scaleMaterials
} from '../public/spec-planner.js';

const allocation = allocateOwnedMaterials(
  { '운명의 파편': 12000, '운명의 돌파석': 30, '골드': 1000, '실링': 50000 },
  { '운명의 파편': 10000, '운명의 돌파석': 50 }
);
assert.deepEqual(allocation.ownedUsed, { '운명의 파편': 10000, '운명의 돌파석': 30 });
assert.deepEqual(allocation.purchasedMaterials, { '운명의 파편': 2000, '골드': 1000, '실링': 50000 });
assert.equal(allocation.remainingOwned['운명의 돌파석'], 20);

assert.deepEqual(
  mergeMaterials({ '운명의 파편': 1000, '실링': 200 }, scaleMaterials({ '운명의 파편': 500, '골드': 10 }, 3)),
  { '운명의 파편': 2500, '실링': 200, '골드': 30 }
);
assert.deepEqual(
  buildHoningScenarioMaterials(
    { '운명의 파편': 12000, '실링': 300000 },
    { '운명의 파편': 3000, '골드': 970, '실링': 33000 },
    4
  ),
  { '운명의 파편': 24000, '실링': 432000, '골드': 3880 }
);

const rows = [
  { category: 'normalHoning', item: { type: '무기', name: 'A' }, from: 20, to: 21, available: true, powerDelta: 100, expectedCost: { expectedGold: 1000 } },
  { category: 'gem', item: { type: '보석', name: 'B' }, from: 7, to: 8, available: true, powerDelta: 50, expectedCost: { expectedGold: 250 } },
  { category: 'accessory', item: { type: '귀걸이', name: 'C' }, available: false, powerDelta: 1000, expectedCost: { expectedGold: 1 } }
];
const targetPlan = buildUpgradePlan({
  rows,
  currentPower: 5000,
  targetPower: 5120,
  mode: 'target',
  costForRow: row => ({ gold: row.expectedCost.expectedGold, silver: 0, remainingOwned: {} })
});
assert.equal(targetPlan.steps.length, 2);
assert.equal(targetPlan.steps[0].row.category, 'gem');
assert.equal(targetPlan.steps[0].cumulativeGold, 250);
assert.equal(targetPlan.steps[1].cumulativeGold, 1250);
assert.equal(targetPlan.projectedPower, 5150);
assert.equal(targetPlan.reached, true);

const budgetPlan = buildUpgradePlan({
  rows,
  currentPower: 5000,
  budget: 500,
  mode: 'budget',
  costForRow: row => ({ gold: row.expectedCost.expectedGold, silver: 0, remainingOwned: {} })
});
assert.equal(budgetPlan.steps.length, 1);
assert.equal(budgetPlan.cumulativeGold, 250);
assert.equal(budgetPlan.remainingBudget, 250);

const sharedInventoryPlan = buildUpgradePlan({
  rows: [
    { category: 'normalHoning', item: { type: '상의', name: 'A' }, available: true, powerDelta: 10 },
    { category: 'normalHoning', item: { type: '하의', name: 'B' }, available: true, powerDelta: 10 }
  ],
  currentPower: 5000,
  mode: 'all',
  ownedMaterials: { '운명의 파편': 10 },
  costForRow: (_row, inventory) => {
    const result = allocateOwnedMaterials({ '운명의 파편': 10 }, inventory);
    return {
      gold: Number(result.purchasedMaterials['운명의 파편'] || 0) * 10,
      silver: 0,
      remainingOwned: result.remainingOwned,
      ownedUsed: result.ownedUsed
    };
  }
});
assert.equal(sharedInventoryPlan.steps[0].gold, 0);
assert.equal(sharedInventoryPlan.steps[1].gold, 100);
assert.equal(sharedInventoryPlan.steps[1].cumulativeGold, 100);

const scenario = { characterName: '무사브', selectedKeys: ['보석|겁화'], ownedMaterials: { '운명의 파편': 12345 } };
assert.deepEqual(decodeSpecScenario(encodeSpecScenario(scenario)), scenario);

console.log('spec planner tests passed');
