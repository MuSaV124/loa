import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expectedHitDamage } from '../public/damage-math.js';
import { evaluateManaCandidate, manaFurnaceDamage, prepareManaScenario, rankManaCandidates } from '../public/mana-recommendation.js';

const { nodes } = JSON.parse(readFileSync(new URL('../public/data/evolution.json', import.meta.url), 'utf8'));
const furnace = nodes.find(node => node.name === '마나 용광로').levels;
const blunt = nodes.find(node => node.name === '뭉툭한 가시').levels;
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
assert.equal(rankManaCandidates([sustainable, higherWithDelay], true).practical[0], sustainable);
console.log('mana recommendation tests passed');
