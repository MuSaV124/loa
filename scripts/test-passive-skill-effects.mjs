import assert from 'node:assert/strict';
import {
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
assert.equal(passiveEffectsForSkill(breaker, { name: '성운멸쇄권' }, { identitySkills: ['성운멸쇄권'] }).effects.critRate, 20);
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

assert.equal(passiveEffectsForSkill(categoryScopes, { name: '포격 스킬' }).effects.critRate, 50, '상태 공통 10%와 포격 계열 40%는 해당 계열에서만 합산해야 한다.');
assert.equal(passiveEffectsForSkill(categoryScopes, { name: '실버호크 스킬' }).effects.critRate, 50);
assert.equal(passiveEffectsForSkill(categoryScopes, { name: '고대의 정령 스킬' }).effects.critRate, 26);
assert.equal(passiveEffectsForSkill(categoryScopes, { name: '적룡필살' }).effects.critRate, 110);
assert.equal(passiveEffectsForSkill(categoryScopes, { name: '스나이프', category: '일반 스킬' }).effects.critRate, 10);

const leap = extractArkPassiveSkillEffects([
  passive('도약', '풀려난 힘', '초각성 스킬이 적에게 주는 피해가 15.0% 증가한다.'),
  passive('도약', '포식자의 불꽃', '플레임 블레이드 스킬의 치명타 피해가 90.0% 증가한다.'),
  passive('도약', '버스트 강화', '브레이킹 문 스킬 사용 이후 블레이드 버스트 스킬의 치명타 피해가 60.0% 증가한다.')
], {
  shareNames: ['성운멸쇄권', '플레임 블레이드', '블레이드 버스트'],
  identitySkills: ['성운멸쇄권', '플레임 블레이드', '브레이킹 문']
});

assert.equal(passiveEffectsForSkill(leap, { name: '성운멸쇄권' }, { identitySkills: ['성운멸쇄권', '플레임 블레이드', '브레이킹 문'] }).effects.skillDamage, 15);
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
