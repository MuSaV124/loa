import { collectSkillTooltipTexts, parseSkillManaUsage } from './skill-effects.js';
import { normalizeSkillCycleName, skillCooldownSeconds } from './skill-cycle.js';

export const MANA_PROFILE_PATCH = '2026-11-19';
// Add measured records only after matching the character signature and reviewing the source.
export const VERIFIED_MANA_PROFILES = Object.freeze([]);

const SPECIAL_RESOURCES = {
  인파이터: ['special', '기력·충격'],
  기공사: ['special', '내공·금강선공'],
  브레이커: ['special', '기력·충격·투기'],
  스카우터: ['state-dependent', '배터리·하이퍼 싱크'],
  데모닉: ['state-dependent', '마나·잠식 게이지·악마화'],
  아르카나: ['mixed', '마나·카드 수급'],
  블레이드: ['mixed', '마나·블레이드 오브'],
  워로드: ['mixed', '마나·실드 게이지'],
  소울이터: ['state-dependent', '마나·영혼석·빙의'],
  소서리스: ['mixed', '마나·마력 게이지']
};

function positiveNumber(value) {
  const text = String(value ?? '').replace(/,/g, '').trim();
  const number = /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}

function readCostModifier(texts, source, rune = false) {
  const relevant = texts.filter(text => /마나\s*(?:소모|소비)|소모\s*(?:되는|하는)\s*마나|마나.{0,20}추가로\s*소모/.test(text));
  if (!relevant.length) return null;
  const pattern = rune
    ? /^(?:\[집중\]\s*)?스킬\s*사용\s*시\s*마나\s*(?:소모량|소비량)(?:이|을)?\s*([\d.]+)\s*%\s*(감소|증가)\s*(?:한다|된다|시킨다)?[.!]?$/
    : /^(?:해당\s*스킬의\s*|스킬의\s*)?마나\s*(?:소모량|소비량)(?:이|을)?\s*([\d.]+)\s*%\s*(감소|증가)\s*(?:한다|된다|시킨다)?[.!]?$/;
  const matches = relevant.map(text => text.match(pattern));
  const changes = [...new Set(matches.filter(Boolean).map(match => (match[2] === '감소' ? -1 : 1) * Number(match[1])))];
  const percent = changes.length === 1 && matches.every(Boolean) && changes[0] >= -100 && Number.isFinite(changes[0]) ? changes[0] : null;
  return { source, percent };
}

export function skillManaCostProfile(raw, skill) {
  const usage = raw?.Tooltip != null ? parseSkillManaUsage(raw.Tooltip) : skill;
  if (!usage?.manaUsageKnown) return { baseCost: null, preEvolutionCost: null, source: 'unverified', modifiers: [] };
  if (!usage.usesMana) return { baseCost: 0, preEvolutionCost: 0, source: raw ? 'official-api' : 'derived', modifiers: [] };
  const baseCost = positiveNumber(usage.manaCost);
  const modifiers = (Array.isArray(raw?.Tripods) ? raw.Tripods : []).filter(tripod => tripod?.IsSelected === true)
    .map(tripod => readCostModifier(collectSkillTooltipTexts(tripod.Tooltip), tripod.Name || '트라이포드')).filter(Boolean);
  if (raw?.Rune?.Name === '집중') {
    modifiers.push(readCostModifier(collectSkillTooltipTexts(raw.Rune.Tooltip), '집중 룬', true) || { source: '집중 룬', percent: null });
  }
  const valid = baseCost != null && modifiers.length <= 1 && modifiers.every(entry => entry.percent != null);
  return {
    baseCost,
    preEvolutionCost: valid ? baseCost * (1 + (modifiers[0]?.percent || 0) / 100) : null,
    source: raw?.Tooltip ? 'official-api' : 'derived',
    modifiers
  };
}

export function buildCharacterManaProfile(profile, snapshot, rawSkills = [], skillItems = []) {
  const className = profile?.CharacterClassName || snapshot?.profile?.className || '';
  const build = snapshot?.profile?.secondClass || '';
  const rawByName = new Map(rawSkills.map(skill => [normalizeSkillCycleName(skill.Name), skill]));
  const skills = skillItems.map(skill => ({
    name: skill.name, level: skill.level,
    baseCooldown: positiveNumber(skill.baseCooldownSeconds),
    ...skillManaCostProfile(rawByName.get(normalizeSkillCycleName(skill.name)), skill)
  }));
  const stats = Array.isArray(profile?.Stats) ? profile.Stats : [];
  const maxManaStat = stats.find(row => /^최대\s*마나$/.test(row?.Type || ''));
  const maxMana = positiveNumber(maxManaStat?.Value ?? profile?.MaxMana);
  const observedMana = skills.some(skill => skill.baseCost > 0);
  const observedNonMana = skills.some(skill => skill.baseCost === 0);
  const special = Object.hasOwn(SPECIAL_RESOURCES, className) ? SPECIAL_RESOURCES[className] : null;
  const kind = special?.[0] || (observedMana ? 'mana-observed' : 'unknown');
  const resource = special?.[1] || (observedMana ? '장착 스킬에서 마나 사용 확인' : '자원 미확인');
  const signature = JSON.stringify([
    profile?.CharacterName || snapshot?.profile?.name || '', className, build, maxMana,
    stats,
    (rawSkills || []).filter(skill => skillItems.some(item => item.name === skill.Name)).map(skill => [
      skill.Name, skill.Level, skill.SkillType, parseSkillManaUsage(skill.Tooltip),
      (skill.Tripods || []).filter(tripod => tripod.IsSelected).map(tripod => [tripod.Name, tripod.Level, tripod.Tooltip]),
      skill.Rune?.Name || '', skill.Rune?.Grade || ''
    ]).sort((a, b) => a[0].localeCompare(b[0])),
    (snapshot?.gems?.items || []).map(gem => [gem.level, gem.kind, gem.skillNames || gem.skillName]),
    snapshot?.effects?.engraving?.items || [], snapshot?.effects?.bracelet || {}, snapshot?.arkGrid?.slots || [],
    snapshot?.equipment?.combat || [], snapshot?.equipment?.accessories || []
  ]);
  return { className, build, kind, resource, maxMana, observedMana, observedNonMana, skills, signature };
}

export function findVerifiedManaProfile(character, profiles = VERIFIED_MANA_PROFILES, today = new Date().toISOString().slice(0, 10)) {
  if (!character?.signature) return null;
  return profiles.find(profile => profile.signature === character.signature && profile.patch === MANA_PROFILE_PATCH
    && profile.verifiedAt >= MANA_PROFILE_PATCH && profile.verifiedAt <= today && profile.expiresAt >= today
    && profile.source && profile.inputs && Array.isArray(profile.inputs.skills) && profile.inputs.skills.length
    && ['duration', 'maxMana', 'startMana', 'recoveryMana'].every(key => Number.isFinite(profile.inputs[key]))
    && (profile.inputs.recoveryMana === 0 || ['firstRecovery', 'recoveryInterval'].every(key => Number.isFinite(profile.inputs[key])))) || null;
}

export function withManaCooldowns(profile, skillCycle) {
  const cooldowns = new Map((skillCycle?.items || []).map(item => [normalizeSkillCycleName(item.name), skillCooldownSeconds(item)]));
  return (profile?.skills || []).map(item => ({ ...item, effectiveCooldown: cooldowns.get(normalizeSkillCycleName(item.name)) || null }));
}
