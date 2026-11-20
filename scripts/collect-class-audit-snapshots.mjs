import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const readRows = async file => JSON.parse(await readFile(new URL(file, import.meta.url), 'utf8')).rows;
const output = process.argv[2];
if (!output) throw new Error('Provide a local output path for character snapshots.');
const endpoint = process.env.LOA_SKILL_AUDIT_API_BASE || 'https://loa-beige.vercel.app';
const rosters = await Promise.all([
  readRows('./combat-power-reference-characters.json'),
  readRows('./combat-power-class-samples.json'),
  readRows('./combat-power-replacement-characters.json')
]);
const characters = new Map();
for (const row of rosters.flat()) {
  const name = row.name || row.referenceCharacter;
  if (name && !characters.has(name.toLowerCase())) characters.set(name.toLowerCase(), { name, className: row.className });
}
const samples = [];
const targets = [...characters.values()];
for (let i = 0; i < targets.length; i += 3) {
  const batch = targets.slice(i, i + 3);
  const rows = await Promise.all(batch.map(async sample => {
    try {
      const url = new URL('/api/character', endpoint);
      url.searchParams.set('name', sample.name);
      url.searchParams.set('appVersion', '6.1.3');
      const response = await fetch(url, { signal: AbortSignal.timeout(16000) });
      if (!response.ok) return { ...sample, error: `HTTP ${response.status}` };
      const body = await response.json();
      if (!body.ok || !body.raw) return { ...sample, error: 'Character response lacked raw armory data' };
      const { raw, skills, arkGrid, skillEffectsError, arkGridError, apiVersion } = body;
      return { ...sample, raw, skills, arkGrid, skillEffectsError, arkGridError, apiVersion,
        responseDate: response.headers.get('date'), cacheAge: response.headers.get('age') };
    } catch (error) {
      return { ...sample, error: error.cause?.code || error.message };
    }
  }));
  samples.push(...rows);
  await writeFile(resolve(output), JSON.stringify({ source: endpoint, retrievedAt: new Date().toISOString(), samples }));
}
console.log(`Collected ${samples.filter(row => row.raw).length}/${samples.length} character snapshots.`);
