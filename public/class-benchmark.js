export function normalizeBenchmarkText(value) {
  return String(value || '').replace(/\s+/g, '').replace(/[·:]/g, '').toLowerCase();
}

export function findClassBenchmark(data, profile) {
  const className = normalizeBenchmarkText(profile?.className || profile?.CharacterClassName);
  if (!className || !Array.isArray(data?.classes)) return null;
  return data.classes.find(row => {
    const names = [row.className, ...(row.aliases || [])].map(normalizeBenchmarkText);
    return names.includes(className);
  }) || null;
}

export function lumerusKillSeconds({
  combatPower = 5000,
  ratio,
  hp = 100_000_000_000
} = {}) {
  const power = Number(combatPower);
  const multiplier = Number(ratio);
  const health = Number(hp);
  if (!(power > 0) || !(multiplier > 0) || !(health > 0)) return null;
  return health / (power * 100_000 * multiplier);
}

export function benchmarkKillSeconds(data, row) {
  return lumerusKillSeconds({
    combatPower: data?.benchmark?.combatPower,
    hp: data?.benchmark?.lumerusHp,
    ratio: row?.ratio?.representative
  });
}
