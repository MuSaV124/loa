import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calculateBluntSpike,
  calculatePracticalRecommendationScore,
  calculateSonicBreakEvolutionDamage,
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
assert.equal(shiftClickTargetLevel(0, node('회심')), 0);
assert.equal(shiftClickTargetLevel(0, node('입식 타격가')), 2);
assert.equal(shiftClickTargetLevel(2, node('입식 타격가'), -1), 0);

for (const name of evolution.tiers['2']) assert.equal(node(name).costPerLevel, 10);
assert.deepEqual(level('끝없는 마나', 2), { cooldownReduction: 14, manaReduction: 20 });
assert.deepEqual(level('금단의 주문', 2), { evolutionDamage: 20, manaReduction: 12 });
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

// 로펙 표본: 공속 150.85%, 이속 145.85%에서 음속 돌파 Lv.2 진피 21.01%.
approx(calculateSonicBreakEvolutionDamage(150.85, 145.85, sonicLv2), 21.01);
approx(calculateSonicBreakEvolutionDamage(155.55, 155.55, sonicLv2), 24);
approx(calculateSonicBreakEvolutionDamage(150, 130, sonicLv2), 7);
approx(calculateSonicBreakEvolutionDamage(145, 145, sonicLv1), 9.5);
approx(calculateSonicBreakEvolutionDamage(164.92, 164.92, sonicLv1), 12);

// 로펙 표본: 치적 118.73%에서 뭉툭한 가시 Lv.2 총 진피 73.095%.
const blunt = calculateBluntSpike(118.73, {
  critCap: 80,
  overCritToEvolutionDamageRate: 1.5,
  overCritEvolutionDamageCap: 60
});
approx(blunt.effectiveCritRate, 80);
approx(blunt.convertedEvolutionDamage + 15, 73.095);

const cappedBlunt = calculateBluntSpike(130, {
  critCap: 80,
  overCritToEvolutionDamageRate: 1.5,
  overCritEvolutionDamageCap: 60
});
approx(cappedBlunt.convertedEvolutionDamage, 60);

const practical = options => calculatePracticalRecommendationScore({ expectedValue: 100, ...options });
approx(practical({ rawCritRate: 95, fiveName: '입식 타격가' }).value, 100);
approx(practical({ rawCritRate: 94.9, fiveName: '입식 타격가' }).value, 99.5);
approx(practical({ rawCritRate: 102, fiveName: '입식 타격가' }).value, 99);
approx(practical({ rawCritRate: 121, fiveName: '뭉툭한 가시' }).value, 99.5);
approx(practical({ rawCritRate: 100, fiveName: '뭉툭한 가시', singleHitMainSkill: true }).value, 97.5);
approx(practical({
  rawCritRate: 100,
  fiveName: '입식 타격가',
  manaShortageClass: true,
  selection: {
    '끝없는 마나': { level: 2 },
    '금단의 주문': { level: 1 },
    '무한한 마력': { level: 2 }
  }
}).value, 102.1);
approx(practical({
  rawCritRate: 100,
  fiveName: '입식 타격가',
  manaShortageClass: true,
  noManaMainSkill: true,
  selection: { '끝없는 마나': { level: 2 } }
}).value, 100);

console.log('2/4/5티어 진화 계산 테스트 통과');
