import assert from 'node:assert/strict';
import {
  extractArkGridSkillEffects,
  extractArkPassiveSkillEffects,
  mergeSkillEffects,
  passiveEffectsForSkill
} from '../public/passive-skill-effects.js';

function passive(category, nodeName, text) {
  return {
    name: category,
    raw: {
      ToolTip: JSON.stringify({
        Element_000: { type: 'NameTagBox', value: nodeName },
        Element_002: { type: 'MultiTextBox', value: text }
      })
    }
  };
}

const breaker = extractArkPassiveSkillEffects([
  passive('깨달음', '권왕파천무', "'권왕십이식 : 낙화' 스킬의 치명타 적중률이 15.0% 증가하고 보유한 충격 에너지 1당 적에게 주는 피해가 4.0% 증가한다."),
  passive('깨달음', '단전 호흡', '적에게 주는 피해가 21.0% 증가한다.'),
  passive('깨달음', '권왕십이식 : 풍랑', "'권왕십이식 : 풍랑' 스킬의 치명타 적중률이 15.0% 증가한다. 적에게 주는 피해량이 8.0% 증가한다."),
  passive('도약', '충격 폭발', '성운멸쇄권 스킬 시전 시 치명타 적중률이 20.0% 증가하고 소모한 충격 에너지 1 당 적에게 주는 피해가 0.40% 증가한다.')
], {
  skillItems: [
    { name: '파천섬광', category: '충격 스킬' },
    { name: '성운멸쇄권', category: '초각성 스킬' }
  ],
  shareNames: ['권왕십이식 : 낙화', '권왕십이식 : 풍랑', '파천섬광', '성운멸쇄권'],
  identitySkills: ['성운멸쇄권']
});

assert.equal(breaker.globalEffects.enemyDamage, 29, '전역 적주피 21%와 8%는 전역 버킷으로 유지해야 한다.');
assert.equal(breaker.globalEffects.critRate, 0, '개별 스킬 치적은 전역 치적으로 합산하면 안 된다.');
assert.equal(passiveEffectsForSkill(breaker, { name: '권왕십이식 : 낙화' }).effects.critRate, 15);
assert.equal(passiveEffectsForSkill(breaker, { name: '권왕십이식 : 풍랑' }).effects.critRate, 15);
assert.equal(passiveEffectsForSkill(breaker, { name: '성운멸쇄권', skillType: 1, skillTypeKnown: true }).effects.critRate, 20);
assert.equal(passiveEffectsForSkill(breaker, { name: '파천섬광', category: '충격 스킬' }).effects.critRate, 0);
assert.equal(passiveEffectsForSkill(breaker, { name: '성운멸쇄권' }).effects.skillDamage, 0, '에너지 1당 피해는 보유량 없이 임의 계산하면 안 된다.');

const groupedBreaker = extractArkPassiveSkillEffects([
  passive('깨달음', '권왕파천무', "'권왕십이식 : 낙화' 스킬의 치명타 적중률이 15.0% 증가한다."),
  passive('깨달음', '권왕십이식 : 낙화 강화', '권왕십이식 : 낙화 스킬의 피해량이 80.0% 증가한다.'),
  passive('깨달음', '권왕십이식 : 풍랑', "'권왕십이식 : 풍랑' 스킬의 치명타 적중률이 15.0% 증가한다. '권왕십이식 : 풍랑' 스킬의 피해량이 추가로 60.0% 증가한다.")
], {
  shareNames: ['권왕십이식']
});
const groupedFall = passiveEffectsForSkill(groupedBreaker, { name: '권왕십이식 : 낙화', shareName: '권왕십이식' }).effects;
const groupedWave = passiveEffectsForSkill(groupedBreaker, { name: '권왕십이식 : 풍랑', shareName: '권왕십이식' }).effects;
assert.equal(groupedFall.critRate, 15, '권왕십이식 묶음명이 낙화와 풍랑 치적을 중복 적용하면 안 된다.');
assert.equal(groupedWave.critRate, 15, '권왕십이식 묶음명이 낙화와 풍랑 치적을 중복 적용하면 안 된다.');
assert.equal(groupedFall.skillDamage, 80, '낙화에는 낙화 강화만 적용해야 한다.');
assert.equal(groupedWave.skillDamage, 60, '풍랑에는 풍랑 강화만 적용해야 한다.');

const leapCritTargets = extractArkPassiveSkillEffects([
  passive('도약', '관통 필살', '적룡필살의 돌진 공격 거리가 4.0m 증가하고, 치명타 적중률이 100.0% 증가한다. 적에게 주는 피해가 20.0% 증가한다.'),
  passive('도약', '그림자 맹수', '피니쉬 스텝의 치명타 적중률이 30.0% 증가한다. 페르소나 상태에서 공격 적중 시 치명타 피해가 15.0% 증가한다.')
]);
assert.equal(leapCritTargets.globalEffects.critRate, 0, '도약의 개별 스킬 치적을 전역 치적으로 합산하면 안 된다.');
assert.equal(passiveEffectsForSkill(leapCritTargets, { name: '적룡필살' }).effects.critRate, 100);
assert.equal(passiveEffectsForSkill(leapCritTargets, { name: '피니쉬 스텝' }).effects.critRate, 30);
assert.equal(passiveEffectsForSkill(leapCritTargets, { name: '다른 스킬' }).effects.critRate, 0);

const categoryScopes = extractArkPassiveSkillEffects([
  passive('깨달음', '포격 강화', '포격 스킬의 치명타 적중률이 40.0% 증가한다.'),
  passive('깨달음', '두 번째 동료', '실버호크 스킬의 치명타 적중률이 40.0% 증가한다.'),
  passive('깨달음', '상급 소환사', '고대의 정령 스킬의 치명타 적중률이 16.0% 증가한다.'),
  passive('도약', '잠식된 달', '페르소나 상태 진입 시 치명타 적중률이 10.0% 증가한다.'),
  passive('도약', '절정', '적룡필살 스킬의 치명타 적중률이 100.0% 증가한다.')
], {
  skillItems: [
    { name: '포격 : 곡사포', category: '포격 스킬' },
    { name: '스나이프', category: '일반 스킬' },
    { name: '적룡포', category: '집중 스탠스 스킬' }
  ],
  shareNames: ['포격 스킬', '실버호크 스킬', '고대의 정령 스킬', '적룡필살']
});

assert.equal(passiveEffectsForSkill(categoryScopes, { name: '포격 스킬' }).effects.critRate, 40);
assert.equal(passiveEffectsForSkill(categoryScopes, { name: '실버호크 스킬' }).effects.critRate, 40);
assert.equal(passiveEffectsForSkill(categoryScopes, { name: '고대의 정령 스킬' }).effects.critRate, 16);
assert.equal(passiveEffectsForSkill(categoryScopes, { name: '적룡필살' }).effects.critRate, 100);
assert.equal(passiveEffectsForSkill(categoryScopes, { name: '스나이프', category: '일반 스킬' }).effects.critRate, 0);
assert.equal(categoryScopes.unresolved.find(row => row.nodeName === '잠식된 달')?.effects.critRate, 10);

const patchScopes = extractArkPassiveSkillEffects([
  passive('깨달음', '환류 강화', '각성기를 제외한 모든 스킬의 피해량이 52.0% 증가한다.'),
  passive('깨달음', '격분', '폭주 중 적에게 주는 치명타 피해가 57.0% 증가한다.'),
  passive('깨달음', '맑은 날', '여우비가 활성화되어 있는 동안 기상 스킬의 피해량이 42.0% 증가한다.'),
  passive('깨달음', '황제의 자비', '카드 사용 시 8.0초 간 적에게 주는 피해가 6% 증가한다.')
]);
const ordinary = { name: '일반기', skillType: 0, skillTypeKnown: true };
const awakening = { name: '각성 기술', skillType: 100, skillTypeKnown: true };
assert.equal(passiveEffectsForSkill(patchScopes, ordinary).effects.skillDamage, 52);
assert.equal(passiveEffectsForSkill(patchScopes, { ...ordinary, skillType: 1 }).effects.skillDamage, 52);
assert.equal(passiveEffectsForSkill(patchScopes, awakening).effects.skillDamage, 0);
assert.equal(passiveEffectsForSkill(patchScopes, { ...awakening, skillType: 101 }).effects.skillDamage, 0);
assert.equal(passiveEffectsForSkill(patchScopes, { name: '유형 미확인' }).effects.skillDamage, 0);
assert.equal(passiveEffectsForSkill(patchScopes, { name: '펼치기', category: '기상 스킬' }).effects.skillDamage, 0);
assert.equal(passiveEffectsForSkill(patchScopes, ordinary).effects.critDamage, 0);
assert.equal(patchScopes.globalEffects.enemyDamage, 0);
assert.deepEqual(patchScopes.unresolved.map(row => row.nodeName), ['격분', '맑은 날', '황제의 자비']);

const scopedEnemy = extractArkGridSkillEffects([{ name: '연가 창식', activeTexts: [
  '집중 스킬이 적에게 주는 피해량이 7.0% 증가한다.'
] }]);
assert.equal(passiveEffectsForSkill(scopedEnemy, { name: '적룡포', category: '집중 스킬' }).effects.skillDamage, 7);
assert.equal(passiveEffectsForSkill(scopedEnemy, { name: '맹룡열파', category: '난무 스킬' }).effects.skillDamage, 0);
const gravity = passive('깨달음', '중력 수련', '중력 가중 모드 기본 공격과 볼텍스 그래비티의 치명타 적중률이 30.0% 증가하며 적에게 주는 피해가 28.0% 증가한다.');
const gravityGroup = extractArkPassiveSkillEffects([gravity], { shareNames: ['중력 가중 스킬', '퍼펙트 스윙'] });
assert.equal(gravityGroup.unresolved.length, 1);
assert.equal(passiveEffectsForSkill(gravityGroup, { name: '중력 가중 스킬' }).effects.critRate, 0);
assert.equal(passiveEffectsForSkill(gravityGroup, { name: '중력 가중 모드 기본 공격' }).effects.critRate, 30);
assert.equal(passiveEffectsForSkill(gravityGroup, { name: '볼텍스 그래비티' }).effects.skillDamage, 28);
assert.equal(passiveEffectsForSkill(gravityGroup, { name: '퍼펙트 스윙' }).effects.skillDamage, 0);

const glaivier = extractArkPassiveSkillEffects([
  passive('깨달음', '절정 I', '난무 스탠스 전환 시 이동속도가 15.0% 증가하고, 집중 스탠스 전환 시 공격속도가 15.0% 증가한다.'),
  passive('깨달음', '절정 II', '난무 스탠스 전환 시 치명타 피해가 70.0% 증가한다.'),
  passive('깨달음', '절정 III', '집중 스탠스 전환 시 적에게 주는 피해가 25.0% 증가한다.')
], {
  skillItems: [
    { name: '맹룡열파', category: '난무 스킬' },
    { name: '적룡포', category: '집중 스킬' }
  ]
});
assert.equal(glaivier.globalEffects.attackSpeed, 0);
assert.equal(glaivier.globalEffects.moveSpeed, 0);
assert.equal(glaivier.globalEffects.critDamage, 0);
assert.equal(glaivier.globalEffects.enemyDamage, 0);
const flurryEffects = passiveEffectsForSkill(glaivier, { name: '맹룡열파', category: '난무 스킬' }).effects;
const focusEffects = passiveEffectsForSkill(glaivier, { name: '적룡포', category: '집중 스킬' }).effects;
assert.equal(flurryEffects.moveSpeed, 15);
assert.equal(flurryEffects.attackSpeed, 0);
assert.equal(flurryEffects.critDamage, 70);
assert.equal(focusEffects.attackSpeed, 15);
assert.equal(focusEffects.moveSpeed, 0);
assert.equal(focusEffects.skillDamage, 25);

const glaivierGrid = extractArkGridSkillEffects([
  {
    name: '질서의 해 코어 : 연가 창식',
    point: 19,
    activeTexts: [
      '적에게 주는 피해량이 1.5% 증가한다.',
      "'운명: 연가 창식' : 30.0초 동안 집중 스킬의 치명타 적중률이 20.0% 감소하지만, 집중 스킬이 치명타로 적중 시 적에게 주는 피해가 20.0% 증가한다.",
      "'운명: 연가 난무' : 30.0초 동안 난무 스킬의 피해량이 34.0% 증가한다."
    ]
  },
  {
    name: '질서의 달 코어 : 청룡기',
    point: 18,
    activeTexts: ['난무 스킬의 시전 속도가 10.0% 증가하고 집중 스킬의 피해량이 10.0% 증가한다.']
  }
], {
  skillItems: [
    { name: '맹룡열파', category: '난무 스킬' },
    { name: '적룡포', category: '집중 스킬' }
  ]
});
assert.equal(glaivierGrid.globalEffects.enemyDamage, 1.5);
assert.equal(glaivierGrid.globalEffects.critRate, 0);
const flurryGridEffects = passiveEffectsForSkill(glaivierGrid, { name: '맹룡열파', category: '난무 스킬' }).effects;
const focusGridEffects = passiveEffectsForSkill(glaivierGrid, { name: '적룡포', category: '집중 스킬' }).effects;
assert.equal(flurryGridEffects.skillDamage, 34);
assert.equal(focusGridEffects.critRate, -20);
assert.equal(focusGridEffects.critHitDamage, 20, '구버전 연가 창식의 20%는 치명타 적중 시에만 적용한다.');
assert.equal(focusGridEffects.skillDamage, 10, '청룡기의 집중 피해는 별도 스킬 피해다.');

const leap = extractArkPassiveSkillEffects([
  passive('도약', '풀려난 힘', '초각성 스킬이 적에게 주는 피해가 15.0% 증가한다.'),
  passive('도약', '포식자의 불꽃', '플레임 블레이드 스킬의 치명타 피해가 90.0% 증가한다.'),
  passive('도약', '버스트 강화', '브레이킹 문 스킬 사용 이후 블레이드 버스트 스킬의 치명타 피해가 60.0% 증가한다.')
], {
  shareNames: ['성운멸쇄권', '플레임 블레이드', '블레이드 버스트'],
  identitySkills: ['성운멸쇄권', '플레임 블레이드', '브레이킹 문']
});

assert.equal(passiveEffectsForSkill(leap, { name: '성운멸쇄권', skillType: 1, skillTypeKnown: true }).effects.skillDamage, 15);
assert.equal(passiveEffectsForSkill(leap, { name: '성운멸쇄권', skillType: 101, skillTypeKnown: true }).effects.skillDamage, 0);
assert.equal(passiveEffectsForSkill(leap, { name: '플레임 블레이드' }, { identitySkills: ['성운멸쇄권', '플레임 블레이드', '브레이킹 문'] }).effects.critDamage, 90);
assert.equal(passiveEffectsForSkill(leap, { name: '블레이드 버스트' }, { identitySkills: ['성운멸쇄권', '플레임 블레이드', '브레이킹 문'] }).effects.critDamage, 60);
assert.equal(passiveEffectsForSkill(leap, { name: '일반 공격' }, { identitySkills: ['성운멸쇄권'] }).effects.skillDamage, 0);

assert.deepEqual(
  mergeSkillEffects({ critRate: 15, skillDamage: 10 }, { critRate: 20, skillDamage: 20 }),
  {
    critRate: 35, critDamage: 0, critHitDamage: 0, additionalDamage: 0, enemyDamage: 0,
    attackPower: 0, attackSpeed: 0, moveSpeed: 0, skillDamage: 32
  },
  '치적은 합산하고 스킬 피해 버킷은 곱연산해야 한다.'
);

console.log('passive skill effect tests passed');
