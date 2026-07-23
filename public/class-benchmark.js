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

const BENCHMARK_SLOT_ORDER = new Map([['해', 0], ['달', 1], ['별', 2]]);

export function sortedBenchmarkCores(cores) {
  return [...(Array.isArray(cores) ? cores : [])]
    .sort((a, b) => (BENCHMARK_SLOT_ORDER.get(a?.slot) ?? 99) - (BENCHMARK_SLOT_ORDER.get(b?.slot) ?? 99));
}

export function formatBenchmarkRange(ratio) {
  const representative = Number(ratio?.representative || 0);
  if (!(representative > 0)) return '';
  const min = Number(ratio?.min ?? representative);
  const max = Number(ratio?.max ?? representative);
  return Math.abs(max - min) > 0.0001
    ? `${min.toFixed(3)}–${max.toFixed(3)}배`
    : `${representative.toFixed(3)}배`;
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
