import assert from 'node:assert/strict';
import {
  extractCombatSkillEffects,
  formatSkillEffectSummary,
  hasSkillEffects,
  parseSkillEffectText,
  skillExperimentItems
} from '../public/skill-effects.js';

const direct = parseSkillEffectText(`
  치명타 적중률이 24.5% 증가하고 치명타 피해가 80% 증가한다.
  추가 피해가 12% 증가하며 공격력이 6% 증가한다.
  공격 속도가 8% 증가하고 이동 속도가 5% 증가한다.
  재사용 대기시간이 12% 감소한다.
`);
assert.equal(direct.critRate, 24.5);
assert.equal(direct.critDamage, 80);
assert.equal(direct.additionalDamage, 12);
assert.equal(direct.attackPower, 6);
assert.equal(direct.attackSpeed, 8);
assert.equal(direct.moveSpeed, 5);
assert.equal('cooldownReduction' in direct, false);

const jointSpeed = parseSkillEffectText('공격 및 이동 속도가 7%만큼 증가한다. 피해가 25% 증가한다.');
assert.equal(jointSpeed.attackSpeed, 7);
assert.equal(jointSpeed.moveSpeed, 7);
assert.equal(jointSpeed.skillDamage, 25);

const critHit = parseSkillEffectText('치명타 적중 시 적에게 주는 피해가 15% 증가한다.');
assert.equal(critHit.critHitDamage, 15);
assert.equal(critHit.enemyDamage, 0, '치명타 적중 조건 피해를 일반 적주피로 중복 계산하면 안 된다.');

const guaranteed = extractCombatSkillEffects([{
  Name: '적룡포', Level: 14,
  Tripods: [{
    Tier: 3,
    Slot: 0,
    Name: '확정 치명 표본',
    IsSelected: true,
    Tooltip: '피격이상 면역인 적에게 공격 적중 시 치명타 적중률이 100% 증가하며 치명타 피해가 60% 증가한다.'
  }]
}]);
assert.equal(guaranteed.calculableItems[0].guaranteedCrit, true);
assert.equal(guaranteed.calculableItems[0].conditional, true);
assert.equal(guaranteed.conditionalTripodCount, 1);
assert.equal(skillExperimentItems(guaranteed).length, 1);

const skills = [
  {
    Name: '레드 더스트', Icon: 'red-dust.png', Level: 14, Type: '일반', SkillType: 1,
    Tripods: [
      { Tier: 1, Slot: 0, Name: '날렵한 움직임', IsSelected: true, Tooltip: JSON.stringify({ a: '공격 속도가 8% 증가한다.', b: '공격 속도가 8% 증가한다.' }) },
      { Tier: 2, Slot: 1, Name: '급소 타격', IsSelected: true, Tooltip: { description: '치명타 적중률이 33.2% 증가한다. 재사용 대기시간이 2초 감소한다.' } },
      { Tier: 3, Slot: 2, Name: '붉은 충격', IsSelected: true, Tooltip: '스킬의 피해량이 40% 증가한다.' },
      { Tier: 3, Slot: 0, Name: '미선택', IsSelected: false, Tooltip: '치명타 피해가 999% 증가한다.' }
    ]
  },
  {
    Name: '블레이즈', Icon: 'blaze.png', Level: 14, Type: '일반', SkillType: 1,
    Tripods: [
      { Tier: 1, Slot: 0, Name: '치명타 강화', IsSelected: true, Tooltip: '치명타 피해가 60% 증가한다.' },
      { Tier: 2, Slot: 0, Name: '약점 노출', IsSelected: true, Tooltip: '적에게 주는 피해가 10% 증가한다.' },
      { Tier: 3, Slot: 0, Name: '마력 증폭', IsSelected: true, Tooltip: '추가 피해가 20% 증가한다.' },
      { Tier: 3, Slot: 1, Name: '면역 대상 강화', IsSelected: true, Tooltip: '피격이상 면역인 적에게 주는 피해가 80% 증가한다.' },
      { Tier: 3, Slot: 2, Name: '보스 대상 강화', IsSelected: true, Tooltip: '보스 등급 이상인 적에게 주는 피해가 70% 증가한다.' }
    ]
  },
  {
    Name: '쿨감 전용 스킬', Level: 10,
    Tripods: [{ Tier: 1, Slot: 0, Name: '빠른 준비', IsSelected: true, Tooltip: '재사용 대기시간이 8초 감소한다.' }]
  }
];

const parsed = extractCombatSkillEffects(skills);
assert.equal(parsed.items.length, 3);
assert.equal(parsed.calculableItems.length, 2);
assert.equal(parsed.selectedTripodCount, 9);
assert.equal(parsed.ignoredCooldownCount, 2);
assert.deepEqual(parsed.calculableItems[0].effects, {
  critRate: 33.2,
  critDamage: 0,
  critHitDamage: 0,
  additionalDamage: 0,
  enemyDamage: 0,
  attackPower: 0,
  attackSpeed: 8,
  moveSpeed: 0,
  skillDamage: 40
});
assert.equal(parsed.calculableItems[1].effects.critDamage, 60);
assert.equal(parsed.calculableItems[1].effects.enemyDamage, 0);
assert.equal(parsed.calculableItems[1].effects.additionalDamage, 20);
assert.equal(parsed.calculableItems[1].effects.skillDamage, 236.6, '트라이포드 전용 피해 10%, 80%, 70%는 곱연산 스킬 피해여야 한다.');
assert.equal(hasSkillEffects(parsed.items[2].effects), false);
assert.match(formatSkillEffectSummary(parsed.calculableItems[0].effects), /치적 \+33.2%/);
assert.doesNotMatch(formatSkillEffectSummary(parsed.calculableItems[0].effects), /쿨/);

// 2026-07-27 LOAWA 실사용 통계에서 직업별 인기 스킬을 한 개씩 대조한 회귀 표본이다.
// 파서는 직업명이나 스킬명 화이트리스트 없이 같은 공식 Tooltip 구조를 처리해야 한다.
const loawaPopularSkillSamples = [
  ['디스트로이어', '헤비 크러쉬'], ['발키리', '계시의 검'], ['버서커', '피니쉬 스트라이크'],
  ['슬레이어', '볼케이노 이럽션'], ['워로드', '증오의 함성'], ['홀리나이트', '신성검'],
  ['기공사', '순보'], ['배틀마스터', '바람의 속삭임'], ['브레이커', '권왕의 진격'],
  ['스트라이커', '번개의 속삭임'], ['인파이터', '전진의 일격'], ['창술사', '맹룡열파'],
  ['건슬링어', '포커스 샷'], ['데빌헌터', 'AT02 유탄'], ['블래스터', '미사일 폭격'],
  ['스카우터', '명령 : 레이드 미사일'], ['호크아이', '차징 샷'], ['바드', '음파 진동'],
  ['서머너', '고대의 창'], ['소서리스', '천벌'], ['아르카나', '셀레스티얼 레인'],
  ['데모닉', '데모닉 슬래쉬'], ['리퍼', '쉐도우 스톰'], ['블레이드', '스핀 커터'],
  ['소울이터', '길로틴 스윙'], ['기상술사', '펼치기'], ['도화가', '묵법 : 해그리기'],
  ['차원술사', '일점 관통'], ['환수사', '할퀴기'], ['가디언나이트', '와일드 어퍼']
];
assert.equal(loawaPopularSkillSamples.length, 30);
for (const [className, skillName] of loawaPopularSkillSamples) {
  const classResult = extractCombatSkillEffects([{
    Name: skillName,
    Level: 14,
    Tripods: [{ Tier: 1, Slot: 0, Name: `${className} 표본`, IsSelected: true, Tooltip: '치명타 적중률이 10% 증가한다.' }]
  }]);
  assert.equal(classResult.calculableItems[0]?.name, skillName, `${className} 실사용 스킬 표본 파싱 실패`);
  assert.equal(classResult.calculableItems[0]?.effects?.critRate, 10, `${className} 효과값 파싱 실패`);
}

console.log('skill effect tests passed');
