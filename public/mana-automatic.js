import { findVerifiedManaProfile } from './mana-character.js';
import { prepareManaScenario } from './mana-recommendation.js?v=6.1.1';
import { normalizeSkillCycleName, skillCooldownSeconds } from './skill-cycle.js';
import { resolveManaEnvironment, SUPPORT_MANA } from './support-mana.js';

// Historical in-game observation used only for the explicitly hypothetical scenario.
export const AUTO_MANA_RECOVERY_SOURCE = 'https://www.inven.co.kr/board/lostark/4821/100754';
const RECOVERY_FRACTION = 0.0444;

export function buildAutomaticManaAnalysis({ character, cycle, knownSkills = [], damageSkills = [], support = 'none', verified = findVerifiedManaProfile(character) } = {}) {
  const supporter = Object.hasOwn(SUPPORT_MANA, support) ? SUPPORT_MANA[support] : null;
  if (!character?.className || !supporter) return { reason: '캐릭터를 조회하면 마나 추정 근거를 확인할 수 있습니다.' };
  if (cycle?.appliedCycleLinkCount || cycle?.unresolvedCycleLinkCount || cycle?.stochasticCycleLinkCount) {
    return { reason: '스킬 연동 쿨타임과 마나 지연의 상호작용 미검증' };
  }
  const hasAnalyzerShares = cycle?.shareSource === 'combat-analyzer' && ['ark-grid', 'second-class'].includes(cycle.analyzerMatch)
    && Math.abs(cycle.mappedShare - 1) < 1e-6 && cycle.shareRows?.length > 0
    && cycle.shareRows.every(row => row.targetNames?.length === 1);
  const assumedTimes = duration => supporter.skill
    ? Array.from({ length: Math.ceil(duration / supporter.baseCooldown) }, (_, i) => i * supporter.baseCooldown) : [];
  const timing = supporter.skill && `${supporter.label} 조우 시 및 기본 쿨(${supporter.baseCooldown}초)마다 적용 가정`;
  if (verified && hasAnalyzerShares) {
    const input = verified.inputs;
    const params = { support, duration: input.duration, maxMana: input.maxMana, naturalMana: input.recoveryMana };
    const measuredSupport = verified.support?.[support];
    const measured = resolveManaEnvironment({ ...params, ...measuredSupport });
    const measuredTiming = measured.quality === 'input';
    const environment = measuredTiming ? measured : resolveManaEnvironment({ ...params, receivedTimes: assumedTimes(input.duration) });
    if (!environment.reason) {
      const prepared = prepareManaScenario({ ...input, environment }, damageSkills, knownSkills);
      if (prepared.scenario) {
        const withoutSupport = prepareManaScenario(input, damageSkills, knownSkills).scenario;
        const detail = [`검증된 캐릭터별 마나·운용 프로필 (${verified.verifiedAt})`, !measuredTiming && timing,
          environment.assumption].filter(Boolean).join(' · ');
        return { ...prepared, withoutSupport: supporter.skill ? withoutSupport : null, origin: measuredTiming ? 'verified' : 'automatic', detail };
      }
    }
  }
  if (!character.observedMana || ['special', 'state-dependent'].includes(character.kind)) {
    return { reason: `${character.resource || '직업 자원'} 운용에 일치하는 검증 프로필 없음` };
  }
  const costs = new Map(character.skills.map(skill => [normalizeSkillCycleName(skill.name), skill.preEvolutionCost]));
  const cooldowns = new Map((cycle?.items || []).map(skill => [normalizeSkillCycleName(skill.name), skill]));
  const equipped = knownSkills.filter(skill => skill.currentTree);
  const skills = equipped.map(skill => {
    const key = normalizeSkillCycleName(skill.name);
    const cooldownItem = cooldowns.get(key);
    return { name: skill.name, first: 0, interval: cooldownItem?.baseCooldownSeconds > 0 ? skillCooldownSeconds(cooldownItem) : 0,
      cost: costs.get(key), cooldownItem };
  });
  const uncertain = skills.filter(skill => !Number.isFinite(skill.cost) || skill.interval < 0.1);
  if (!skills.some(skill => skill.cost > 0) || uncertain.length) {
    return { reason: uncertain.length ? `장착 스킬의 비용·쿨타임 미확인 (${uncertain.slice(0, 3).map(skill => skill.name).join(', ')})`
      : '마나 사용 스킬의 장착 정보 없음' };
  }
  const names = new Set(skills.map(skill => normalizeSkillCycleName(skill.name)));
  const sharesMapped = hasAnalyzerShares && damageSkills.length > 0
    && damageSkills.every(name => names.has(normalizeSkillCycleName(name)));
  const maxMana = character.maxMana ?? verified?.inputs.maxMana;
  const hasCapacity = Number.isFinite(maxMana) && maxMana >= 1;
  const canRank = sharesMapped && hasCapacity;
  const duration = cycle.windowSeconds;
  if (!Number.isFinite(duration) || duration < 1 || duration > 600) return { reason: '자동 비교 구간 미확인' };
  const capacity = canRank ? maxMana : 1;
  const recoveryMana = capacity * RECOVERY_FRACTION;
  const environment = resolveManaEnvironment({ support, duration, maxMana: capacity, naturalMana: recoveryMana, receivedTimes: assumedTimes(duration) });
  if (environment.reason) return environment;
  const input = { duration, maxMana: capacity, startMana: capacity, recoveryMana, recoveryInterval: 1, firstRecovery: 1, skills, extraRecovery: [] };
  const compareSkills = canRank ? damageSkills : [...names];
  const firstUseSpacing = Math.min(duration, ...skills.map(skill => skill.interval)) / skills.length;
  const prepare = (env, alternative = false) => {
    const schedule = alternative ? skills.slice().reverse().map((skill, index) => ({ ...skill, first: index * firstUseSpacing })) : skills;
    const prepared = prepareManaScenario({ ...input, skills: schedule, reductions: alternative ? 'sum' : 'product',
      environment: { ...env, quality: 'estimate' } }, compareSkills, knownSkills);
    if (prepared.scenario && !canRank) prepared.scenario.normalizedCapacity = true;
    return prepared;
  };
  const primary = prepare(environment);
  if (!primary.scenario) return primary;
  const alternate = prepare(environment, true).scenario;
  const withoutSupport = support === 'none' ? null : prepare(resolveManaEnvironment({ support: 'none', naturalMana: recoveryMana })).scenario;
  const detail = [`${duration}초 · 시작 마나 가득 · 2024년 관찰값으로 매초 최대 MP의 4.44% 회복 가정`,
    '스킬 포인트·트라이포드·룬에서 추정한 스킬을 목록 순서로 시작 후 계산 쿨마다 사용 · 소모 감소 개별 곱',
    canRank && `전투분석 지분 ${cycle.analyzerTag || '매칭 표본'} 적용`, timing, environment.assumption,
    '음식·추가 회복·조건부 쿨감 미반영'].filter(Boolean).join(' · ');
  const reason = [!hasCapacity && '최대 마나 미확인', !sharesMapped && '장착 스킬과 연결된 전투분석 피해 지분 미확인']
    .filter(Boolean).join(' · ');
  return canRank
    ? { origin: 'automatic', scenario: primary.scenario, alternate, withoutSupport, detail, assumedRecovery: true }
    : { origin: 'capacity', threshold: primary.scenario, alternateThreshold: alternate, withoutSupportThreshold: withoutSupport, detail, reason, assumedRecovery: true };
}
