import assert from 'node:assert/strict';
import {
  ARCANA_CARD_EXPECTATION_MODELS,
  ARCANA_CULL_EFFECT,
  findArcanaCardExpectation,
  formatArcanaCardExpectation,
  weightedArcanaCardValue
} from '../public/arcana-card-expectation.js';

assert.equal(findArcanaCardExpectation({ className: '브레이커', secondClass: '권왕파천무' }), null);
assert.equal(findArcanaCardExpectation({ className: '아르카나', secondClass: '황제의 칙령' })?.key, 'emperor');
assert.equal(findArcanaCardExpectation({ CharacterClassName: '아르카나', Title: '황후의 은총' })?.key, 'empress');
assert.equal(ARCANA_CULL_EFFECT.critRate, 100);
assert.equal(ARCANA_CULL_EFFECT.critDamage, 50);

const emperor = ARCANA_CARD_EXPECTATION_MODELS.emperor;
assert.ok(Math.abs(weightedArcanaCardValue(1, 2, emperor) - 1.0691) < 1e-12);
assert.ok(Math.abs(weightedArcanaCardValue(1, 2, ARCANA_CARD_EXPECTATION_MODELS.empress) - (1 + 1 / 12)) < 1e-12);
assert.equal(formatArcanaCardExpectation(emperor), '황제의 칙령 · 도태 6.91% 확률 가중');

console.log('arcana card expectation tests passed');
