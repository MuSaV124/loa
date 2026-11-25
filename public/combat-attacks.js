import { SKILL_TYPE } from './class-damage-rules.js';

export const DIRECTION = Object.freeze({ HEAD: 'HEAD', BACK: 'BACK', NON_DIRECTIONAL: 'NON_DIRECTIONAL', UNKNOWN: 'UNKNOWN' });
export const ATTACK_SOURCE = Object.freeze({
  SKILL: 'SKILL', IDENTITY: 'IDENTITY', TRANSFORM: 'TRANSFORM', SUMMON: 'SUMMON',
  AWAKENING: 'AWAKENING', SUPER_AWAKENING: 'SUPER_AWAKENING', DOT: 'DOT', OTHER: 'OTHER'
});
export const ATTACK_STYLE = Object.freeze({ ENTROPY: '사멸', MIXED: '비사멸', HIT_MASTER: '타대', UNKNOWN: 'UNKNOWN' });
const POSITION_ENGRAVINGS = Object.freeze({ '결투의 대가': DIRECTION.HEAD, '기습의 대가': DIRECTION.BACK, '타격의 대가': DIRECTION.NON_DIRECTIONAL });
const TRANSFORM_SKILL_CATEGORIES = new Set(['악마 스킬', '하이퍼 싱크 스킬']);

const SPECIAL_ATTACKS = [{
  className: '브레이커', build: '수라의 길', name: '수라결 기본 공격', direction: DIRECTION.HEAD,
  source: ATTACK_SOURCE.IDENTITY,
  evidence: '공식 깨달음 툴팁(출처), 사용자 게임 확인(수라결 모든 타격 헤드)',
  components: {
    '수라결 기본 공격의 연타 공격': DIRECTION.HEAD,
    '수라결 기본 공격의 마지막 타격': DIRECTION.HEAD
  }
}, {
  className: '디스트로이어', build: '중력 수련', name: '중력 가중 모드 기본 공격', direction: DIRECTION.UNKNOWN,
  source: ATTACK_SOURCE.IDENTITY,
  evidence: '2026-11-18 공식 업데이트 13598(공격 출처)'
}, {
  className: '디스트로이어', build: '중력 수련', name: '볼텍스 그래비티', direction: DIRECTION.UNKNOWN,
  source: ATTACK_SOURCE.IDENTITY,
  evidence: '2026-11-18 공식 업데이트 13598(공격 출처)'
}, {
  className: '버서커', build: '광전사의 비기', name: '블러디 러쉬',
  source: ATTACK_SOURCE.TRANSFORM, evidence: 'https://lostark.game.onstove.com/News/Notice/Views/13598'
}, {
  className: '블레이드', name: '블레이드 버스트',
  source: ATTACK_SOURCE.IDENTITY, evidence: 'https://lostark.game.onstove.com/News/Notice/Views/12914'
}, {
  className: '블래스터', build: '포격 강화', name: '포격 스킬',
  source: ATTACK_SOURCE.TRANSFORM, evidence: 'https://lostark.game.onstove.com/News/Notice/Views/13598'
}, {
  className: '호크아이', name: '실버호크 스킬',
  source: ATTACK_SOURCE.SUMMON, evidence: 'https://www.playlostark.com/en-gb/game/releases/welcome-to-paradise'
}, {
  className: '블래스터', name: 'A.C.T',
  source: ATTACK_SOURCE.SUMMON, evidence: 'https://lostark.game.onstove.com/News/Notice/Views/13598'
}, {
  className: '브레이커', build: '수라의 길', name: '화상',
  source: ATTACK_SOURCE.DOT, evidence: '무사브 공식 아크 그리드 툴팁(6초 화상 피해)'
}];

export function attackDirection(value) {
  if (value === '헤드' || value === DIRECTION.HEAD) return DIRECTION.HEAD;
  if (value === '백' || value === DIRECTION.BACK) return DIRECTION.BACK;
  if (value === false || value === DIRECTION.NON_DIRECTIONAL) return DIRECTION.NON_DIRECTIONAL;
  return DIRECTION.UNKNOWN;
}

export function isDirectional(direction) {
  return direction === DIRECTION.HEAD || direction === DIRECTION.BACK;
}

export function attackDirections(attack) {
  return attack?.directions ?? (isDirectional(attack?.direction) ? [attack.direction] : []);
}

export function specialAttackRecords(className, build) {
  return SPECIAL_ATTACKS.filter(record => record.className === className && (!record.build || record.build === build));
}

export function describeAttack({ name, item, className, build }) {
  const record = specialAttackRecords(className, build).find(entry => entry.name === name || Object.hasOwn(entry.components || {}, name));
  const component = Boolean(record && record.name !== name);
  const type = item?.skillTypeKnown ? item.skillType : null;
  const source = record ? record.source : type === SKILL_TYPE.awakening ? ATTACK_SOURCE.AWAKENING
    : type === SKILL_TYPE.hyperAwakening ? ATTACK_SOURCE.SUPER_AWAKENING
    : TRANSFORM_SKILL_CATEGORIES.has(item?.category) ? ATTACK_SOURCE.TRANSFORM
    : type === SKILL_TYPE.regular || type === SKILL_TYPE.hyperSkill ? ATTACK_SOURCE.SKILL : ATTACK_SOURCE.OTHER;
  const verifiedDirection = component ? record.components[name] : record?.direction;
  const fallback = attackDirection(item?.attackDirection);
  const directions = isDirectional(verifiedDirection) ? [verifiedDirection]
    : [...new Set((item?.attackDirections || [fallback]).map(attackDirection).filter(isDirectional))];
  const direction = directions.length === 1 ? directions[0] : directions.length > 1 ? DIRECTION.UNKNOWN : fallback;
  const forced = attackDirection(item?.forcedAttackDirection);
  return {
    id: [className, build, name].join('/'), className, build, name, source, direction, directions,
    forcedDirection: directions.includes(forced) ? forced : null,
    selectedTripods: item?.selectedTripods || [], criticalEligible: item?.canCrit ?? null,
    evidence: record?.evidence || (item ? '로스트아크 OpenAPI combat-skills 툴팁' : ''),
    confidence: isDirectional(verifiedDirection) ? 'OBSERVED' : directions.length || direction !== DIRECTION.UNKNOWN ? 'TOOLTIP' : 'UNKNOWN',
    parent: component ? record.name : null
  };
}

export function normalizedAttackName(name) {
  return String(name || '').replace(/\s+|[·:]/g, '').toLowerCase();
}

export function inspectAttackShares(shareRows, specials = []) {
  const normalized = normalizedAttackName;
  const specialByName = new Map(specials.map(attack => [normalized(attack.name), attack]));
  const valid = shareRows.filter(row => row?.name && Number.isFinite(Number(row.share ?? row.normalizedShare))
    && Number(row.share ?? row.normalizedShare) > 0);
  const rawTotal = valid.reduce((sum, row) => sum + Number(row.share ?? row.normalizedShare), 0);
  const issues = [];
  if (valid.length !== shareRows.length) issues.push({ kind: 'INVALID_SHARE_ROWS', count: shareRows.length - valid.length });
  const retained = new Map();
  const overlapping = new Map();
  for (const row of valid) {
    const parent = specialByName.get(normalized(row.name));
    for (const name of Object.keys(parent?.components || {})) overlapping.set(normalized(name), parent.name);
  }
  for (const row of valid) {
    const key = normalized(row.name);
    const group = overlapping.get(key);
    if (group) {
      issues.push({ kind: 'COMPONENT_ALREADY_IN_AGGREGATE', name: row.name, aggregate: group });
      continue;
    }
    if (retained.has(key)) {
      issues.push({ kind: 'DUPLICATE_LABEL', name: row.name });
      continue;
    }
    retained.set(key, row);
  }
  const retainedTotal = [...retained.values()].reduce((sum, row) => sum + Number(row.share ?? row.normalizedShare), 0);
  return { retained, specialByName, issues, rawTotal, retainedTotal };
}

export function buildAttackUnits({ className, build, items = [], fallbackItems = [], shareRows = [], extraTargets = [], shareBasis = 'PRESET' }) {
  const specials = specialAttackRecords(className, build);
  const normalized = normalizedAttackName;
  const itemByName = new Map(items.map(item => [normalized(item.name), item]));
  const make = ({ name, shareName = name, item, weight = 0, basis = 'UNVERIFIED' }) => {
    const attack = describeAttack({ name, item, className, build });
    return {
      name, shareName, targetNames: attack.parent ? [name, attack.parent] : [name],
      category: item?.category || '', item, weight, basis, attack
    };
  };
  const { retained, specialByName, issues, rawTotal, retainedTotal } = inspectAttackShares(shareRows, specials);
  const units = [];
  const names = new Set();
  if (retainedTotal > 0) {
    for (const row of retained.values()) {
      const key = normalized(row.name);
      const item = itemByName.get(key) || (!specialByName.has(key) && row.targetNames?.length === 1
        ? itemByName.get(normalized(row.targetNames[0])) : null);
      const name = item?.name || row.name;
      units.push(make({ name, shareName: row.name, item, weight: Number(row.share ?? row.normalizedShare) / retainedTotal, basis: shareBasis }));
      names.add(normalized(name));
    }
  } else {
    const fallback = new Map(fallbackItems.filter(item => item.name).map(item => [normalized(item.name), item]));
    for (const [key, item] of fallback) {
      units.push(make({ name: item.name, item, weight: 1 / fallback.size, basis: 'ESTIMATED_EQUAL' }));
      names.add(key);
    }
  }
  for (const name of [...extraTargets, ...specials.flatMap(attack => [attack.name, ...Object.keys(attack.components || {})])]) {
    const key = normalized(name);
    if (!key || names.has(key)) continue;
    const item = itemByName.get(key);
    units.push(make({ name: item?.name || name, item }));
    names.add(key);
  }
  return { units, issues, rawTotal, retainedTotal };
}

export function classifyAttackStyle(attacks, engravingNames, gearKnown) {
  if (!gearKnown || !attacks.length) return ATTACK_STYLE.UNKNOWN;
  const observed = attacks.filter(attack => attack.weight > 0);
  const share = direction => observed.reduce((sum, attack) => sum + (attack.direction === direction
    || attackDirections(attack).includes(direction) ? attack.weight : 0), 0);
  const head = share(DIRECTION.HEAD), back = share(DIRECTION.BACK), neutral = share(DIRECTION.NON_DIRECTIONAL);
  const active = Object.keys(POSITION_ENGRAVINGS).filter(name => engravingNames.includes(name));
  if (active.length === 1) {
    const direction = POSITION_ENGRAVINGS[active[0]];
    if (direction === DIRECTION.HEAD && head > 0.5) return ATTACK_STYLE.ENTROPY;
    if (direction === DIRECTION.BACK && back > 0.5) return ATTACK_STYLE.ENTROPY;
    if (direction === DIRECTION.NON_DIRECTIONAL && neutral > 0.5) return ATTACK_STYLE.HIT_MASTER;
  }
  if (!active.length && head + back > 0 && neutral > 0) return ATTACK_STYLE.MIXED;
  return ATTACK_STYLE.UNKNOWN;
}

export function isScopedEngraving(name) {
  return Object.hasOwn(POSITION_ENGRAVINGS, name);
}

export function engravingAllowedForBuild(name, style) {
  return style !== ATTACK_STYLE.MIXED || !isScopedEngraving(name);
}

export function scopedEngraving(name, percent, description = '') {
  if (!isScopedEngraving(name)) return null;
  const direction = POSITION_ENGRAVINGS[name];
  if (name === '타격의 대가') return percent > 0 ? { name, direction, base: 0, bonus: percent } : null;
  const text = String(description).replace(/<[^>]*>/g, '');
  const scope = direction === DIRECTION.HEAD ? '헤드' : '백';
  const match = text.match(new RegExp('적에게\\s*주는\\s*피해가\\s*([\\d.]+)\\s*%\\s*증가하며[, ]+'
    + scope + '\\s*어택\\s*성공\\s*시\\s*피해량이\\s*추가로\\s*([\\d.]+)\\s*%'));
  if (!match) return null;
  const base = Number(match[1]), bonus = Number(match[2]);
  if (!Number.isFinite(base) || !Number.isFinite(bonus) || Math.abs(base + bonus - percent) > 0.011) return null;
  return { name, direction, base, bonus };
}

export function engravingScope(attack, engraving) {
  if (attack.source === ATTACK_SOURCE.SUPER_AWAKENING) return false;
  if (engraving.direction === DIRECTION.NON_DIRECTIONAL) {
    if (attack.source === ATTACK_SOURCE.AWAKENING || attackDirections(attack).length) return false;
    if (attack.source === ATTACK_SOURCE.SKILL && attack.direction === DIRECTION.NON_DIRECTIONAL) return true;
    return null;
  }
  if (attack.direction === DIRECTION.UNKNOWN && !attackDirections(attack).length) return null;
  return attackDirections(attack).includes(engraving.direction);
}

export function attackHitModifiers(attack, landed, engravings, conditions, backCardDamage) {
  if (attack.source === ATTACK_SOURCE.SUPER_AWAKENING) return { critRate: 0, enemyDamageSources: [] };
  const direction = attack.forcedDirection ?? (landed === true ? attack.direction : landed);
  const hit = attackDirections(attack).includes(direction) ? direction : null;
  let critRate = 0;
  const enemyDamageSources = [];
  const add = (label, value) => { if (value) enemyDamageSources.push({ label, value }); };
  if (hit === DIRECTION.BACK) {
    critRate = 10;
    add('백어택', 5);
    add('카드 세트 · 백어택', backCardDamage);
  }
  if (hit === DIRECTION.HEAD) add('헤드어택', 20);
  for (const engraving of engravings) {
    const eligible = engravingScope(attack, engraving) === true;
    add(engraving.name, engraving.base);
    if (eligible && (hit === engraving.direction || engraving.direction === DIRECTION.NON_DIRECTIONAL)) {
      add(engraving.base ? engraving.name + ' · 방향 적중' : engraving.name, engraving.bonus);
    }
  }
  for (const rule of conditions) {
    if (hit === rule.direction) add(rule.name, rule.damage);
  }
  return { critRate, enemyDamageSources };
}

export function directionRate(value) {
  if (value == null || !String(value).trim()) return null;
  const percent = Number(value);
  return Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent / 100 : null;
}

export function mixAttackOutcomes(missed, hit, rate) {
  if (rate <= 0) return missed;
  if (rate >= 1) return hit;
  const mix = (a, b) => a * (1 - rate) + b * rate;
  return {
    ...missed,
    value: mix(missed.value, hit.value),
    alternateValue: mix(missed.alternateValue, hit.alternateValue),
    multiCritContribution: mix(missed.multiCritContribution, hit.multiCritContribution),
    critHitStackingUnverified: missed.critHitStackingUnverified || hit.critHitStackingUnverified
  };
}

export function attackOutcomes(attack, theoryDirections, rates, evaluate) {
  if (attack?.forcedDirection) return evaluate(attack.forcedDirection);
  if (rates) {
    let combined = evaluate(null);
    let total = Math.max(0, 1 - rates.reduce((sum, row) => sum + row.rate, 0));
    for (const { direction, rate } of rates) {
      if (rate <= 0) continue;
      total += rate;
      const hit = evaluate(direction);
      combined = {
        result: mixAttackOutcomes(combined.result, hit.result, rate / total),
        normal: mixAttackOutcomes(combined.normal, hit.normal, rate / total)
      };
    }
    return combined;
  }
  if (!theoryDirections?.length) return evaluate(null);
  return theoryDirections.map(evaluate).reduce((best, next) => best.result.value >= next.result.value ? best : next);
}
