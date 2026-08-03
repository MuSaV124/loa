import { SKILL_EFFECT_KEYS, hasSkillEffects, parseSkillEffectText } from './skill-effects.js?v=5.15.6';

const EFFECT_KEYS = [...SKILL_EFFECT_KEYS];

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function emptyEffects() {
  return Object.fromEntries(EFFECT_KEYS.map(key => [key, 0]));
}

function normalize(value) {
  return String(value || '').replace(/\s+/g, '').replace(/[·:'"“”‘’]/g, '').trim().toLowerCase();
}

function cleanText(value) {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&#37;/gi, '%')
    .replace(/&#43;/gi, '+')
    .replace(/\|\|/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
}

function parseTooltipPayload(effect) {
  const rawTooltip = effect?.raw?.ToolTip ?? effect?.raw?.Tooltip ?? effect?.tooltip ?? '';
  let payload = null;
  if (typeof rawTooltip === 'string' && rawTooltip.trim().startsWith('{')) {
    try { payload = JSON.parse(rawTooltip); } catch {}
  } else if (rawTooltip && typeof rawTooltip === 'object') {
    payload = rawTooltip;
  }
  const entries = payload && typeof payload === 'object' ? Object.values(payload) : [];
  const nodeName = entries.find(row => row?.type === 'NameTagBox')?.value || '';
  const descriptions = entries
    .filter(row => row?.type === 'MultiTextBox')
    .map(row => cleanText(row?.value))
    .filter(Boolean);
  return {
    nodeName: cleanText(nodeName) || nodeNameFromDescription(effect?.description),
    text: descriptions.join('\n') || cleanText(effect?.tooltip || effect?.description || '')
  };
}

function nodeNameFromDescription(value) {
  const text = cleanText(value);
  const match = text.match(/(?:깨달음|도약)\s*\d+티어\s*(.+?)(?:\s*Lv\.?\s*\d+)?$/i);
  return match?.[1]?.trim() || '';
}

function clauses(value) {
  return cleanText(value)
    .replace(/(증가|감소|상승|강화)하고,\s*/gi, '$1.\n')
    .split(/\n|(?<=[.!?])\s+/)
    .map(row => row.trim())
    .filter(Boolean);
}

function removePerUnitDamage(value) {
  return String(value || '').replace(/(?:보유한|소모한|획득한|남은|보유|소모)[^.!?]{0,60}?1\s*(?:개|회|중첩)?\s*당[^%]{0,90}?\d+(?:\.\d+)?\s*%\s*(?:증가|상승)(?:한다|합니다)?/gi, ' ');
}

function removeNonCombatDamage(value) {
  return String(value || '').replace(/무력화\s*피해량(?:이|가)?\s*\d+(?:\.\d+)?\s*%\s*(?:증가|상승)(?:한다|합니다)?/gi, ' ');
}

function mergeEffects(target, source) {
  for (const key of EFFECT_KEYS) {
    const value = Number(source?.[key] || 0);
    if (!Number.isFinite(value) || Math.abs(value) < 0.0001) continue;
    if (key === 'skillDamage') {
      target.skillDamage = ((1 + Number(target.skillDamage || 0) / 100) * (1 + value / 100) - 1) * 100;
    } else {
      target[key] = Number(target[key] || 0) + value;
    }
  }
  for (const key of EFFECT_KEYS) target[key] = round2(target[key]);
  return target;
}

function normalizeScopedDamage(effects) {
  const result = { ...effects };
  if (Math.abs(Number(result.enemyDamage || 0)) > 0.0001) {
    result.skillDamage = ((1 + Number(result.skillDamage || 0) / 100)
      * (1 + Number(result.enemyDamage || 0) / 100) - 1) * 100;
    result.enemyDamage = 0;
  }
  for (const key of EFFECT_KEYS) result[key] = round2(result[key]);
  return result;
}

function unique(values) {
  const seen = new Set();
  return values.filter(value => {
    const key = normalize(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function quotedSkillTargets(clause) {
  const source = String(clause || '');
  const withSkill = [...source.matchAll(/[\'"“”‘’]([^\'"“”‘’]{1,45})[\'"“”‘’]\s*스킬/gi)].map(match => match[1].trim());
  const damageIndex = source.search(/피해량|피해가/i);
  const damagePrefix = damageIndex >= 0 ? source.slice(Math.max(0, damageIndex - 100), damageIndex) : '';
  const withDamage = [...damagePrefix.matchAll(/[\'"“”‘’]([^\'"“”‘’]{1,45})[\'"“”‘’]/gi)].map(match => match[1].trim());
  return unique([...withSkill, ...withDamage]);
}

function knownSkillTargets(clause, knownSkills) {
  const source = normalize(clause);
  const direct = knownSkills.filter(name => {
    const key = normalize(name);
    return key && (source.includes(`${key}스킬`) || source.includes(`${key}피해량`) || source.includes(`${key}의피해량`));
  });
  if (direct.length || !/피해량|피해가/.test(source)) return direct;
  const mentioned = knownSkills.filter(name => {
    const key = normalize(name);
    return key && source.includes(key);
  });
  return mentioned.length === 1 ? mentioned : [];
}

function categorySelector(clause, knownCategories) {
  const source = String(clause || '');
  const known = knownCategories
    .sort((a, b) => b.length - a.length)
    .find(category => normalize(source).includes(`${normalize(category).replace(/스킬$/, '')}스킬`));
  if (known) return known.replace(/\s*스킬\s*$/, '').trim();

  const explicit = source.match(/(?:^|[,.]\s*|\s)(초각성|각성기|일반|충격|기력|포격|실버호크|고대의?\s*정령|루인|헤드어택|백어택)\s*스킬(?:의|이|가|은|는|을|로|에서|에)/i);
  if (explicit) return explicit[1].trim();
  const damageCategory = source.match(/(?:^|\s)(초각성기|각성기)(?:의)?\s*피해량/i);
  return damageCategory?.[1]?.replace(/기$/, '')?.trim() || '';
}

function inferredDamageTargets(clause) {
  const source = String(clause || '');
  if (/당\s*피해량/i.test(source)) return [];
  const namedSkills = [...source.matchAll(/(?:^|[,]\s*)(?:또한\s*)?([가-힣A-Za-z0-9 ·]{2,24}\s*:\s*[가-힣A-Za-z0-9 ·]{1,24})\s*스킬(?:의)?\s*피해량/gi)]
    .map(match => match[1].trim());
  const damageTargets = [...source.matchAll(/(?:^|[,])\s*(?:또한\s*)?[\'"“”‘’]?([가-힣A-Za-z0-9 :·]{2,32}?)[\'"“”‘’]?(?:의)?\s*피해량(?:이|가|을|를)?\s*(?:추가로\s*)?\d/gi)]
    .map(match => match[1].trim());
  return unique([...namedSkills, ...damageTargets]
    .filter(target => !/상태에서\s*주는|스킬\s*사용\s*시|스킬$|받는$|주는$|치명타$|무력화$/i.test(target)));
}

function inferredSkillContextTargets(clause) {
  const source = String(clause || '').trim();
  const possessive = source.match(/^[\'"“”‘’]?([가-힣A-Za-z0-9 :·]{2,32})[\'"“”‘’]?\s*의\s+/i);
  const skill = source.match(/(?:^|이후\s+|후\s+|[,]\s*)[\'"“”‘’]?([가-힣A-Za-z0-9 :·]{2,32}?)[\'"“”‘’]?\s*스킬(?:의|\s+시전\s*시|\s+사용\s*시)/i);
  const skillTarget = String(skill?.[1] || '').replace(/^.*(?:이후|후)\s+/i, '').trim();
  return unique([possessive?.[1]?.includes('스킬') ? '' : possessive?.[1], skillTarget].filter(target => {
    const value = String(target || '').trim();
    const category = value.replace(/\s*스킬\s*$/i, '').trim();
    return value && !/^(?:초각성|초각성기|각성기|일반|충격|기력|포격|실버호크|고대의?\s*정령|루인|헤드어택|백어택)$/i.test(category);
  }));
}

function isSubjectlessEffectClause(clause) {
  return /^(?:치명타|적에게\s*주는|추가\s*피해|피해량|공격\s*속도|이동\s*속도|공격력)/i.test(String(clause || '').trim());
}

function signedPercent(value, direction) {
  const number = Number(value || 0);
  return /감소|낮아/.test(direction || '') ? -Math.abs(number) : number;
}

function augmentPassiveEffects(parsed, clause, classification) {
  const effects = { ...parsed };
  const text = String(clause || '');
  if (classification.scope !== 'global') {
    let strongestDamage = Number(effects.skillDamage || 0);
    for (const match of text.matchAll(/(?:총\s*)?피해량(?:이|가|을|를)?\s*(?:추가로\s*)?(\d+(?:\.\d+)?)\s*%\s*(증가|강화|감소|낮아지)/gi)) {
      const value = signedPercent(match[1], match[2]);
      if (Math.abs(value) > Math.abs(strongestDamage)) strongestDamage = value;
    }
    effects.skillDamage = round2(strongestDamage);
  }
  const enemy = text.match(/적에게\s*주는\s*피해(?:량)?(?:이|가)?\s*(?:추가로\s*)?(?:최대\s*)?(\d+(?:\.\d+)?)\s*%\s*(증가|상승|감소)/i)
    || text.match(/자신에게\s*받는\s*피해량(?:이|가)?\s*(\d+(?:\.\d+)?)\s*%\s*(증가|상승|감소)/i);
  if (enemy && Math.abs(signedPercent(enemy[1], enemy[2])) > Math.abs(Number(effects.enemyDamage || 0))) {
    effects.enemyDamage = round2(signedPercent(enemy[1], enemy[2]));
  }
  return effects;
}

function classifyClause(clause, { knownSkills, knownCategories }) {
  const explicitTargets = unique([
    ...quotedSkillTargets(clause),
    ...inferredDamageTargets(clause)
  ]);
  const knownTargets = knownSkillTargets(clause, knownSkills).filter(target => {
    const key = normalize(target);
    return !explicitTargets.some(explicit => {
      const explicitKey = normalize(explicit);
      return key && explicitKey && key !== explicitKey && explicitKey.includes(key);
    });
  });
  const targets = unique([...explicitTargets, ...knownTargets]);
  if (targets.length) return { scope: 'skill', targets, selector: '' };

  const selector = categorySelector(clause, knownCategories);
  if (selector) return { scope: 'category', targets: [], selector };

  const contextTargets = /치명타/i.test(clause) ? inferredSkillContextTargets(clause) : [];
  if (contextTargets.length) return { scope: 'skill', targets: contextTargets, selector: '' };

  if (/(?:상태|태세|변신|폭주|페르소나|아덴|아이덴티티)[^.!?]{0,35}(?:중|에서|진입\s*시|동안|일\s*때)/i.test(clause)) {
    return { scope: 'state', targets: [], selector: '상태 조건' };
  }
  return { scope: 'global', targets: [], selector: '' };
}

export function emptyPassiveSkillEffectState() {
  return { rules: [], globalEffects: emptyEffects(), items: [], unresolved: [] };
}

export function extractArkPassiveSkillEffects(effects, { skillItems = [], shareNames = [], identitySkills = [] } = {}) {
  const result = emptyPassiveSkillEffectState();
  const knownSkills = unique([
    ...skillItems.map(item => item?.name),
    ...shareNames,
    ...identitySkills
  ].filter(Boolean));
  const knownCategories = unique(skillItems.map(item => item?.category).filter(Boolean));
  const seen = new Set();

  for (const [effectIndex, effect] of (Array.isArray(effects) ? effects : []).entries()) {
    const category = String(effect?.name || '').trim();
    if (category !== '깨달음' && category !== '도약') continue;
    const payload = parseTooltipPayload(effect);
    let pendingTargets = [];
    for (const clause of clauses(payload.text)) {
      let classification = classifyClause(clause, { knownSkills, knownCategories });
      if (classification.scope === 'global' && pendingTargets.length && isSubjectlessEffectClause(clause)) {
        classification = { scope: 'skill', targets: pendingTargets, selector: '' };
      }
      const calculableClause = removeNonCombatDamage(removePerUnitDamage(clause));
      const parsed = augmentPassiveEffects(parseSkillEffectText(calculableClause), calculableClause, classification);
      if (!hasSkillEffects(parsed)) {
        pendingTargets = classification.scope === 'skill' ? classification.targets : inferredSkillContextTargets(clause);
        if (payload.nodeName !== '기민함' && !/무력화\s*피해|자신\s*및\s*파티원|파티원에게/i.test(clause) && /%/.test(clause) && /치명타|적에게\s*주는\s*피해|추가\s*피해|공격력|피해량?이?\s*\d/i.test(clause)) {
          result.unresolved.push({ effectIndex: Number(effect?.index ?? effectIndex), category, nodeName: payload.nodeName || category, text: clause });
        }
        continue;
      }
      pendingTargets = [];
      const effectsForRule = classification.scope === 'global' ? parsed : normalizeScopedDamage(parsed);
      const signature = [category, payload.nodeName, classification.scope, classification.targets.map(normalize).join(','), normalize(classification.selector), normalize(clause), JSON.stringify(effectsForRule)].join('|');
      if (seen.has(signature)) continue;
      seen.add(signature);

      const row = {
        effectIndex: Number(effect?.index ?? effectIndex),
        category,
        nodeName: payload.nodeName || category,
        level: Number(effect?.level || 0),
        scope: classification.scope,
        targets: classification.targets,
        selector: classification.selector,
        effects: effectsForRule,
        rawEffects: parsed,
        text: clause
      };
      result.items.push(row);
      if (classification.scope === 'global') mergeEffects(result.globalEffects, effectsForRule);
      else result.rules.push(row);
    }
  }
  return result;
}

function matchesText(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

export function passiveRuleMatchesSkill(rule, skill, { identitySkills = [] } = {}) {
  if (!rule || !skill) return false;
  if (rule.scope === 'state') return true;
  const names = unique([skill.name, skill.shareName, ...(skill.targetNames || [])].filter(Boolean));
  if (rule.scope === 'skill') {
    const normalizedNames = new Set(names.map(normalize));
    return rule.targets.some(target => normalizedNames.has(normalize(target)));
  }
  if (rule.scope !== 'category') return false;

  const selector = String(rule.selector || '').replace(/\s*스킬\s*$/, '').trim();
  if (/초각성/i.test(selector)) {
    return names.some(name => identitySkills.some(identity => matchesText(name, identity)));
  }
  return names.some(name => matchesText(name, selector)) || matchesText(skill.category, selector);
}

export function passiveEffectsForSkill(passiveState, skill, options = {}) {
  const effects = emptyEffects();
  const rules = [];
  for (const rule of passiveState?.rules || []) {
    if (!passiveRuleMatchesSkill(rule, skill, options)) continue;
    mergeEffects(effects, rule.effects);
    rules.push(rule);
  }
  return { effects, rules };
}

export function mergeSkillEffects(...sources) {
  const effects = emptyEffects();
  for (const source of sources) mergeEffects(effects, source || {});
  return effects;
}
