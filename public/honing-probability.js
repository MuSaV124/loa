// Existing site parameters shared by normal and armguard honing.
export const NORMAL_HONING_PITY_RULES = Object.freeze({
  failBonusRate: 0.1,
  maxRateMultiplier: 2,
  artisanFactor: 0.46511,
  artisanLimit: 100
});

export function normalHoningAttemptRatePercent(ratePercent, attempt, supportRatePercent = 0) {
  const base = Number(ratePercent);
  if (!Number.isFinite(base) || base <= 0) return 0;
  const support = Number(supportRatePercent);
  const turn = Math.max(1, Math.floor(Number(attempt) || 1));
  const { failBonusRate, maxRateMultiplier } = NORMAL_HONING_PITY_RULES;
  return Math.min(100, Math.min(base * maxRateMultiplier, base * (1 + failBonusRate * (turn - 1)))
    + (Number.isFinite(support) && support > 0 ? support : 0));
}

export function normalHoningAttemptDistribution(ratePercent, supportRatePercent = 0) {
  if (!normalHoningAttemptRatePercent(ratePercent, 1, supportRatePercent)) {
    return [];
  }
  const { artisanFactor, artisanLimit } = NORMAL_HONING_PITY_RULES;
  const outcomes = [];
  let survival = 1;
  let artisan = 0;
  for (let attempt = 1; attempt < 10000; attempt += 1) {
    const rate = normalHoningAttemptRatePercent(ratePercent, attempt, supportRatePercent);
    const probability = survival * rate / 100;
    outcomes.push({ attempts: attempt, probability, pity: false });
    survival -= probability;
    if (rate >= 100) return outcomes;
    artisan += rate * artisanFactor;
    if (artisan >= artisanLimit) {
      outcomes.push({ attempts: attempt + 1, probability: survival, pity: true });
      return outcomes;
    }
  }
  return [];
}

export function normalHoningOutcome(ratePercent, supportRatePercent = 0) {
  const outcomes = normalHoningAttemptDistribution(ratePercent, supportRatePercent);
  const pity = outcomes.at(-1);
  return {
    pityAttempts: pity?.attempts || 0,
    expectedAttempts: outcomes.reduce((sum, outcome) => sum + outcome.attempts * outcome.probability, 0),
    pityProbability: pity?.pity ? pity.probability : 0
  };
}
