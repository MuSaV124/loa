import assert from 'node:assert/strict';
import { RELIC_ENGRAVING_RULES, adjustedEngravingEffects, relicEngravingEffect } from '../public/engraving-math.js';

const values = (name, key) => RELIC_ENGRAVING_RULES[name].levels.map(effect => effect[key]);

assert.deepEqual(values('원한', 'enemyDamage'), [18, 18.75, 19.5, 20.25, 21]);
assert.deepEqual(values('저주받은 인형', 'enemyDamage'), [14, 14.75, 15.5, 16.25, 17]);
assert.deepEqual(values('아드레날린', 'critRate'), [14, 15.5, 17, 18.5, 20]);
assert.deepEqual(values('예리한 둔기', 'critDamage'), [44, 46, 48, 50, 52]);
assert.deepEqual(values('질량 증가', 'enemyDamage'), [16, 16.75, 17.5, 18.25, 19]);
assert.deepEqual(values('돌격대장', 'conditionalDamage'), [16, 16.8, 17.6, 18.4, 19.2]);
assert.deepEqual(values('기습의 대가', 'conditionalDamage'), [19.8, 20.5, 21.2, 21.9, 22.6]);
assert.deepEqual(values('속전속결', 'conditionalDamage'), [18, 18.75, 19.5, 20.25, 21]);
assert.deepEqual(values('마나 효율 증가', 'conditionalDamage'), [13, 13.75, 14.5, 15.25, 16]);

assert.equal(relicEngravingEffect('아드레날린', 2).critRate, 17);
assert.equal(relicEngravingEffect('아드레날린', 2).attackPower, 5.4);
assert.equal(relicEngravingEffect('질량 증가', 4).attackSpeed, -10);
assert.equal(relicEngravingEffect('없는 각인', 4).enemyDamage, 0);

const originalAdrenaline = adjustedEngravingEffects({ enemyDamage: 18 }, {
  originalHasAdrenaline: true,
  adrenalineEnabled: false,
  replacementName: '저주받은 인형',
  replacementBookLevel: 2
});
assert.equal(originalAdrenaline.effects.enemyDamage, 33.5);

const currentReplacement = relicEngravingEffect('저주받은 인형', 0);
const changedToAdrenaline = adjustedEngravingEffects({ enemyDamage: 30 }, {
  originalHasAdrenaline: false,
  adrenalineEnabled: true,
  replacementName: '저주받은 인형',
  replacementBookLevel: 0,
  originalReplacementEffect: currentReplacement
});
assert.equal(changedToAdrenaline.effects.enemyDamage, 16);

const upgradedReplacement = adjustedEngravingEffects({ enemyDamage: 30 }, {
  originalHasAdrenaline: false,
  adrenalineEnabled: false,
  replacementName: '저주받은 인형',
  replacementBookLevel: 4,
  originalReplacementEffect: currentReplacement
});
assert.equal(upgradedReplacement.effects.enemyDamage, 33);

console.log('engraving math tests passed');
