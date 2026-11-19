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

export function normalHoningOutcome(ratePercent, supportRatePercent = 0) {
  if (!normalHoningAttemptRatePercent(ratePercent, 1, supportRatePercent)) {
    return { pityAttempts: 0, expectedAttempts: 0, pityProbability: 0 };
  }
  const { artisanFactor, artisanLimit } = NORMAL_HONING_PITY_RULES;
  let expectedAttempts = 0;
  let survival = 1;
  let artisan = 0;
  for (let attempt = 1; attempt < 10000; attempt += 1) {
    const rate = normalHoningAttemptRatePercent(ratePercent, attempt, supportRatePercent);
    expectedAttempts += survival;
    survival *= 1 - rate / 100;
    artisan += rate * artisanFactor;
    if (artisan >= artisanLimit) {
      return { pityAttempts: attempt + 1, expectedAttempts: expectedAttempts + survival, pityProbability: survival };
    }
  }
  return { pityAttempts: 0, expectedAttempts: 0, pityProbability: 0 };
}
