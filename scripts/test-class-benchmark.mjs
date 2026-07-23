import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  benchmarkKillSeconds,
  findClassBenchmark,
  lumerusKillSeconds,
  normalizeBenchmarkText
} from '../public/class-benchmark.js';

assert.equal(normalizeBenchmarkText('극의 : 체술'), '극의체술');
assert.equal(lumerusKillSeconds({ combatPower: 5000, ratio: 1, hp: 100_000_000_000 }), 200);
assert.equal(lumerusKillSeconds({ combatPower: 5000, ratio: 1.25, hp: 100_000_000_000 }), 160);
assert.equal(lumerusKillSeconds({ combatPower: 0, ratio: 1 }), null);

const fixture = {
  benchmark: { combatPower: 5000, lumerusHp: 100_000_000_000 },
  classes: [
    { className: '브레이커', ratio: { representative: 1.2 } },
    { className: '환수사', aliases: ['Wildsoul'], ratio: { representative: 0.9 } }
  ]
};
assert.equal(findClassBenchmark(fixture, { CharacterClassName: '브레이커' })?.className, '브레이커');
assert.equal(findClassBenchmark(fixture, { className: 'wildsoul' })?.className, '환수사');
assert.ok(Math.abs(benchmarkKillSeconds(fixture, fixture.classes[0]) - 166.6666667) < 0.0001);

const data = JSON.parse(fs.readFileSync(new URL('../public/class-benchmarks.json', import.meta.url), 'utf8'));
assert.equal(data.classes.length, 28);
assert.deepEqual(data.excludedClasses, ['바드', '도화가']);
for (const row of data.classes) {
  assert.equal(row.cores.length, 3, `${row.className}: 코어 3개`);
  assert.equal(new Set(row.cores.map(core => core.slot)).size, 3, `${row.className}: 해/달/별 슬롯`);
  assert.ok(Number(row.ratio?.representative) > 0, `${row.className}: 대표 배율`);
  assert.ok(benchmarkKillSeconds(data, row) > 0, `${row.className}: 처치 시간`);
}

console.log('class benchmark tests passed');
