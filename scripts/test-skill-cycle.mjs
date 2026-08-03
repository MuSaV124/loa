import assert from 'node:assert/strict';
import { extractCombatSkillEffects } from '../public/skill-effects.js';
import { extractProfileCooldownReduction } from '../api/character.js';
import {
  buildSkillCycleModel,
  evaluateEvolutionCooldown,
  evaluateSkillCastFrequency,
  parseArkGridCycleLinks,
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
const fasterCardDraw = evaluateSkillCastFrequency(model, 20, { referenceReduction: 10 });
const slowerCardDraw = evaluateSkillCastFrequency(model, 0, { referenceReduction: 10 });
assert.ok(fasterCardDraw.multiplier > 1, '기준보다 높은 쿨감은 카드 드로우 횟수를 늘려야 한다.');
assert.ok(slowerCardDraw.multiplier < 1, '기준보다 낮은 쿨감은 카드 드로우 횟수를 줄여야 한다.');
assert.equal(fasterCardDraw.modeled, true);
const fallbackCardDraw = evaluateSkillCastFrequency(null, 14, { referenceReduction: 32 });
assert.ok(Math.abs(fallbackCardDraw.multiplier - 0.68 / 0.86) < 1e-12);

const specificEffects = extractCombatSkillEffects([
  { Name: '일반 공격', Level: 10, Type: '일반', SkillType: 0, Tooltip: tooltip('일반 공격', 20), Tripods: [] },
  { Name: '신성검', Level: 10, Type: '일반', SkillType: 0, Tooltip: tooltip('신성검', 20), Tripods: [] }
]);
const specificModel = buildSkillCycleModel({
  skillEffects: specificEffects,
  snapshot: {
    profile: { swiftCooldownReduction: 0 }, gems: { items: [] },
    arkGrid: { slots: [{ activeTexts: ['신성검의 재사용 대기시간이 3.0초 감소한다.'] }] }
  },
  shares: { '일반 공격': 0.5, '신성검': 0.5 }
});
assert.equal(specificModel.items.find(item => item.name === '일반 공격').effectiveCooldownSeconds, 20, '특정 스킬 쿨감이 전체 스킬에 적용되면 안 된다.');
assert.equal(specificModel.items.find(item => item.name === '신성검').effectiveCooldownSeconds, 17);

const spaceEffects = extractCombatSkillEffects([
  { Name: '공간 조작', Level: 10, Type: '일반', SkillType: 0, Tooltip: tooltip('공간 조작', 40, '시침 스킬'), Tripods: [] },
  { Name: '전방 찌르기', Level: 10, Type: '일반', SkillType: 0, Tooltip: tooltip('전방 찌르기', 20, '분침 스킬'), Tripods: [] },
  { Name: '너머 베기', Level: 14, Type: '일반', SkillType: 0, Tooltip: tooltip('너머 베기', 40, '분침 스킬'), Tripods: [] },
  { Name: '공간 절단', Level: 14, Type: '일반', SkillType: 0, Tooltip: JSON.stringify({ title: { leftText: '재사용 대기시간 1분', level: '[분침 스킬]' } }), Tripods: [] }
]);
const spaceGridText = "'운명' 발동 시 60.0초 동안 '운명: 차원 절단' 효과를 획득한다. 초각성 스킬, 아이덴티티 스킬, 공간 절단을 제외한 시침, 분침, 결합 스킬 사용 시마다 60.0초 동안 '운명: 차원 조각' 효과를 획득한다. '운명: 차원 조각': 6중첩 시 '운명: 차원 왜곡' 효과를 획득한다. '운명: 차원 왜곡': 공간 절단 사용 시 1중첩을 소모하여 공간 절단의 재사용 대기시간이 60.0초 감소한다. 공간 절단 사용 시 공간 조작의 재사용 대기시간이 2.0초 감소한다.";
const spaceSnapshot = {
  profile: { swiftCooldownReduction: 30.64 }, gems: { items: [] },
  arkGrid: { slots: [{ activeTexts: [spaceGridText] }] }
};
const spaceShares = { '공간 절단': 0.56, '너머 베기': 0.08, '일념': 0.124 };
const spaceModel = buildSkillCycleModel({ skillEffects: spaceEffects, snapshot: spaceSnapshot, shares: spaceShares, analyzerTag: '333 공간' });
const spaceDirectModel = buildSkillCycleModel({ skillEffects: spaceEffects, snapshot: { profile: spaceSnapshot.profile, gems: { items: [] } }, shares: spaceShares, analyzerTag: '333 공간' });
const spaceNode = evaluateEvolutionCooldown(spaceModel, 4);
const spaceDirectNode = evaluateEvolutionCooldown(spaceDirectModel, 4);
assert.equal(spaceModel.items.find(item => item.name === '공간 절단').baseCooldownSeconds, 60);
assert.equal(spaceModel.gridCycleLinks.length, 2);
assert.equal(spaceNode.cycleLinkCount, 2);
assert.ok(spaceNode.multiplier > spaceDirectNode.multiplier, '스택 생성과 연쇄 쿨감이 최적화 훈련 효율에 추가 반영되어야 한다.');
assert.ok(spaceNode.affectedSharePercent > 80, '공간 절단 지분까지 쿨감 영향 대상으로 연결해야 한다.');

const spaceGemSnapshot = {
  ...spaceSnapshot,
  gems: { items: [{ skillName: '너머 베기', kind: 'cooldown', level: 8, attackBonus: true, valid: true }] }
};
const spaceGemDirectSnapshot = { ...spaceGemSnapshot, arkGrid: { slots: [] } };
const spaceGemModel = buildSkillCycleModel({ skillEffects: spaceEffects, snapshot: spaceGemSnapshot, shares: spaceShares, analyzerTag: '333 공간' });
const spaceGemDirectModel = buildSkillCycleModel({ skillEffects: spaceEffects, snapshot: spaceGemDirectSnapshot, shares: spaceShares, analyzerTag: '333 공간' });
assert.ok(spaceGemModel.gemCooldownMultiplier > spaceGemDirectModel.gemCooldownMultiplier, '쿨감 보석 효율에도 스택 생성과 쿨 초기화 연쇄를 반영해야 한다.');
assert.ok(spaceGemModel.gemCooldownAffectedSharePercent > spaceGemDirectModel.gemCooldownAffectedSharePercent, '연쇄로 영향을 받는 전투분석 지분을 보석 효율에 포함해야 한다.');

const liveSpaceCycleItems = [
  ['공간 조작', 40, null], ['전방 찌르기', 20, null], ['건너 찌르기', 28, null], ['역공', 40, 32],
  ['너머 베기', 40, null], ['공간 절단', 60, null], ['분광', 55, null], ['경계 돌파', 50, 35]
].map(([name, baseCooldownSeconds, setSeconds]) => ({
  name, level: 14, currentTree: true, cooldownEligible: true, category: name === '공간 조작' ? '시침 스킬' : '분침 스킬',
  baseCooldownSeconds, cooldown: { flatSeconds: 0, percentReduction: 0, setSeconds }
}));
const liveSpaceModel = buildSkillCycleModel({
  skillEffects: {
    items: [...liveSpaceCycleItems, { name: '일념', level: 1, currentTree: true, cooldownEligible: false, baseCooldownSeconds: 120, cooldown: {} }],
    cycleItems: liveSpaceCycleItems
  },
  snapshot: {
    profile: { swiftCooldownReduction: 30.64, secondClass: '공간 검사' },
    gems: { items: ['공간 조작', '건너 찌르기', '공간 절단', '분광', '경계 돌파'].map((skillName, slot) => ({ slot, skillName, kind: 'cooldown', level: 10, attackBonus: true, valid: true })) },
    arkGrid: { slots: [{ activeTexts: [spaceGridText] }] }
  },
  shares: { '공간 절단': 0.56, '일념': 0.124, '너머 베기': 0.08, '역공': 0.08, '분광': 0.07 },
  identitySkills: ['일념'],
  analyzerTag: '333 공간'
});
const liveSpaceOptimization = evaluateEvolutionCooldown(liveSpaceModel, 4);
const limitBreakFactor = 1 + 88.37 / 100;
const optimizationFactor = (1 + 83.37 / 100) * liveSpaceOptimization.multiplier;
assert.ok(liveSpaceOptimization.multiplier > 1.025 && liveSpaceOptimization.multiplier < 1.026, '1004대게형 공간 검사에서 최적화 훈련 1레벨의 쿨 연쇄 효율을 재현해야 한다.');
assert.ok(limitBreakFactor > optimizationFactor, '현재 1004대게형 세팅에서는 연쇄를 모두 반영해도 한계 돌파 1레벨이 근소하게 우세해야 한다.');
assert.ok((limitBreakFactor / optimizationFactor - 1) * 100 < 0.3, '두 노드의 실제 격차가 과장되면 안 된다.');

const chanceLinks = parseArkGridCycleLinks(
  '스킬 A 사용 시 25% 확률로 스킬 B의 재사용 대기시간이 5.0초 감소한다.',
  { items: skillEffects.items, shareNames: ['스킬 A', '스킬 B'] }
);
assert.equal(chanceLinks.length, 1);
assert.equal(chanceLinks[0].procChance, 0.25);
assert.equal(chanceLinks[0].stochastic, false, '수치가 명시된 발동 확률은 기대값으로 계산해야 한다.');
const unknownChanceLinks = parseArkGridCycleLinks(
  '스킬 A 사용 시 일정 확률로 스킬 B의 재사용 대기시간이 5.0초 감소한다.',
  { items: skillEffects.items, shareNames: ['스킬 A', '스킬 B'] }
);
assert.equal(unknownChanceLinks[0].stochastic, true, '발동 확률 수치가 없을 때만 직접 환산에서 제외해야 한다.');

const identityEffects = extractCombatSkillEffects([
  { Name: '게이지 수급기', Level: 10, Type: '일반', SkillType: 0, Tooltip: tooltip('게이지 수급기', 20), Tripods: [] },
  { Name: '포격 : 집중포화', Level: 10, Type: '일반', SkillType: 0, Tooltip: tooltip('포격 : 집중포화', 30), Tripods: [] }
]);
const identitySnapshot = {
  profile: { swiftCooldownReduction: 0 },
  gems: { items: [{ skillName: '게이지 수급기', kind: 'cooldown', level: 8, attackBonus: true, valid: true }] }
};
const identityModel = buildSkillCycleModel({
  skillEffects: identityEffects,
  snapshot: identitySnapshot,
  shares: { '게이지 수급기': 0.1, '포격 스킬': 0.25, '변신 기본 공격': 0.65 }
});
assert.equal(identityModel.mappedSharePercent, 35, '전투분석기의 스킬 그룹 지분을 현재 장착 스킬에 연결해야 한다.');
assert.equal(identityModel.identityDriverSharePercent, 65, '미장착 아이덴티티 지분은 게이지 수급 주기에 연결해야 한다.');
assert.equal(evaluateEvolutionCooldown(identityModel, 4).affectedSharePercent, 100, '일반 스킬 쿨감이 게이지 수급을 거쳐 아이덴티티 딜에 미치는 영향을 포함해야 한다.');
assert.ok(identityModel.gemCooldownAffectedSharePercent > identityModel.mappedSharePercent, '수급기 쿨감 보석의 아이덴티티 기여를 보석 효율에 포함해야 한다.');
const groupedCooldownModel = buildSkillCycleModel({
  skillEffects: identityEffects,
  snapshot: { profile: { swiftCooldownReduction: 0 }, gems: { items: [] }, arkGrid: { slots: [{ activeTexts: ['포격 스킬의 재사용 대기시간이 10.0% 감소한다.'] }] } },
  shares: { '포격 스킬': 1 }
});
assert.equal(groupedCooldownModel.items.find(item => item.name === '포격 : 집중포화').effectiveCooldownSeconds, 27, '스킬 그룹 쿨감은 같은 접두어의 변신 스킬에도 적용해야 한다.');

const skillBOnly = {
  ...skillEffects,
  items: skillEffects.items,
  cycleItems: skillEffects.cycleItems.filter(item => item.name === '스킬 B')
};
const skillBModel = buildSkillCycleModel({ skillEffects: skillBOnly, snapshot, shares: { '스킬 A': 0.6, '스킬 B': 0.4 } });
assert.ok(evaluateEvolutionCooldown(skillBModel, 10).multiplier < evaluateEvolutionCooldown(model, 10).multiplier, '현재 트리에서 쿨감 대상 딜 지분이 바뀌면 추천 점수도 바뀌어야 한다.');

const fallback = evaluateEvolutionCooldown(null, 10, { fallbackSharePercent: 55 });
assert.equal(fallback.modeled, false);
assert.ok(Math.abs(fallback.multiplier - (1 + (1 / 0.9 - 1) * 0.55)) < 1e-12);

const mixedManaEffects = extractCombatSkillEffects([
  {
    Name: '마나 스킬', Level: 10, Type: '일반', SkillType: 0,
    Tooltip: JSON.stringify({ title: { leftText: '재사용 대기시간 20초 | 마나 300 소모', level: '[마법 스킬]' } }),
    Tripods: []
  },
  {
    Name: '비마나 스킬', Level: 10, Type: '일반', SkillType: 0,
    Tooltip: JSON.stringify({ title: { leftText: '재사용 대기시간 20초', level: '[마법 스킬]' } }),
    Tripods: []
  }
]);
const mixedManaModel = buildSkillCycleModel({
  skillEffects: mixedManaEffects,
  snapshot: { profile: { swiftCooldownReduction: 0 }, gems: { items: [] } },
  shares: { '마나 스킬': 0.5, '비마나 스킬': 0.5 }
});
const manaOnlyCooldown = evaluateEvolutionCooldown(mixedManaModel, 0, { manaSkillReduction: 10 });
const allSkillCooldown = evaluateEvolutionCooldown(mixedManaModel, 10);
assert.equal(manaOnlyCooldown.affectedSharePercent, 50, '끝없는 마나와 무한한 마력 쿨감은 마나 사용 스킬에만 적용해야 한다.');
assert.ok(manaOnlyCooldown.multiplier > 1 && manaOnlyCooldown.multiplier < allSkillCooldown.multiplier, '비마나 스킬은 마나 전용 쿨감 기대값에서 제외해야 한다.');

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
