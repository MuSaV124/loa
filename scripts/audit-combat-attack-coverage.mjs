import { readFile, writeFile } from 'node:fs/promises';
import { classifyAttackStyle, describeAttack, DIRECTION, engravingScope, scopedEngraving, specialAttackRecords } from '../public/combat-attacks.js';
import { combatAnalyzerSkillShares, findCombatAnalyzerProfile } from '../public/combat-analyzer.js';
import { extractCombatSkillEffects } from '../public/skill-effects.js';
import { buildSkillCycleModel } from '../public/skill-cycle.js';

const [rosterFile, output] = process.argv.slice(2);
if (!rosterFile || !output) throw new Error('Usage: node scripts/audit-combat-attack-coverage.mjs <audit roster JSON> <output JSON>');
const read = async file => JSON.parse(await readFile(file, 'utf8'));
const input = await read(rosterFile);
const reference = await read(new URL('../docs/class-damage-audit-results.json', import.meta.url));
const analyzer = await read(new URL('../public/combat-analyzer.json', import.meta.url));
const endpoint = new URL('/api/character', process.env.LOA_APP_URL || 'https://loa-beige.vercel.app');
const normalize = value => String(value || '').replace(/\s+/g, '').replace(/[·:]/g, '').toLowerCase();
const names = [...new Map((input.cases || input).filter(row => row.character).map(row => [row.character, row])).values()];

function auditCharacter(data) {
  const profile = data.powerSnapshot?.profile;
  if (!profile?.className || !profile.secondClass || !data.skills?.length) throw new Error('Armory skill or build data missing');
  const { className, secondClass: build } = profile;
  const scope = { className, build };
  const skillEffects = extractCombatSkillEffects(data.skills);
  const engravings = data.raw?.ArmoryEngraving?.ArkPassiveEffects || [];
  const analyzerProfile = findCombatAnalyzerProfile(analyzer, data.powerSnapshot, skillEffects, { support: false });
  const shares = combatAnalyzerSkillShares(analyzerProfile?.value);
  const cycle = buildSkillCycleModel({ skillEffects, snapshot: data.powerSnapshot, shares, identitySkills: analyzer.identitySkills || [] });
  const specialAttacks = specialAttackRecords(className, build);
  const findSkill = name => skillEffects.items.find(item => normalize(item.name) === normalize(name));
  const weighted = cycle.shareRows.map(row => {
    const group = specialAttacks.find(attack => attack.name === row.name);
    const item = findSkill(row.name) || (!group && row.targetNames?.length === 1 ? findSkill(row.targetNames[0]) : null);
    return { ...describeAttack({ ...scope, name: item?.name || row.name, item }), weight: row.normalizedShare };
  });
  const books = [
    { name: '결투의 대가', direction: DIRECTION.HEAD },
    { name: '기습의 대가', direction: DIRECTION.BACK },
    scopedEngraving('타격의 대가', 1)
  ];
  const attacks = skillEffects.items.map(item => {
    const attack = describeAttack({ ...scope, name: item.name, item });
    return {
      name: item.name, source: attack.source, direction: attack.direction,
      tripods: attack.selectedTripods.map(tripod => tripod.name),
      eligibility: Object.fromEntries(books.map(book => [book.name, engravingScope(attack, book)])),
      directionConditions: attack.selectedTripods.flatMap(tripod => tripod.directionalDamage || [])
    };
  });
  return {
    className, build, style: classifyAttackStyle(weighted, engravings.map(book => book.Name), engravings.length > 0),
    positionEngravings: engravings.map(book => book.Name).filter(name => books.some(book => book.name === name)),
    shareBasis: analyzerProfile ? 'PRESET' : 'UNKNOWN', attacks,
    presetRows: weighted.map(({ name, source, direction, weight, confidence }) => ({ name, source, direction, weight, confidence })),
    specialAttacks
  };
}

const observed = [];
const errors = [];
let next = 0;
await Promise.all(Array.from({ length: Math.min(4, names.length) }, async () => {
  while (next < names.length) {
    const row = names[next++];
    try {
      const url = new URL(endpoint);
      url.searchParams.set('name', row.character);
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const sample = auditCharacter(await response.json());
      if (sample.className !== row.className || sample.build !== row.build) {
        errors.push({ className: row.className, build: row.build, currentBuild: sample.build, status: 'CURRENT_BUILD_DIFFERS' });
      }
      if (sample.className === row.className) observed.push(sample);
    } catch (error) {
      errors.push({ className: row.className, build: row.build, status: error.message });
    }
  }
}));

const identities = new Map((await read(new URL('./class-audit-roster.json', import.meta.url))).rows.map(row => [row.className, row.identity]));
const builds = reference.cases.map(({ className, build }) => {
  const samples = observed.filter(row => row.className === className && row.build === build);
  const styles = new Set(samples.map(row => row.style).filter(style => style !== 'UNKNOWN'));
  return { className, build, identitySystem: identities.get(className), style: styles.size === 1 ? [...styles][0] : 'UNKNOWN',
    samples: samples.length, unknownDirections: samples.reduce((sum, sample) => sum + sample.attacks.filter(attack => attack.direction === DIRECTION.UNKNOWN).length, 0),
    unknownPresetRows: [...new Set(samples.flatMap(sample => sample.presetRows.filter(row => row.direction === DIRECTION.UNKNOWN).map(row => row.name)))] };
});
const result = {
  retrievedAt: new Date().toISOString(), endpoint: endpoint.href, requested: names.length,
  observed: observed.sort((a, b) => a.className.localeCompare(b.className, 'ko') || a.build.localeCompare(b.build, 'ko')),
  builds, errors
};
await writeFile(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({
  requested: names.length, observed: observed.length, builds: builds.filter(row => row.samples).length,
  classes: new Set(observed.map(row => row.className)).size, notices: errors.length
}));
