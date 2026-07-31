import assert from 'node:assert/strict';
import {
  calculateDamageBonusPercent,
  extractCardEffects,
  parseEffectDescription,
  parseEffectDescriptions,
  parseSetRequirement
} from '../public/card-effects.js';

assert.deepEqual(parseSetRequirement('세상을 구하는 빛 2세트'), {
  setName: '세상을 구하는 빛',
  requiredSetCount: 2,
  requiredAwakeTotal: 0
});
assert.deepEqual(parseSetRequirement('세상을 구하는 빛 6세트 (18각성합계)'), {
  setName: '세상을 구하는 빛',
  requiredSetCount: 6,
  requiredAwakeTotal: 18
});
assert.equal(parseSetRequirement('알 수 없는 문구'), null);

assert.deepEqual(parseEffectDescription('성속성 피해 +7.00%'), {
  kind: 'numeric',
  label: '성속성 피해',
  value: 7,
  unit: 'percent',
  text: '성속성 피해 +7.00%'
});
assert.equal(parseEffectDescription('공격 속성을 성속성으로 변환').kind, 'attributeConversion');
assert.equal(parseEffectDescription('공격 속성을 성속성으로 변환').attribute, '성속성');
assert.equal(parseEffectDescription('설명 없는 효과').kind, 'unparsed');

// 무사브(브레이커) 실제 응답: 전설 카드 6장 전부 5각, 세상을 구하는 빛 6세트 30각.
const SET_ITEMS = [
  { Name: '세상을 구하는 빛 2세트', Description: '암속성 피해 감소 +10.00%' },
  { Name: '세상을 구하는 빛 4세트', Description: '암속성 피해 감소 +10.00%' },
  { Name: '세상을 구하는 빛 6세트', Description: '암속성 피해 감소 +10.00%' },
  { Name: '세상을 구하는 빛 6세트 (12각성합계)', Description: '공격 속성을 성속성으로 변환' },
  { Name: '세상을 구하는 빛 6세트 (18각성합계)', Description: '성속성 피해 +7.00%' },
  { Name: '세상을 구하는 빛 6세트 (24각성합계)', Description: '성속성 피해 +4.00%' },
  { Name: '세상을 구하는 빛 6세트 (30각성합계)', Description: '성속성 피해 +4.00%' }
];

const cardsWithAwake = awakeCounts =>
  awakeCounts.map((awakeCount, slot) => ({
    Slot: slot,
    Name: `카드${slot}`,
    Grade: '전설',
    AwakeCount: awakeCount,
    AwakeTotal: 5
  }));

const armory = (awakeCounts, slots = [0, 1, 2, 3, 4, 5]) => ({
  Cards: cardsWithAwake(awakeCounts),
  Effects: [{ Index: 0, CardSlots: slots, Items: SET_ITEMS }]
});

const full = extractCardEffects(armory([5, 5, 5, 5, 5, 5]));
assert.equal(full.sets[0].equippedCount, 6);
assert.equal(full.sets[0].awakeTotal, 30);
assert.equal(full.attributeConversion, '성속성');
assert.equal(full.totals['성속성 피해'], 15);
assert.equal(full.totals['암속성 피해 감소'], 30);
assert.equal(full.damageBonusPercent, 15);
assert.equal(full.applied.length, 7);
assert.equal(full.skipped.length, 0);
assert.equal(full.unparsed.length, 0);
assert.equal(full.cards.length, 6);

// 18각이면 24/30각 효과는 빠지고 7%만 남아야 한다.
const at18 = extractCardEffects(armory([3, 3, 3, 3, 3, 3]));
assert.equal(at18.sets[0].awakeTotal, 18);
assert.equal(at18.totals['성속성 피해'], 7);
assert.equal(at18.damageBonusPercent, 7);
assert.equal(at18.attributeConversion, '성속성');
assert.equal(at18.skipped.length, 2);

// 12각이면 속성 변환만 되고 피해 증가는 아직 없다.
const at12 = extractCardEffects(armory([2, 2, 2, 2, 2, 2]));
assert.equal(at12.sets[0].awakeTotal, 12);
assert.equal(at12.totals['성속성 피해'], undefined);
assert.equal(at12.attributeConversion, '성속성');
assert.equal(at12.damageBonusPercent, 0);

// 속성 변환 전(6각)에는 피해 증가를 전체 공격에 적용하지 않는다.
const at6 = extractCardEffects(armory([1, 1, 1, 1, 1, 1]));
assert.equal(at6.attributeConversion, '');
assert.equal(at6.damageBonusPercent, 0);
assert.equal(at6.totals['암속성 피해 감소'], 30);

// 카드를 4장만 꽂으면 6세트 효과는 전부 빠진다.
const fourCards = extractCardEffects({
  Cards: cardsWithAwake([5, 5, 5, 5]),
  Effects: [{ Index: 0, CardSlots: [0, 1, 2, 3], Items: SET_ITEMS }]
});
assert.equal(fourCards.sets[0].equippedCount, 4);
assert.equal(fourCards.sets[0].awakeTotal, 20);
assert.equal(fourCards.totals['암속성 피해 감소'], 20);
assert.equal(fourCards.attributeConversion, '');
assert.equal(fourCards.damageBonusPercent, 0);

// API가 달성분만 주더라도 자체 계산으로 다시 판정하므로 결과가 같아야 한다.
const achievedOnly = extractCardEffects({
  Cards: cardsWithAwake([3, 3, 3, 3, 3, 3]),
  Effects: [{ Index: 0, CardSlots: [0, 1, 2, 3, 4, 5], Items: SET_ITEMS.slice(0, 5) }]
});
assert.equal(achievedOnly.totals['성속성 피해'], 7);
assert.equal(achievedOnly.damageBonusPercent, 7);

// 변환 속성과 다른 속성의 피해 증가는 전체 공격에 적용하지 않는다.
assert.equal(calculateDamageBonusPercent({ attributeConversion: '성속성', totals: { '화속성 피해': 12 } }), 0);
assert.equal(calculateDamageBonusPercent({ attributeConversion: '', totals: { '성속성 피해': 15 } }), 0);
assert.equal(calculateDamageBonusPercent({ attributeConversion: '성속성', totals: { '성속성 피해': 15 } }), 15);

// 빈 응답과 잘못된 입력에서 예외 없이 기본값을 돌려준다.
for (const empty of [null, undefined, {}, { Cards: null, Effects: null }]) {
  const result = extractCardEffects(empty);
  assert.equal(result.cards.length, 0);
  assert.equal(result.sets.length, 0);
  assert.equal(result.damageBonusPercent, 0);
  assert.equal(result.attributeConversion, '');
}

// `...피해 2.0% 증가` 형태도 읽는다.
assert.deepEqual(parseEffectDescription('백어택 성공 시 적에게 주는 피해 2.0% 증가'), {
  kind: 'numeric',
  label: '백어택 성공 시 적에게 주는 피해',
  value: 2,
  unit: 'percent',
  text: '백어택 성공 시 적에게 주는 피해 2.0% 증가'
});
assert.equal(parseEffectDescription('가디언 토벌 시 가디언에게 받는 피해 7.5% 감소').value, -7.5);

// 세구빛 30각: 변환된 성속성 피해만 전역 배수로 잡고, 암속성 피해 감소는 버린다.
assert.deepEqual(full.buckets, { critRate: 0, critDamage: 0, attributeDamage: 15, enemyDamage: 0, additionalDamage: 0, attackSpeed: 0, moveSpeed: 0 });
assert.equal(full.conditional.backAttackEnemyDamage, 0);
assert.equal(full.ignored.filter(row => row.reason === 'defensive').length, 3);

// 남겨진 바람의 절벽 30각: 치적 +7%가 잡혀야 한다. 파티 디버프는 보수적으로 제외.
const windCliff = extractCardEffects({
  Cards: cardsWithAwake([5, 5, 5, 5, 5, 5]),
  Effects: [{
    Index: 0,
    CardSlots: [0, 1, 2, 3, 4, 5],
    Items: [
      { Name: '남겨진 바람의 절벽 2세트', Description: '암속성 피해 감소 +8.00%' },
      { Name: '남겨진 바람의 절벽 6세트 (12각성합계)', Description: '치명타 적중률 +7.00%' },
      { Name: '남겨진 바람의 절벽 6세트 (18각성합계)', Description: '공격 적중 시 대상이 자신 및 파티원에게 받는 성속성 피해량이 1.0% 증가' },
      { Name: '남겨진 바람의 절벽 6세트 (30각성합계)', Description: '공격 적중 시 대상이 자신 및 파티원에게 받는 성속성 피해량이 1.5% 증가' }
    ]
  }]
});
assert.equal(windCliff.buckets.critRate, 7);
assert.equal(windCliff.buckets.attributeDamage, 0);
assert.equal(windCliff.attributeConversion, '');
assert.equal(windCliff.ignored.filter(row => row.reason === 'party-debuff').length, 2);

// 카제로스의 군단장: 암속성으로 변환되므로 암속성 피해가 전역 배수가 된다.
const kazeros = extractCardEffects({
  Cards: cardsWithAwake([5, 5, 5, 5, 5, 5]),
  Effects: [{
    Index: 0,
    CardSlots: [0, 1, 2, 3, 4, 5],
    Items: [
      { Name: '카제로스의 군단장 2세트', Description: '성속성 피해 감소 +10.00%' },
      { Name: '카제로스의 군단장 6세트 (12각성합계)', Description: '공격 속성을 암속성으로 변환' },
      { Name: '카제로스의 군단장 6세트 (18각성합계)', Description: '암속성 피해 +7.00%' },
      { Name: '카제로스의 군단장 6세트 (30각성합계)', Description: '암속성 피해 +4.00%' }
    ]
  }]
});
assert.equal(kazeros.attributeConversion, '암속성');
assert.equal(kazeros.buckets.attributeDamage, 11);
assert.equal(kazeros.damageBonusPercent, 11);
// 성속성 피해 감소는 방어 계열이라 버려야 한다.
assert.equal(kazeros.ignored.some(row => row.reason === 'defensive'), true);

// 세 우마르가 오리라: 백어택 조건부라 버킷이 아니라 conditional로 간다.
const umar = extractCardEffects({
  Cards: [0, 1, 2].map(slot => ({ Slot: slot, Name: `카드${slot}`, Grade: '전설', AwakeCount: 5, AwakeTotal: 5 })),
  Effects: [{
    Index: 0,
    CardSlots: [0, 1, 2],
    Items: [
      { Name: '세 우마르가 오리라 3세트', Description: '가디언 토벌 시 가디언에게 받는 피해 7.5% 감소' },
      { Name: '세 우마르가 오리라 3세트 (6각성합계)', Description: '백어택 성공 시 적에게 주는 피해 2.0% 증가' },
      { Name: '세 우마르가 오리라 3세트 (15각성합계)', Description: '백어택 성공 시 적에게 주는 피해 7.0% 증가' }
    ]
  }]
});
assert.equal(umar.sets[0].awakeTotal, 15);
assert.equal(umar.conditional.backAttackEnemyDamage, 9);
assert.equal(umar.buckets.enemyDamage, 0);

// 가디언 전용 효과는 레이드 딜과 무관하므로 버린다.
const guardian = extractCardEffects({
  Cards: [0, 1, 2].map(slot => ({ Slot: slot, Name: `카드${slot}`, Grade: '전설', AwakeCount: 5, AwakeTotal: 5 })),
  Effects: [{
    Index: 0,
    CardSlots: [0, 1, 2],
    Items: [{ Name: '부르는 소리 있도다 3세트 (15각성합계)', Description: '가디언 토벌 시 가디언에게 주는 피해 7.0% 증가' }]
  }]
});
assert.deepEqual(guardian.buckets, { critRate: 0, critDamage: 0, attributeDamage: 0, enemyDamage: 0, additionalDamage: 0, attackSpeed: 0, moveSpeed: 0 });
assert.equal(guardian.ignored.filter(row => row.reason === 'guardian-only').length, 1);

// 변환되지 않은 속성의 피해 증가는 로테이션 지분을 알 수 없어 합산하지 않는다.
const mismatched = extractCardEffects({
  Cards: cardsWithAwake([5, 5, 5, 5, 5, 5]),
  Effects: [{
    Index: 0,
    CardSlots: [0, 1, 2, 3, 4, 5],
    Items: [{ Name: '가상 세트 6세트', Description: '화속성 피해 +10.00%' }]
  }]
});
assert.equal(mismatched.buckets.attributeDamage, 0);
assert.equal(mismatched.ignored.filter(row => row.reason === 'attribute-share-unknown').length, 1);

// 신념의 길: 하나의 Description에 <BR>로 효과가 두 개 들어온다. 둘 다 방어 계열이라 버린다.
const faithPath = extractCardEffects({
  Cards: cardsWithAwake([5, 5, 5, 5, 5, 5]),
  Effects: [{
    Index: 0,
    CardSlots: [0, 1, 2, 3, 4, 5],
    Items: [{ Name: '신념의 길 6세트 (12각성합계)', Description: '물리 방어력 +4.00%<BR><BR>마법 방어력 +4.00%' }]
  }]
});
assert.equal(faithPath.unparsed.length, 0);
assert.equal(faithPath.ignored.filter(row => row.reason === 'defensive').length, 2);
assert.equal(faithPath.totals['물리 방어력'], 4);
assert.equal(faithPath.totals['마법 방어력'], 4);

assert.equal(parseEffectDescriptions('물리 방어력 +4.00%<BR><BR>마법 방어력 +4.00%').length, 2);
assert.equal(parseEffectDescriptions('공격 속도 +4.00%').length, 1);
assert.equal(parseEffectDescriptions('').length, 0);

// 피어나는 화염의 가호: 공격 속도는 음속 돌파 계산에 쓰이므로 버리지 않는다.
const flameBless = extractCardEffects({
  Cards: cardsWithAwake([5, 5, 5, 5, 5, 5]),
  Effects: [{
    Index: 0,
    CardSlots: [0, 1, 2, 3, 4, 5],
    Items: [{ Name: '피어나는 화염의 가호 6세트 (12각성합계)', Description: '공격 속도 +4.00%' }]
  }]
});
assert.equal(flameBless.buckets.attackSpeed, 4);
assert.equal(flameBless.ignored.length, 0);
assert.equal(flameBless.unparsed.length, 0);

console.log('card effect tests passed');
