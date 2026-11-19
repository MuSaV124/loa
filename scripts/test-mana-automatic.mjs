import assert from 'node:assert/strict';
import { buildAutomaticManaAnalysis } from '../public/mana-automatic.js';
import { evaluateManaCandidate, minimumSustainableMana, rankManaCandidates } from '../public/mana-recommendation.js';

const knownSkills = ['화염', '낙뢰'].map(name => ({ name, currentTree: true, usesMana: true, manaUsageKnown: true }));
const damageSkills = knownSkills.map(skill => skill.name);
const character = { className: '워로드', kind: 'mixed', resource: '마나·실드 게이지', observedMana: true, maxMana: null,
  skills: [{ name: damageSkills[0], preEvolutionCost: 90 }, { name: damageSkills[1], preEvolutionCost: 70 }] };
const cycle = { items: knownSkills.map(skill => ({ ...skill, baseCooldownSeconds: 4 })), windowSeconds: 60,
  shareSource: 'combat-analyzer', analyzerMatch: 'ark-grid', mappedShare: 1,
  shareRows: damageSkills.map(name => ({ targetNames: [name] })) };
const base = { character, cycle, knownSkills, damageSkills };
const analysis = changes => buildAutomaticManaAnalysis({ ...base, ...changes });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

const capacity = analysis();
assert.equal(capacity.origin, 'capacity');
assert.equal(capacity.scenario, undefined, 'Missing capacity never yields a simulated damage ranking.');
assert.match(capacity.reason, /최대 마나 미확인/);
assert.match(capacity.detail, /2024년 관찰값.*4.44%/);
const threshold = minimumSustainableMana(capacity.threshold);
// At t=56 the fifteenth 160-MP burst follows 56 ticks. The total is the limiting segment.
near(threshold, 15 * 160 / (1 + 56 * 0.0444));
const furnace = { manaFurnace: { maxManaCostPercent: 2 } };
near(minimumSustainableMana(capacity.threshold, furnace), 15 * 160 / (1 + 56 * 0.0444 - 30 * 0.02));
assert.ok(minimumSustainableMana(capacity.alternateThreshold) < threshold);
assert.equal(minimumSustainableMana(capacity.threshold, { manaFurnace: { maxManaCostPercent: 60 } }), Infinity);

const supportAnalyses = Object.fromEntries(['none', 'bard', 'artist', 'paladin', 'valkyrie'].map(support => [support, analysis({ support })]));
const thresholds = Object.fromEntries(Object.entries(supportAnalyses).map(([support, item]) => [support, minimumSustainableMana(item.threshold)]));
assert.deepEqual(supportAnalyses.artist.threshold.environment.instant.map(event => event.time), [0, 30]);
assert.deepEqual(supportAnalyses.bard.threshold.environment.windows.map(({ start, end }) => [start, end]), [[0, 8], [30, 38]]);
assert.equal(supportAnalyses.artist.threshold.environment.windows.length, 0);
assert.equal(supportAnalyses.bard.threshold.environment.instant.length, 0);
assert.ok(thresholds.artist < thresholds.none && thresholds.bard < thresholds.none);
assert.ok(thresholds.paladin < thresholds.bard);
assert.equal(thresholds.paladin, thresholds.valkyrie);
near(minimumSustainableMana(supportAnalyses.artist.withoutSupportThreshold), threshold);

const damage = value => ({ value, skillExperiment: { items: [
  { name: damageSkills[0], share: 0.75, value }, { name: damageSkills[1], share: 0.25, value }
] } });
for (const [support, cutoff] of Object.entries(thresholds)) {
  const atCapacity = maxMana => analysis({ support, character: { ...character, maxMana } });
  const upper = atCapacity(Math.ceil(cutoff));
  assert.equal(upper.origin, 'automatic');
  assert.equal(upper.scenario.environment.quality, 'estimate');
  assert.equal(evaluateManaCandidate(upper.scenario, {}, damage(1)).firstShortage, null);
  const lower = atCapacity(Math.ceil(cutoff) - 1);
  assert.notEqual(evaluateManaCandidate(lower.scenario, {}, damage(1)).firstShortage, null);
}

const exactCapacity = { ...character, maxMana: 665 };
assert.match(analysis({ character: { ...character, kind: 'state-dependent' } }).reason, /검증 프로필 없음/);
assert.match(analysis({ character: { ...character, kind: 'special' } }).reason, /검증 프로필 없음/);
assert.match(analysis({ cycle: { ...cycle, appliedCycleLinkCount: 1 } }).reason, /스킬 연동/);
assert.match(analysis({ character: { ...character, skills: character.skills.slice(1) } }).reason, /화염/);
assert.match(analysis({ cycle: { ...cycle, items: cycle.items.slice(1) } }).reason, /화염/);
assert.equal(analysis({ character: exactCapacity, cycle: { ...cycle, analyzerMatch: 'gem-fallback' } }).origin, 'capacity');
assert.equal(analysis({ character: exactCapacity, cycle: { ...cycle, shareRows: [{ targetNames: damageSkills }] } }).origin, 'capacity');

const measured = { verifiedAt: '2026-11-19', inputs: { duration: 20, maxMana: 800, startMana: 800, recoveryMana: 20,
  firstRecovery: 1, recoveryInterval: 1, reductions: 'product', extraRecovery: [],
  skills: damageSkills.map((name, i) => ({ name, first: i, interval: 5, cost: character.skills[i].preEvolutionCost })) },
  support: { bard: { receivedTimes: [1], manualRestore: 28 } } };
assert.equal(analysis({ verified: measured }).origin, 'verified');
assert.equal(analysis({ verified: measured, support: 'bard' }).origin, 'verified');
assert.equal(analysis({ verified: measured, support: 'artist' }).origin, 'automatic');
assert.equal(analysis({ verified: measured, support: 'artist' }).scenario.environment.baseline, 20);

// Synthetic build comparison on a fixed character. Identical recovery without shortages preserves the theory order.
const builds = [
  ['뭉툭한 가시', 1.27, {}], ['마나 용광로', 1.25, furnace], ['가시·금단', 1.24, { manaCostReductions: [20] }],
  ['가시·끝없는 마나', 1.23, { manaCostReductions: [14], manaSkillCooldownReduction: 5 }],
  ['용광로·금단', 1.22, { ...furnace, manaCostReductions: [20] }], ['일반', 1.21, {}]
];
function compare(support, maxMana, alternate = false) {
  const item = analysis({ character: { ...character, maxMana }, support });
  const variants = builds.map(([name, value, stats]) => ({ name, recValue: value, calc: { result: damage(value) },
    mana: evaluateManaCandidate(alternate ? item.alternate : item.scenario, stats, damage(value)) }));
  const ranked = rankManaCandidates(variants, true);
  assert.equal(ranked.practical.length, 0, 'Assumed recovery never produces verified raid results.');
  const top = list => list.slice(0, 5).map(row => row.name);
  return { theory: top(ranked.theoretical), automatic: top(ranked.evaluated) };
}
const noSupport = compare('none', exactCapacity.maxMana);
assert.notDeepEqual(noSupport.automatic, noSupport.theory);
assert.equal(noSupport.automatic[0], '가시·금단');
assert.equal(compare('artist', exactCapacity.maxMana).automatic[0], '뭉툭한 가시');
const enough = compare('none', 2000);
assert.deepEqual(enough.automatic, enough.theory);
assert.deepEqual(compare('artist', 2000).automatic, enough.theory);
if (process.env.LOA_REPORT_TOP5 === '1') console.log(JSON.stringify({ thresholds,
  theory: noSupport.theory, none: noSupport.automatic, bard: compare('bard', exactCapacity.maxMana).automatic,
  artist: compare('artist', exactCapacity.maxMana).automatic, paladin: compare('paladin', exactCapacity.maxMana).automatic,
  valkyrie: compare('valkyrie', exactCapacity.maxMana).automatic, alternative: compare('none', exactCapacity.maxMana, true).automatic }, null, 2));

console.log('automatic mana scenario and recommendation tests passed');
