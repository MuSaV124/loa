import { collectSkillTooltipTexts, parseSkillManaUsage } from './skill-effects.js';
import { normalizeSkillCycleName, skillCooldownSeconds } from './skill-cycle.js';

export const MANA_PROFILE_PATCH = '2026-11-19';
// Add measured records only after matching the character signature and reviewing the source.
export const VERIFIED_MANA_PROFILES = Object.freeze([]);

const SPECIAL_RESOURCES = {
  가디언나이트: ['state-dependent', '엠버레스의 기운·소켓'],
  인파이터: ['special', '기력·충격'],
  기공사: ['special', '내공·금강선공'],
  브레이커: ['special', '기력·충격·투기'],
  리퍼: ['unknown', '어둠·혼돈 게이지 · 마나 비용 표기 없음'],
  스카우터: ['state-dependent', '배터리·하이퍼 싱크'],
  데모닉: ['state-dependent', '마나·잠식 게이지·악마화'],
  아르카나: ['mixed', '마나·카드 수급'],
  배틀마스터: ['mixed', '마나·버블'],
  블레이드: ['mixed', '마나·블레이드 오브'],
  워로드: ['mixed', '마나·실드 게이지'],
  소울이터: ['state-dependent', '마나·영혼석·빙의'],
  스트라이커: ['mixed', '마나·버블'],
  소서리스: ['mixed', '마나·마력 게이지']
};

function positiveNumber(value) {
  const text = String(value ?? '').trim();
  const number = /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text) ? Number(text.replaceAll(',', '')) : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function readMaximumMana(profile) {
  const stats = Array.isArray(profile?.Stats) ? profile.Stats : [];
  const candidates = stats.filter(row => /^최대\s*마나$/.test(String(row?.Type ?? '').trim()))
    .map(row => ({ value: positiveNumber(row.Value), path: 'ArmoryProfile.Stats[최대 마나]' }));
  candidates.push({ value: positiveNumber(profile?.MaxMana), path: 'ArmoryProfile.MaxMana' });
  const valid = candidates.filter(row => row.value != null);
  if (!valid.length) return { value: null, status: 'unknown', reason: '명시 최대 마나 없음' };
  if (valid.some(row => row.value !== valid[0].value)) return { value: null, status: 'unknown', reason: '최대 마나 필드 불일치' };
  return { ...valid[0], status: 'api' };
}

function currentManaTooltip(raw, skill) {
  if (raw?.Tooltip == null) return { usage: skill, reason: '툴팁 누락' };
  const usage = parseSkillManaUsage(raw.Tooltip);
  if (usage.manaUsageKnown) return { usage };
  let tooltip = raw.Tooltip;
  if (typeof tooltip === 'string') {
    try { tooltip = JSON.parse(tooltip); } catch { return { usage, reason: '현재 레벨 비용 문구 미확인' }; }
  }
  const box = tooltip?.Element_004;
  // The current Korean Armory gives this skill an Ancient Orb cost in the resource row.
  if (box?.type === 'MultiTextBox' && typeof box.value === 'string' &&
      /^정령의 구슬\s+[1-9]\d*\s*소모$/.test(collectSkillTooltipTexts(box.value.split('|')[0])[0] || '')) {
    return { usage: { manaUsageKnown: true, usesMana: false, manaCost: 0 }, alternativeResource: '정령의 구슬' };
  }
  return { usage, reason: box?.type === 'SingleTextBox' ? '설명 시작 · 별도 비용 행 생략' : '현재 레벨 비용 문구 미확인' };
}

function readCostModifier(texts, source, rune = false) {
  const noCost = /^(?:스킬\s*)?(?:발동|시전|사용)\s*시\s*마나를\s*소모하지\s*않는다[.!]?$/;
  const relevant = texts.filter(text => /마나\s*(?:소모|소비)|소모\s*(?:되는|하는)\s*마나|마나.{0,20}추가로\s*소모|마나를\s*소모/.test(text));
  if (!relevant.length) return null;
  const pattern = rune
    ? /^(?:\[집중\]\s*)?스킬\s*사용\s*시\s*마나\s*(?:소모|소비)(?:량)?(?:이|을)?\s*([\d.]+)\s*%\s*(감소|증가)\s*(?:한다|된다|시킨다)?[.!]?$/
    : /^(?:(?:해당\s*)?스킬의\s*|시전\s*시\s*)?마나\s*(?:소모|소비)(?:량)?(?:가|이|을)?\s*([\d.]+)\s*%\s*(감소|증가)(?:\s*한다|\s*된다|\s*시킨다|하고\s*,\s*스킬 사용 시 재사용 대기시간이 [\d.]+\s*초 감소한다|하지만\s*,\s*적에게 주는 피해가 [\d.]+\s*% 증가한다)?[.!]?$/;
  const changes = new Set(relevant.map(text => {
    if (!rune && noCost.test(text)) return -100;
    const match = text.match(pattern);
    return match ? (match[2] === '감소' ? -1 : 1) * Number(match[1]) : null;
  }));
  const [change] = changes;
  const percent = changes.size === 1 && Number.isFinite(change) && change >= -100 ? change : null;
  return { source, percent };
}

export function skillManaCostProfile(raw, skill) {
  const { usage, reason, alternativeResource } = currentManaTooltip(raw, skill);
  const source = raw?.Tooltip ? 'official-api' : 'derived';
  if (!usage?.manaUsageKnown) return { baseCost: null, preEvolutionCost: null, source: 'unverified', modifiers: [], reason };
  if (!usage.usesMana) return { baseCost: 0, preEvolutionCost: 0, source, modifiers: [], alternativeResource };
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
    source, reason: valid ? undefined : '선택 비용 효과 또는 중첩 미확인',
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
  const maximumMana = readMaximumMana(profile);
  const maxMana = maximumMana.value;
  const observedMana = skills.some(skill => skill.baseCost > 0);
  const observedNonMana = skills.some(skill => skill.baseCost === 0);
  const special = Object.hasOwn(SPECIAL_RESOURCES, className) ? SPECIAL_RESOURCES[className] : null;
  const kind = special?.[0] || (observedMana ? 'mana-observed' : 'unknown');
  const resource = special?.[1] || (observedMana ? '장착 스킬에서 마나 사용 확인' : '자원 미확인');
  const signature = JSON.stringify([
    profile?.CharacterName || snapshot?.profile?.name || '', className, build, maxMana, profile?.CharacterLevel ?? null,
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
  return { className, build, kind, resource, maxMana, maximumMana, observedMana, observedNonMana, skills, signature };
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
