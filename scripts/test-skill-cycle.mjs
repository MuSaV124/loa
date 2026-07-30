import assert from 'node:assert/strict';
import { extractCombatSkillEffects } from '../public/skill-effects.js';
import { extractProfileCooldownReduction } from '../api/character.js';
import {
  buildSkillCycleModel,
  evaluateEvolutionCooldown,
  parseArkGridCooldownRules,
  skillCooldownSeconds
} from '../public/skill-cycle.js';

const tooltip = (name, cooldown, category = '화염 스킬') => JSON.stringify({
  title: { leftText: `재사용 대기시간 ${cooldown}초`, level: `[${category}]` },
  name
});

const skillEffects = extractCombatSkillEffects([
  {
    Name: '스킬 A', Level: 14, Type: '일반', SkillType: 0, Tooltip: tooltip('스킬 A', 20),
    Rune: {
      Name: '속행', Grade: '전설',
      Tooltip: JSON.stringify({ effect: '스킬 사용 시 일정 확률로 전체 재사용 대기 시간이 16% 감소' })
    },
    Tripods: [{ Tier: 0, Slot: 0, Name: '빠른 준비', IsSelected: true, Tooltip: '재사용 대기시간이 4.0초 감소한다.' }]
  },
  {
    Name: '스킬 B', Level: 10, Type: '일반', SkillType: 0, Tooltip: tooltip('스킬 B', 10, '냉기 스킬'),
    Tripods: [{ Tier: 0, Slot: 0, Name: '회수', IsSelected: true, Tooltip: '마지막 공격 적중 시 재사용 대기시간이 50.0% 감소된다.' }]
  },
  { Name: '미사용 스킬', Level: 1, Type: '일반', SkillType: 0, Tooltip: tooltip('미사용 스킬', 8), Tripods: [] }
]);

assert.equal(skillEffects.cycleItems.length, 2);
assert.equal(skillEffects.items[0].baseCooldownSeconds, 20);
assert.equal(skillEffects.items[0].category, '화염 스킬');
assert.equal(skillEffects.items[0].cooldown.flatSeconds, 4);
assert.equal(skillEffects.items[1].cooldown.percentReduction, 50);
assert.equal(skillEffects.items[0].rune.cooldownPercent, 16);
assert.equal(skillEffects.items[0].rune.stochastic, true);
assert.equal(extractProfileCooldownReduction({ Stats: [{
  Type: '신속',
  Tooltip: ["스킬 재사용 대기시간이 <font color='#99ff99'>33.64%</font> 감소합니다."]
}] }), 33.64);

const gridTexts = [
  '화염 스킬의 재사용 대기시간이 10.0% 감소한다.',
  "'운명' 발동 시 30초 동안 공격 적중 시 화염 스킬의 재사용 대기시간이 0.5초 감소된다."
];
const gridRules = parseArkGridCooldownRules(gridTexts);
assert.equal(gridRules.length, 2);
assert.equal(gridRules[0].appliedDirectly, true);
assert.equal(gridRules[1].conditional, true);

const snapshot = {
  profile: {
    swiftCooldownReduction: 10,
    stats: [{ type: '신속', value: 500 }]
  },
  gems: { items: [{ skillName: '스킬 A', kind: 'cooldown', level: 8, attackBonus: true, valid: true, effectText: '재사용 대기시간 20.00% 감소' }] },
  effects: { arkGrid: { items: [{ activeTexts: gridTexts }] } }
};

const model = buildSkillCycleModel({
  skillEffects,
  snapshot,
  shares: { '스킬 A': 0.6, '아이덴티티': 0.4 },
  identitySkills: ['아이덴티티'],
  analyzerTag: '현재 코어'
});

assert.equal(model.usedSkillCount, 2);
assert.equal(model.mappedSkillCount, 1);
assert.equal(model.mappedSharePercent, 60);
assert.equal(model.identitySharePercent, 40);
assert.equal(model.conditionalGridRules.length, 1);
assert.equal(model.stochasticRuneCount, 1);
assert.equal(model.swiftExact, true);
assert.ok(Math.abs(model.items[0].effectiveCooldownSeconds - 10.368) < 1e-9);

const node = evaluateEvolutionCooldown(model, 10);
const currentCasts = 1 + 54 / 10.368;
const upgradedSeconds = 9.331;
const upgradedCasts = 1 + 54 / upgradedSeconds;
const expectedMultiplier = 1 + 0.6 * (upgradedCasts / currentCasts - 1);
assert.ok(Math.abs(node.multiplier - expectedMultiplier) < 1e-12);
assert.equal(node.affectedSharePercent, 60);
assert.equal(node.modeled, true);
assert.equal(skillCooldownSeconds(model.items[0], 10), 9.331);

const skillBOnly = {
  ...skillEffects,
  items: skillEffects.items.filter(item => item.name === '스킬 B'),
  cycleItems: skillEffects.cycleItems.filter(item => item.name === '스킬 B')
};
const skillBModel = buildSkillCycleModel({ skillEffects: skillBOnly, snapshot, shares: { '스킬 A': 0.6, '스킬 B': 0.4 } });
assert.ok(evaluateEvolutionCooldown(skillBModel, 10).multiplier < evaluateEvolutionCooldown(model, 10).multiplier, '현재 트리에서 쿨감 대상 딜 지분이 바뀌면 추천 점수도 바뀌어야 한다.');

const fallback = evaluateEvolutionCooldown(null, 10, { fallbackSharePercent: 55 });
assert.equal(fallback.modeled, false);
assert.ok(Math.abs(fallback.multiplier - (1 + (1 / 0.9 - 1) * 0.55)) < 1e-12);

const allClasses = [
  '디스트로이어', '발키리', '버서커', '슬레이어', '워로드', '홀리나이트', '기공사', '배틀마스터', '브레이커', '스트라이커',
  '인파이터', '창술사', '건슬링어', '데빌헌터', '블래스터', '스카우터', '호크아이', '바드', '서머너', '소서리스',
  '아르카나', '데모닉', '리퍼', '블레이드', '소울이터', '기상술사', '도화가', '차원술사', '환수사', '가디언나이트'
];
assert.equal(allClasses.length, 30);
for (const className of allClasses) {
  const effects = extractCombatSkillEffects([{ Name: `${className} 표본`, Level: 10, Tooltip: tooltip(className, 18), Tripods: [] }]);
  const classModel = buildSkillCycleModel({ skillEffects: effects, snapshot: { profile: { swiftCooldownReduction: 12 }, gems: { items: [] } } });
  assert.equal(classModel.items.length, 1, `${className} 현재 트리 주기 파싱 실패`);
  assert.equal(classModel.items[0].effectiveCooldownSeconds, 15.84, `${className} 초단위 계산 실패`);
}

console.log('skill cycle tests passed');
