import assert from 'node:assert/strict';
import { ATTACK_SOURCE, ATTACK_STYLE, DIRECTION, attackHitModifiers, classifyAttackStyle, describeAttack, directionRate, engravingAllowedForBuild, engravingScope, isDirectional, mixAttackOutcomes, scopedEngraving } from '../public/combat-attacks.js';
import { expectedHitDamage } from '../public/damage-math.js';
import { extractCombatSkillEffects, parseSkillAttackDirection } from '../public/skill-effects.js';
import { extractArkGridSkillEffects, passiveEffectsForSkill } from '../public/passive-skill-effects.js';

const { HEAD, BACK, NON_DIRECTIONAL, UNKNOWN } = DIRECTION;
const { SKILL, IDENTITY, AWAKENING, SUPER_AWAKENING } = ATTACK_SOURCE;
const attack = (direction, source = SKILL) => ({ direction, source });
const hit = (direction, landed, engravings = [], conditions = [], source = SKILL) =>
  attackHitModifiers(attack(direction, source), landed, engravings, conditions, 8);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, String(actual) + ' !== ' + expected);

assert.deepEqual(hit(BACK, true), { critRate: 10, enemyDamageSources: [{ label: '백어택', value: 5 }, { label: '카드 세트 · 백어택', value: 8 }] });
assert.deepEqual(hit(HEAD, true), { critRate: 0, enemyDamageSources: [{ label: '헤드어택', value: 20 }] });
for (const direction of [NON_DIRECTIONAL, UNKNOWN]) assert.deepEqual(hit(direction, true), { critRate: 0, enemyDamageSources: [] });
assert.deepEqual(hit(HEAD, false), hit(BACK, false));
for (const [direction, expected] of [[HEAD, [1.696, 1.924]], [BACK, [1.696, 1.924]], [UNKNOWN, [1.6, 1.7]], [NON_DIRECTIONAL, [1.6, 1.7]]]) {
  for (const level of [1, 2]) {
    near(expectedHitDamage({ critRate: 50 + 10 * level, critDamage: 200 + (isDirectional(direction) ? 16 * level : 0) }).value, expected[level - 1]);
  }
}
assert.equal(directionRate(''), null);
assert.equal(directionRate(101), null);
assert.equal(directionRate('0'), 0);
assert.equal(directionRate(50), 0.5);
assert.equal(directionRate(100), 1);

const rawHead = { Name: '진 파공권', Level: 14, SkillType: 0, Tooltip: { Element_007: { value: '공격 타입 : 헤드 어택' } } };
assert.equal(parseSkillAttackDirection(rawHead), '헤드');
assert.equal(parseSkillAttackDirection({ Tooltip: { Element_007: { value: '공격 타입 : 헤드 어택, 백 어택' } } }), null);
assert.equal(parseSkillAttackDirection({ ...rawHead, Tripods: [{ IsSelected: true, Tooltip: '헤드 어택을 적용하지 않는다.' }] }), false);
assert.equal(parseSkillAttackDirection({ ...rawHead, Tripods: [{ IsSelected: true, Tooltip: '백 어택으로 변경된다.' }] }), '백');
const tripod = { Name: '혼신의 일격',
  Tooltip: '적에게 주는 피해가 70% 증가한다. 공격이 헤드어택으로 적중 시 적에게 주는 피해가 추가로 30.0% 증가한다.' };
const getTripodSkill = selected => extractCombatSkillEffects([{ ...rawHead, Tripods: [{ ...tripod, IsSelected: selected }] }]).items[0];
const skill = getTripodSkill(true);
assert.equal(skill.effects.skillDamage, 70);
assert.equal(getTripodSkill(false).effects.skillDamage, 0);
const condition = skill.selectedTripods[0].directionalDamage;
assert.deepEqual(condition, [{ name: tripod.Name, direction: HEAD, damage: 30 }]);
function headOutcome(landed) {
  return expectedHitDamage({ skillDamage: 70, ...hit(HEAD, landed, [], condition) });
}
near(headOutcome(false).value, 1.7);
near(headOutcome(true).value, 1.7 * 1.2 * 1.3);
near(mixAttackOutcomes(headOutcome(false), headOutcome(true), 0.5).value, 2.176);

const sura = name => describeAttack({ className: '브레이커', build: '수라의 길', name });
assert.equal(sura('수라결 기본 공격').source, IDENTITY);
assert.equal(sura('수라결 기본 공격').direction, HEAD);
assert.equal(sura('수라결 기본 공격의 연타 공격').parent, '수라결 기본 공격');
assert.equal(sura('수라결 기본 공격의 마지막 타격').direction, UNKNOWN);
assert.equal(describeAttack({ name: '수라결 기본 공격', className: '브레이커', build: '권왕파천무' }).direction, UNKNOWN);
assert.equal(describeAttack({ name: '루인 러쉬', item: { category: '악마 스킬', attackDirection: false } }).source, ATTACK_SOURCE.TRANSFORM);
assert.equal(describeAttack({ name: '코멧 스트라이크', item: { category: '하이퍼 싱크 스킬', attackDirection: false } }).source, ATTACK_SOURCE.TRANSFORM);
assert.equal(describeAttack({ className: '호크아이', name: '실버호크 스킬' }).source, ATTACK_SOURCE.SUMMON);
assert.equal(describeAttack({ className: '블래스터', build: '포격 강화', name: '포격 스킬' }).direction, UNKNOWN);

const headBook = scopedEngraving('결투의 대가', 22.6, '적에게 주는 피해가 <FONT>7.60%</FONT> 증가하며, 헤드어택 성공 시 피해량이 추가로 <FONT>15.00%</FONT> 증가한다.');
const backBook = scopedEngraving('기습의 대가', 22.6, '적에게 주는 피해가 7.60% 증가하며, 백어택 성공 시 피해량이 추가로 15.00% 증가한다.');
const hitMaster = scopedEngraving('타격의 대가', 17);
const engravingDamage = (direction, landed, engraving) => hit(direction, landed, [engraving]).enemyDamageSources
  .filter(entry => entry.label.startsWith(engraving.name)).reduce((factor, entry) => factor * (1 + entry.value / 100), 1);
for (const [book, properDirection, otherDirection] of [[headBook, HEAD, BACK], [backBook, BACK, HEAD]]) {
  near(engravingDamage(properDirection, true, book), 1.076 * 1.15);
  near(engravingDamage(properDirection, false, book), 1.076);
  near(engravingDamage(otherDirection, true, book), 1.076);
  near(engravingDamage(UNKNOWN, true, book), 1.076);
}
near(engravingDamage(NON_DIRECTIONAL, false, hitMaster), 1.17);
assert.equal(engravingDamage(BACK, false, hitMaster), 1);
assert.equal(engravingScope(attack(NON_DIRECTIONAL, AWAKENING), hitMaster), false);
assert.equal(engravingScope(attack(NON_DIRECTIONAL, SUPER_AWAKENING), hitMaster), false);
assert.equal(engravingScope(attack(NON_DIRECTIONAL, IDENTITY), hitMaster), null);
assert.equal(scopedEngraving('결투의 대가', 22.6), null);

const awakening = { name: '천하섬멸옥', item: { skillType: 100, skillTypeKnown: true, attackDirection: false } };
const regular = { name: '일반 스킬', item: { skillType: 0, skillTypeKnown: true, attackDirection: false } };
assert.equal(describeAttack(awakening).source, AWAKENING);
const grid = extractArkGridSkillEffects([{ name: '천하섬멸옥 모의 코어',
  activeTexts: ['천하섬멸옥 스킬의 피해량이 20.0% 증가한다.'] }], { skillItems: [{ name: awakening.name }, { name: regular.name }] });
const scores = (awakeningShare, engravings) => [regular, awakening].reduce((total, unit) => {
  const share = unit === awakening ? awakeningShare : 1 - awakeningShare;
  const effects = passiveEffectsForSkill(grid, unit).effects;
  const modifiers = attackHitModifiers(describeAttack(unit), false, engravings, [], 0);
  return total + share * expectedHitDamage({ skillDamage: effects.skillDamage, enemyDamageSources: modifiers.enemyDamageSources }).value;
}, 0);
near(scores(0, [hitMaster]) / scores(0, []) - 1, 0.17);
near(scores(0.4, [hitMaster]) / scores(0.4, []) - 1, 0.102 / 1.08);
near(scores(1, [hitMaster]), 1.2);

// Selected core tooltips observed for a Soulfist Robust Spirit armory profile.
const soulGrid = extractArkGridSkillEffects([
  { name: '연환섬멸', activeTexts: ['천하섬멸옥의 피해량이 35.0% 증가한다.'] },
  { name: '파천섬결', activeTexts: ["'운명: 섬멸' : 금강선공 상태에서 천하섬멸옥 스킬 피해량이 20.0% 증가한다."] },
  { name: '광멸옥', activeTexts: [
    '천하섬멸옥의 시전 속도가 20.0% 증가하고, 치명타 피해량이 24.0% 증가한다.',
    '천하섬멸옥 스킬 시전 중 받는 모든 피해가 30.0% 감소하고, 피해량이 13.0% 증가한다.',
    '천하섬멸옥, 낙일멸천옥의 재사용 대기시간이 10.0% 감소한다. 천하섬멸옥의 피해량이 8.0% 증가한다.'
  ] }
], { skillItems: [{ name: awakening.name }, { name: regular.name }, { name: '낙일멸천옥' }] });
const soulEffects = passiveEffectsForSkill(soulGrid, awakening).effects;
near(soulEffects.skillDamage, 64.75);
assert.equal(soulEffects.critDamage, 24);
assert.equal(soulGrid.unresolved.some(rule => rule.nodeName === '파천섬결' && rule.activationUnknown), true);
assert.equal(passiveEffectsForSkill(soulGrid, regular).effects.skillDamage, 0);

const weights = [{ weight: 0.6, direction: HEAD }, { weight: 0.4, direction: NON_DIRECTIONAL }];
assert.equal(classifyAttackStyle(weights, ['결투의 대가'], true), ATTACK_STYLE.ENTROPY);
assert.equal(classifyAttackStyle(weights, [], true), ATTACK_STYLE.MIXED);
assert.equal(classifyAttackStyle(weights, [], false), ATTACK_STYLE.UNKNOWN);
assert.equal(classifyAttackStyle([{ weight: 1, direction: NON_DIRECTIONAL }], ['타격의 대가'], true), ATTACK_STYLE.HIT_MASTER);
for (const { name } of [headBook, backBook, hitMaster]) assert.equal(engravingAllowedForBuild(name, ATTACK_STYLE.MIXED), false);
assert.equal(engravingAllowedForBuild('원한', ATTACK_STYLE.MIXED), true);
console.log('attack sources, direction, tripod conditions, engravings, and awakening weights passed');
