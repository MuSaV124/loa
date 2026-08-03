const ARCANA_CLASS_NAME = '아르카나';

export const ARCANA_CULL_EFFECT = Object.freeze({
  critRate: 100,
  critDamage: 50
});

export const ARCANA_CARD_EXPECTATION_MODELS = Object.freeze({
  emperor: Object.freeze({
    key: 'emperor',
    engraving: '황제의 칙령',
    cullProbability: 0.0691,
    evidenceLabel: '황제 5,831회 실측',
    sourceUrl: 'https://www.inven.co.kr/board/lostark/5346/168434'
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
  const probability = Math.max(0, Math.min(1, Number(model?.cullProbability || 0)));
  return normal * (1 - probability) + cull * probability;
}

export function formatArcanaCardExpectation(model) {
  if (!model) return '';
  return `${model.engraving} · 도태 ${(model.cullProbability * 100).toFixed(2)}% 확률 가중`;
}
