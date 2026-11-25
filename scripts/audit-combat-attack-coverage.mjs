import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { parseCharacterArmory } from '../api/character.js';
import { ATTACK_SOURCE, attackHitModifiers, buildAttackUnits, classifyAttackStyle, describeAttack, DIRECTION, engravingScope, scopedEngraving, specialAttackRecords } from '../public/combat-attacks.js';
import { combatAnalyzerSkillShares, findCombatAnalyzerProfile } from '../public/combat-analyzer.js';
import { expectedHitDamage } from '../public/damage-math.js';
import { extractArkGridSkillEffects, extractArkPassiveSkillEffects } from '../public/passive-skill-effects.js';
import { collectSkillTooltipTexts, extractCombatSkillEffects, parseSkillAttackProfile, skillExperimentItems } from '../public/skill-effects.js';
import { buildSkillCycleModel } from '../public/skill-cycle.js';

const [rosterFile, output] = process.argv.slice(2);
if (!rosterFile || !output) throw new Error('Usage: node scripts/audit-combat-attack-coverage.mjs <audit roster JSON> <output JSON>');
const read = async file => JSON.parse(await readFile(file, 'utf8'));
const input = await read(rosterFile);
const reference = await read(new URL('../docs/class-damage-audit-results.json', import.meta.url));
const analyzer = await read(new URL('../public/combat-analyzer.json', import.meta.url));
const endpoint = new URL('/api/character', process.env.LOA_APP_URL || 'https://loa-beige.vercel.app');
const saved = Array.isArray(input.samples);
const names = saved ? input.samples : [...new Map((input.cases || input).filter(row => row.character).map(row => [row.character, row])).values()];

function tripodAudit(skill) {
  const base = parseSkillAttackProfile({ ...skill, Tripods: [] });
  return (skill.Tripods || []).flatMap(tripod => {
    const text = collectSkillTooltipTexts(tripod.Tooltip).join(' ');
    if (!text) return [];
    const result = parseSkillAttackProfile({ ...skill, Tripods: [{ ...tripod, IsSelected: true }] });
    const directionChanged = JSON.stringify(base) !== JSON.stringify(result);
    const traits = Object.entries({
      DIRECTION: /(?:헤드|백)\s*어택|방향성/,
      CRIT: /치명타/,
      ADDITIONAL_HIT: /(?:추가|추격|후속)\s*(?:공격|타격)|(?:공격|타격)\s*횟수/,
      MULTI_HIT: /첫\s*(?:타격|공격)|마지막\s*(?:타격|공격)|연속\s*타격|연타/,
      DOT: /도트|화상|출혈|매\s*초마다|지속\s*피해/,
      SUMMON: /(?:소환|생성)하여.*(?:공격|피해)|(?:소환수|환영).*(?:공격|피해)/
    }).filter(([, pattern]) => pattern.test(text)).map(([kind]) => kind);
    return [{ tier: tripod.Tier, slot: tripod.Slot, name: tripod.Name, selected: tripod.IsSelected === true,
      traits, ...(directionChanged ? { before: base, after: result, tooltip: text } : {}) }];
  });
}

function auditCharacter(data) {
  const profile = data.powerSnapshot?.profile;
  if (!profile?.className || !profile.secondClass || !data.skills?.length) throw new Error('Armory skill or build data missing');
  const { className, secondClass: build } = profile;
  const scope = { className, build };
  const skillEffects = extractCombatSkillEffects(data.skills);
  const engravings = data.raw?.ArmoryEngraving?.ArkPassiveEffects || [];
  const armorySkills = new Map(data.skills.map(skill => [skill.Name, skill]));
  const analyzerProfile = findCombatAnalyzerProfile(analyzer, data.powerSnapshot, skillEffects, { support: false });
  const shares = combatAnalyzerSkillShares(analyzerProfile?.value);
  const cycle = buildSkillCycleModel({ skillEffects, snapshot: data.powerSnapshot, shares, identitySkills: analyzer.identitySkills || [] });
  const specialAttacks = specialAttackRecords(className, build);
  const shareBasis = cycle.shareSource === 'combat-analyzer' ? 'PRESET' : 'ESTIMATED_TREE';
  const model = buildAttackUnits({ ...scope, items: skillEffects.items, shareRows: cycle.shareRows,
    fallbackItems: skillExperimentItems(skillEffects), shareBasis });
  const weighted = model.units.map(({ attack, weight, basis }) => ({ ...attack, weight, basis }));
  const weightSum = weighted.reduce((sum, attack) => sum + attack.weight, 0);
  assert.ok(!weightSum || Math.abs(weightSum - 1) < 1e-9, className + '/' + build);
  const books = [
    { name: '결투의 대가', direction: DIRECTION.HEAD },
    { name: '기습의 대가', direction: DIRECTION.BACK },
    scopedEngraving('타격의 대가', 1)
  ];
  const attacks = skillEffects.items.map(item => {
    const attack = describeAttack({ ...scope, name: item.name, item });
    for (const direction of [null, DIRECTION.HEAD, DIRECTION.BACK]) {
      const modifiers = attackHitModifiers(attack, direction, books.filter(book => book.name === '타격의 대가'), [], 0);
      const result = expectedHitDamage({ attackSource: attack.source, critRate: 130 + modifiers.critRate,
        critDamage: 250 + (attack.directions.length ? 32 : 0), evolutionDamage: 20, enemyDamageSources: modifiers.enemyDamageSources });
      assert.ok(Number.isFinite(result.value) && result.value > 0, item.name);
      if (attack.source === ATTACK_SOURCE.SUPER_AWAKENING) assert.equal(result.value, 1);
      if (!attack.directions.length) assert.equal(modifiers.critRate, 0);
    }
    return {
      name: item.name, source: attack.source, direction: attack.direction, directions: attack.directions,
      forcedDirection: attack.forcedDirection, confidence: attack.confidence, evidence: attack.evidence,
      tripods: attack.selectedTripods.map(tripod => tripod.name),
      eligibility: Object.fromEntries(books.map(book => [book.name, engravingScope(attack, book)])),
      directionConditions: attack.selectedTripods.flatMap(tripod => tripod.directionalDamage || []),
      unresolvedDirectionRules: [...(item.partialAttackDirectionRules || []),
        ...attack.selectedTripods.flatMap(tripod => tripod.unverifiedDirectionalDamage || [])],
      tripodOptions: tripodAudit(armorySkills.get(item.name) || {})
    };
  });
  const passive = (data.arkPassive?.Effects || []).map((raw, index) => ({ name: raw.Name, index, description: raw.Description, raw }));
  const effectOptions = { skillItems: skillEffects.items, shareNames: weighted.map(attack => attack.name), identitySkills: analyzer.identitySkills || [] };
  const scopedEffects = [...extractArkPassiveSkillEffects(passive, effectOptions).items,
    ...extractArkGridSkillEffects(data.arkGridEffects?.items, effectOptions).items];
  const awakeningNames = new Set(attacks.filter(attack => [ATTACK_SOURCE.AWAKENING, ATTACK_SOURCE.SUPER_AWAKENING].includes(attack.source)).map(attack => attack.name));
  const awakeningEffects = scopedEffects.filter(row => /각성기/.test(row.selector || '') || row.targets?.some(target => awakeningNames.has(target)));
  return {
    className, build, style: classifyAttackStyle(weighted.filter(row => row.basis === 'PRESET'), engravings.map(book => book.Name), engravings.length > 0),
    positionEngravings: engravings.filter(engraving => books.some(book => book.name === engraving.Name))
      .map(engraving => ({ name: engraving.Name, description: collectSkillTooltipTexts(engraving.Description).join(' ') })),
    shareBasis, weightSum, rawShareTotal: cycle.rawShareTotal, shareIssues: [...cycle.shareIssues, ...model.issues], attacks,
    presetRows: weighted.map(({ name, source, direction, directions, forcedDirection, weight, confidence, basis, parent }) =>
      ({ name, source, direction, directions, forcedDirection, weight, confidence, basis, parent })),
    specialAttacks: specialAttacks.flatMap(record => [record.name, ...Object.keys(record.components || {})]
      .map(name => describeAttack({ ...scope, name }))), awakeningEffects,
    evolutionEvidence: passive.filter(row => row.name === '진화' && /일격|혼신의 강타|뭉툭한 가시|입식 타격가|인파이팅/.test(row.description || ''))
      .map(row => ({ name: collectSkillTooltipTexts(row.description).join(' '), tooltip: collectSkillTooltipTexts(row.raw.ToolTip).at(-1) }))
  };
}

const observed = [];
const errors = [];
let next = 0;
await Promise.all(Array.from({ length: Math.min(4, names.length) }, async () => {
  while (next < names.length) {
    const row = names[next++];
    try {
      let data;
      if (saved) {
        if (!row.raw) throw new Error(row.error || 'Armory data missing');
        data = parseCharacterArmory(row.raw, { arkGrid: { data: row.arkGrid }, combatSkills: { data: row.skills } });
      } else {
        const url = new URL(endpoint);
        url.searchParams.set('name', row.character);
        const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        data = await response.json();
      }
      const expectedClass = row.classExpected || row.className;
      const expectedBuild = row.buildExpected || row.build;
      const sample = auditCharacter(data);
      if (sample.className !== expectedClass || sample.build !== expectedBuild) {
        errors.push({ className: expectedClass, build: expectedBuild, currentBuild: sample.build, status: 'CURRENT_BUILD_DIFFERS' });
      }
      if (sample.className === expectedClass) observed.push(sample);
    } catch (error) {
      if (error instanceof assert.AssertionError) throw error;
      errors.push({ className: row.classExpected || row.className, build: row.buildExpected || row.build, status: error.message });
    }
  }
}));

const identities = new Map((await read(new URL('./class-audit-roster.json', import.meta.url))).rows.map(row => [row.className, row.identity]));
const builds = reference.cases.map(({ className, build: catalogBuild }) => {
  // Official 12914 renamed the Deadeye Enlightenment node.
  const build = className === '데빌헌터' && catalogBuild === '강화 무기' ? '전술 탄환' : catalogBuild;
  const samples = observed.filter(row => row.className === className && row.build === build);
  const styles = new Set(samples.map(row => row.style).filter(style => style !== 'UNKNOWN'));
  return { className, build, identitySystem: identities.get(className), style: styles.size === 1 ? [...styles][0] : 'UNKNOWN',
    samples: samples.length, unknownDirections: samples.reduce((sum, sample) => sum + sample.attacks.filter(attack => attack.confidence === 'UNKNOWN').length, 0),
    unknownPresetRows: [...new Set(samples.flatMap(sample => sample.presetRows.filter(row => row.weight > 0 && row.confidence === 'UNKNOWN').map(row => row.name)))] };
});
const result = {
  retrievedAt: saved ? input.retrievedAt : new Date().toISOString(), endpoint: saved ? input.source : endpoint.href, requested: names.length,
  observed: observed.sort((a, b) => a.className.localeCompare(b.className, 'ko') || a.build.localeCompare(b.build, 'ko')),
  builds, errors
};
await writeFile(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({
  requested: names.length, observed: observed.length, builds: builds.filter(row => row.samples).length,
  classes: new Set(observed.map(row => row.className)).size, notices: errors.length
}));
