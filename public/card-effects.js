/**
 * 카드 세트 효과 파싱
 *
 * 공식 API의 ArmoryCard.Effects는 세트 효과를 텍스트로만 준다.
 * 요구 조건이 Items[].Name에 `"세상을 구하는 빛 6세트 (18각성합계)"` 형태로 들어있으므로
 * 여기서 세트 수와 각성합계를 뽑아, 실제 장착 카드로 계산한 값과 대조해 통과 여부를 정한다.
 *
 * API는 달성한 효과만 내려준다. 24각 캐릭터에는 30각성합계 항목이 아예 오지 않고,
 * 0각 캐릭터에는 각성 항목 자체가 없는 것을 실제 응답으로 확인했다.
 * 그래도 자체 계산값으로 다시 판정하는 이유는 API 동작이 바뀌어도 결과가 같게 하기 위해서다.
 */

const SET_NAME_PATTERN = /^(.*?)\s*(\d+)세트(?:\s*\((\d+)각성합계\))?\s*$/;
// `성속성 피해 +7.00%` 형태
const SIGNED_EFFECT_PATTERN = /^(.*?)\s*([+-])\s*([\d,.]+)\s*(%?)\s*$/;
// `백어택 성공 시 적에게 주는 피해 2.0% 증가` 형태
const TRAILING_EFFECT_PATTERN = /^(.*?)\s*([\d,.]+)\s*%\s*(증가|감소)\s*$/;
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

/**
 * 하나의 Description에 `물리 방어력 +4.00%<BR><BR>마법 방어력 +4.00%` 처럼
 * 효과가 여러 개 들어오므로 <BR>로 나눠 각각 파싱한다.
 */
export function parseEffectDescriptions(description) {
  return String(description || '')
    .split(/<\s*br\s*\/?\s*>/gi)
    .map(part => parseEffectDescription(part))
    .filter(Boolean);
}

export function parseEffectDescription(description) {
  const text = String(description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const conversion = ATTRIBUTE_CONVERSION_PATTERN.exec(text);
  if (conversion) {
    return { kind: 'attributeConversion', attribute: conversion[1], text };
  }

  const signed = SIGNED_EFFECT_PATTERN.exec(text);
  if (signed) {
    const value = Number(signed[3].replace(/,/g, ''));
    if (!Number.isFinite(value)) return { kind: 'unparsed', text };
    return {
      kind: 'numeric',
      label: signed[1].trim(),
      value: signed[2] === '-' ? -value : value,
      unit: signed[4] === '%' ? 'percent' : 'flat',
      text
    };
  }

  const trailing = TRAILING_EFFECT_PATTERN.exec(text);
  if (trailing) {
    const value = Number(trailing[2].replace(/,/g, ''));
    if (!Number.isFinite(value)) return { kind: 'unparsed', text };
    return {
      kind: 'numeric',
      label: trailing[1].trim(),
      value: trailing[3] === '감소' ? -value : value,
      unit: 'percent',
      text
    };
  }

  return { kind: 'unparsed', text };
}

/**
 * 파싱된 효과를 딜 공식의 버킷으로 분류한다.
 * scoreCore는 치명/진화형피해/추가피해/적주피/공격력/스킬피해/각인/쿨감 버킷을 곱하므로
 * 변환된 속성 피해는 그 어디에도 속하지 않는 별도 버킷으로 둔다.
 *
 * 조건이 붙은 효과는 무조건 적용하지 않고 conditional로 분리해 호출부가 결정하게 한다.
 * 판단 근거가 부족한 항목은 합산하지 않고 ignored에 남긴다.
 */
export function classifyEffect(parsed, attributeConversion) {
  if (!parsed || parsed.kind !== 'numeric') return null;
  const { label, value } = parsed;

  if (/피해\s*감소$/.test(label)) return { target: 'ignored', reason: 'defensive' };
  if (/(방어력|생명력|보호막|회복량)$/.test(label)) return { target: 'ignored', reason: 'defensive' };
  if (/^가디언 토벌 시/.test(label)) return { target: 'ignored', reason: 'guardian-only' };
  // 대상이 받는 피해를 늘리는 파티 디버프. 본인 딜 반영 방식이 확인되지 않아 합산하지 않는다.
  // `...받는 성속성 피해량이` 처럼 조사가 붙어 오므로 끝의 조사를 허용한다.
  if (/받는\s.*피해(량)?[이가은는]?$/.test(label)) return { target: 'ignored', reason: 'party-debuff' };

  if (/^치명타 적중률$/.test(label)) return { target: 'critRate', value };
  if (/^치명타 피해$/.test(label)) return { target: 'critDamage', value };
  // 공격 속도는 딜 버킷을 직접 곱하지는 않지만 음속 돌파 계산에 쓰이므로 버리지 않는다.
  if (/^공격 속도$/.test(label)) return { target: 'attackSpeed', value };
  if (/^이동 속도$/.test(label)) return { target: 'moveSpeed', value };
  if (/^백어택 성공 시 적에게 주는 피해$/.test(label)) {
    return { target: 'conditional', key: 'backAttackEnemyDamage', value };
  }
  if (/^적에게 주는 피해$/.test(label)) return { target: 'enemyDamage', value };
  if (/^추가 피해$/.test(label)) return { target: 'additionalDamage', value };

  const attributeMatch = /^(\S+속성) 피해$/.exec(label);
  if (attributeMatch) {
    // 공격 속성이 그 속성으로 변환된 경우에만 전체 공격에 적용된다.
    if (attributeConversion && attributeMatch[1] === attributeConversion) {
      return { target: 'attributeDamage', value };
    }
    return { target: 'ignored', reason: 'attribute-share-unknown' };
  }

  return { target: 'ignored', reason: 'unclassified' };
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
    // scoreCore의 딜 버킷에 그대로 더할 수 있는 값들.
    buckets: { critRate: 0, critDamage: 0, attributeDamage: 0, enemyDamage: 0, additionalDamage: 0, attackSpeed: 0, moveSpeed: 0 },
    // 조건 충족 여부를 호출부가 판단해야 하는 값들.
    conditional: { backAttackEnemyDamage: 0 },
    applied: [],
    skipped: [],
    ignored: [],
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

      const parsedList = parseEffectDescriptions(item?.Description);
      const entry = {
        name: String(item?.Name || ''),
        setName: requirement.setName,
        requiredSetCount: requirement.requiredSetCount,
        requiredAwakeTotal: requirement.requiredAwakeTotal,
        description: String(item?.Description || ''),
        effects: parsedList
      };

      if (!meetsRequirement) {
        result.skipped.push(entry);
        continue;
      }

      result.applied.push(entry);

      for (const parsed of parsedList) {
        if (parsed.kind === 'attributeConversion') {
          result.attributeConversion = parsed.attribute;
        } else if (parsed.kind === 'numeric') {
          result.totals[parsed.label] = round2((result.totals[parsed.label] || 0) + parsed.value);
        } else {
          result.unparsed.push({ name: entry.name, description: entry.description, reason: 'description' });
        }
      }
    }

    result.sets.push({ name: setName, slots, equippedCount, awakeTotal });
  }

  result.damageBonusPercent = calculateDamageBonusPercent(result);

  // 속성 변환은 루프 도중에 확정되므로, 버킷 분류는 전체를 다 읽은 뒤 한 번 더 돈다.
  for (const entry of result.applied) {
    for (const parsed of entry.effects) {
      const classified = classifyEffect(parsed, result.attributeConversion);
      if (!classified) continue;
      if (classified.target === 'ignored') {
        result.ignored.push({ name: entry.name, description: parsed.text, reason: classified.reason });
      } else if (classified.target === 'conditional') {
        result.conditional[classified.key] = round2((result.conditional[classified.key] || 0) + classified.value);
      } else {
        result.buckets[classified.target] = round2((result.buckets[classified.target] || 0) + classified.value);
      }
    }
  }

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
