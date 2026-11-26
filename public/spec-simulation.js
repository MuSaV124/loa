const ACCESSORY_DAMAGE_KEYS = new Set(['critRate', 'critDamage', 'critHitDamage', 'additionalDamage', 'enemyDamage']);

export function accessoryUpgradeHasDamageModel(candidate) {
  const keys = Object.keys(candidate?.effects || {});
  return keys.length > 0 && keys.every(key => ACCESSORY_DAMAGE_KEYS.has(key));
}

// Preserve any residual API aggregate while replacing the changed item sources
// individually. Enemy damage uses a product of item sources in the hit engine.
export function accessoryDamageInput(base = {}, before = {}, after = {}) {
  if (before.items === after.items) return base;
  const result = { ...base, items: after.items };
  for (const key of ACCESSORY_DAMAGE_KEYS) {
    const sum = group => (group.items || []).reduce((total, item) => total + (Number(item.effects?.[key]) || 0), 0);
    result[key] = (Number(base[key]) || 0) + sum(after) - sum(before);
  }
  return result;
}

export function expectedDamageChangePercent(before, after, analyzedGemFactor = 1) {
  if (![before, after, analyzedGemFactor].every(Number.isFinite)) return null;
  if (!(before > 0) || !(after >= 0) || !(analyzedGemFactor > 0)) return null;
  const change = (after * analyzedGemFactor / before - 1) * 100;
  return Number.isFinite(change) ? change : null;
}
