import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const INPUT = resolve(process.env.LOA_SAMPLE_INPUT || 'tmp/combat-samples-loawa-around.json');
const OUTPUT = resolve(process.env.LOA_MODEL_OUTPUT || 'tmp/combat-power-model.json');

const MODEL_VERSION = 'combat-power-linear-v1';
const MIN_COMBAT_POWER = Number(process.env.LOA_MODEL_MIN_CP || 5000);
const MAX_COMBAT_POWER = Number(process.env.LOA_MODEL_MAX_CP || 6500);
const NORMAL_HONING_WEAPON_DELTA = Number(process.env.LOA_NORMAL_HONING_WEAPON_DELTA || 25);
const NORMAL_HONING_ARMOR_DELTA = Number(process.env.LOA_NORMAL_HONING_ARMOR_DELTA || 6);

const ALL_CLASS_NAMES = [
  '디스트로이어', '발키리', '버서커', '슬레이어', '워로드', '홀리나이트',
  '기공사', '배틀마스터', '브레이커', '스트라이커', '인파이터', '창술사',
  '건슬링어', '데빌헌터', '블래스터', '스카우터', '호크아이',
  '바드', '서머너', '소서리스', '아르카나',
  '데모닉', '리퍼', '블레이드', '소울이터',
  '기상술사', '도화가', '차원술사', '환수사',
  '가디언나이트'
];

const FEATURE_DEFS = [
  ['itemAvgLevel', row => row.itemAvgLevel],
  ['weaponHoning', row => row.gearSummary?.weaponHoning],
  ['armorHoning', row => row.gearSummary?.armorHoning],
  ['weaponQuality', row => row.gearSummary?.weaponQuality],
  ['armorQuality', row => row.gearSummary?.armorQuality],
  ['accessoryQuality', row => row.accessories?.averageQuality],
  ['gemAverage', row => row.gemSummary?.averageLevel],
  ['damageGemAverage', row => row.gemSummary?.damageAverageLevel],
  ['cooldownGemAverage', row => row.gemSummary?.cooldownAverageLevel],
  ['arkGridTotal', row => row.arkGrid?.total],
  ['arkGridAverage', row => row.arkGrid?.average],
  ['accessoryAdditionalDamage', row => row.effects?.accessory?.additionalDamage],
  ['accessoryEnemyDamage', row => row.effects?.accessory?.enemyDamage],
  ['accessoryAttackPowerPercent', row => row.effects?.accessory?.attackPowerPercent],
  ['accessoryWeaponPowerPercent', row => row.effects?.accessory?.weaponPowerPercent],
  ['accessoryAttackPowerFlat', row => row.effects?.accessory?.attackPowerFlat],
  ['accessoryWeaponPowerFlat', row => row.effects?.accessory?.weaponPowerFlat],
  ['braceletCritRate', row => row.effects?.bracelet?.critRate],
  ['braceletCritDamage', row => row.effects?.bracelet?.critDamage],
  ['braceletAdditionalDamage', row => row.effects?.bracelet?.additionalDamage],
  ['braceletEnemyDamage', row => row.effects?.bracelet?.enemyDamage],
  ['braceletAttackPowerFlat', row => row.effects?.bracelet?.attackPowerFlat],
  ['braceletWeaponPowerFlat', row => row.effects?.bracelet?.weaponPowerFlat],
  ['arkGridCritRate', row => row.effects?.arkGrid?.critRate],
  ['arkGridCritDamage', row => row.effects?.arkGrid?.critDamage],
  ['arkGridAdditionalDamage', row => row.effects?.arkGrid?.additionalDamage],
  ['arkGridEnemyDamage', row => row.effects?.arkGrid?.enemyDamage],
  ['engravingAttackPower', row => row.effects?.engraving?.attackPower],
  ['engravingEnemyDamage', row => row.effects?.engraving?.enemyDamage],
  ['engravingAdditionalDamage', row => row.effects?.engraving?.additionalDamage],
  ['engravingCritRate', row => row.effects?.engraving?.critRate],
  ['engravingCritDamage', row => row.effects?.engraving?.critDamage]
];

function categoryKey(row) {
  const className = row.className || 'unknown';
  const arkPassive = row.effects?.arkGrid?.items?.find?.(item => item?.name)?.name || row.arkPassive || '';
  return `${className}|${arkPassive || 'unknown'}`;
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

function transpose(matrix) {
  return matrix[0].map((_, col) => matrix.map(row => row[col]));
}

function multiply(a, b) {
  const bt = transpose(b);
  return a.map(row => bt.map(col => dot(row, col)));
}

function multiplyVec(a, v) {
  return a.map(row => dot(row, v));
}

function solveLinearSystem(a, b) {
  const n = a.length;
  const m = a.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) continue;
    [m[col], m[pivot]] = [m[pivot], m[col]];

    const divisor = m[col][col];
    for (let j = col; j <= n; j += 1) m[col][j] /= divisor;

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = m[row][col];
      for (let j = col; j <= n; j += 1) m[row][j] -= factor * m[col][j];
    }
  }

  return m.map(row => row[n]);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function stdev(values, avg = mean(values)) {
  const variance = mean(values.map(value => (value - avg) ** 2));
  return Math.sqrt(variance) || 1;
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(values, q) {
  const sorted = values.slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function buildFeatureDefs(rows) {
  const base = FEATURE_DEFS.slice();
  const counts = new Map();
  for (const row of rows) counts.set(categoryKey(row), (counts.get(categoryKey(row)) || 0) + 1);
  const categories = [...counts.entries()]
    .filter(([, count]) => count >= Number(process.env.LOA_MODEL_MIN_CATEGORY_COUNT || 4))
    .map(([key]) => key)
    .sort();
  return [
    ...base,
    ...categories.map(key => [`category:${key}`, row => (categoryKey(row) === key ? 1 : 0)])
  ];
}

function rowToFeatureValues(row, featureDefs = FEATURE_DEFS) {
  return featureDefs.map(([, getter]) => finite(getter(row)));
}

function buildMatrix(rows, stats, featureDefs = FEATURE_DEFS) {
  return rows.map(row => {
    const values = rowToFeatureValues(row, featureDefs);
    return [
      1,
      ...values.map((value, i) => (value - stats.means[i]) / stats.scales[i])
    ];
  });
}

function fitRidge(rows, lambda = 2.5, featureDefs = FEATURE_DEFS) {
  const raw = rows.map(row => rowToFeatureValues(row, featureDefs));
  const means = raw[0].map((_, i) => mean(raw.map(row => row[i])));
  const scales = raw[0].map((_, i) => stdev(raw.map(row => row[i]), means[i]));
  const stats = { means, scales };
  const x = buildMatrix(rows, stats, featureDefs);
  const y = rows.map(row => finite(row.combatPower));
  const xt = transpose(x);
  const xtx = multiply(xt, x);
  for (let i = 1; i < xtx.length; i += 1) xtx[i][i] += lambda;
  const xty = multiplyVec(xt, y);
  const weights = solveLinearSystem(xtx, xty);
  return { weights, stats, lambda, featureDefs };
}

function fitNonNegativeRidge(rows, lambda = 4, iterations = 18000, featureDefs = FEATURE_DEFS) {
  const raw = rows.map(row => rowToFeatureValues(row, featureDefs));
  const means = raw[0].map((_, i) => mean(raw.map(row => row[i])));
  const scales = raw[0].map((_, i) => stdev(raw.map(row => row[i]), means[i]));
  const stats = { means, scales };
  const x = buildMatrix(rows, stats, featureDefs);
  const y = rows.map(row => finite(row.combatPower));
  const yMean = mean(y);
  const featureCount = featureDefs.length;
  const weights = Array(featureCount + 1).fill(0);
  weights[0] = yMean;
  const centeredY = y.map(value => value - yMean);
  const featureMatrix = x.map(row => row.slice(1));
  const n = rows.length;
  let step = 0.012;

  for (let iter = 0; iter < iterations; iter += 1) {
    const grad = Array(featureCount).fill(0);
    for (let r = 0; r < n; r += 1) {
      const prediction = dot(featureMatrix[r], weights.slice(1));
      const error = prediction - centeredY[r];
      for (let c = 0; c < featureCount; c += 1) grad[c] += (error * featureMatrix[r][c]) / n;
    }
    for (let c = 0; c < featureCount; c += 1) {
      grad[c] += lambda * weights[c + 1] / n;
      weights[c + 1] = Math.max(0, weights[c + 1] - step * grad[c]);
    }
    if (iter && iter % 4000 === 0) step *= 0.72;
  }

  return { weights, stats, lambda, nonNegative: true, featureDefs };
}

function predict(row, model) {
  const x = buildMatrix([row], model.stats, model.featureDefs)[0];
  return dot(x, model.weights);
}

function evaluate(rows, model) {
  const predictions = rows.map(row => {
    const predicted = predict(row, model);
    const actual = finite(row.combatPower);
    const error = predicted - actual;
    return { name: row.name, actual, predicted, error, absError: Math.abs(error) };
  });
  const abs = predictions.map(row => row.absError);
  return {
    count: rows.length,
    mae: mean(abs),
    medianAbsError: median(abs),
    p90AbsError: quantile(abs, 0.9),
    maxAbsError: Math.max(...abs),
    predictions: predictions.sort((a, b) => b.absError - a.absError)
  };
}

function normalizeRow(row) {
  return {
    ...row,
    combatPower: finite(row.combatPower),
    itemAvgLevel: finite(row.itemAvgLevel),
    modelKey: [
      row.className || 'unknown',
      row.effects?.arkGrid?.items?.map?.(item => item?.name).filter(Boolean).slice(0, 3).join('+') || 'unknown'
    ].join('|')
  };
}

function filterTrainingRows(rows) {
  return rows
    .filter(row => row.ok)
    .map(normalizeRow)
    .filter(row => row.className)
    .filter(row => row.combatPower >= MIN_COMBAT_POWER && row.combatPower <= MAX_COMBAT_POWER)
    .filter(row => row.itemAvgLevel >= 1765 && row.itemAvgLevel <= 1795)
    .filter(row => finite(row.gemSummary?.total) >= 10)
    .filter(row => finite(row.arkGrid?.total) > 0);
}

function coefficientTable(model) {
  return model.featureDefs.map(([name], index) => {
    const perUnit = model.weights[index + 1] / model.stats.scales[index];
    return {
      name,
      mean: model.stats.means[index],
      scale: model.stats.scales[index],
      standardizedWeight: model.weights[index + 1],
      perUnit
    };
  }).sort((a, b) => Math.abs(b.standardizedWeight) - Math.abs(a.standardizedWeight));
}

function classSampleCounts(rows) {
  const counts = new Map();
  for (const row of rows) {
    const className = row.className || '';
    if (!className) continue;
    counts.set(className, (counts.get(className) || 0) + 1);
  }
  return counts;
}

function buildNormalHoningFallbacks(rows) {
  const counts = classSampleCounts(rows);
  const classNames = [...new Set([...ALL_CLASS_NAMES, ...counts.keys()])].sort((a, b) => a.localeCompare(b, 'ko'));
  const classFallbacks = {};
  for (const className of classNames) {
    const sampleCount = counts.get(className) || 0;
    classFallbacks[className] = {
      weapon: NORMAL_HONING_WEAPON_DELTA,
      armor: NORMAL_HONING_ARMOR_DELTA,
      sampleCount,
      confidence: sampleCount >= Number(process.env.LOA_MODEL_MIN_CLASS_COUNT || 4) ? 'class-estimated' : 'estimated',
      basis: sampleCount
        ? 'Class is present in the official combat-power sample set; delta uses shared honing fallback until before/after samples exist.'
        : 'Loawa rank class coverage placeholder; delta uses shared honing fallback until samples exist.'
    };
  }
  return classFallbacks;
}

async function main() {
  const payload = JSON.parse(await readFile(INPUT, 'utf8'));
  const allRows = Array.isArray(payload?.rows) ? payload.rows : [];
  const rows = filterTrainingRows(allRows);
  if (rows.length < 12) throw new Error(`not enough training rows: ${rows.length}`);

  const featureDefs = buildFeatureDefs(rows);
  const ridgeModel = fitRidge(rows, 2.5, featureDefs);
  const nonNegativeModel = fitNonNegativeRidge(rows, 4, 18000, featureDefs);
  const ridgeEvaluation = evaluate(rows, ridgeModel);
  const nonNegativeEvaluation = evaluate(rows, nonNegativeModel);
  const forceFit = process.env.LOA_MODEL_FORCE_FIT || '';
  const model = forceFit === 'ridge'
    ? ridgeModel
    : forceFit === 'non-negative-ridge'
      ? nonNegativeModel
      : nonNegativeEvaluation.mae <= ridgeEvaluation.mae * 1.18 ? nonNegativeModel : ridgeModel;
  const evaluation = evaluate(rows, model);
  const output = {
    version: MODEL_VERSION,
    createdAt: new Date().toISOString(),
    source: INPUT,
    filter: {
      minCombatPower: MIN_COMBAT_POWER,
      maxCombatPower: MAX_COMBAT_POWER,
      itemAvgLevel: [1765, 1795]
    },
    target: 'profile.CombatPower',
    rowCount: {
      input: allRows.length,
      training: rows.length
    },
    model: {
      fit: model.nonNegative ? 'non-negative-ridge' : 'ridge',
      intercept: model.weights[0],
      lambda: model.lambda,
      features: model.featureDefs.map(([name], index) => ({
        name,
        mean: model.stats.means[index],
        scale: model.stats.scales[index],
        weight: model.weights[index + 1],
        perUnit: model.weights[index + 1] / model.stats.scales[index]
      }))
    },
    evaluation: {
      count: evaluation.count,
      mae: evaluation.mae,
      medianAbsError: evaluation.medianAbsError,
      p90AbsError: evaluation.p90AbsError,
      maxAbsError: evaluation.maxAbsError,
      comparedFits: {
        ridgeMae: ridgeEvaluation.mae,
        nonNegativeMae: nonNegativeEvaluation.mae
      },
      worst: evaluation.predictions.slice(0, 12)
    },
    coefficientsByImpact: coefficientTable(model).slice(0, 20),
    upgradeDelta: {
      normalHoning: {
        weapon: NORMAL_HONING_WEAPON_DELTA,
        armor: NORMAL_HONING_ARMOR_DELTA,
        slotDefaults: {
          weapon: NORMAL_HONING_WEAPON_DELTA,
          head: NORMAL_HONING_ARMOR_DELTA,
          top: NORMAL_HONING_ARMOR_DELTA,
          bottom: NORMAL_HONING_ARMOR_DELTA,
          gloves: NORMAL_HONING_ARMOR_DELTA,
          shoulder: NORMAL_HONING_ARMOR_DELTA,
          armor: NORMAL_HONING_ARMOR_DELTA
        },
        classFallbacks: buildNormalHoningFallbacks(rows),
        coverage: 'all-loawa-rank-classes',
        confidence: 'estimated',
        basis: 'Shared fallback for all classes. Replace each class/slot with verified before-after official CombatPower samples as they are collected.'
      }
    }
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`training rows: ${rows.length}/${allRows.length}`);
  console.log(`MAE: ${evaluation.mae.toFixed(2)} / median: ${evaluation.medianAbsError.toFixed(2)} / p90: ${evaluation.p90AbsError.toFixed(2)}`);
  console.log('top coefficients');
  for (const row of output.coefficientsByImpact.slice(0, 12)) {
    console.log(`${row.name.padEnd(32)} std=${row.standardizedWeight.toFixed(2)} perUnit=${row.perUnit.toFixed(4)}`);
  }
  console.log(`saved ${OUTPUT}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
