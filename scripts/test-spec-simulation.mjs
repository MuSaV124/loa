import assert from 'node:assert/strict';
import { expectedHitDamage } from '../public/damage-math.js';
import { normalHoningOutcome } from '../public/honing-probability.js';
import { buildUpgradePlan } from '../public/spec-planner.js';
import { accessoryDamageInput, accessoryUpgradeHasDamageModel, expectedDamageChangePercent } from '../public/spec-simulation.js';

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

// Independent two-outcome fixtures from the patch. No combat RNG is shipped.
function sampleHits(seed, count, lower, upper, upperChance) {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => random() < upperChance ? upper : lower);
}
const cases = [
  [90, 1, 2.5, 0.9], [100, 2.5, 2.5, 0], [120, 2.5, 4, 0.2],
  [200, 4, 4, 0], [220, 4, 5.5, 0.2], [300, 5.5, 5.5, 0]
];
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected} (±${tolerance})`);
const count = 24000;
for (const [critRate, lower, upper, chance] of cases) {
  const expected = expectedHitDamage({ critRate, critDamage: 250 }).value;
  const tolerance = 6 * (upper - lower) * Math.sqrt(chance * (1 - chance) / count) + 1e-10;
  for (const seed of [17, 119, 20261118]) {
    const hits = sampleHits(seed, count, lower, upper, chance);
    close(mean(hits), expected, tolerance);
    if (critRate === 120) assert.deepEqual(hits, sampleHits(seed, count, lower, upper, chance));
  }
}

const blunt = expectedHitDamage({ critRate: 220, critDamage: 250, critCap: 80, evolutionDamage: 19, overCritToEvolutionDamageRate: 1.4 });
assert.equal(blunt.critical.multiCritChance, 0);
close(blunt.value, (0.2 + 0.8 * 2.5) * 3.15);
close(mean(sampleHits(19, count, 3.15, 2.5 * 3.15, 0.8)), blunt.value, 6 * (1.5 * 3.15) * Math.sqrt(0.8 * 0.2 / count));

const glaivier = expectedHitDamage({ critRate: 220, critDamage: 250, forcedCrit: true, critRateToDamage: 0.6 });
assert.equal(glaivier.critical.multiCritChance, 0);
close(glaivier.value, 2.5 * 2.32);
const beforeBuff = expectedHitDamage({ critRate: 100, critDamage: 250 });
const afterBuff = expectedHitDamage({ critRate: 100, skillCritBonus: 20, critDamage: 250, enemyDamageSources: [5, 10] });
close(afterBuff.value, 2.8 * 1.05 * 1.10);
close(expectedDamageChangePercent(beforeBuff.value, afterBuff.value), 29.36);

const ring = { effects: { critRate: 0.4, critDamage: 1.1 } };
const unchanged = { effects: { enemyDamage: 3 } };
const before = { critRate: 0.4, critDamage: 1.1, items: [ring, unchanged] };
const after = { items: [{ effects: { critRate: 1.55, critDamage: 4 } }, unchanged] };
const accessory = accessoryDamageInput(before, before, after);
close(accessory.critRate, 1.55);
close(accessory.critDamage, 4);
assert.equal(accessory.items[1], unchanged);
assert.equal(before.items[0], ring);
assert.equal(accessoryUpgradeHasDamageModel(after.items[0]), true);
assert.equal(accessoryUpgradeHasDamageModel({ effects: { weaponPowerPercent: 3 } }), false);
close(expectedDamageChangePercent(2.8, 2.8), 0);
assert.equal(expectedDamageChangePercent(0, 2.8), null);

const rows = [
  { item: { name: '반지 상상' }, upgradeGroup: 'ring:0', available: true, powerDelta: 20, expectedCost: { expectedGold: 100 } },
  { item: { name: '반지 상중' }, upgradeGroup: 'ring:0', available: true, powerDelta: 15, expectedCost: { expectedGold: 40 } },
  { item: { name: '다른 반지' }, upgradeGroup: 'ring:1', available: true, powerDelta: 10, expectedCost: { expectedGold: 60 } }
];
for (const mode of ['all', 'budget', 'target']) {
  const plan = buildUpgradePlan({ rows, mode, currentPower: 1000, targetPower: 1100, budget: 200 });
  assert.deepEqual(plan.steps.map(step => step.row.item.name), ['반지 상중', '다른 반지']);
  assert.equal(plan.cumulativeGold, 100);
}

// Existing deterministic honing exposure independently sampled with documented
// failure progression. The guaranteed attempt consumes one more attempt.
const trials = [];
const random = seededRandom(20261119);
for (let run = 0; run < count; run += 1) {
  let artisan = 0;
  for (let attempt = 1; ; attempt += 1) {
    const rate = Math.min(15 + 1.5 * (attempt - 1), 30) + 5;
    if (artisan >= 100 || random() < rate / 100) {
      trials.push(attempt);
      break;
    }
    artisan += rate * 0.46511;
  }
}
const trialMean = mean(trials);
const sampleVariance = mean(trials.map(attempt => (attempt - trialMean) ** 2));
close(trialMean, normalHoningOutcome(15, 5).expectedAttempts, 6 * Math.sqrt(sampleVariance / count));

console.log('spec simulator tests passed (seeded hit and honing samples, shared effects, mutually exclusive upgrades)');
