import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { compareManaFurnaceCosts, PUBLIC_MANA_RECOVERY_RATE } from '../public/mana-recommendation.js';

function isNumber(value, min = 0) {
  return Number.isFinite(value) && value >= min;
}

export function checkManaObservations(input) {
  if (input?.version !== 1 || !Array.isArray(input.observations)) throw new Error('version 1 observations required');
  const groups = new Map();
  for (const row of input.observations) {
    const { source, contributor, patch, className, level, equipmentFingerprint, combat, maxMana, ticks = [], casts = [], ...conditions } = row;
    if (![source, contributor, patch, className, equipmentFingerprint].every(value => typeof value === 'string' && value.trim())
      || !Number.isInteger(level) || level < 1 || typeof combat !== 'boolean' || !isNumber(maxMana, 1)
      || !Array.isArray(ticks) || !Array.isArray(casts)) throw new Error('Invalid provenance, conditions, or maximum mana');
    const key = JSON.stringify([patch, className, level, equipmentFingerprint, combat, maxMana,
      conditions.food ?? null, conditions.support ?? null, conditions.recoveryEffects ?? null]);
    if (!groups.has(key)) groups.set(key, { contributors: new Set(), ticks: [], casts: [] });
    const group = groups.get(key);
    group.contributors.add(contributor);
    for (const [index, tick] of ticks.entries()) {
      if (!isNumber(tick.time) || !isNumber(tick.before) || !isNumber(tick.after) || tick.before > tick.after
        || tick.after > maxMana || (index > 0 && tick.time <= ticks[index - 1].time)) throw new Error('Invalid recovery tick');
      // A bar filled at the end of a tick cannot reveal the full recovery amount.
      if (index && tick.after < maxMana) {
        const elapsed = tick.time - ticks[index - 1].time;
        const gain = tick.after - tick.before;
        group.ticks.push({ elapsed, gain, rate: gain / maxMana / elapsed * 100, expectedPublicGain: maxMana * elapsed * PUBLIC_MANA_RECOVERY_RATE / 100 });
      }
    }
    for (const cast of casts) {
      if (!cast.name || !Number.isInteger(cast.level) || cast.level < 1 || !isNumber(cast.before) || !isNumber(cast.after)
        || cast.after > cast.before || cast.before > maxMana || !isNumber(cast.base)
        || !isNumber(cast.beforeEvolution) || !isNumber(cast.reduced) || !isNumber(cast.furnacePercent)
        || !Array.isArray(cast.reductions) || !cast.reductions.every(value => isNumber(value) && value <= 100)
        || ![null, 'sum', 'product'].includes(cast.stacking ?? null)
        || (cast.reductions.length > 1 && !cast.stacking)) throw new Error('Invalid cast measurement');
      const observed = cast.before - cast.after;
      const extra = maxMana * cast.furnacePercent / 100;
      const a = compareManaFurnaceCosts({ ...cast, extra });
      group.casts.push({ name: cast.name, level: cast.level, setup: cast.setup ?? null, observed, expected: a,
        error: Object.fromEntries(Object.entries(a).map(([model, expected]) => [model, expected == null ? null : observed - expected])) });
    }
  }
  return [...groups].map(([key, group]) => ({ conditions: JSON.parse(key), independentContributors: group.contributors.size,
    status: 'PENDING_REVIEW', ticks: group.ticks, casts: group.casts }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = process.argv[2];
  if (!source) throw new Error('Usage: node scripts/check-mana-observations.mjs <observations.json>');
  const observations = JSON.parse(await readFile(source, 'utf8'));
  console.log(JSON.stringify(checkManaObservations(observations), null, 2));
}
