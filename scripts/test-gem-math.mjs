import assert from 'node:assert/strict';
import { gemFusionPurchaseCount, isBoundGem } from '../public/gem-math.js';

assert.equal(isBoundGem({ name: '7레벨 광휘의 보석' }), false);
assert.equal(isBoundGem({ name: '7레벨 광휘의 보석 (귀속)' }), true);
assert.equal(isBoundGem({ name: '7레벨 광휘의 보석 (귀속)   ' }), true);
assert.equal(isBoundGem({ name: '7레벨 광휘의 보석', text: '캐릭터 귀속' }), false);
assert.equal(isBoundGem({ bound: false, name: '7레벨 광휘의 보석 (귀속)' }), true);
assert.equal(isBoundGem({ bound: true }), false);

assert.equal(gemFusionPurchaseCount({ name: '7레벨 광휘의 보석' }), 2);
assert.equal(gemFusionPurchaseCount({ name: '7레벨 광휘의 보석 (귀속)' }), 3);
assert.equal(gemFusionPurchaseCount({ bound: true }), 2);

console.log('gem math tests passed');
