import assert from 'node:assert/strict';
import {
  calculateDamageBonusPercent,
  extractCardEffects,
  parseEffectDescription,
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

console.log('card effect tests passed');
