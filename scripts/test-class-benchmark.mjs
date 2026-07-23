import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  benchmarkKillSeconds,
  findClassBenchmark,
  formatBenchmarkRange,
  lumerusKillSeconds,
  normalizeBenchmarkText,
  sortedBenchmarkCores
} from '../public/class-benchmark.js';

assert.equal(normalizeBenchmarkText('극의 : 체술'), '극의체술');
assert.equal(lumerusKillSeconds({ combatPower: 5000, ratio: 1, hp: 100_000_000_000 }), 200);
assert.equal(lumerusKillSeconds({ combatPower: 5000, ratio: 1.25, hp: 100_000_000_000 }), 160);
assert.equal(lumerusKillSeconds({ combatPower: 0, ratio: 1 }), null);
assert.deepEqual(
  sortedBenchmarkCores([{ slot: '별' }, { slot: '해' }, { slot: '달' }]).map(core => core.slot),
  ['해', '달', '별']
);
assert.equal(formatBenchmarkRange({ representative: 1.165, min: 1.1, max: 1.23 }), '1.100–1.230배');
assert.equal(formatBenchmarkRange({ representative: 1 }), '1.000배');
assert.equal(formatBenchmarkRange(null), '');

const fixture = {
  benchmark: { combatPower: 5000, lumerusHp: 100_000_000_000 },
  classes: [
    { className: '브레이커', builds: [{ engraving: '권왕파천무', ratio: { representative: 1.2 } }] },
    { className: '환수사', aliases: ['Wildsoul'], builds: [{ engraving: '야성', ratio: { representative: 0.9 } }] }
  ]
};
assert.equal(findClassBenchmark(fixture, { CharacterClassName: '브레이커' })?.className, '브레이커');
assert.equal(findClassBenchmark(fixture, { className: 'wildsoul' })?.className, '환수사');
assert.ok(Math.abs(benchmarkKillSeconds(fixture, fixture.classes[0].builds[0]) - 166.6666667) < 0.0001);

const data = JSON.parse(fs.readFileSync(new URL('../public/class-benchmarks.json', import.meta.url), 'utf8'));
assert.equal(data.version, 2);
assert.equal(data.classes.length, 28);
assert.deepEqual(data.excludedClasses, ['바드', '도화가']);
assert.equal(data.classes.reduce((sum, row) => sum + row.builds.length, 0), 54);
assert.deepEqual(
  [...new Set(data.classes.map(row => row.group))],
  ['전사', '무도가', '헌터', '마법사', '암살자', '스페셜리스트', '오리지널']
);
for (const group of [...new Set(data.classes.map(row => row.group))]) {
  const classNames = data.classes.filter(row => row.group === group).map(row => row.className);
  assert.deepEqual(classNames, [...classNames].sort((a, b) => a.localeCompare(b, 'ko')), `${group}: 가나다순`);
}
const dreadRoar = data.classes.find(row => row.className === '가디언나이트')?.builds.find(build => build.engraving === '드레드 로어');
const asura = data.classes.find(row => row.className === '브레이커')?.builds.find(build => build.engraving === '수라의 길');
assert.equal(dreadRoar?.combination, '232');
assert.equal(asura?.combination, '322');
for (const row of data.classes) {
  assert.ok(row.builds.length >= 1, `${row.className}: 직업각인`);
  for (const build of row.builds) {
    if (!build.cores.length) {
      assert.equal(build.engraving, '핸드거너');
      continue;
    }
    assert.equal(build.cores.length, 3, `${row.className} ${build.engraving}: 코어 3개`);
    assert.deepEqual(build.cores.map(core => core.slot), ['해', '달', '별'], `${row.className} ${build.engraving}: 해·달·별 순서`);
    if (build.ratio) {
      assert.ok(Number(build.ratio.representative) > 0, `${row.className} ${build.engraving}: 대표 배율`);
      assert.ok(benchmarkKillSeconds(data, build) > 0, `${row.className} ${build.engraving}: 처치 시간`);
    } else {
      assert.equal(build.status, '자료 부족');
    }
  }
}

console.log('class benchmark tests passed');
