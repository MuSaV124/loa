export function isBoundGem(gem = {}) {
  if (typeof gem.bound === 'boolean') return gem.bound;
  if (typeof gem.isBound === 'boolean') return gem.isBound;

  const text = [
    gem.name,
    gem.text,
    gem.tooltip,
    gem.bindType,
    gem.boundType,
    gem.tradeType
  ].filter(Boolean).join(' ');

  return /(?:캐릭터|원정대)?\s*귀속/u.test(text);
}

export function gemFusionPurchaseCount(gem = {}) {
  return isBoundGem(gem) ? 3 : 2;
}
