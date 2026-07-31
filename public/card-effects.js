/**
 * 카드 세트 효과 파싱
 *
 * 공식 API의 ArmoryCard.Effects는 세트 효과를 텍스트로만 준다.
 * 요구 조건이 Items[].Name에 `"세상을 구하는 빛 6세트 (18각성합계)"` 형태로 들어있으므로
 * 여기서 세트 수와 각성합계를 뽑아, 실제 장착 카드로 계산한 값과 대조해 통과 여부를 정한다.
 *
 * API가 달성한 효과만 주는지 전체 단계를 주는지는 확인되지 않았다.
 * 어느 쪽이든 결과가 같도록 항상 자체 계산값으로 다시 판정한다.
 */

const SET_NAME_PATTERN = /^(.*?)\s*(\d+)세트(?:\s*\((\d+)각성합계\))?\s*$/;
const NUMERIC_EFFECT_PATTERN = /^(.*?)\s*([+-])\s*([\d,.]+)\s*(%?)\s*$/;
const ATTRIBUTE_CONVERSION_PATTERN = /공격\s*속성을\s*(\S+?)으?로\s*변환/;

export function parseSetRequirement(name) {
  const match = SET_NAME_PATTERN.exec(String(name || '').trim());
  if (!match) return null;
  return {
    setName: match[1].trim(),
    requiredSetCount: Number(match[2]),
    requiredAwakeTotal: match[3] === undefined ? 0 : Number(match[3])
  };
}

export function parseEffectDescription(description) {
  const text = String(description || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const conversion = ATTRIBUTE_CONVERSION_PATTERN.exec(text);
  if (conversion) {
    return { kind: 'attributeConversion', attribute: conversion[1], text };
  }

  const numeric = NUMERIC_EFFECT_PATTERN.exec(text);
  if (!numeric) return { kind: 'unparsed', text };

  const value = Number(numeric[3].replace(/,/g, ''));
  if (!Number.isFinite(value)) return { kind: 'unparsed', text };

  return {
    kind: 'numeric',
    label: numeric[1].trim(),
    value: numeric[2] === '-' ? -value : value,
    unit: numeric[4] === '%' ? 'percent' : 'flat',
    text
  };
}

function cardsBySlot(cards) {
  const bySlot = new Map();
  for (const card of Array.isArray(cards) ? cards : []) {
    if (card && Number.isFinite(Number(card.Slot))) bySlot.set(Number(card.Slot), card);
  }
  return bySlot;
}

export function extractCardEffects(armoryCard) {
  const cards = Array.isArray(armoryCard?.Cards) ? armoryCard.Cards : [];
  const bySlot = cardsBySlot(cards);

  const cardList = cards.map(card => ({
    slot: Number(card.Slot),
    name: String(card.Name || ''),
    grade: String(card.Grade || ''),
    icon: String(card.Icon || ''),
    awakeCount: Number(card.AwakeCount) || 0,
    awakeTotal: Number(card.AwakeTotal) || 0
  }));

  const result = {
    cards: cardList,
    sets: [],
    totals: {},
    attributeConversion: '',
    damageBonusPercent: 0,
    applied: [],
    skipped: [],
    unparsed: []
  };

  for (const effect of Array.isArray(armoryCard?.Effects) ? armoryCard.Effects : []) {
    const slots = Array.isArray(effect?.CardSlots) ? effect.CardSlots.map(Number) : [];
    // 이 세트에 실제로 꽂혀 있는 카드만으로 세트 수와 각성합계를 다시 센다.
    const equipped = slots.filter(slot => bySlot.has(slot));
    const equippedCount = equipped.length;
    const awakeTotal = equipped.reduce((sum, slot) => sum + (Number(bySlot.get(slot).AwakeCount) || 0), 0);

    let setName = '';
    for (const item of Array.isArray(effect?.Items) ? effect.Items : []) {
      const requirement = parseSetRequirement(item?.Name);
      if (!requirement) {
        result.unparsed.push({ name: String(item?.Name || ''), reason: 'set-requirement' });
        continue;
      }
      if (!setName) setName = requirement.setName;

      const meetsRequirement =
        requirement.requiredSetCount <= equippedCount && requirement.requiredAwakeTotal <= awakeTotal;

      const parsed = parseEffectDescription(item?.Description);
      const entry = {
        name: String(item?.Name || ''),
        setName: requirement.setName,
        requiredSetCount: requirement.requiredSetCount,
        requiredAwakeTotal: requirement.requiredAwakeTotal,
        description: String(item?.Description || ''),
        effect: parsed
      };

      if (!meetsRequirement) {
        result.skipped.push(entry);
        continue;
      }

      result.applied.push(entry);

      if (!parsed) continue;
      if (parsed.kind === 'attributeConversion') {
        result.attributeConversion = parsed.attribute;
      } else if (parsed.kind === 'numeric') {
        result.totals[parsed.label] = round2((result.totals[parsed.label] || 0) + parsed.value);
      } else {
        result.unparsed.push({ name: entry.name, description: entry.description, reason: 'description' });
      }
    }

    result.sets.push({ name: setName, slots, equippedCount, awakeTotal });
  }

  result.damageBonusPercent = calculateDamageBonusPercent(result);
  return result;
}

/**
 * 공격 속성이 변환된 경우에만, 변환된 속성의 피해 증가를 전체 공격에 적용한다.
 * 변환이 없으면 해당 속성 공격이 얼마나 되는지 알 수 없으므로 보수적으로 0으로 둔다.
 * `피해 감소`처럼 방어 계열 항목은 딜 증가에 넣지 않는다.
 */
export function calculateDamageBonusPercent({ attributeConversion, totals }) {
  if (!attributeConversion) return 0;
  const key = `${attributeConversion} 피해`;
  const value = totals?.[key];
  return Number.isFinite(value) ? round2(value) : 0;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
