import assert from 'node:assert/strict';
import {
  ARCANA_CARD_EXPECTATION_MODELS,
  ARCANA_CHANCELLOR_EFFECT,
  ARCANA_CULL_EFFECT,
  ARCANA_SOVEREIGN_EFFECT,
  ARCANA_STREAM_EFFECT,
  arcanaChancellorExpectationWeight,
  arcanaCombatExpectation,
  arcanaCullExpectationWeight,
  arcanaSovereignExpectationWeight,
  findArcanaCardExpectation,
  findArcanaStreamEffect,
  formatArcanaCardExpectation,
  weightedArcanaCardValue,
  weightedEmperorNormalSkillCardValue
} from '../public/arcana-card-expectation.js';

assert.equal(findArcanaCardExpectation({ className: '브레이커', secondClass: '권왕파천무' }), null);
assert.equal(findArcanaCardExpectation({ className: '아르카나', secondClass: '황제의 칙령' })?.key, 'emperor');
assert.equal(findArcanaCardExpectation({ CharacterClassName: '아르카나', Title: '황후의 은총' })?.key, 'empress');
assert.equal(ARCANA_CULL_EFFECT.critRate, 100);
assert.equal(ARCANA_CULL_EFFECT.critDamage, 50);
assert.equal(ARCANA_CULL_EFFECT.durationSeconds, 4);
assert.equal(ARCANA_CHANCELLOR_EFFECT.critRate, 20);
assert.equal(ARCANA_CHANCELLOR_EFFECT.durationSeconds, 10);
assert.equal(ARCANA_SOVEREIGN_EFFECT.skillDamage, 50);
assert.equal(ARCANA_SOVEREIGN_EFFECT.durationSeconds, 4);
assert.equal(ARCANA_STREAM_EFFECT.critRate, 27.6);

const emperor = ARCANA_CARD_EXPECTATION_MODELS.emperor;
assert.equal(emperor.emperorCombinedTriggerProbability, 0.33);
assert.equal(emperor.cullProbability, 0.07);
assert.equal(emperor.chancellorProbability, 0.0565);
assert.equal(emperor.sovereignProbability, 0.064);
const emperorCullWeight = 1 - Math.exp(-(41.6 / 60) * 0.07 * 4);
const emperorChancellorWeight = 1 - Math.exp(-(41.6 / 60) * 0.0565 * 10);
const emperorSovereignWeight = 1 - Math.exp(-(41.6 / 60) * 0.064 * 4);
assert.ok(Math.abs(arcanaCullExpectationWeight(emperor) - emperorCullWeight) < 1e-12);
assert.ok(Math.abs(arcanaChancellorExpectationWeight(emperor) - emperorChancellorWeight) < 1e-12);
assert.ok(Math.abs(arcanaSovereignExpectationWeight(emperor) - emperorSovereignWeight) < 1e-12);
assert.ok(Math.abs(weightedArcanaCardValue(1, 2, emperor) - (1 + emperorCullWeight)) < 1e-12);
assert.ok(Math.abs(weightedArcanaCardValue(1, 2, ARCANA_CARD_EXPECTATION_MODELS.empress) - (1 + 1 / 12)) < 1e-12);
const emperorNormalSkillValue = weightedEmperorNormalSkillCardValue(1, 2, 1.25, 2.5, emperor);
const emperorNormalSkillCritValue = 1 * (1 - emperorCullWeight) * (1 - emperorChancellorWeight)
  + 2 * emperorCullWeight * (1 - emperorChancellorWeight)
  + 1.25 * (1 - emperorCullWeight) * emperorChancellorWeight
  + 2.5 * emperorCullWeight * emperorChancellorWeight;
assert.ok(Math.abs(emperorNormalSkillValue - emperorNormalSkillCritValue * (1 + emperorSovereignWeight * 0.5)) < 1e-12);
const emperorCombat = arcanaCombatExpectation(emperor);
assert.equal(emperorCombat.combatSeconds, 180);
assert.equal(emperorCombat.cardsPerMinute, 41.6);
assert.ok(Math.abs(emperorCombat.cards - 124.8) < 1e-12);
assert.ok(Math.abs(emperorCombat.cullCards - 8.736) < 1e-12);
assert.ok(Math.abs(emperorCombat.chancellorCards - 7.0512) < 1e-12);
assert.ok(Math.abs(emperorCombat.sovereignCards - 7.9872) < 1e-12);
assert.ok(Math.abs(emperorCombat.cullUptime - emperorCullWeight) < 1e-12);
assert.ok(Math.abs(emperorCombat.chancellorUptime - emperorChancellorWeight) < 1e-12);
assert.ok(Math.abs(emperorCombat.sovereignUptime - emperorSovereignWeight) < 1e-12);
assert.equal(formatArcanaCardExpectation(emperor), `황제의 칙령 · 황제+또황 33.0% · 실전 41.6장/분 · 도태 7.00%/${(emperorCullWeight * 100).toFixed(2)}% · 재상 5.65%/${(emperorChancellorWeight * 100).toFixed(2)}% · 제후 6.40%/${(emperorSovereignWeight * 100).toFixed(2)}%`);

const streamSkillEffects = {
  items: [{
    name: '스트림 오브 엣지',
    currentTree: true,
    effects: { critRate: 27.6 },
    selectedTripods: [{ name: '다크니스 엣지', effects: { critRate: 27.6 } }]
  }]
};
assert.equal(findArcanaStreamEffect({ className: '아르카나', secondClass: '황제의 칙령' }, streamSkillEffects)?.critRate, 27.6);
assert.equal(findArcanaStreamEffect({ className: '아르카나', secondClass: '황후의 은총' }, streamSkillEffects), null);
assert.equal(findArcanaStreamEffect({ className: '아르카나', secondClass: '황제의 칙령' }, { items: [] }), null);

console.log('arcana card expectation tests passed');
