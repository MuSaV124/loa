import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expectedCriticalDamage, expectedHitDamage } from '../public/damage-math.js';
import { maintainedEvolutionDamage } from '../public/evolution-math.js';
import { extractCombatSkillEffects, parseSkillEffectText } from '../public/skill-effects.js';
import { extractArkGridSkillEffects, extractArkPassiveSkillEffects, passiveEffectsForSkill } from '../public/passive-skill-effects.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const crit = rate => expectedCriticalDamage({ critRate: rate, critDamage: 250 });

// Independently enumerate the two outcomes on both sides of each tier boundary.
for (const [rate, low, high, chance] of [
  [0, 1, 2.5, 0], [99.99, 1, 2.5, .9999], [100, 2.5, 4, 0],
  [100.01, 2.5, 4, .0001], [120, 2.5, 4, .2], [199.99, 2.5, 4, .9999],
  [200, 4, 5.5, 0], [200.01, 4, 5.5, .0001], [299.99, 4, 5.5, .9999],
  [300, 5.5, 7, 0], [330, 5.5, 7, .3]
]) {
  const result = crit(rate);
  close(result.multiplier, low * (1 - chance) + high * chance);
  close(result.nextTierChance, chance);
}
// Official tier rule at each requested rate, with 250% critical damage.
for (const [critRate, expected, tiers, nextChance, multiChance] of [
  [90, 2.35, 0, .9, 0],
  [95, 2.425, 0, .95, 0],
  [100, 2.5, 1, 0, 0],
  [110, 2.65, 1, .1, .1],
  [120, 2.8, 1, .2, .2],
  [150, 3.25, 1, .5, .5],
  [200, 4, 2, 0, 1],
  [220, 4.3, 2, .2, 1],
  [300, 5.5, 3, 0, 1]
]) {
  const result = expectedHitDamage({ critRate, critDamage: 250 });
  close(result.value, expected);
  assert.equal(result.critical.guaranteedTiers, tiers);
  close(result.critical.nextTierChance, nextChance);
  close(result.critical.multiCritChance, multiChance);
}
close(crit(120).multiCritChance, .2);
assert.equal(crit(220).critHitChance, 1);
assert.equal(crit(220).multiCritChance, 1);
assert.equal(crit(220).guaranteedTiers, 2);
assert.equal(expectedCriticalDamage({ critRate: 220, canCrit: false }).multiplier, 1);
assert.equal(expectedCriticalDamage({ critRate: 220, multiCrit: false }).multiplier, 2);
close(expectedCriticalDamage({ critRate: 120, critDamage: 250, critHitMultiplier: 1.12 }).multiplier, 2.5 * 1.12 + .2 * 1.5);
assert.equal(expectedHitDamage({ critRate: 100, critHitDamage: 12 }).critHitStackingUnverified, false);
assert.equal(expectedHitDamage({ critRate: 100.01, critHitDamage: 12 }).critHitStackingUnverified, true);
assert.equal(expectedHitDamage({ critRate: 220, critHitDamage: 12, critCap: 80 }).critHitStackingUnverified, false);
for (const [critRate, firstOnly, wholeHit] of [[80, 2.44, 2.44], [120, 3.10, 3.136], [220, 4.6, 4.816], [320, 6.1, 6.496]]) {
  const hit = expectedHitDamage({ critRate, critDamage: 250, critHitDamage: 12 });
  assert.ok(Math.abs(hit.value - firstOnly) < 1e-10, critRate);
  assert.ok(Math.abs(hit.alternateValue - wholeHit) < 1e-10, critRate);
}

const blunt = expectedHitDamage({ critRate: 180, critDamage: 250, critCap: 80, evolutionDamage: 19, overCritToEvolutionDamageRate: 1.4 });
assert.equal(blunt.critical.multiCritChance, 0);
close(blunt.critical.critHitChance, .8);
close(blunt.convertedEvolutionDamage, 140);
close(blunt.value, (.2 + .8 * 2.5) * 2.59);

const { nodes } = JSON.parse(readFileSync(new URL('../public/data/evolution.json', import.meta.url), 'utf8'));
const bluntLevels = nodes.find(node => node.name === '뭉툭한 가시').levels;
const standingLevels = nodes.find(node => node.name === '입식 타격가').levels;
for (const node of nodes) {
  if (node.name === '뭉툭한 가시') continue;
  for (const [level, effects] of Object.entries(node.levels || {})) {
    const label = `${node.name} Lv.${level}`;
    assert.equal(effects.critCap, undefined, label);
    // Node selection owns the multi-crit policy even if the stats carry an opt-out.
    for (const [critRate, tiers, chance, multiplier] of [[120, 1, .2, 2.8], [220, 2, .2, 4.3], [300, 3, 0, 5.5]]) {
      const hit = expectedHitDamage({ ...effects, critRate, critDamage: 250, multiCrit: false });
      assert.equal(hit.effectiveCritRate, critRate, label);
      assert.equal(hit.convertedEvolutionDamage, 0, label);
      assert.equal(hit.critical.guaranteedTiers, tiers, label);
      close(hit.critical.nextTierChance, chance);
      close(hit.critical.multiplier, multiplier + 2.5 * (effects.critHitDamage ?? 0) / 100);
    }
  }
}
for (const [level, bluntBase, conversionRate, standingBase] of [[1, 9.5, 1.2, 10.5], [2, 19, 1.4, 21]]) {
  for (const [critRate, commonCritical, tiers, nextChance] of [
    [80, 2.2, 0, .8], [100, 2.5, 1, 0], [120, 2.8, 1, .2], [150, 3.25, 1, .5],
    [200, 4, 2, 0], [220, 4.3, 2, .2], [300, 5.5, 3, 0]
  ]) {
    const otherEvolution = 25;
    const hit = (effect, commonEvolution) => expectedHitDamage({
      ...effect, critRate: critRate - 35, skillCritBonus: 20, adrenalineCritRate: 15, critDamage: 250,
      evolutionDamage: effect.evolutionDamage + commonEvolution
    });
    const spike = hit(bluntLevels[level], otherEvolution);
    const standing = hit({ ...standingLevels[level], evolutionDamage: maintainedEvolutionDamage(standingLevels[level]) }, otherEvolution);
    const conversion = (critRate - 80) * conversionRate;
    close(spike.effectiveCritRate, 80);
    close(spike.critical.critHitChance, .8);
    close(spike.critical.multiCritChance, 0);
    close(spike.convertedEvolutionDamage, conversion);
    close(spike.evo, otherEvolution + bluntBase + conversion);
    close(spike.value, 2.2 * (1 + (otherEvolution + bluntBase + conversion) / 100));
    close(standing.effectiveCritRate, critRate);
    assert.equal(standing.critical.guaranteedTiers, tiers);
    close(standing.critical.nextTierChance, nextChance);
    close(standing.convertedEvolutionDamage, 0);
    close(standing.evo, otherEvolution + standingBase);
    close(standing.critical.multiplier, commonCritical);
    close(standing.value, commonCritical * (1 + (otherEvolution + standingBase) / 100));
  }
}
close(expectedHitDamage({
  critRate: 120, critDamage: 250, evolutionDamage: 20, additionalDamage: 10,
  enemyDamageSources: [10, { value: 15 }], attackPower: 5, skillDamage: 30, attributeDamage: 15
}).value, 2.8 * 1.2 * 1.1 * 1.1 * 1.15 * 1.05 * 1.3 * 1.15);

const text = '공격이 항상 치명타로 적중하며 모든 치명타 발생 확률 1%당 피해량이 0.6% 증가한다. 치명타 피해가 60% 증가한다.';
const glaivier = parseSkillEffectText(text);
assert.equal(glaivier.forcedCrit, true);
assert.equal(glaivier.critRateToDamage, .6);
assert.equal(glaivier.critRate, 0);
assert.equal(glaivier.skillDamage, 0);
assert.equal(glaivier.critDamage, 60);
close(expectedHitDamage({ ...glaivier, critRate: 120, critDamage: 260 }).value, 2.6 * 1.72);
for (const critRate of [80, 220, 300]) {
  const standing = expectedHitDamage({ ...glaivier, ...standingLevels[2], critRate, critDamage: 260,
    evolutionDamage: maintainedEvolutionDamage(standingLevels[2]) });
  assert.equal(standing.critical.guaranteedTiers, 1);
  close(standing.critical.multiCritChance, 0);
  close(standing.critical.convertedDamage, critRate * .6);
  close(standing.value, 2.6 * (1 + critRate * .006) * 1.21);
  // Preserve the current theoretical assumption until the interaction is confirmed in-game.
  const spike = expectedHitDamage({ ...glaivier, ...bluntLevels[2], critRate, critDamage: 260 });
  close(spike.critical.critHitChance, .8);
  close(spike.critical.multiCritChance, 0);
  close(spike.value, (.2 + .8 * 2.6) * (1.19 + (critRate - 80) * .014));
}
assert.equal(parseSkillEffectText('치명타 적중률이 100% 증가한다.').forcedCrit, undefined);
assert.equal(parseSkillEffectText('치명타 적중률이 80.0% (PvP 40.0%) 증가한다.').critRate, 80);

const scoped = extractArkPassiveSkillEffects([{
  name: '도약', tooltip: `적룡필살의 돌진 공격 거리가 4.0m 증가하고, ${text}`
}], { shareNames: ['적룡필살', '다른 스킬'] });
assert.equal(scoped.globalEffects.forcedCrit, undefined);
const leap = passiveEffectsForSkill(scoped, { name: '적룡필살' }).effects;
assert.equal(leap.critRateToDamage, .6);
assert.equal(leap.skillDamage, 0);
assert.equal(passiveEffectsForSkill(scoped, { name: '다른 스킬' }).effects.forcedCrit, undefined);

const scrapper = extractArkPassiveSkillEffects([{
  name: '깨달음', tooltip: '기력 스킬의 피해량이 73.0% 증가하지만 충격 스킬 피해량이 30.0% 감소한다.'
}]);
assert.equal(passiveEffectsForSkill(scrapper, { name: '철포난격', category: '기력 스킬' }).effects.skillDamage, 73);
assert.equal(passiveEffectsForSkill(scrapper, { name: '죽음의 선고', category: '충격 스킬' }).effects.skillDamage, -30);
assert.equal(passiveEffectsForSkill(scrapper, { name: '다른 스킬' }).effects.skillDamage, 0);

const tripods = extractCombatSkillEffects(['적룡포', '철량추'].map((Name, index) => ({
  Name, Level: 14, Tripods: [{ Name: index ? '지면 강타' : '파괴하는 창', IsSelected: true, Tooltip: text }]
})));
assert.equal(tripods.items[0].effects.critRateToDamage, .6);
assert.equal(tripods.items[1].effects.critRateToDamage, undefined);
assert.equal(tripods.items[1].selectedTripods[0].partialCritRuleUnmodeled, true);

const evolutionCore = [{
  name: '진화의 끝', point: 17,
  activeTexts: [`적룡포의 '진화하는 창술' 트라이포드 적용 시 피해량이 30.0% 감소하지만 공격이 항상 치명타로 적중하며 모든 치명타 발생 확률 1%당 피해량이 0.6% 증가한다. 집중 스킬의 피해량이 1.0% 증가한다.`]
}];
for (const hasTripod of [false, true]) {
  const target = { name: '적룡포', category: '집중 스킬', selectedTripods: hasTripod ? [{ name: '진화하는 창술' }] : [] };
  const otherSkill = { name: '굉열파', category: '집중 스킬' };
  const grid = extractArkGridSkillEffects(evolutionCore, { skillItems: [target, otherSkill] });
  const effects = passiveEffectsForSkill(grid, target).effects;
  assert.equal(Boolean(effects.forcedCrit), hasTripod);
  assert.equal(effects.skillDamage, hasTripod ? -29.3 : 1);
  assert.equal(passiveEffectsForSkill(grid, otherSkill).effects.skillDamage, 1);
}

for (const rate of [-10, NaN, Infinity, '-Infinity', 450]) {
  for (const damage of [0, NaN, 250, -100, Infinity]) {
    const result = expectedHitDamage({ critRate: rate, critDamage: damage, attackPower: -10 });
    assert.ok(Number.isFinite(result.value) && result.value >= 0);
  }
}

console.log('damage math tests passed');
