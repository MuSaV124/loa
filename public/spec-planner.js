const NON_CONSUMABLE_COST_KEYS = new Set(['골드', '실링']);

function finiteNonNegative(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function normalizeOwnedMaterials(materials = {}) {
  const normalized = {};
  for (const [name, amount] of Object.entries(materials || {})) {
    const value = finiteNonNegative(amount);
    if (name && value > 0) normalized[name] = value;
  }
  return normalized;
}

export function scaleMaterials(materials = {}, multiplier = 1) {
  const scaled = {};
  const factor = finiteNonNegative(multiplier);
  for (const [name, amount] of Object.entries(materials || {})) {
    const value = finiteNonNegative(amount) * factor;
    if (name && value > 0) scaled[name] = value;
  }
  return scaled;
}

export function mergeMaterials(...groups) {
  const merged = {};
  for (const group of groups) {
    for (const [name, amount] of Object.entries(group || {})) {
      const value = finiteNonNegative(amount);
      if (name && value > 0) merged[name] = finiteNonNegative(merged[name]) + value;
    }
  }
  return merged;
}

export function upperAncientRefineBookName(slot, fromStage, toStage = Number(fromStage || 0) + 1) {
  const prefix = slot === 'weapon' ? '야금술' : slot === 'armor' ? '재봉술' : '';
  const target = Math.floor(Number(toStage || 0));
  if (!prefix || !Number.isFinite(target)) return '';
  if (target >= 12 && target <= 15) return `${prefix} : 전율 [12-15]`;
  if (target >= 16 && target <= 19) return `${prefix} : 전율 [16-19]`;
  return '';
}

export function upperAncientRefineBookRateBonusPercent(toStage) {
  const bonuses = { 12: 5, 13: 5, 14: 4, 15: 4, 16: 4, 17: 3, 18: 3, 19: 3 };
  return bonuses[Math.floor(Number(toStage || 0))] || 0;
}

export function buildHoningScenarioMaterials(oneTimeMaterials = {}, perAttemptMaterials = {}, attempts = 1) {
  return mergeMaterials(oneTimeMaterials, scaleMaterials(perAttemptMaterials, attempts));
}

export function allocateOwnedMaterials(requiredMaterials = {}, ownedMaterials = {}) {
  const remainingOwned = normalizeOwnedMaterials(ownedMaterials);
  const purchasedMaterials = {};
  const ownedUsed = {};

  for (const [name, amount] of Object.entries(requiredMaterials || {})) {
    const required = finiteNonNegative(amount);
    if (!name || required <= 0) continue;
    if (NON_CONSUMABLE_COST_KEYS.has(name)) {
      purchasedMaterials[name] = required;
      continue;
    }
    const available = finiteNonNegative(remainingOwned[name]);
    const used = Math.min(required, available);
    const shortage = Math.max(0, required - used);
    if (used > 0) ownedUsed[name] = used;
    if (shortage > 0) purchasedMaterials[name] = shortage;
    remainingOwned[name] = Math.max(0, available - used);
  }

  return { purchasedMaterials, ownedUsed, remainingOwned };
}

export function specEstimateKey(row = {}) {
  const item = row.item || {};
  return [
    row.category || 'unknown',
    item.type || '',
    item.name || '',
    row.stepLabel || '',
    row.from ?? '',
    row.to ?? ''
  ].map(value => String(value).replace(/\|/g, '/')).join('|');
}

export function buildUpgradePlan({
  rows = [],
  currentPower = 0,
  mode = 'target',
  targetPower = 0,
  budget = 0,
  ownedMaterials = {},
  costForRow
} = {}) {
  const basePower = finiteNonNegative(currentPower);
  const target = finiteNonNegative(targetPower);
  const goldBudget = finiteNonNegative(budget);
  const candidates = rows
    .filter(row => row?.available && finiteNonNegative(row?.powerDelta) > 0)
    .map(row => ({ row, key: specEstimateKey(row) }));
  const steps = [];
  let remaining = candidates.slice();
  let inventory = normalizeOwnedMaterials(ownedMaterials);
  let cumulativeGold = 0;
  let cumulativeSilver = 0;
  let projectedPower = basePower;

  while (remaining.length) {
    const evaluated = remaining.map(candidate => {
      const cost = typeof costForRow === 'function'
        ? costForRow(candidate.row, inventory)
        : { gold: finiteNonNegative(candidate.row?.expectedCost?.expectedGold), silver: finiteNonNegative(candidate.row?.expectedCost?.silver), remainingOwned: inventory };
      const powerDelta = finiteNonNegative(candidate.row?.powerDelta);
      const percent = basePower > 0 ? (powerDelta / basePower) * 100 : powerDelta;
      const gold = finiteNonNegative(cost?.gold);
      const score = percent > 0 ? gold / percent : Infinity;
      return { ...candidate, cost, powerDelta, percent, gold, score };
    }).filter(candidate => mode !== 'budget' || cumulativeGold + candidate.gold <= goldBudget + 0.000001);

    if (!evaluated.length) break;
    evaluated.sort((a, b) => a.score - b.score || b.powerDelta - a.powerDelta || a.key.localeCompare(b.key));
    const picked = evaluated[0];
    cumulativeGold += picked.gold;
    cumulativeSilver += finiteNonNegative(picked.cost?.silver);
    projectedPower += picked.powerDelta;
    inventory = normalizeOwnedMaterials(picked.cost?.remainingOwned || inventory);
    steps.push({
      row: picked.row,
      key: picked.key,
      gold: picked.gold,
      silver: finiteNonNegative(picked.cost?.silver),
      powerDelta: picked.powerDelta,
      projectedPower,
      cumulativeGold,
      cumulativeSilver,
      ownedUsed: normalizeOwnedMaterials(picked.cost?.ownedUsed || {})
    });
    remaining = remaining.filter(candidate => candidate.key !== picked.key);

    if (mode === 'target' && target > 0 && projectedPower >= target) break;
  }

  return {
    mode,
    currentPower: basePower,
    targetPower: target,
    budget: goldBudget,
    steps,
    projectedPower,
    powerGain: projectedPower - basePower,
    cumulativeGold,
    cumulativeSilver,
    remainingOwned: inventory,
    reached: mode === 'target' ? target > 0 && projectedPower >= target : goldBudget > 0 && cumulativeGold <= goldBudget,
    remainingTarget: mode === 'target' ? Math.max(0, target - projectedPower) : 0,
    remainingBudget: mode === 'budget' ? Math.max(0, goldBudget - cumulativeGold) : 0
  };
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function encodeSpecScenario(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload || {}));
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeSpecScenario(encoded) {
  try {
    const normalized = String(encoded || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
