const RAW_ARMGUARD_HONING_ROWS = [
  // stage, rate, growth shard, growth silver, attempt shard, destruction, guardian, leapstone, fusion, gold, silver
  [1, 15, 145000, 1450000, 14500, 600, 1800, 30, 22, 5200, 80000],
  [2, 15, 145000, 1450000, 15000, 620, 1860, 31, 23, 5400, 80000],
  [3, 15, 145000, 1450000, 15630, 640, 1925, 32, 24, 5610, 80000],
  [4, 15, 145000, 1450000, 16280, 660, 1990, 33, 25, 5830, 80000],
  [5, 15, 145000, 1450000, 16960, 680, 2055, 34, 26, 6060, 80000],
  [6, 10, 148000, 1480000, 17670, 700, 2125, 36, 27, 6300, 80000],
  [7, 10, 166000, 1660000, 18410, 720, 2195, 38, 28, 6550, 88000],
  [8, 10, 166000, 1660000, 19180, 745, 2270, 40, 29, 6810, 88000],
  [9, 10, 169000, 1690000, 19980, 770, 2345, 42, 30, 7080, 88000],
  [10, 10, 204000, 2040000, 20810, 795, 2425, 44, 31, 7360, 88000],
  [11, 5, 207000, 2070000, 21680, 820, 2505, 46, 32, 7650, 88000],
  [12, 5, 227000, 2270000, 22590, 845, 2590, 48, 33, 7950, 88000],
  [13, 5, 253000, 2530000, 23530, 870, 2680, 50, 34, 8260, 88000],
  [14, 5, 275000, 2750000, 24510, 900, 2770, 53, 36, 8590, 88000],
  [15, 5, 306000, 3060000, 25530, 930, 2865, 56, 38, 8930, 88000],
  [16, 3, 328000, 3280000, 26600, 960, 2965, 59, 40, 9280, 88000],
  [17, 3, 360000, 3600000, 27710, 990, 3065, 62, 42, 9650, 104000],
  [18, 3, 388000, 3880000, 28870, 1020, 3170, 65, 44, 10030, 104000],
  [19, 3, 420000, 4200000, 30080, 1055, 3280, 68, 46, 10430, 104000],
  [20, 3, 447000, 4470000, 31340, 1090, 3390, 72, 48, 10840, 144000],
  [21, 1.5, 480000, 4800000, 32650, 1125, 3505, 76, 50, 11270, 144000],
  [22, 1.5, 513000, 5130000, 34020, 1160, 3625, 80, 53, 11720, 192000],
  [23, 1.5, 541000, 5410000, 35440, 1200, 3750, 84, 56, 12180, 192000],
  [24, 1.5, 574000, 5740000, 36920, 1240, 3880, 89, 59, 12660, 240000],
  [25, 1.5, 607000, 6070000, 38470, 1280, 4015, 94, 62, 13160, 240000]
];

export const NORMAL_HONING_PITY_RULES = Object.freeze({
  failBonusRate: 0.1,
  maxRateMultiplier: 2,
  artisanFactor: 0.46511,
  artisanLimit: 100
});

// Provisional until Smilegate publishes the armguard support-material caps.
export const ARMGUARD_BREATH_ESTIMATE = Object.freeze({
  official: false,
  capsByTarget: Object.freeze([
    Object.freeze({ min: 1, max: 19, lava: 10, glacier: 10 }),
    Object.freeze({ min: 20, max: 23, lava: 15, glacier: 15 }),
    Object.freeze({ min: 24, max: 25, lava: 25, glacier: 25 })
  ])
});

export const ARMGUARD_HONING_ROWS = RAW_ARMGUARD_HONING_ROWS.map(([
  stage,
  ratePercent,
  growthShard,
  growthSilver,
  attemptShard,
  destructionStone,
  guardianStone,
  leapstone,
  fusion,
  gold,
  silver
]) => Object.freeze({
  stage,
  from: stage - 1,
  to: stage,
  ratePercent,
  growthMaterials: Object.freeze({
    '운명의 파편': growthShard,
    '실링': growthSilver
  }),
  attemptMaterials: Object.freeze({
    '운명의 파편': attemptShard,
    '운명의 파괴석 결정': destructionStone,
    '운명의 수호석 결정': guardianStone,
    '위대한 운명의 돌파석': leapstone,
    '상급 아비도스 융화제': fusion,
    '골드': gold,
    '실링': silver
  })
}));

export function armguardHoningRowForCurrentStage(currentStage) {
  const from = Math.max(0, Math.floor(Number(currentStage || 0)));
  return ARMGUARD_HONING_ROWS.find(row => row.from === from) || null;
}

export function armguardHoningRowsBetween(fromStage, toStage) {
  const from = Math.max(0, Math.min(24, Math.floor(Number(fromStage || 0))));
  const to = Math.max(from + 1, Math.min(25, Math.floor(Number(toStage || 25))));
  return ARMGUARD_HONING_ROWS.filter(row => row.from >= from && row.to <= to);
}

function armguardAttemptRatePercent(ratePercent, attempt) {
  const base = Number(ratePercent || 0);
  const bonus = base * NORMAL_HONING_PITY_RULES.failBonusRate * (Math.max(1, attempt) - 1);
  return Math.min(base * NORMAL_HONING_PITY_RULES.maxRateMultiplier, base + bonus);
}

function armguardPityAttempts(ratePercent) {
  let artisan = 0;
  for (let attempt = 1; attempt < 10000; attempt += 1) {
    artisan += armguardAttemptRatePercent(ratePercent, attempt) * NORMAL_HONING_PITY_RULES.artisanFactor;
    if (artisan >= NORMAL_HONING_PITY_RULES.artisanLimit) return attempt + 1;
  }
  return 0;
}

export function armguardPityProbability(ratePercent, supportRatePercent = 0) {
  const support = Math.max(0, Number(supportRatePercent || 0));
  const pityAttempts = (() => {
    let artisan = 0;
    for (let attempt = 1; attempt < 10000; attempt += 1) {
      artisan += (armguardAttemptRatePercent(ratePercent, attempt) + support) * NORMAL_HONING_PITY_RULES.artisanFactor;
      if (artisan >= NORMAL_HONING_PITY_RULES.artisanLimit) return attempt + 1;
    }
    return 0;
  })();
  if (!pityAttempts) return 0;
  let probability = 1;
  for (let attempt = 1; attempt < pityAttempts; attempt += 1) {
    probability *= Math.max(0, 1 - (armguardAttemptRatePercent(ratePercent, attempt) + support) / 100);
  }
  return probability;
}

export function armguardExpectedPityCount(fromStage, toStage) {
  return armguardHoningRowsBetween(fromStage, toStage)
    .reduce((total, row) => total + armguardPityProbability(row.ratePercent), 0);
}

export function armguardBreathMaxCombined(targetStage) {
  const target = Math.max(1, Math.min(25, Math.floor(Number(targetStage || 1))));
  const cap = ARMGUARD_BREATH_ESTIMATE.capsByTarget.find(row => target >= row.min && target <= row.max);
  return Number(cap?.lava || 0) + Number(cap?.glacier || 0);
}

function greatestCommonDivisor(a, b) {
  let left = Math.abs(Math.floor(Number(a || 0)));
  let right = Math.abs(Math.floor(Number(b || 0)));
  while (right) [left, right] = [right, left % right];
  return left || 1;
}

export function armguardBreathMixes(targetStage) {
  const target = Math.max(1, Math.min(25, Math.floor(Number(targetStage || 1))));
  const cap = ARMGUARD_BREATH_ESTIMATE.capsByTarget.find(row => target >= row.min && target <= row.max);
  if (!cap) return Object.freeze([{ lava: 0, glacier: 0, total: 0 }]);
  const steps = greatestCommonDivisor(cap.lava, cap.glacier);
  const lavaPerStep = cap.lava / steps;
  const glacierPerStep = cap.glacier / steps;
  return Object.freeze(Array.from({ length: steps + 1 }, (_, index) => Object.freeze({
    lava: lavaPerStep * index,
    glacier: glacierPerStep * index,
    total: (lavaPerStep + glacierPerStep) * index
  })));
}

export function armguardBreathMixesForMode(targetStage, mode = 'optimal', hasPrices = true) {
  const mixes = armguardBreathMixes(targetStage);
  if (mode === 'none') return Object.freeze([mixes[0]]);
  if (mode === 'full') return Object.freeze([mixes.at(-1)]);
  return hasPrices ? Object.freeze([mixes[0], mixes.at(-1)]) : Object.freeze([mixes[0]]);
}
