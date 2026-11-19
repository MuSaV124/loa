import { materialPurchaser } from './material-quotes.js';
import { normalizeOwnedMaterials } from './spec-planner.js';

function averageRequirement(stages, name) {
  return stages.reduce((sum, stage) => sum + stage.outcomes.reduce((subtotal, outcome) =>
    subtotal + outcome.probability * (Number(stage.fixed?.[name] || 0) + Number(stage.perAttempt?.[name] || 0) * outcome.attempts), 0), 0);
}

function convolveRequirements(stages, name, { owned, period, periodicAfter }) {
  const inputs = stages.map(({ fixed, perAttempt, outcomes }) => {
    const initial = Number(fixed?.[name] || 0);
    const repeated = Number(perAttempt?.[name] || 0);
    return (initial || repeated) && outcomes.filter(outcome => outcome.probability > 0).map(({ attempts, probability }) => ({
      quantity: initial + repeated * attempts, probability
    }));
  }).filter(Boolean);
  let distribution = new Map([[0, 1]]);
  let remainingMinimum = inputs.reduce((sum, outcomes) => sum + (outcomes[0]?.quantity || 0), 0);
  for (const outcomes of inputs) {
    if (!outcomes.length) return new Map();
    remainingMinimum -= outcomes[0].quantity;
    const threshold = Math.max(0, Math.floor(owned + periodicAfter - remainingMinimum));
    const next = new Map();
    for (const [required, mass] of distribution) {
      for (const { quantity, probability } of outcomes) {
        const total = required + quantity;
        // Keep one full period above the threshold so a folded shortage remains positive.
        const periods = Math.max(0, Math.floor((total - threshold - 1) / period));
        const remainder = total - periods * period;
        const weight = mass * probability;
        next.set(remainder, (next.get(remainder) || 0) + weight);
      }
    }
    distribution = next;
  }
  return distribution;
}

export function calculateHoningMaterialCost(stages, priceMap, { ownedMaterials, boundOnly = new Set(), linear = false } = {}) {
  const remainingOwned = normalizeOwnedMaterials(ownedMaterials);
  const ownedUsed = {};
  const rows = [];
  let tradeGold = 0;
  let fixedGold = 0;
  let silver = 0;
  const names = new Set(stages.flatMap(stage => [...Object.keys(stage.fixed || {}), ...Object.keys(stage.perAttempt || {})]));
  for (const name of names) {
    const fixed = name === '골드';
    const isSilver = name === '실링';
    if (fixed || isSilver) {
      const required = averageRequirement(stages, name);
      if (!(required > 0)) continue;
      if (fixed) fixedGold += required;
      else silver += required;
      rows.push({ name, required, unitGold: fixed ? 1 : 0, gold: fixed ? required : 0, fixed, silver: !fixed });
      continue;
    }
    const bound = boundOnly.has(name);
    const quote = bound ? null : materialPurchaser(priceMap, name);
    const unitGold = quote?.unitGold || 0;
    const owned = remainingOwned[name] || 0;
    const period = quote?.period || 1;
    const required = averageRequirement(stages, name);
    if (!(required > 0)) continue;
    const distribution = linear
      ? new Map([[required, 1]])
      : convolveRequirements(stages, name, { owned, period, periodicAfter: quote?.periodicAfter || 0 });
    let foldedRequirement = 0;
    for (const [quantity, probability] of distribution) foldedRequirement += quantity * probability;
    const removedQuantity = Math.max(0, required - foldedRequirement);
    let used = 0;
    let purchased = removedQuantity;
    let shortageProbability = 0;
    let gold = removedQuantity / period * (quote?.periodGold || 0);
    for (const [quantity, probability] of distribution) {
      const shortage = Math.max(0, quantity - owned);
      used += probability * Math.min(owned, quantity);
      if (shortage <= 0) continue;
      purchased += probability * shortage;
      shortageProbability += probability;
      if (quote) gold += probability * (linear ? shortage * unitGold : quote.cost(shortage));
    }
    if (owned > 0) remainingOwned[name] = Math.max(0, owned - used);
    if (used > 0) ownedUsed[name] = used;
    tradeGold += gold;
    rows.push({
      name, required, purchased, ownedUsed: used, unitGold, gold, shortageProbability,
      boundOnly: bound, boundShortage: bound && shortageProbability > 0,
      missingPrice: !bound && !quote && shortageProbability > 0
    });
  }
  const complete = stages.every(stage => stage.outcomes.length > 0) && rows.every(row => !row.boundShortage && !row.missingPrice);
  return { rows, tradeGold, fixedGold, silver, totalGold: tradeGold + fixedGold, ownedUsed, remainingOwned, complete };
}

export function goldEfficiency(expectedGold, increasePercent) {
  if (!Number.isFinite(expectedGold) || expectedGold <= 0 || !Number.isFinite(increasePercent) || increasePercent <= 0) {
    return { goldPerPercent: Infinity, percentPer100k: 0 };
  }
  return { goldPerPercent: expectedGold / increasePercent, percentPer100k: increasePercent * 100000 / expectedGold };
}
