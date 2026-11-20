import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calculateBluntSpike,
  calculateSonicBreakEvolutionDamage,
  maintainedEvolutionDamage,
  shiftClickTargetLevel
} from '../public/evolution-math.js';

const evolution = JSON.parse(readFileSync(new URL('../public/data/evolution.json', import.meta.url), 'utf8'));
const node = name => evolution.nodes.find(item => item.name === name);
const level = (name, value) => node(name)?.levels?.[String(value)];

const sonicLv1 = { rate: 0.05, overCapBonus: 4, overCapRate: 0.15, maxEvolutionDamage: 12 };
const sonicLv2 = { rate: 0.1, overCapBonus: 8, overCapRate: 0.3, maxEvolutionDamage: 24 };

function approx(actual, expected, precision = 0.001) {
  assert.ok(Math.abs(actual - expected) <= precision, `${actual} != ${expected}`);
}

assert.equal(shiftClickTargetLevel(0, node('치명')), 10);
assert.equal(shiftClickTargetLevel(10, node('치명')), 20);
assert.equal(shiftClickTargetLevel(25, node('치명')), 30);
assert.equal(shiftClickTargetLevel(20, node('치명'), -1), 10);
assert.equal(shiftClickTargetLevel(5, node('치명'), -1), 0);
assert.equal(shiftClickTargetLevel(0, node('예리한 감각')), 2);
assert.equal(shiftClickTargetLevel(1, node('예리한 감각')), 2);
assert.equal(shiftClickTargetLevel(0, node('한계 돌파')), 2);
assert.equal(shiftClickTargetLevel(1, node('한계 돌파')), 3);
assert.equal(shiftClickTargetLevel(3, node('한계 돌파'), -1), 1);
assert.equal(shiftClickTargetLevel(1, node('한계 돌파'), -1), 0);
assert.equal(shiftClickTargetLevel(0, node('파괴 전차')), 2);
assert.equal(shiftClickTargetLevel(2, node('파괴 전차'), -1), 0);
assert.equal(shiftClickTargetLevel(0, node('회심')), 1);
assert.equal(shiftClickTargetLevel(1, node('회심'), -1), 0);
assert.equal(shiftClickTargetLevel(0, node('입식 타격가')), 2);
assert.equal(shiftClickTargetLevel(2, node('입식 타격가'), -1), 0);

for (const name of evolution.tiers['2']) assert.equal(node(name).costPerLevel, 10);
assert.deepEqual(level('끝없는 마나', 2), { manaSkillCooldownReduction: 14, manaReduction: 20 });
assert.deepEqual(level('금단의 주문', 2), { evolutionDamage: 10, manaSkillEvolutionDamage: 10, manaReduction: 12 });
assert.deepEqual(level('예리한 감각', 2), { critRate: 8, evolutionDamage: 10 });
assert.deepEqual(level('한계 돌파', 3), { evolutionDamage: 30 });
assert.deepEqual(level('최적화 훈련', 2), { evolutionDamage: 10, cooldownReduction: 8 });
assert.deepEqual(level('축복의 여신', 3), { speedBonus: 9 });

assert.deepEqual(level('파괴 전차', 2), { evolutionDamage: 24, attackSpeedBonus: 8 });
assert.deepEqual(level('타이밍 지배', 2), { evolutionDamage: 16, cooldownReduction: 10 });
assert.deepEqual(level('정열의 춤사위', 2), { evolutionDamage: 14 });

assert.deepEqual(level('회심', 1), { critHitDamage: 12 });
assert.deepEqual(level('달인', 1), { critRate: 7, additionalDamage: 8.5 });
assert.deepEqual(level('분쇄', 1), { evolutionDamage: 20 });
for (const name of ['선각자', '진군', '기원']) assert.deepEqual(node(name).levels, {});

assert.deepEqual(level('음속 돌파', 1).sonicBreak, sonicLv1);
assert.deepEqual(level('음속 돌파', 2).sonicBreak, sonicLv2);
assert.deepEqual(node('안정된 관리자').levels, {});

for (const item of evolution.nodes) {
  assert.ok(item.description?.trim(), `${item.name}: 툴팁 설명 누락`);
  if (item.tier > 1) {
    assert.equal(Object.keys(item.displayLevels || {}).length, item.maxLevel, `${item.name}: 레벨별 전체 설명 누락`);
  }
}
assert.match(node('달인').description, /10초/);
assert.match(node('달인').displayLevels['1'], /최대 5중첩/);
assert.match(node('진군').description, /5m/);
assert.match(node('진군').description, /7초/);
assert.match(node('입식 타격가').description, /피격 이상/);
assert.match(node('마나 용광로').description, /최대 마나의 2%/);
for (const [lv, base, perStack, active] of [[1, 6, .75, 9], [2, 12, 1.5, 18]]) {
  const standing = level('입식 타격가', lv);
  assert.equal(maintainedEvolutionDamage(standing), base + perStack * 6);
  const inFighting = level('인파이팅', lv);
  assert.equal(maintainedEvolutionDamage(inFighting), active);
}

// 로펙 표본: 공속 150.85%, 이속 145.85%에서 음속 돌파 Lv.2 진피 21.01%.
approx(calculateSonicBreakEvolutionDamage(150.85, 145.85, sonicLv2), 21.01);
approx(calculateSonicBreakEvolutionDamage(155.55, 155.55, sonicLv2), 24);
approx(calculateSonicBreakEvolutionDamage(150, 130, sonicLv2), 7);
approx(calculateSonicBreakEvolutionDamage(145, 145, sonicLv1), 9.5);
approx(calculateSonicBreakEvolutionDamage(164.92, 164.92, sonicLv1), 12);

for (const [nodeLevel, base, rate] of [[1, 9.5, 1.2], [2, 19, 1.4]]) {
  const rule = level('뭉툭한 가시', nodeLevel);
  assert.deepEqual(rule, { evolutionDamage: base, critCap: 80, overCritToEvolutionDamageRate: rate });
  assert.equal(calculateBluntSpike(79.99, rule).effectiveCritRate, 79.99);
  assert.equal(calculateBluntSpike(80, rule).convertedEvolutionDamage, 0);
  approx(calculateBluntSpike(80.01, rule).convertedEvolutionDamage, .01 * rate);
  approx(calculateBluntSpike(250, rule).convertedEvolutionDamage, 170 * rate);
}

console.log('2/4/5티어 진화 계산 테스트 통과');
