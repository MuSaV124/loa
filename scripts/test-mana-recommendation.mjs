import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expectedHitDamage } from '../public/damage-math.js';
import { maintainedEvolutionDamage } from '../public/evolution-math.js';
import { createManaRanking, evaluateManaCandidate, evaluateManaRotation, manaFurnaceDamage, prepareManaScenario, rankManaCandidates } from '../public/mana-recommendation.js';
import { resolveManaEnvironment } from '../public/support-mana.js';

const { nodes } = JSON.parse(readFileSync(new URL('../public/data/evolution.json', import.meta.url), 'utf8'));
const furnace = nodes.find(node => node.name === '마나 용광로').levels;
const blunt = nodes.find(node => node.name === '뭉툭한 가시').levels;
const standing = nodes.find(node => node.name === '입식 타격가').levels;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const manaSkill = { name: '화염', usesMana: true, manaCost: 200, manaUsageKnown: true };
const nonManaSkill = { name: '비마나 기술', usesMana: false, manaUsageKnown: true };
assert.deepEqual(manaFurnaceDamage(furnace[1].manaFurnace, manaSkill), { damage: 5, known: true });
assert.deepEqual(manaFurnaceDamage(furnace[2].manaFurnace, manaSkill), { damage: 10, known: true });
assert.deepEqual(manaFurnaceDamage(furnace[2].manaFurnace, { ...manaSkill, manaCost: 603 }), { damage: 24, known: true });
assert.deepEqual(manaFurnaceDamage(furnace[2].manaFurnace, nonManaSkill), { damage: 0, known: true });
assert.deepEqual(manaFurnaceDamage(furnace[2].manaFurnace, {}), { damage: 0, known: false });
assert.deepEqual(manaFurnaceDamage(furnace[2].manaFurnace, { ...manaSkill, manaCost: 0 }), { damage: 0, known: false });

for (const [level, base, rate] of [[1, 9.5, 1.2], [2, 19, 1.4]]) {
  for (const [commonCrit, skillCrit] of [[65, 10], [65, 15], [65, 55], [200, 120]]) {
    const hit = expectedHitDamage({
      ...blunt[level], critRate: commonCrit, skillCritBonus: skillCrit, critDamage: 250,
      evolutionDamage: 25 + base, additionalDamage: 13, enemyDamage: 8
    });
    const raw = commonCrit + skillCrit;
    const allEvolution = 25 + base + Math.max(0, raw - 80) * rate;
    near(hit.evo, allEvolution);
    near(hit.value, (1 + Math.min(80, raw) / 100 * 1.5) * (1 + allEvolution / 100) * 1.13 * 1.08);
    assert.equal(hit.critical.multiCritChance, 0);
  }
}

const baseInput = {
  duration: 10, maxMana: 100, startMana: 100, recoveryMana: 0,
  firstRecovery: 2, recoveryInterval: 2, reductions: '',
  skills: [{ name: '화염', first: 0, interval: 2, cost: 40 }, { name: '비마나 기술', first: 0, interval: 3, cost: 0 }],
  extraRecovery: []
};
const names = ['화염', '비마나 기술'];
function scenario(changes = {}) {
  const prepared = prepareManaScenario({ ...baseInput, ...changes }, names, [manaSkill, nonManaSkill]);
  assert.ok(prepared.scenario, prepared.reason);
  return prepared.scenario;
}
const damage = {
  value: 2,
  skillExperiment: { items: [{ name: '화염', share: .75, value: 2 }, { name: '비마나 기술', share: .25, value: 2 }] }
};
const empty = evaluateManaCandidate(scenario(), {}, damage);
near(empty.value, 1.1);
assert.equal(empty.firstShortage, 4);
assert.deepEqual(empty.delayedSkills.map(({ name, lostCasts }) => ({ name, lostCasts })), [{ name: '화염', lostCasts: 3 }]);
const saved = evaluateManaCandidate(scenario(), { manaCostReductions: [20] }, damage);
near(saved.value, 1.4);
assert.equal(saved.firstShortage, 6);
const shortStart = evaluateManaCandidate(scenario({ startMana: 40 }), furnace[2], damage);
assert.equal(shortStart.firstShortage, 0, '용광로 사용 시 최대 마나의 2%를 별도 차감');
const refill = evaluateManaCandidate(scenario({ recoveryMana: 40 }), furnace[2], damage);
assert.equal(refill.value, damage.value);
assert.equal(refill.firstShortage, null);
assert.deepEqual(refill.delayedSkills, []);
const supportRestore = evaluateManaCandidate(scenario({ extraRecovery: [{ time: 5, amount: 100 }] }), {}, damage);
assert.equal(supportRestore.firstShortage, 4);
near(supportRestore.value, 1.7);
assert.ok(supportRestore.delayedSkills[0].wait >= 1);
assert.match(evaluateManaCandidate(scenario(), { manaCostReductions: [20, 16] }, damage).reason, /중첩/);
const sumReduction = evaluateManaCandidate(scenario({ startMana: 80, reductions: 'sum' }), { manaCostReductions: [20, 16] }, damage);
const productReduction = evaluateManaCandidate(scenario({ startMana: 80, reductions: 'product' }), { manaCostReductions: [20, 16] }, damage);
assert.equal(sumReduction.firstShortage, 6);
assert.equal(productReduction.firstShortage, 4);
assert.match(evaluateManaCandidate(scenario(), {}, { ...damage, arcanaCardExpectation: {} }).reason, /카드 수급/);
assert.match(prepareManaScenario({ ...baseInput, skills: baseInput.skills.slice(1) }, names, [manaSkill, nonManaSkill]).reason, /조건 누락/);
assert.match(prepareManaScenario({ ...baseInput, maxMana: NaN }, names, [manaSkill, nonManaSkill]).reason, /최대 마나/);

for (const [support, receivedTimes, manualRestore, casts] of [
  ['none', [], undefined, 2], ['bard', [0], 15, 3], ['artist', [5], 60, 4],
  ['paladin', [0], 40, 5], ['valkyrie', [0], 40, 5]
]) {
  const environment = resolveManaEnvironment({ support, duration: 10, maxMana: 100, naturalMana: 0, receivedTimes, manualRestore });
  assert.equal(environment.quality, 'input');
  const run = scenario({ environment });
  // 75% share at 220% crit / 250% crit damage, 25% at 200% / 300%.
  // Both tier-five nodes share the same ordinary evolution bonus and cast schedule.
  for (const [node, expectedManaSkill, expectedOtherSkill] of [
    [blunt[2], 2.2 * 3.40, 2.6 * 3.12], [standing[2], 4.3 * 1.46, 5 * 1.46]
  ]) {
    const stats = { ...node, critRate: 200, evolutionDamage: 25 + maintainedEvolutionDamage(node) };
    const first = expectedHitDamage({ ...stats, skillCritBonus: 20, critDamage: 250 });
    const second = expectedHitDamage({ ...stats, critDamage: 300 });
    near(first.value, expectedManaSkill);
    near(second.value, expectedOtherSkill);
    const skillResult = (other, critInteractionUnverified = false) => {
      const items = [
        { name: names[0], share: .75, value: first.value },
        { name: names[1], share: .25, value: other, critInteractionUnverified }
      ];
      return { value: .75 * first.value + .25 * other, skillExperiment: { items } };
    };
    const result = evaluateManaCandidate(run, stats, skillResult(second.value));
    near(result.value, .75 * expectedManaSkill * casts / 5 + .25 * expectedOtherSkill);
    assert.equal(result.delayedSkills[0]?.lostCasts ?? 0, 5 - casts, support);
    assert.equal(result.firstShortage === null, casts === 5, support);

    const guaranteed = expectedHitDamage({ ...stats, critDamage: 300, forcedCrit: true, critRateToDamage: .6 });
    const hasCap = node.critCap != null;
    const withException = evaluateManaCandidate(run, stats, skillResult(guaranteed.value, hasCap));
    if (hasCap) {
      assert.equal(withException.quality, 'estimate');
      assert.match(withException.assumptions.join(' '), /확정 치명과 뭉가/);
      near(withException.value, .75 * expectedManaSkill * casts / 5 + .25 * guaranteed.value);
    } else {
      near(guaranteed.value, 3 * 2.2 * 1.46);
      near(withException.value, .75 * expectedManaSkill * casts / 5 + .25 * 3 * 2.2 * 1.46);
    }
  }
}

function compareBuilds(critRate, recoveryMana) {
  const run = scenario({ recoveryMana });
  const rows = [
    ['가시', blunt[2]], ['가시 절감', { ...blunt[2], manaCostReductions: [20], evolutionDamage: 12 }],
    ['용광로', furnace[2]], ['용광로 절감', { ...furnace[2], manaCostReductions: [20] }],
    ['일반', { evolutionDamage: 35 }], ['일반 절감', { evolutionDamage: 30, manaCostReductions: [20] }]
  ].map(([name, effects]) => {
    const values = [manaSkill, nonManaSkill].map((skill, index) => ({
      name: skill.name, share: index ? .25 : .75,
      value: expectedHitDamage({ ...effects, critRate, critDamage: 230,
        evolutionDamage: (effects.evolutionDamage || 0) + manaFurnaceDamage(effects.manaFurnace, skill).damage }).value
    }));
    const result = { value: values.reduce((sum, skill) => sum + skill.share * skill.value, 0), skillExperiment: { items: values } };
    return { name, calc: { result }, recValue: result.value, mana: evaluateManaCandidate(run, effects, result) };
  });
  const ranks = rankManaCandidates(rows, true);
  const top = candidates => candidates.slice(0, 5).map(row => row.name);
  return { theory: top(ranks.theoretical), practical: top(ranks.practical), disabled: top(rankManaCandidates(rows, false).theoretical) };
}
for (const crit of [55, 170]) {
  const enough = compareBuilds(crit, 100);
  assert.deepEqual(enough.practical, enough.theory);
  const shortage = compareBuilds(crit, 0);
  assert.notDeepEqual(shortage.practical, shortage.theory);
  assert.deepEqual(shortage.disabled, shortage.theory);
  assert.ok(enough.theory.length === 5 && shortage.practical.length === 5);
  if (process.env.LOA_REPORT_TOP5 === '1') console.log({ crit, enough, shortage });
}
const unverified = { calc: { result: { manaDamageUnverified: true } }, recValue: 100 };
const ranked = rankManaCandidates([unverified], true);
assert.equal(ranked.theoretical.length, 0);
assert.equal(ranked.practical.length, 0);
assert.deepEqual(ranked.unverified, [unverified]);
const sustainable = { calc: { result: {} }, recValue: 4, mana: { firstShortage: null, value: 4 } };
const higherWithDelay = { calc: { result: {} }, recValue: 6, mana: { firstShortage: 1, value: 5 } };
assert.equal(rankManaCandidates([sustainable, higherWithDelay], true).practical[0], higherWithDelay);
const equalWithDelay = { ...higherWithDelay, mana: { ...higherWithDelay.mana, value: 4 } };
assert.equal(rankManaCandidates([equalWithDelay, sustainable], true).practical[0], sustainable);

// Equal cast availability for A/B. Only the skill that actually suffers
// a mana delay loses its share of the interpretation difference.
const withCritAssumption = evaluateManaCandidate(scenario(), {}, {
  ...damage, critHitStackingUnverified: true,
  alternateValue: damage.value + .75,
  skillExperiment: { items: damage.skillExperiment.items.map((row, i) =>
    i === 0 ? { ...row, alternateValue: row.value + 1 } : row) }
});
near(withCritAssumption.value, empty.value);
near(withCritAssumption.alternateValue - withCritAssumption.value,
  .75 * (1 - (empty.delayedSkills[0]?.lostCasts || 0) / 5));
assert.equal(withCritAssumption.quality, 'estimate');
const uncertainClassEffect = evaluateManaCandidate(scenario(), {}, { ...damage, unverifiedClassEffects: true });
near(uncertainClassEffect.value, empty.value);
assert.equal(uncertainClassEffect.quality, 'estimate');
assert.match(uncertainClassEffect.assumptions.join(' '), /직업 효과/);
const firstCritRule = { calc: { result: { alternateValue: 5.1 } }, recValue: 4.8,
  mana: { value: 4.8, alternateValue: 5.1, quality: 'estimate' } };
const fixedCritRule = { calc: { result: { alternateValue: 5 } }, recValue: 5,
  mana: { value: 5, alternateValue: 5, quality: 'input' } };
const variants = rankManaCandidates([firstCritRule, fixedCritRule], true);
assert.deepEqual(variants.evaluated, [fixedCritRule, firstCritRule]);
assert.deepEqual(variants.evaluatedAlternate, [firstCritRule, fixedCritRule]);
assert.deepEqual(variants.theoreticalAlternate, [firstCritRule, fixedCritRule]);
assert.deepEqual(variants.practical, [fixedCritRule]);
assert.ok(variants.unverified.includes(firstCritRule));

// Rank with collisions in each tiebreaker and compare against a full sort.
const rankingSamples = Array.from({ length: 1000 }, (_, i) => ({
  recValue: (i * 7) % 19,
  calc: { result: { alternateValue: (i * 13) % 21, manaDamageUnverified: i % 17 === 0 } },
  mana: i % 13 === 0 ? null : {
    value: (i * 11) % 23, alternateValue: (i * 17) % 27,
    firstShortage: i % 7 === 0 ? 3 : null, quality: i % 5 === 0 ? 'estimate' : 'input'
  }
}));
const fullSort = rankManaCandidates(rankingSamples, true);
const streaming = createManaRanking(true);
rankingSamples.forEach(streaming.add);
for (const key of ['theoretical', 'theoreticalAlternate', 'evaluated', 'evaluatedAlternate', 'unverified']) {
  assert.deepEqual(streaming[key], fullSort[key].slice(0, 5), key);
}
assert.deepEqual(streaming.estimates, fullSort.evaluated.filter(row => row.mana.quality === 'estimate').slice(0, 5));
assert.deepEqual(streaming.estimatesAlternate, fullSort.evaluatedAlternate.filter(row => row.mana.quality === 'estimate').slice(0, 5));
assert.equal(streaming.counts.candidates, rankingSamples.length);
assert.equal(streaming.counts.evaluated, fullSort.evaluated.length);

const strike = { name: '검증 타격', first: 0, interval: 10, cost: 10 };
const known = skill => ({ ...skill, currentTree: true, usesMana: skill.cost !== 0, manaUsageKnown: true });
const rotationInput = { maxMana: 400, startMana: 50, recoveryMana: 0, firstRecovery: 0, recoveryInterval: 1,
  reductions: 'product', skills: [strike], extraRecovery: [] };
function condition(overrides = {}) {
  const input = { ...rotationInput, duration: 300, strict: true, ...overrides };
  const prepared = prepareManaScenario(input, [input.skills[0].name], input.skills.map(known));
  assert.ok(prepared.scenario, prepared.reason);
  return prepared.scenario;
}
const hit = { value: 2, alternateValue: 2.5, skillExperiment: { items: [{ name: strike.name, value: 2, alternateValue: 2.5, share: 1 }] } };
assert.equal(evaluateManaCandidate(condition({ duration: 45, strict: false }), {}, hit).firstShortage, null);
const early = evaluateManaCandidate(condition(), {}, hit);
assert.equal(early.firstShortage, 50);
assert.equal(early.eligible, false);
assert.equal(early.manaDelay, 0);
assert.equal(early.lostCasts, early.shortageCount);

const last = condition({ startMana: 300, skills: [{ ...strike, interval: 1, cost: 1 }] });
const finalFailure = evaluateManaRotation(last);
assert.deepEqual(finalFailure.shortages, [{ time: 300, skill: strike.name, deficit: 1 }]);
assert.equal(finalFailure.skillCasts[0].casts, 300);
assert.equal(finalFailure.skillCasts[0].plannedCasts, 301);
assert.equal(finalFailure.completed, true);
assert.deepEqual(evaluateManaRotation(last, {}, { cache: false }), finalFailure);
const enough300 = condition({ startMana: 301, skills: [{ ...strike, interval: 1, cost: 1 }] });
const passed = evaluateManaCandidate(enough300, {}, hit);
assert.equal(passed.eligible, true);
assert.equal(passed.minMana, 0);
assert.equal(passed.totalDamage, 600);
const assumed = condition({ startMana: 400 });
assert.equal(evaluateManaCandidate(assumed, {}, hit).validation, 'estimate');
assert.equal(evaluateManaCandidate(assumed, {}, hit).eligible, true);

const recoveredAfterMiss = condition({ startMana: 0, skills: [{ ...strike, interval: 100 }], extraRecovery: [{ time: 299, amount: 200 }] });
const positiveEnding = evaluateManaRotation(recoveredAfterMiss);
assert.equal(positiveEnding.firstShortage, 0);
assert.equal(positiveEnding.endMana, 190);
assert.equal(positiveEnding.sustainable, false);
assert.deepEqual(positiveEnding.shortages.map(event => event.time), [0, 100, 200]);

const expires = condition({ startMana: 0, skills: [{ ...strike, interval: 1 }],
  environment: { quality: 'input', windows: [{ start: 0, end: 8, amount: 10 }] } });
assert.equal(evaluateManaRotation(expires).firstShortage, 8);
assert.equal(evaluateManaRotation(expires).extraRecovered, 80);
const lateCast = [{ ...strike, first: 299 }];
const supportOptions = { duration: 300, maxMana: 400, naturalMana: 0 };
const artist300 = resolveManaEnvironment({ ...supportOptions, support: 'artist', receivedTimes: [299], manualRestore: 10 });
assert.equal(evaluateManaRotation(condition({ startMana: 0, skills: lateCast })).sustainable, false);
assert.equal(evaluateManaRotation(condition({ startMana: 0, skills: lateCast, environment: artist300 })).sustainable, true);

const level = (name, lv) => nodes.find(node => node.name === name).levels[lv];
const tierMix = {
  manaCostReductions: [level('끝없는 마나', 2).manaReduction, level('무한한 마력', 2).manaReduction],
  manaSkillCooldownReduction: level('끝없는 마나', 2).manaSkillCooldownReduction + level('무한한 마력', 2).manaSkillCooldownReduction,
  cooldownReduction: level('선각자', 1).cooldownReduction, manaFurnace: furnace[2].manaFurnace
};
const mixed = evaluateManaRotation(condition({ skills: [{ ...strike, cost: 100 }] }), tierMix);
near(mixed.skillCasts[0].cost, 100 * .8 * .84 + 400 * .02);
near(mixed.skillCasts[0].interval, 6.7);

const locked = condition({ skills: [{ ...strike, castTime: 2 }, { ...strike, name: '대기 기술', first: .1, cost: 20 }] });
assert.deepEqual(evaluateManaRotation(locked).shortages.slice(0, 2).map(event => [event.time, event.skill]), [[12, '대기 기술'], [22, '대기 기술']]);
const casting = condition({ startMana: 0, skills: [{ ...strike, type: '캐스팅', castTime: 2, first: 286 }],
  extraRecovery: [{ time: 288, amount: 10 }] });
assert.deepEqual(evaluateManaRotation(casting).shortages, [{ time: 300, skill: strike.name, deficit: 10 }]);
const lateShortage = evaluateManaRotation(condition({ startMana: 0, skills: [{ ...strike, first: 299.99 }],
  extraRecovery: [{ time: 300, amount: 20 }] }));
assert.equal(lateShortage.firstShortage, 299.99);
assert.equal(lateShortage.endMana, 20);
assert.equal(lateShortage.sustainable, false);
const colliding = { startMana: 0, skills: [{ ...strike, first: 300 }], extraRecovery: [{ time: 300, amount: 10 }] };
assert.equal(evaluateManaRotation(condition(colliding)).sustainable, true);
assert.equal(evaluateManaRotation(condition({ ...colliding, recoveryOrder: 'after-cast' })).firstShortage, 300);
const duringCast = condition({ startMana: 0, skills: [{ ...strike, type: '캐스팅 스킬', castTime: 2, first: 298 }],
  extraRecovery: [{ time: 299, amount: 10 }] });
assert.equal(evaluateManaRotation(duringCast).sustainable, true);
const capped = evaluateManaRotation(condition({ startMana: 400, skills: [{ ...strike, first: 300 }],
  extraRecovery: [{ time: 299, amount: 99 }] }));
assert.equal(capped.endMana, 390);
assert.equal(capped.recoveredMana, 0);
assert.equal(capped.discardedRecovery, 99);
const fractional = evaluateManaRotation(condition({ startMana: .3, skills: [{ ...strike, interval: 100, cost: .1,
  activeWindows: [{ start: 0, end: 300 }] }] }));
assert.equal(fractional.sustainable, true);
assert.equal(fractional.minMana, 0);
const release = evaluateManaRotation(condition({ startMana: 10, skills: [
  { ...strike, castTime: 2, aftercast: 1, activeWindows: [{ start: 0, end: 3 }] },
  { ...strike, name: '대기 기술', first: 1, activeWindows: [{ start: 3, end: 4 }] },
  { ...strike, name: '사용 불가', activeWindows: [] }
] }));
assert.deepEqual(release.shortages.map(event => [event.time, event.skill]), [[3, '대기 기술']]);
assert.deepEqual(release.skillCasts.map(skill => skill.plannedCasts), [1, 1, 0]);
const interrupted = evaluateManaRotation(condition({ skills: [{ ...strike, type: '지점', first: 299, castTime: 2 }] }));
assert.equal(interrupted.consumedMana, 0);
const recorded = { startMana: 10, recoveryOrder: 'before-cast', skills: [{ ...strike, castStarts: [0, 300] }],
  extraRecovery: [{ time: 200, amount: 10 }],
  observation: { source: '테스트 기록', duration: 300, startMana: 10, endMana: 0, shortageCount: 0, manaDelay: 0, lostCasts: 0,
    events: [0, 300].map(time => ({ time, skill: strike.name, before: 10, after: 0 })) } };
const measured = evaluateManaCandidate(condition(recorded), {}, hit);
assert.equal(measured.validation, 'measured');
assert.equal(evaluateManaRotation(condition({ ...recorded, observation: { ...recorded.observation, endMana: 1 } })).validation, 'estimate');
assert.equal(evaluateManaRotation(condition({ ...recorded, observation: { ...recorded.observation, shortageCount: 1 } })).validation, 'estimate');
assert.equal(evaluateManaRotation(condition({ ...recorded, environment: { quality: 'estimate' } })).validation, 'estimate');
const blocked = evaluateManaRotation(condition({ ...recorded, skills: [{ ...strike, castStarts: [0, 1] }] }));
assert.equal(blocked.unavailable.length, 1);
assert.equal(blocked.consumedMana, 10);
assert.equal(blocked.sustainable, false);
assert.ok(prepareManaScenario({ ...rotationInput, duration: 300, strict: true }, [strike.name], [known(strike), known({ ...strike, name: '누락 스킬' })]).reason);

const strictRanking = createManaRanking(true);
const invalid = { recValue: 100, mana: { ...early, value: 100 }, calc: { result: hit } };
const stable = { recValue: 2, mana: passed, calc: { result: hit } };
const observed = { recValue: 2, mana: measured, calc: { result: hit } };
[invalid, stable, observed].forEach(strictRanking.add);
assert.deepEqual(strictRanking.sustainable, [stable, observed]);
assert.deepEqual(strictRanking.estimates, [stable]);
assert.deepEqual(strictRanking.measured, [observed]);
assert.deepEqual(strictRanking.shortage, [invalid]);
console.log('mana recommendation tests passed');
