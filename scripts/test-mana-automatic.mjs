import assert from 'node:assert/strict';
import { buildAutomaticManaAnalysis } from '../public/mana-automatic.js';
import { evaluateManaCandidate, minimumSustainableMana, rankManaCandidates } from '../public/mana-recommendation.js';

const knownSkills = ['화염', '낙뢰'].map(name => ({ name, currentTree: true, usesMana: true, manaUsageKnown: true }));
const damageSkills = knownSkills.map(skill => skill.name);
const character = { className: '워로드', kind: 'mixed', resource: '마나·실드 게이지', observedMana: true, maxMana: 800 };
const cycle = { items: knownSkills.map(skill => ({ ...skill, baseCooldownSeconds: 4 })), windowSeconds: 60,
  shareSource: 'combat-analyzer', analyzerMatch: 'ark-grid', mappedShare: 1,
  shareRows: damageSkills.map(name => ({ targetNames: [name] })) };
const inputs = { duration: 20, maxMana: 800, startMana: 800, recoveryMana: 20,
  firstRecovery: 1, recoveryInterval: 1, reductions: 'product', extraRecovery: [],
  skills: damageSkills.map((name, index) => ({ name, first: index, interval: 5, cost: index ? 70 : 90 })) };
const verified = { verifiedAt: '2026-11-19', inputs,
  support: { bard: { receivedTimes: [1], manualRestore: 28 }, artist: { receivedTimes: [2], manualRestore: 100 } } };
const base = { character, cycle, knownSkills, damageSkills };
const analysis = changes => buildAutomaticManaAnalysis({ ...base, ...changes });

for (const support of ['none', 'bard', 'artist', 'paladin', 'valkyrie']) {
  for (const maxMana of [null, 800]) {
    const automatic = analysis({ character: { ...character, maxMana }, support, duration: 300 });
    assert.equal(automatic.scenario, undefined);
    assert.equal(automatic.threshold, undefined);
    assert.match(automatic.reason, /자연 회복량·틱 및 실제 시전 조건 미확인/);
    assert.equal(automatic.reason.includes('최대 마나 미확인'), maxMana == null);
  }
}
assert.match(analysis({ cycle: { ...cycle, appliedCycleLinkCount: 1 }, verified }).reason, /스킬 연동/);
assert.match(analysis({ cycle: { ...cycle, shareRows: [{ targetNames: damageSkills }] }, verified }).reason, /피해 지분 미확인/);
assert.equal(analysis({ verified }).origin, 'verified');
assert.equal(analysis({ verified, support: 'bard' }).origin, 'verified');
assert.deepEqual(analysis({ verified, support: 'artist' }).scenario.environment.instant, [{ time: 2, amount: 100 }]);
assert.match(analysis({ verified, support: 'artist', supportVariant: 'level-7' }).reason, /실제 적용 시각/);
assert.match(analysis({ verified, support: 'paladin' }).reason, /실제 적용 시각/);
assert.match(analysis({ verified, duration: 300 }).reason, /실제 시전 조건 미확인/);
const prepared300 = analysis({ verified: { ...verified, inputs: { ...inputs, duration: 300 } }, duration: 300 });
assert.equal(prepared300.origin, 'profile-input');
assert.equal(prepared300.scenario.observation, null);

// The normalized-capacity solver still agrees with a synthetic, explicitly specified no-recovery model.
const scenario = analysis({ verified }).scenario;
assert.equal(minimumSustainableMana({ ...scenario, normalizedCapacity: true, recovery: [] }), 4 * 160);
assert.ok(Math.abs(minimumSustainableMana({ ...scenario, normalizedCapacity: true, recovery: [] },
  { manaFurnace: { maxManaCostPercent: 2 } }) - 640 / (1 - 0.16)) < 1e-8);

const variants = [1.27, 1.25, 1.24, 1.23, 1.22, 1.21].map(value => ({
  recValue: value, calc: { result: { value, skillExperiment: { items: damageSkills.map(name => ({ name, share: 0.5, value })) } } }
}));
for (const variant of variants) variant.mana = evaluateManaCandidate(scenario, {}, variant.calc.result);
const ranks = rankManaCandidates(variants, true);
assert.deepEqual(ranks.evaluated.slice(0, 5), ranks.theoretical.slice(0, 5));
console.log('missing natural recovery is never synthesized; verified-profile and theory regressions passed');
