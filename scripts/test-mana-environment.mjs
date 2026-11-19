import assert from 'node:assert/strict';
import characterHandler from '../api/character.js';
import invenHandler from '../api/inven-arkpassive.js';
import { buildCharacterManaProfile, findVerifiedManaProfile, MANA_PROFILE_PATCH, skillManaCostProfile } from '../public/mana-character.js';
import { evaluateManaCandidate, prepareManaScenario, rankManaCandidates } from '../public/mana-recommendation.js';
import { resolveManaEnvironment, SUPPORT_MANA } from '../public/support-mana.js';

const tooltip = cost => JSON.stringify({
  Element_001: { value: { leftText: '재사용 대기시간 12초' } },
  Element_004: { type: 'MultiTextBox', value: `마나 ${cost} 소모|` },
  Element_011: { type: 'SingleTextBox', value: '마나 999 소모' }
});
const reduction = { Name: '마력 조절', IsSelected: true, Level: 5, Tooltip: '마나 소모량이 30.0% 감소한다.' };
const focus = { Name: '집중', Grade: '전설', Tooltip: '[집중] 스킬 사용 시 마나 소모량 40% 감소' };
const raw = { Name: '주력기', Level: 12, Type: '일반', SkillType: 0, Tooltip: tooltip(400), Tripods: [reduction] };
const skill = { name: raw.Name, level: 12, baseCooldownSeconds: 12, manaUsageKnown: true, usesMana: true, manaCost: 400 };
assert.equal(skillManaCostProfile(raw).baseCost, 400);
assert.equal(skillManaCostProfile(raw).preEvolutionCost, 280);
assert.equal(skillManaCostProfile({ ...raw, Tripods: [{ ...reduction, IsSelected: false }], Rune: focus }).preEvolutionCost, 240);
assert.equal(skillManaCostProfile({ ...raw, Rune: focus }).preEvolutionCost, null);
assert.equal(skillManaCostProfile({ ...raw, Tripods: [{ ...reduction, Tooltip: '폭주 중 마나 소모량이 30% 감소한다.' }] }).preEvolutionCost, null);
assert.equal(skillManaCostProfile({ Tooltip: JSON.stringify({ Element_011: { value: '마나 999 소모' } }) }).baseCost, null);

const profile = { CharacterName: '마나 API 표본', CharacterClassName: '데모닉', Stats: [{ Type: '최대 마나', Value: '3,500' }] };
const character = buildCharacterManaProfile(profile, undefined, [raw], [skill]);
assert.equal(character.maxMana, 3500);
assert.equal(character.kind, 'state-dependent');
assert.equal(buildCharacterManaProfile({ ...profile, Stats: [] }).maxMana, null);
assert.equal(buildCharacterManaProfile({ ...profile, CharacterClassName: '기공사' }).kind, 'special');
assert.equal(buildCharacterManaProfile({ ...profile, CharacterClassName: '소서리스' }).kind, 'mixed');
assert.equal(buildCharacterManaProfile({ ...profile, CharacterClassName: '미확인' }, undefined, [raw], [skill]).kind, 'mana-observed');
const measured = { signature: character.signature, patch: MANA_PROFILE_PATCH, verifiedAt: '2026-11-19', expiresAt: '2026-11-30',
  source: 'test fixture', inputs: { duration: 30, maxMana: 3500, startMana: 3500, recoveryMana: 0,
    skills: [{ name: raw.Name, first: 0, interval: 12, cost: 280 }] } };
assert.equal(findVerifiedManaProfile(character), null);
assert.equal(findVerifiedManaProfile(character, [measured], '2026-11-19'), measured);
assert.equal(findVerifiedManaProfile(character, [measured], '2026-12-01'), null);
assert.equal(findVerifiedManaProfile(character, [{ ...measured, patch: '2026-08-01' }], '2026-11-19'), null);
assert.equal(findVerifiedManaProfile(character, [{ ...measured, inputs: { skills: [] } }], '2026-11-19'), null);
const changed = buildCharacterManaProfile(profile, undefined, [{ ...raw, Rune: focus }], [skill]);
assert.equal(findVerifiedManaProfile(changed, [measured], '2026-11-19'), null);

const env = { duration: 28, maxMana: 100, naturalMana: 10 };
for (const id of ['none', 'bard', 'artist', 'paladin', 'valkyrie']) {
  const none = resolveManaEnvironment({ ...env, support: id, uptime: 0 });
  assert.deepEqual(none.instant, []);
  assert.deepEqual(none.windows, []);
  assert.equal(none.baseline, 10);
  assert.equal(none.profile, SUPPORT_MANA[id]);
}
assert.match(resolveManaEnvironment({ ...env, support: 'bard' }).reason, /적용 시각 또는 가동률/);
assert.match(resolveManaEnvironment({ ...env, support: 'artist', uptime: 100 }).reason, /적용 시각/);
assert.match(resolveManaEnvironment({ ...env, support: 'bard', uptime: 100, patch: '2026-12-01' }).reason, /재확인/);
assert.match(resolveManaEnvironment({ ...env, support: 'none', naturalMana: NaN }).reason, /회복량 미확인/);
assert.match(resolveManaEnvironment({ ...env, support: 'none', food: true }).reason, /음식/);
assert.equal(resolveManaEnvironment({ ...env, food: true, foodTick: 16 }).baseline, 16);
assert.equal(resolveManaEnvironment({ ...env, food: false, foodTick: 16 }).baseline, 10);
const bard = resolveManaEnvironment({ ...env, support: 'bard', uptime: 100 });
assert.equal(bard.quality, 'estimate');
assert.deepEqual(bard.windows[0], { start: 0, end: 8, amount: 14 });
assert.equal(bard.windows.at(-1).end, 28);
const times = [2, 15];
const paladin = resolveManaEnvironment({ ...env, support: 'paladin', receivedTimes: times, manualRestore: 19 });
assert.equal(paladin.quality, 'input');
assert.deepEqual(paladin.windows, [{ start: 2, end: 10, amount: 19 }, { start: 15, end: 23, amount: 19 }]);
const valkyrie = resolveManaEnvironment({ ...env, support: 'valkyrie', receivedTimes: times, manualRestore: 19 });
assert.deepEqual(valkyrie.windows, paladin.windows);
const artist = resolveManaEnvironment({ ...env, support: 'artist', receivedTimes: [4, 4, 15], manualRestore: 24 });
assert.deepEqual(artist.instant, [{ time: 4, amount: 24 }, { time: 15, amount: 24 }]);
assert.equal(artist.quality, 'input');
assert.equal(resolveManaEnvironment({ ...env, support: 'artist', receivedTimes: [4] }).quality, 'estimate');

const skillMeta = [{ ...skill, name: 'A' }, { ...skill, name: 'B' }];
const base = {
  duration: env.duration, maxMana: env.maxMana, startMana: 80, recoveryMana: env.naturalMana, firstRecovery: 1, recoveryInterval: 1,
  reductions: 'sum', skills: [{ name: 'A', cost: 36, first: 0, interval: 2 }, { name: 'B', cost: 24, first: 1, interval: 3 }], extraRecovery: []
};
const damage = { value: 2, skillExperiment: { items: [{ name: 'A', share: .75, value: 2 }, { name: 'B', share: .25, value: 2 }] } };
function prepare(input, environment) {
  const result = prepareManaScenario({ ...input, environment }, ['A', 'B'], skillMeta);
  assert.ok(result.scenario, result.reason);
  return result.scenario;
}
const paladinScenario = prepare(base, paladin);
assert.deepEqual(paladinScenario.recovery.filter(event => [1, 2, 9, 10].includes(event.time)),
  [{ time: 1, amount: 10 }, { time: 2, amount: 19 }, { time: 9, amount: 19 }, { time: 10, amount: 10 }]);
const overlap = prepare(base, resolveManaEnvironment({ ...env, support: 'bard', receivedTimes: [0, 2], manualRestore: 20 }));
assert.equal(overlap.recovery.find(event => event.time === 4).amount, 20);
const baseResult = evaluateManaCandidate(prepare(base), {}, damage);
const artistResult = evaluateManaCandidate(prepare(base, artist), {}, damage);
const paladinResult = evaluateManaCandidate(paladinScenario, {}, damage);
assert.ok(baseResult.value < artistResult.value);
assert.ok(baseResult.value < paladinResult.value);
assert.deepEqual(evaluateManaCandidate(prepare(base, valkyrie), {}, damage), paladinResult);
const estimated = { calc: { result: damage }, recValue: 2, mana: evaluateManaCandidate(prepare(base, bard), {}, damage) };
const ranked = rankManaCandidates([estimated], true);
assert.deepEqual(ranked.evaluated, [estimated]);
assert.deepEqual(ranked.unverified, [estimated]);
assert.deepEqual(ranked.practical, []);

for (let index = 0; index < 48; index += 1) {
  const skills = [
    { name: 'A', cost: 11 + index % 42, first: 0, interval: 1 + (index % 8) / 3 },
    { name: 'B', cost: 13 + (17 * index) % 54, first: .2, interval: 1 + (index % 11) / 3 }
  ];
  const scenario = { ...base, skills, recoveryMana: 1 + index % 21, startMana: index };
  const before = evaluateManaCandidate(prepare(scenario), {}, damage);
  const after = evaluateManaCandidate(prepare({ ...scenario, recoveryMana: scenario.recoveryMana + 7 }), {}, damage);
  assert.ok(after.value >= before.value - 1e-8, `monotonic damage ${index}`);
  assert.ok((after.firstShortage ?? Infinity) >= (before.firstShortage ?? Infinity), `monotonic first shortage ${index}`);
}

const realFetch = globalThis.fetch;
const realKey = process.env.LOSTARK_API_KEY;
function mockResponse() {
  return { statusCode: 0, headers: {}, setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
try {
  process.env.LOSTARK_API_KEY = 'test-token';
  let apiCalls = 0;
  globalThis.fetch = async (url, options) => {
    const path = new URL(url).pathname;
    assert.match(url, /^https:\/\/developer-lostark\.game\.onstove\.com\/armories\/characters\//);
    assert.equal(options.headers.Authorization, 'bearer test-token');
    apiCalls += 1;
    const data = path.endsWith('/combat-skills') ? [raw] : path.endsWith('/arkgrid') ? {} : { ArmoryProfile: profile };
    return Response.json(data);
  };
  const query = { name: profile.CharacterName };
  const first = mockResponse();
  await characterHandler({ query }, first);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.apiVersion, '6.1.1');
  assert.equal(first.body.manaProfile.maxMana, 3500);
  assert.equal(first.body.manaProfile.skills[0].preEvolutionCost, 280);
  assert.doesNotMatch(JSON.stringify(first.body), /test-token/);
  const second = mockResponse();
  await characterHandler({ query }, second);
  assert.equal(second.body.cached, true);
  assert.equal(apiCalls, 3);
  globalThis.fetch = async url => {
    assert.match(url, /^https:\/\/lostark\.inven\.co\.kr\/datainfo\/arkpassive\//);
    return new Response('<html>sample</html>');
  };
  const inven = mockResponse();
  await invenHandler({ query: {} }, inven);
  assert.equal(inven.body.ok, true);
  assert.deepEqual(Object.keys(inven.body).sort(), ['htmlLength', 'note', 'ok', 'source', 'status']);
} finally {
  globalThis.fetch = realFetch;
  if (realKey == null) delete process.env.LOSTARK_API_KEY;
  else process.env.LOSTARK_API_KEY = realKey;
}

console.log('character API, support mana, timing, food, data gaps and monotonic recovery tests passed');
