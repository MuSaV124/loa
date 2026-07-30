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
  return {
    items: [],
    calculableItems: [],
    cycleItems: [],
    selectedTripodCount: 0,
    conditionalTripodCount: 0,
    cooldownTripodCount: 0,
    stochasticCooldownCount: 0,
    ignoredCooldownCount: 0,
    usedSkillCount: 0
  };
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

function hasConditionalWording(text) {
  return /(?:적중|공격|스킬|사용|유지|차지|홀딩|폭주|변신|스탠스|게이지|생명력)[^.!?]{0,28}(?:시|동안|경우)|(?:이상|이하)일?\s*때|피격이상\s*면역|백어택|헤드어택|보스\s*등급|조건/gi.test(text);
}

function hasGuaranteedCritWording(text, effects) {
  return Number(effects?.critRate || 0) >= 99.99
    || /항상\s*치명타|확정\s*치명|치명타로\s*적중/gi.test(text);
}

function hasTimedSpeedWording(text) {
  return /\d+(?:\.\d+)?\s*초\s*(?:동안|간)/i.test(text);
}

function round3(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function cooldownDirection(direction) {
  return /증가|늘어/.test(String(direction || '')) ? -1 : 1;
}

export function parseCooldownRuleText(value) {
  const text = decodeEntities(value);
  const out = {
    flatSeconds: 0,
    percentReduction: 0,
    setSeconds: null,
    resetChance: 0,
    stochastic: /일정\s*확률|확률로|랜덤/i.test(text),
    text
  };
  if (!text || !/재사용\s*대기시간|쿨타임|쿨다운/i.test(text)) return out;

  const cooldownIndex = text.search(/재사용\s*대기시간|쿨타임|쿨다운/i);
  const cooldownClause = text.slice(cooldownIndex, cooldownIndex + 120).split(/[!?]|\.(?=\s|$)/)[0];

  const setMatch = cooldownClause.match(/재사용\s*대기시간(?:이|을|은|는)?\s*(\d+(?:\.\d+)?)\s*초로\s*(?:변경|증가|감소|고정)/i);
  if (setMatch) out.setSeconds = round3(setMatch[1]);

  if (!setMatch) {
    const firstEffect = cooldownClause.match(/(\d+(?:\.\d+)?)\s*(%|초)\s*(감소|증가|줄어|늘어)/i);
    if (firstEffect?.[2] === '%') out.percentReduction = round3(Number(firstEffect[1]) * cooldownDirection(firstEffect[3]));
    else if (firstEffect?.[2] === '초') out.flatSeconds = round3(Number(firstEffect[1]) * cooldownDirection(firstEffect[3]));
  }

  const resetMatch = text.match(/(\d+(?:\.\d+)?)\s*%\s*확률로[^.!?]{0,40}?재사용\s*대기시간(?:이|을)?\s*(?:초기화|100\s*%\s*감소)/i);
  if (resetMatch) {
    out.resetChance = round3(resetMatch[1]);
    out.stochastic = true;
  }
  return out;
}

function mergeCooldownRules(rules) {
  const deterministic = rules.filter(rule => !rule.stochastic);
  const setRows = deterministic.filter(rule => Number(rule.setSeconds) > 0);
  return {
    flatSeconds: round3(deterministic.reduce((sum, rule) => sum + Number(rule.flatSeconds || 0), 0)),
    percentReduction: round3(100 * (1 - deterministic.reduce((factor, rule) => factor * (1 - Number(rule.percentReduction || 0) / 100), 1))),
    setSeconds: setRows.length ? Number(setRows[setRows.length - 1].setSeconds) : null,
    stochastic: rules.some(rule => rule.stochastic),
    rules
  };
}

function baseCooldownSeconds(skill) {
  for (const text of collectSkillTooltipTexts(skill?.Tooltip)) {
    const charge = text.match(/(?:스택\s*)?충전\s*시간\s*(?:(\d+(?:\.\d+)?)\s*분(?:\s*(\d+(?:\.\d+)?)\s*초)?|(\d+(?:\.\d+)?)\s*초)/i);
    if (charge) return round3(Number(charge[1] || 0) * 60 + Number(charge[2] || charge[3] || 0));
    const match = text.match(/(?:^|\s)재사용\s*대기시간\s*(?:(\d+(?:\.\d+)?)\s*분(?:\s*(\d+(?:\.\d+)?)\s*초)?|(\d+(?:\.\d+)?)\s*초)(?:\s*$|\s*[|·/])/i);
    if (match) return round3(Number(match[1] || 0) * 60 + Number(match[2] || match[3] || 0));
  }
  return 0;
}

function skillCategory(skill) {
  for (const text of collectSkillTooltipTexts(skill?.Tooltip)) {
    const match = text.match(/\[([^\]]+\s*스킬)\]/);
    if (match) return match[1].replace(/\s+/g, ' ').trim();
    const stance = text.match(/\[([^\]]+)\s*스탠스\]/);
    if (stance) return `${stance[1].replace(/\s+/g, ' ').trim()} 스킬`;
  }
  return '';
}

function runeSummary(rune) {
  if (!rune) return null;
  const text = collectSkillTooltipTexts(rune?.Tooltip).join(' ');
  const cooldownMatch = text.match(/전체\s*재사용\s*대기\s*시간(?:이|을)?\s*(\d+(?:\.\d+)?)\s*%\s*감소/i);
  return {
    name: String(rune?.Name || '').trim(),
    grade: String(rune?.Grade || '').trim(),
    icon: String(rune?.Icon || '').trim(),
    cooldownPercent: round3(cooldownMatch?.[1] || 0),
    stochastic: Boolean(cooldownMatch) && /일정\s*확률|확률로/i.test(text),
    text
  };
}

function parseSelectedTripod(tripod) {
  const texts = collectSkillTooltipTexts(tripod?.Tooltip);
  const joinedText = texts.join(' ');
  const effects = emptyEffects();
  for (const text of texts) {
    const parsed = parseSkillEffectText(text);
    for (const key of SKILL_EFFECT_KEYS) {
      if (Math.abs(Number(parsed[key] || 0)) > Math.abs(Number(effects[key] || 0))) effects[key] = parsed[key];
    }
  }
  // A tripod's "적에게 주는 피해" applies to that skill, not the character-wide
  // enemy-damage bucket. Keep the exported text parser generic, then normalize it
  // once the tooltip is known to belong to a selected tripod.
  if (Math.abs(Number(effects.enemyDamage || 0)) > 0.0001) {
    effects.skillDamage = ((1 + Number(effects.skillDamage || 0) / 100)
      * (1 + Number(effects.enemyDamage || 0) / 100) - 1) * 100;
    effects.enemyDamage = 0;
  }
  for (const key of SKILL_EFFECT_KEYS) effects[key] = round2(effects[key]);
  return {
    tier: Number(tripod?.Tier || 0),
    slot: Number(tripod?.Slot || 0),
    name: String(tripod?.Name || '').trim(),
    icon: String(tripod?.Icon || '').trim(),
    effects,
    timedSpeedBuff: hasTimedSpeedWording(joinedText) && Boolean(effects.attackSpeed || effects.moveSpeed),
    conditional: hasConditionalWording(joinedText),
    guaranteedCrit: hasGuaranteedCritWording(joinedText, effects),
    description: joinedText,
    cooldown: mergeCooldownRules(texts.map(parseCooldownRuleText).filter(rule => /재사용\s*대기시간|쿨타임|쿨다운/i.test(rule.text))),
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
    result.conditionalTripodCount += selectedTripods.filter(tripod => tripod.conditional).length;
    result.cooldownTripodCount += selectedTripods.filter(tripod => tripod.ignoredCooldown).length;
    result.stochasticCooldownCount += selectedTripods.filter(tripod => tripod.cooldown?.stochastic).length;
    result.ignoredCooldownCount = result.stochasticCooldownCount;

    const merged = { effects: emptyEffects(), skillDamageMultiplier: 1 };
    for (const tripod of selectedTripods) mergeTripodEffects(merged, tripod.effects);
    merged.effects.skillDamage = round2((merged.skillDamageMultiplier - 1) * 100);
    for (const key of SKILL_EFFECT_KEYS) merged.effects[key] = round2(merged.effects[key]);
    const timedSpeedEffects = { attackSpeed: 0, moveSpeed: 0 };
    for (const tripod of selectedTripods.filter(row => row.timedSpeedBuff)) {
      for (const key of ['attackSpeed', 'moveSpeed']) {
        if (Math.abs(Number(tripod.effects?.[key] || 0)) > Math.abs(timedSpeedEffects[key])) timedSpeedEffects[key] = Number(tripod.effects[key]);
      }
    }

    const rune = runeSummary(skill?.Rune);
    const cooldown = mergeCooldownRules(selectedTripods.flatMap(tripod => tripod.cooldown?.rules || []));
    const currentTree = Number(skill?.Level || 0) > 1 || selectedTripods.length > 0 || Boolean(rune?.name);
    const item = {
      name: String(skill?.Name || '').trim(),
      icon: String(skill?.Icon || '').trim(),
      level: Number(skill?.Level || 0),
      type: String(skill?.Type || '').trim(),
      skillType: Number(skill?.SkillType || 0),
      cooldownEligible: Number(skill?.SkillType || 0) === 0,
      category: skillCategory(skill),
      baseCooldownSeconds: baseCooldownSeconds(skill),
      cooldown,
      rune,
      currentTree,
      effects: merged.effects,
      timedSpeedEffects,
      conditional: selectedTripods.some(tripod => tripod.conditional),
      guaranteedCrit: selectedTripods.some(tripod => tripod.guaranteedCrit),
      selectedTripods
    };
    result.items.push(item);
    if (currentTree && item.baseCooldownSeconds > 0) result.cycleItems.push(item);
    if (currentTree) result.usedSkillCount += 1;
    if (hasSkillEffects(item.effects)) result.calculableItems.push(item);
  }
  return result;
}

export function skillExperimentItems(skillEffects) {
  return (Array.isArray(skillEffects?.items) ? skillEffects.items : [])
    .filter(item => Number(item?.level || 0) > 0)
    .filter(item => (Array.isArray(item?.selectedTripods) && item.selectedTripods.length > 0) || hasSkillEffects(item?.effects));
}

export function minimumSkillEffectProfile(skillEffects) {
  const items = skillExperimentItems(skillEffects).filter(item => hasSkillEffects(item?.effects));
  const effects = emptyEffects();
  const sources = {};
  for (const key of SKILL_EFFECT_KEYS) {
    const rows = items
      .map(item => ({
        name: item.name || '이름 없는 스킬',
        value: Number((key === 'attackSpeed' || key === 'moveSpeed') ? item?.timedSpeedEffects?.[key] : item?.effects?.[key] || 0)
      }))
      .filter(row => Number.isFinite(row.value) && row.value > 0.0001);
    if (!rows.length) continue;
    const values = rows.map(row => row.value);
    effects[key] = round2(key === 'critRate' ? Math.max(...values) : Math.min(...values));
    sources[key] = rows;
  }
  return { effects, sources, items, itemCount: items.length };
}

export function formatSkillEffectSummary(effects) {
  return SKILL_EFFECT_KEYS
    .filter(key => Math.abs(Number(effects?.[key] || 0)) > 0.0001)
    .map(key => `${SKILL_EFFECT_LABELS[key]} ${Number(effects[key]) > 0 ? '+' : ''}${round2(effects[key])}%`)
    .join(' / ');
}
