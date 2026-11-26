import { findVerifiedManaProfile } from './mana-character.js';
import { MANA_RECOMMENDATION_SECONDS, prepareManaScenario } from './mana-recommendation.js?v=6.1.14';
import { resolveManaEnvironment, supportManaProfile } from './support-mana.js?v=6.1.14';

export function buildAutomaticManaAnalysis({ character, cycle, knownSkills = [], damageSkills = [], support = 'none', supportVariant = '',
  duration, verified = findVerifiedManaProfile(character) } = {}) {
  if (!character?.className || !supportManaProfile(support, supportVariant)) return { reason: '캐릭터를 조회하면 마나 검증 근거를 확인할 수 있습니다.' };
  if (cycle?.appliedCycleLinkCount || cycle?.unresolvedCycleLinkCount || cycle?.stochasticCycleLinkCount) {
    return { reason: '스킬 연동 쿨타임과 마나 지연의 상호작용 미검증' };
  }
  const strict = duration === MANA_RECOMMENDATION_SECONDS;
  if (!verified || (strict && verified.inputs.duration !== duration)) {
    const missing = [!Number.isFinite(character.maxMana) && '최대 마나 미확인', '자연 회복량·틱 및 실제 시전 조건 미확인'];
    return { reason: `${missing.filter(Boolean).join(' · ')} · 고급 마나 설정에서 직접 입력할 수 있습니다.` };
  }
  const hasAnalyzerShares = cycle?.shareSource === 'combat-analyzer' && ['ark-grid', 'second-class'].includes(cycle.analyzerMatch)
    && Math.abs(cycle.mappedShare - 1) < 1e-6 && cycle.shareRows?.length > 0
    && cycle.shareRows.every(row => row.targetNames?.length === 1);
  if (!hasAnalyzerShares) return { reason: '장착 스킬과 연결된 전투분석 피해 지분 미확인' };

  const input = { ...verified.inputs, strict };
  const supportInput = verified.support?.[supportVariant ? `${support}/${supportVariant}` : support];
  if (support !== 'none' && !supportInput) return { reason: '선택한 서포터의 실제 적용 시각과 회복 미확인' };
  const environment = resolveManaEnvironment({ ...supportInput, support, variant: supportVariant, duration: input.duration,
    maxMana: input.maxMana, naturalMana: input.recoveryMana, inclusiveEnd: strict });
  if (environment.reason) return environment;
  const observation = support === 'none' ? input.observation : supportInput?.observation;
  const prepared = prepareManaScenario({ ...input, observation, environment }, damageSkills, knownSkills);
  if (!prepared.scenario) return prepared;
  const withoutSupport = support === 'none' ? null : prepareManaScenario(input, damageSkills, knownSkills).scenario;
  const observed = environment.quality === 'input' && (!strict || prepared.scenario.observation);
  return { ...prepared, withoutSupport, origin: observed ? 'verified' : 'profile-input',
    detail: [`캐릭터별 마나·운용 프로필 (${verified.verifiedAt})`, environment.assumption].filter(Boolean).join(' · ') };
}
