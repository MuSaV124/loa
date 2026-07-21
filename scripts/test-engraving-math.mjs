import assert from 'node:assert/strict';
import { adjustedEngravingEffects, relicEngravingEffect } from '../public/engraving-math.js';

assert.deepEqual(
  relicEngravingEffect('아드레날린', 0),
  { critRate: 14, critDamage: 0, critHitDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 5.4, attackSpeed: 0, conditionalDamage: 0 }
);
assert.equal(relicEngravingEffect('아드레날린', 2).critRate, 17);
assert.equal(relicEngravingEffect('아드레날린', 4).critRate, 20);
assert.equal(relicEngravingEffect('저주받은 인형', 2).enemyDamage, 15.5);

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
