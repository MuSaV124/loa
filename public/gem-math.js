export function isBoundGem(gem = {}) {
  const name = String(gem?.name || gem?.itemName || gem?.displayName || '')
    .replace(/\s+/g, ' ')
    .trim();
  return /\(\s*귀속\s*\)\s*$/u.test(name);
}

export function gemFusionPurchaseCount(gem = {}) {
  return isBoundGem(gem) ? 3 : 2;
}
