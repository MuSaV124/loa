import assert from 'node:assert/strict';
import handler, { loadMarketPriceSection, T4_MATERIAL_GROUPS } from '../api/market-prices.js';
import { allocateArmguardLimitBreaks, armguardHoningRowsBetween } from '../public/armguard-honing.js';
import { calculateHoningMaterialCost, goldEfficiency } from '../public/honing-cost.js';
import { normalHoningAttemptDistribution, normalHoningOutcome } from '../public/honing-probability.js';
import { matchesMaterialName, materialPurchaser, materialQuote } from '../public/material-quotes.js';
import { buildUpgradePlan } from '../public/spec-planner.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
const quote = (name, id, price, bundleCount = 1) => ({ name, id, price, bundleCount });
const small = '운명의 파편 주머니(소)';
const middle = '운명의 파편 주머니(중)';
const large = '운명의 파편 주머니(대)';
const shard = '운명의 파편';
const stock = new Map([
  [small, quote(small, 66130141, 52)],
  [middle, quote(middle, 66130142, 70)],
  [large, quote(large, 66130143, 100)],
  ['돌', quote('돌', 10, 51, 100)]
]);
assert.ok(matchesMaterialName('상급 아비도스 융화 재료', '상급 아비도스 융화제'));
assert.ok(matchesMaterialName('야금술 : 전율 [16–19]', '야금술 : 전율 [16-19]'));
assert.ok(!matchesMaterialName('위대한 운명의 돌파석', '운명의 돌파석'));
assert.ok(!matchesMaterialName('운명의 파괴석 결정', '운명의 파괴석'));
assert.ok(!matchesMaterialName(small, middle));
assert.ok(!matchesMaterialName('야금술 : 전율 [12-15]', '야금술 : 전율 [16-19]'));
assert.equal(materialQuote(quote('운명의 돌파석', 66110226, 37)), null);
assert.equal(materialQuote(quote('돌', 10, 51, null)), null);
assert.equal(materialPurchaser(stock, '돌').cost(101), 102);
assert.equal(materialPurchaser(stock, shard).cost(4000), 140);
assert.equal(materialPurchaser(stock, shard).cost(5000), 170);

const outcomes = [{ attempts: 1, probability: .5 }, { attempts: 2, probability: .5 }];
const stage = { fixed: { '골드': 8, [shard]: 1000 }, perAttempt: { '골드': 100, '돌': 60, [shard]: 1500 }, outcomes };
const options = { ownedMaterials: { '돌': 75, [shard]: 500 } };
const single = calculateHoningMaterialCost([stage], stock, options);
// Outcomes: 108+70 G and 208+51+140 G.
near(single.totalGold, 288.5);
near(single.rows.find(row => row.name === '돌').ownedUsed, 67.5);
assert.equal(single.complete, true);
assert.deepEqual(calculateHoningMaterialCost([stage], stock, options), single);
const multi = calculateHoningMaterialCost([stage, stage], stock, options);
// Four equally likely combinations, with shared inventory and whole pouches.
const expected = [2, 3, 3, 4].reduce((sum, n) => sum + (
  16 + 100 * n + [51, 102, 102][n - 2] + [170, 200, 270][n - 2]
) / 4, 0);
near(multi.totalGold, expected);
assert.ok(multi.totalGold !== single.totalGold * 2);
const changed = new Map(stock).set('돌', quote('돌', 10, 91, 100));
near(calculateHoningMaterialCost([stage], changed, options).totalGold - single.totalGold, 20);
assert.equal(calculateHoningMaterialCost([stage], new Map(), options).complete, false);
assert.equal(calculateHoningMaterialCost([stage], new Map(), { ownedMaterials: { '돌': 120, [shard]: 4000 } }).complete, true);
const bound = calculateHoningMaterialCost([stage], stock, { ...options, boundOnly: new Set(['돌']) });
assert.equal(bound.complete, false);
near(bound.rows.find(row => row.name === '돌').shortageProbability, .5);
assert.deepEqual(allocateArmguardLimitBreaks(15, 16, { '사령의 잔영': 201, '죽음의 손': 20 }, '전설'), {
  remainingOwned: { '사령의 잔영': 0, '죽음의 손': 0 }, shortages: []
});
assert.deepEqual(allocateArmguardLimitBreaks(15, 16, {}, '전설').shortages, [15]);
assert.deepEqual(allocateArmguardLimitBreaks(15, 16, {}, '유물').shortages, []);
assert.deepEqual(allocateArmguardLimitBreaks(10, 21, { '죽음의 손': 369 }).shortages, [20]);

const armguard16 = armguardHoningRowsBetween(15, 16)[0];
assert.equal(armguard16.ratePercent, 3);
assert.equal(armguard16.growthMaterials[shard], 328000);
assert.equal(armguard16.attemptMaterials['골드'], 9280);
const pmf = normalHoningAttemptDistribution(3);
near(pmf[0].probability, .03);
near(pmf[1].probability, .97 * .033);
near(pmf.reduce((sum, outcome) => sum + outcome.probability, 0), 1);
const pityIndex = 11 + Math.ceil((100 - (3 + 6) / 2 * 11 * .46511) / (6 * .46511));
assert.equal(pmf.at(-1).attempts, pityIndex + 1);
assert.equal(pmf.at(-1).pity, true);
near(pmf.at(-1).probability, Array.from({ length: pityIndex }, (_, n) => 1 - Math.min(6, 3 + .3 * n) / 100)
  .reduce((acc, factor) => acc * factor, 1));
assert.deepEqual(normalHoningOutcome(100), { pityAttempts: 1, expectedAttempts: 1, pityProbability: 0 });
assert.deepEqual(normalHoningAttemptDistribution(0), []);

const armguard = armguardHoningRowsBetween(0, 25).map(row => ({
  fixed: row.growthMaterials, perAttempt: row.attemptMaterials, outcomes: normalHoningAttemptDistribution(row.ratePercent)
}));
const full = calculateHoningMaterialCost(armguard, stock);
assert.ok(Number.isFinite(full.totalGold) && full.totalGold > 0);
near(full.fixedGold, armguard.reduce((sum, row) => sum + row.outcomes.reduce((subtotal, outcome) =>
  subtotal + row.perAttempt['골드'] * outcome.attempts * outcome.probability, 0), 0));
assert.deepEqual(goldEfficiency(200000, 2), { goldPerPercent: 100000, percentPer100k: 1 });
const ranking = [single.totalGold, single.totalGold + 20].map(cost => goldEfficiency(cost, 1.5).percentPer100k);
assert.ok(ranking[0] > ranking[1]);
assert.equal(goldEfficiency(0, 1).percentPer100k, 0);
assert.equal(buildUpgradePlan({
  rows: [{ available: true, powerDelta: 50, item: { name: 'A' } }], currentPower: 100, targetPower: 150,
  costForRow: () => ({ complete: false, gold: 0 })
}).steps.length, 0);

const originalFetch = globalThis.fetch;
const realKey = process.env.LOSTARK_API_KEY;
const wireRow = (Name, Id, CurrentMinPrice, BundleCount = 1, extra = {}) => ({ Name, Id, CurrentMinPrice, BundleCount, ...extra });
const json = (data, init = {}) => Response.json(data, init);
try {
  process.env.LOSTARK_API_KEY = 'market-test-success';
  let calls = 0;
  let optionCalls = 0;
  globalThis.fetch = async (url, init) => {
    if (url.endsWith('/markets/options')) {
      optionCalls += 1;
      assert.equal(init.method, 'GET');
      return json({ Categories: [{ Code: 50000, CodeName: '강화 재료',
        Subs: [{ Code: 50010, CodeName: '아크 그리드 재료' }] }] });
    }
    assert.match(url, /\/markets\/items$/);
    calls += 1;
    const { ItemName, Sort, CategoryCode } = JSON.parse(init.body);
    assert.equal(Sort, 'CURRENT_MIN_PRICE');
    assert.equal(CategoryCode, /(?:질서|혼돈)의 젬/.test(ItemName) ? 50010 : 50000);
    const data = {
      '운명의 돌파석': [wireRow('위대한 운명의 돌파석', 66110226, 3), wireRow(ItemName, 66110225, 12)],
      '운명의 파괴석': [wireRow(ItemName, 66102006, 152, 100), wireRow('운명의 파괴석 결정', 66102007, 20, 100)],
      '운명의 수호석': [wireRow(ItemName, 66102106, 0, 100, { RecentPrice: 31, MinPrice: 33 })],
      '아비도스 융화 재료': [wireRow(ItemName, 6861012, 192)],
      '질서의 젬 : 안정': [wireRow(ItemName, 67400003, 8111, 1, { Grade: '영웅' })]
    };
    return json({ Items: data[ItemName] || null });
  };
  const [first, joined] = await Promise.all([loadMarketPriceSection('t4Materials', { force: '1' }), loadMarketPriceSection('t4Materials', { force: '1' })]);
  assert.equal(joined.joinedInflight, true);
  const item = name => first.items.find(row => row.requestedName === name);
  assert.equal(item('운명의 돌파석').id, 66110225);
  assert.equal(item('운명의 파괴석').unitPrice, 1.52);
  assert.equal(item('운명의 수호석').missing, true);
  assert.equal(item('아비도스 융화제').id, 6861012);
  assert.equal(item('질서의 젬 : 안정').price, 8111);
  assert.equal(first.items.length, T4_MATERIAL_GROUPS.flatMap(group => group.items).length);
  assert.ok(calls <= first.items.length * 2);
  assert.equal(optionCalls, 1);

  process.env.LOSTARK_API_KEY = 'market-test-throttled';
  calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return json({}, { status: 429, headers: { 'Retry-After': '50' } });
  };
  const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ query: { mode: 't4Materials', force: '1' } }, response);
  assert.equal(response.code, 429);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.ok(Number(response.headers['Retry-After']) > 0);
  assert.equal(response.body.ok, false);
  assert.ok(calls <= 8);
  const previousCalls = calls;
  await assert.rejects(loadMarketPriceSection('t4Materials', { force: '1' }), { statusCode: 429 });
  assert.equal(calls, previousCalls);
} finally {
  globalThis.fetch = originalFetch;
  if (realKey == null) delete process.env.LOSTARK_API_KEY;
  else process.env.LOSTARK_API_KEY = realKey;
}

console.log('honing quote, probability, inventory, bundle, ranking and market API tests passed');
