import assert from 'node:assert/strict';
import { prepareManaScenario, evaluateManaRotation, forecastManaDamage, manaFurnaceDamage } from '../public/mana-recommendation.js';
import { skillManaCostProfile } from '../public/mana-character.js';
import { parseSkillManaUsage } from '../public/skill-effects.js';
import { resolveManaEnvironment } from '../public/support-mana.js';

const actors = [
  { name: 'A', first: 0, interval: 4, cost: 40, fixedInterval: true },
  { name: 'B', first: 1, interval: 6, cost: 20, fixedInterval: true }
];
const known = rows => rows.map(row => ({ name: row.name, currentTree: true, usesMana: true, manaUsageKnown: true, ...row.metadata }));
const base = { analysisOnly: true, strict: true, duration: 12, maxMana: 100, startMana: 40, recoveryMana: 0 };
const prepare = (input, skills = actors, damageNames = skills.map(row => row.name)) => {
  const result = prepareManaScenario({ ...base, ...input, skills }, damageNames, known(skills));
  assert.ok(result.scenario, result.reason);
  return result.scenario;
};

// Manually enumerated reference: intents A0 B1 A5 B7 A9; actual A0 B2 A6 B8.
const scenario = prepare({ downtime: [{ start: 3, end: 5 }], extraRecovery: [{ time: 2, amount: 25 }, { time: 6, amount: 35 }, { time: 8, amount: 50 }] });
const result = evaluateManaRotation(scenario, { cooldownReduction: 40 });
assert.deepEqual(result.trace.filter(event => event.kind === 'cast').map(({ time, mana, skill }) => [time, mana, skill]),
  [[0, 0, 'A'], [2, 5, 'B'], [6, 0, 'A'], [8, 30, 'B']]);
assert.deepEqual(result.shortages.map(({ start, end }) => [start, end]), [[1, 2], [5, 6], [10, 12]]);
assert.deepEqual(result.skillCasts.map(row => [row.name, row.interval, row.actualInterval, row.plannedCasts, row.casts, row.delayed]),
  [['A', 4, 6, 3, 2, 1], ['B', 6, 6, 2, 2, 2]]);
assert.equal(result.shortageTime, 4);
assert.equal(result.lostCasts, 1);
assert.equal(result.effectiveRecovery, 110);
assert.equal(result.consumedMana, 120);
assert.equal(result.endMana, 30);
assert.ok(Math.abs(result.averageDepletion - 9.6) < 1e-9);
const damage = forecastManaDamage(scenario, result, { skillExperiment: { items: [{ name: 'A', share: 0.75, value: 2 }, { name: 'B', share: 0.25, value: 2 }] } });
assert.deepEqual([damage.ideal, damage.actual, damage.lossPercent], [2, 1.5, 25]);

// Timing order affects cap loss. After-cast also retries at the same instant when that tick is needed.
const single = [{ name: 'A', first: 0, interval: 12, cost: 40 }];
const tie = { startMana: 90, extraRecovery: [{ time: 0, amount: 45 }] };
assert.equal(evaluateManaRotation(prepare(tie, single)).endMana, 60);
assert.equal(evaluateManaRotation(prepare({ ...tie, recoveryOrder: 'after-cast' }, single)).endMana, 95);
const rescued = evaluateManaRotation(prepare({ ...tie, startMana: 5, recoveryOrder: 'after-cast' }, single));
assert.deepEqual([rescued.firstShortage, rescued.shortageTime, rescued.lostCasts, rescued.endMana], [0, 0, 0, 10]);

// Skill windows and downtime require the full cast to fit. A hit count does not multiply mana cost.
const caster = [{ name: 'A', first: 1, interval: 7, cost: 40, castTime: 2, aftercast: 1, metadata: { type: '캐스팅 스킬' },
  activeWindows: [{ start: 0, end: 8 }, { start: 9, end: 12 }] }];
const resumed = evaluateManaRotation(prepare({ downtime: [{ start: 2, end: 5 }], startMana: 100 }, caster));
assert.deepEqual(resumed.trace.filter(event => event.kind === 'cast').map(event => event.time), [7]);
assert.equal(resumed.consumedMana, 40);
const replay = evaluateManaRotation(prepare({ startMana: 100 }, [{ ...caster[0], castStarts: [0, 6, 10] }]));
assert.deepEqual(replay.trace.filter(event => event.kind === 'cast').map(event => event.time), [2, 12]);
assert.equal(replay.unavailable.length, 1);

const furnace = { maxManaCostPercent: 2, damagePerTenMana: 0.5, maxEvolutionDamage: 24 };
const costCheck = [{ ...single[0], cost: 16 }];
const effects = { manaFurnace: furnace, manaCostReductions: [20, 10] };
assert.equal(evaluateManaRotation(prepare({}, costCheck), effects).reason.includes('중첩'), true);
assert.ok(Math.abs(evaluateManaRotation(prepare({ reductions: 'product' }, costCheck), effects).consumedMana - 13.52) < 1e-9);
assert.ok(Math.abs(evaluateManaRotation(prepare({ reductions: 'sum' }, costCheck), effects).consumedMana - 13.2) < 1e-9);
assert.match(evaluateManaRotation(prepare({}, [{ ...single[0], cost: 0 }]), effects).reason, /마나 무료/);
assert.deepEqual(manaFurnaceDamage(furnace, { manaUsageKnown: true, usesMana: true, manaCost: 500, freeManaSkill: true }), { damage: 0, known: false });
assert.deepEqual(manaFurnaceDamage(furnace, { manaUsageKnown: true, usesMana: true, manaCost: 500 }), { damage: 24, known: true });
const artist = { support: 'artist', duration: 12, maxMana: 1000, naturalMana: 0, receivedTimes: [1, 1] };
assert.equal(resolveManaEnvironment({ ...artist, variant: 'level-7' }).instant[0].amount, 220);
assert.deepEqual(resolveManaEnvironment({ ...artist, variant: 'level-14-tripod' }).instant, [{ time: 1, amount: 370 }]);
assert.equal(resolveManaEnvironment({ ...artist, variant: 'level-14-tripod', manualRestore: 300 }).instant[0].amount, 300);

for (const duration of [60, 120, 180, 300, 111.5, 600]) {
  const forecast = evaluateManaRotation(prepare({ duration, startMana: 100, recoveryInterval: 1, firstRecovery: 1, recoveryMana: 30 },
    [{ ...single[0], interval: 10, cost: 20 }]));
  assert.equal(forecast.skillCasts[0].casts, Math.ceil(duration / 10));
  assert.equal(forecast.lostCasts, 0);
  assert.equal(forecast.endMana, 100);
}

const tooltip = text => JSON.stringify({ Element_004: { value: text }, Element_008: { value: '마나 999 소모' } });
for (const text of ['버블 2 소모|재사용 대기시간 12초', '엠버레스의 기운 3 소모, 소켓 1 잠금|재사용 대기시간 16초']) {
  assert.deepEqual(parseSkillManaUsage(tooltip(text)), { manaUsageKnown: true, usesMana: false, manaCost: 0 });
}
assert.deepEqual(parseSkillManaUsage(tooltip('적중 시 대상에게 마나를 돌려준다')), { manaUsageKnown: false, usesMana: false, manaCost: 0 });
for (const [wording, cost] of [
  ['마나 소모가 50.0% 감소하고, 스킬 사용 시 재사용 대기시간이 8.0 초 감소한다.', 50],
  ['시전 시 마나 소모량이 67.0% 감소한다.', 33],
  ['마나 소모량이 30.0% 증가하지만, 적에게 주는 피해가 170.0% 증가한다.', 130],
  ['스킬 발동 시 마나를 소모하지 않는다.', 0],
  ['적중할 때마다 마나 소모량이 50.0% 감소한다.', null]
]) {
  const tripod = { Name: '표본', IsSelected: true, Tooltip: wording };
  const profile = skillManaCostProfile({ Tooltip: tooltip('마나 100 소모'), Tripods: [tripod] });
  if (cost == null) assert.equal(profile.preEvolutionCost, null);
  else assert.ok(profile.preEvolutionCost != null && Math.abs(profile.preEvolutionCost - cost) < 1e-9, wording);
}

console.log('mana timeline, priority, recovery caps, downtime, resource parsing and independent damage checks passed');
