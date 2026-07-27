export const SKILL_EFFECT_KEYS = [
  'critRate',
  'critDamage',
  'critHitDamage',
  'additionalDamage',
  'enemyDamage',
  'attackPower',
  'attackSpeed',
  'moveSpeed',
  'skillDamage'
];

export const SKILL_EFFECT_LABELS = {
  critRate: '치적',
  critDamage: '치피',
  critHitDamage: '치명타 적중 주피',
  additionalDamage: '추피',
  enemyDamage: '적주피',
  attackPower: '공격력',
  attackSpeed: '공속',
  moveSpeed: '이속',
  skillDamage: '스킬 피해'
};

const PERCENT = '([+-]?\\d+(?:\\.\\d+)?)\\s*%';
const CHANGE = '(?:만큼\\s*)?(증가|감소|높아지|낮아지)';
const EFFECT_PATTERNS = {
  critRate: [
    new RegExp(`치명타\\s*(?:적중\\s*)?(?:확률|률)(?:이|가|을|를)?\\s*${PERCENT}\\s*${CHANGE}`, 'gi')
  ],
  critDamage: [
    new RegExp(`치명타\\s*(?:피해|피해량)(?:이|가|을|를)?\\s*${PERCENT}\\s*${CHANGE}`, 'gi')
  ],
  critHitDamage: [
    new RegExp(`치명타\\s*적중\\s*시[^.!?]{0,45}?적에게\\s*주는\\s*피해(?:량)?(?:이|가|을|를)?\\s*${PERCENT}\\s*${CHANGE}`, 'gi')
  ],
  additionalDamage: [
    new RegExp(`추가\\s*피해(?:량)?(?:이|가|을|를)?\\s*${PERCENT}\\s*${CHANGE}`, 'gi')
  ],
  enemyDamage: [
    new RegExp(`적에게\\s*주는\\s*피해(?:량)?(?:이|가|을|를)?\\s*${PERCENT}\\s*${CHANGE}`, 'gi')
  ],
  attackPower: [
    new RegExp(`(?:자신(?:과|의)?\\s*)?공격력(?:이|가|을|를)?\\s*${PERCENT}\\s*${CHANGE}`, 'gi')
  ],
  attackSpeed: [
    new RegExp(`공격\\s*(?:및|과)\\s*이동\\s*속도(?:가|는|를|이)?\\s*${PERCENT}\\s*${CHANGE}`, 'gi'),
    new RegExp(`공격\\s*속도(?:와|및)\\s*이동\\s*속도(?:가|는|를|이)?\\s*${PERCENT}\\s*${CHANGE}`, 'gi'),
    new RegExp(`공격\\s*속도(?:가|는|를|이)?\\s*${PERCENT}\\s*${CHANGE}`, 'gi')
  ],
  moveSpeed: [
    new RegExp(`공격\\s*(?:및|과)\\s*이동\\s*속도(?:가|는|를|이)?\\s*${PERCENT}\\s*${CHANGE}`, 'gi'),
    new RegExp(`공격\\s*속도(?:와|및)\\s*이동\\s*속도(?:가|는|를|이)?\\s*${PERCENT}\\s*${CHANGE}`, 'gi'),
    new RegExp(`이동\\s*속도(?:가|는|를|이)?\\s*${PERCENT}\\s*${CHANGE}`, 'gi')
  ],
  skillDamage: [
    new RegExp(`(?:해당\\s*)?(?:스킬|공격)(?:의|로)?[^.!?]{0,30}?(?:피해|피해량)(?:이|가|을|를)?\\s*${PERCENT}\\s*${CHANGE}`, 'gi'),
    new RegExp(`(?:^|[.!?]\\s*)(?:주는\\s*)?피해(?:량)?(?:이|가|을|를)?\\s*${PERCENT}\\s*${CHANGE}`, 'gim')
  ]
};

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function emptyEffects() {
  return Object.fromEntries(SKILL_EFFECT_KEYS.map(key => [key, 0]));
}

export function emptySkillEffectState() {
  return { items: [], calculableItems: [], selectedTripodCount: 0, ignoredCooldownCount: 0 };
}

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&#37;/gi, '%')
    .replace(/&#43;/gi, '+')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseJsonString(value) {
  const text = String(value ?? '').trim();
  if (!text || (!text.startsWith('{') && !text.startsWith('['))) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export function collectSkillTooltipTexts(tooltip) {
  const texts = [];
  const seenObjects = new Set();
  const visit = value => {
    if (value == null) return;
    if (typeof value === 'string') {
      const parsed = parseJsonString(value);
      if (parsed) return visit(parsed);
      const text = decodeEntities(value);
      if (text) texts.push(text);
      return;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return;
    if (typeof value !== 'object' || seenObjects.has(value)) return;
    seenObjects.add(value);
    if (Array.isArray(value)) return value.forEach(visit);
    Object.values(value).forEach(visit);
  };
  visit(tooltip);
  return [...new Set(texts)];
}

function signedValue(rawValue, direction) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return 0;
  return /감소|낮아지/.test(direction || '') ? -Math.abs(value) : value;
}

function strongestMatch(text, patterns) {
  let selected = 0;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const value = signedValue(match[1], match[2]);
      if (Math.abs(value) > Math.abs(selected)) selected = value;
    }
  }
  return round2(selected);
}

function removeCritHitDamageClauses(text) {
  return text.replace(/치명타\s*적중\s*시[^.!?]{0,80}?적에게\s*주는\s*피해(?:량)?(?:이|가|을|를)?\s*[+-]?\d+(?:\.\d+)?\s*%\s*(?:증가|감소|높아지|낮아지)[^.!?]*/gi, ' ');
}

function removeSpecificDamageClauses(text) {
  return text
    .replace(/치명타\s*(?:피해|피해량)[^.!?]{0,30}?[+-]?\d+(?:\.\d+)?\s*%\s*(?:증가|감소|높아지|낮아지)[^.!?]*/gi, ' ')
    .replace(/추가\s*피해(?:량)?[^.!?]{0,30}?[+-]?\d+(?:\.\d+)?\s*%\s*(?:증가|감소|높아지|낮아지)[^.!?]*/gi, ' ')
    .replace(/적에게\s*주는\s*피해(?:량)?[^.!?]{0,30}?[+-]?\d+(?:\.\d+)?\s*%\s*(?:증가|감소|높아지|낮아지)[^.!?]*/gi, ' ');
}

export function parseSkillEffectText(value) {
  const text = decodeEntities(value);
  const effects = emptyEffects();
  if (!text) return effects;

  for (const key of SKILL_EFFECT_KEYS) {
    let source = text;
    if (key === 'enemyDamage') source = removeCritHitDamageClauses(source);
    if (key === 'skillDamage') source = removeSpecificDamageClauses(removeCritHitDamageClauses(source));
    effects[key] = strongestMatch(source, EFFECT_PATTERNS[key]);
  }
  return effects;
}

export function hasSkillEffects(effects) {
  return SKILL_EFFECT_KEYS.some(key => Math.abs(Number(effects?.[key] || 0)) > 0.0001);
}

function mergeTripodEffects(target, source) {
  for (const key of SKILL_EFFECT_KEYS) {
    const value = Number(source?.[key] || 0);
    if (!Number.isFinite(value) || Math.abs(value) < 0.0001) continue;
    if (key === 'skillDamage') {
      target.skillDamageMultiplier *= 1 + value / 100;
      continue;
    }
    target.effects[key] += value;
  }
}

function parseSelectedTripod(tripod) {
  const texts = collectSkillTooltipTexts(tripod?.Tooltip);
  const effects = emptyEffects();
  for (const text of texts) {
    const parsed = parseSkillEffectText(text);
    for (const key of SKILL_EFFECT_KEYS) {
      if (Math.abs(Number(parsed[key] || 0)) > Math.abs(Number(effects[key] || 0))) effects[key] = parsed[key];
    }
  }
  for (const key of SKILL_EFFECT_KEYS) effects[key] = round2(effects[key]);
  return {
    tier: Number(tripod?.Tier || 0),
    slot: Number(tripod?.Slot || 0),
    name: String(tripod?.Name || '').trim(),
    icon: String(tripod?.Icon || '').trim(),
    effects,
    ignoredCooldown: texts.some(text => /재사용\s*대기시간|쿨타임|쿨다운/i.test(text))
  };
}

export function extractCombatSkillEffects(skills) {
  const result = emptySkillEffectState();
  for (const skill of Array.isArray(skills) ? skills : []) {
    const selectedTripods = (Array.isArray(skill?.Tripods) ? skill.Tripods : [])
      .filter(tripod => tripod?.IsSelected === true)
      .map(parseSelectedTripod);
    result.selectedTripodCount += selectedTripods.length;
    result.ignoredCooldownCount += selectedTripods.filter(tripod => tripod.ignoredCooldown).length;

    const merged = { effects: emptyEffects(), skillDamageMultiplier: 1 };
    for (const tripod of selectedTripods) mergeTripodEffects(merged, tripod.effects);
    merged.effects.skillDamage = round2((merged.skillDamageMultiplier - 1) * 100);
    for (const key of SKILL_EFFECT_KEYS) merged.effects[key] = round2(merged.effects[key]);

    const item = {
      name: String(skill?.Name || '').trim(),
      icon: String(skill?.Icon || '').trim(),
      level: Number(skill?.Level || 0),
      type: String(skill?.Type || '').trim(),
      skillType: Number(skill?.SkillType || 0),
      effects: merged.effects,
      selectedTripods
    };
    result.items.push(item);
    if (hasSkillEffects(item.effects)) result.calculableItems.push(item);
  }
  return result;
}

export function formatSkillEffectSummary(effects) {
  return SKILL_EFFECT_KEYS
    .filter(key => Math.abs(Number(effects?.[key] || 0)) > 0.0001)
    .map(key => `${SKILL_EFFECT_LABELS[key]} ${Number(effects[key]) > 0 ? '+' : ''}${round2(effects[key])}%`)
    .join(' / ');
}
