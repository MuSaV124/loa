const ARCANA_CLASS_NAME = '아르카나';

export const ARCANA_CULL_EFFECT = Object.freeze({
  critRate: 100,
  critDamage: 50,
  durationSeconds: 4
});

export const ARCANA_CHANCELLOR_EFFECT = Object.freeze({
  critRate: 20,
  durationSeconds: 10
});

export const ARCANA_SOVEREIGN_EFFECT = Object.freeze({
  skillDamage: 50,
  durationSeconds: 4
});

export const ARCANA_STREAM_EFFECT = Object.freeze({
  skillName: '스트림 오브 엣지',
  tripodName: '다크니스 엣지',
  critRate: 27.6
});

export const ARCANA_CARD_EXPECTATION_MODELS = Object.freeze({
  emperor: Object.freeze({
    key: 'emperor',
    engraving: '황제의 칙령',
    emperorCombinedTriggerProbability: 0.33,
    cullProbability: 0.07,
    chancellorProbability: 0.0565,
    sovereignProbability: 0.064,
    cardsPerMinute: 41.6,
    cardsPerMinuteRange: Object.freeze([35, 64]),
    defaultCombatSeconds: 180,
    evidenceLabel: '황제 실전 41.6장/분 · 현행 카드 확률 보정',
    sourceUrl: 'https://www.inven.co.kr/board/lostark/5346/168434',
    drawRateSourceUrl: 'https://www.inven.co.kr/board/lostark/5346/167701?vtype=pc'
  }),
  empress: Object.freeze({
    key: 'empress',
    engraving: '황후의 은총',
    cullProbability: 1 / 12,
    evidenceLabel: '황후 현행 가이드 12장 기대',
    sourceUrl: 'https://www.inven.co.kr/board/lostark/5346/162696'
  })
});

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, '').replace(/[\u00b7:]/g, '').trim();
}

function clampProbability(value) {
  return Math.max(0, Math.min(1, Number(value || 0)));
}

export function findArcanaCardExpectation(profile) {
  const className = normalizeText(profile?.className || profile?.CharacterClassName);
  if (className !== ARCANA_CLASS_NAME) return null;

  const secondClass = normalizeText(profile?.secondClass || profile?.arkPassiveTitle || profile?.Title);
  if (secondClass.includes('황후')) return ARCANA_CARD_EXPECTATION_MODELS.empress;
  if (secondClass.includes('황제')) return ARCANA_CARD_EXPECTATION_MODELS.emperor;
  return null;
}

export function weightedArcanaCardValue(normalValue, cullValue, model) {
  const normal = Number(normalValue || 0);
  const cull = Number(cullValue || 0);
  const weight = arcanaCullExpectationWeight(model);
  return normal * (1 - weight) + cull * weight;
}

function poissonCardUptime(model, probability, durationSeconds) {
  const chance = clampProbability(probability);
  const cardsPerMinute = Number(model?.cardsPerMinute || 0);
  const duration = Number(durationSeconds || 0);
  if (!(cardsPerMinute > 0) || !(duration > 0)) return chance;
  return clampProbability(1 - Math.exp(-(cardsPerMinute * chance / 60) * duration));
}

export function arcanaCullExpectationWeight(model) {
  const durationSeconds = Number(model?.cullDurationSeconds || ARCANA_CULL_EFFECT.durationSeconds);
  return poissonCardUptime(model, model?.cullProbability, durationSeconds);
}

export function arcanaChancellorExpectationWeight(model) {
  return poissonCardUptime(model, model?.chancellorProbability, ARCANA_CHANCELLOR_EFFECT.durationSeconds);
}

export function arcanaSovereignExpectationWeight(model) {
  return poissonCardUptime(model, model?.sovereignProbability, ARCANA_SOVEREIGN_EFFECT.durationSeconds);
}

export function weightedEmperorNormalSkillCardValue(normalValue, cullValue, chancellorValue, cullChancellorValue, model) {
  const normal = Number(normalValue || 0);
  const cull = Number(cullValue || 0);
  const chancellor = Number(chancellorValue || 0);
  const cullChancellor = Number(cullChancellorValue || 0);
  const cullWeight = arcanaCullExpectationWeight(model);
  const chancellorWeight = arcanaChancellorExpectationWeight(model);
  const sovereignWeight = arcanaSovereignExpectationWeight(model);

  // 카드 종류별 드로우를 포아송 thinning으로 분리하면 각 버프 상태의 겹침도
  // 독립적으로 계산할 수 있다. 제후는 순수 피해 배율이라 마지막에 곱한다.
  const critStateValue = normal * (1 - cullWeight) * (1 - chancellorWeight)
    + cull * cullWeight * (1 - chancellorWeight)
    + chancellor * (1 - cullWeight) * chancellorWeight
    + cullChancellor * cullWeight * chancellorWeight;
  return critStateValue * (1 + sovereignWeight * ARCANA_SOVEREIGN_EFFECT.skillDamage / 100);
}

export function arcanaCombatExpectation(model, combatSeconds = model?.defaultCombatSeconds || 180) {
  if (!model) return null;
  const seconds = Math.max(0, Number(combatSeconds || 0));
  const cardsPerMinute = Math.max(0, Number(model.cardsPerMinute || 0));
  const cards = cardsPerMinute * seconds / 60;
  const cullCards = cards * clampProbability(model.cullProbability);
  const chancellorCards = cards * clampProbability(model.chancellorProbability);
  const sovereignCards = cards * clampProbability(model.sovereignProbability);
  return {
    combatSeconds: seconds,
    cardsPerMinute,
    cards,
    cullCards,
    chancellorCards,
    sovereignCards,
    cullUptime: arcanaCullExpectationWeight(model),
    chancellorUptime: arcanaChancellorExpectationWeight(model),
    sovereignUptime: arcanaSovereignExpectationWeight(model)
  };
}

export function findArcanaStreamEffect(profile, skillEffects) {
  const model = findArcanaCardExpectation(profile);
  if (model?.key !== 'emperor') return null;
  const stream = (skillEffects?.items || []).find(item => normalizeText(item?.name) === normalizeText(ARCANA_STREAM_EFFECT.skillName));
  if (!stream?.currentTree) return null;
  const tripod = (stream.selectedTripods || []).find(item => normalizeText(item?.name) === normalizeText(ARCANA_STREAM_EFFECT.tripodName));
  if (!tripod) return null;
  const parsedCritRate = Number(tripod?.effects?.critRate || stream?.effects?.critRate || 0);
  return {
    ...ARCANA_STREAM_EFFECT,
    critRate: parsedCritRate > 0 ? parsedCritRate : ARCANA_STREAM_EFFECT.critRate,
    sourceSkill: stream.name,
    sourceTripod: tripod.name
  };
}

export function formatArcanaCardExpectation(model) {
  if (!model) return '';
  const drawRate = Number(model.cardsPerMinute || 0);
  const cullWeight = arcanaCullExpectationWeight(model);
  if (model.key !== 'emperor') {
    return `${model.engraving} · 도태 ${(model.cullProbability * 100).toFixed(2)}% · ${drawRate > 0 ? `실전 ${drawRate.toFixed(1)}장/분 · 도태 기대 가동률 ${(cullWeight * 100).toFixed(2)}%` : '카드 1회 확률 가중'}`;
  }
  const chancellorWeight = arcanaChancellorExpectationWeight(model);
  const sovereignWeight = arcanaSovereignExpectationWeight(model);
  return `${model.engraving} · 황제+또황 ${(model.emperorCombinedTriggerProbability * 100).toFixed(1)}% · 실전 ${drawRate.toFixed(1)}장/분 · 도태 ${(model.cullProbability * 100).toFixed(2)}%/${(cullWeight * 100).toFixed(2)}% · 재상 ${(model.chancellorProbability * 100).toFixed(2)}%/${(chancellorWeight * 100).toFixed(2)}% · 제후 ${(model.sovereignProbability * 100).toFixed(2)}%/${(sovereignWeight * 100).toFixed(2)}%`;
}
