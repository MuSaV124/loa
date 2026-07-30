import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { combatAnalyzerGemFactors, gemUpgradeEfficiency } from '../public/combat-analyzer.js';

const DAMAGE = [8, 12, 16, 20, 24, 28, 32, 36, 40, 44];
const COOLDOWN = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-12, `${label}: ${actual} !== ${expected}`);

const data = {
  identitySkills: [],
  presets: [{ tag: 'audit', cores: [{ '감사 코어': 1 }], gems: [], value: { '스킬 A': 0.6, '스킬 B': 0.4 } }]
};

for (let levelA = 1; levelA <= 10; levelA += 1) {
  for (let levelB = 1; levelB <= 10; levelB += 1) {
    const cooldownLevelA = 1 + ((levelA * 3 + levelB) % 10);
    const cooldownLevelB = 1 + ((levelA + levelB * 7) % 10);
    const gems = [
      { slot: 0, skillName: '스킬 A', kind: 'damage', level: levelA, attackBonus: true, valid: true },
      { slot: 1, skillName: '스킬 B', kind: 'damage', level: levelB, attackBonus: true, valid: true },
      { slot: 2, skillName: '쿨 A', kind: 'cooldown', level: cooldownLevelA, attackBonus: true, valid: true },
      { slot: 3, skillName: '쿨 B', kind: 'cooldown', level: cooldownLevelB, attackBonus: true, valid: true }
    ];
    const snapshot = { profile: { secondClass: '감사' }, arkGrid: { slots: [{ name: '감사 코어', point: 3 }] }, gems: { items: gems } };
    const result = combatAnalyzerGemFactors(data, snapshot, {});
    const expectedDamage = 1 + (DAMAGE[levelA - 1] * 0.6 + DAMAGE[levelB - 1] * 0.4) / 100;
    const weightA = 2 ** (cooldownLevelA - 1);
    const weightB = 2 ** (cooldownLevelB - 1);
    const expectedAverageCooldown = (COOLDOWN[cooldownLevelA - 1] * weightA + COOLDOWN[cooldownLevelB - 1] * weightB) / (weightA + weightB);
    const expectedCooldown = 1 / (1 - 0.9 * expectedAverageCooldown / 100);
    close(result.damageFactor, expectedDamage, 'damage factor');
    close(result.averageCooldown, expectedAverageCooldown, 'cooldown average');
    close(result.cooldownFactor, expectedCooldown, 'cooldown factor');
    close(result.totalFactor, expectedDamage * expectedCooldown, 'total factor');

    if (levelA < 10) {
      const upgrade = gemUpgradeEfficiency({ data, snapshot, skillEffects: {}, gem: gems[0], nextLevel: levelA + 1 });
      const expectedAfterDamage = 1 + (DAMAGE[levelA] * 0.6 + DAMAGE[levelB - 1] * 0.4) / 100;
      close(upgrade.gainPercent, (expectedAfterDamage / expectedDamage - 1) * 100, 'damage upgrade gain');
    }
  }
}

const malformedSnapshot = {
  profile: { secondClass: '감사' },
  arkGrid: { slots: [{ name: '감사 코어', point: 3 }] },
  gems: { items: [{ slot: 0, skillName: '스킬 A', kind: 'damage', level: 0, attackBonus: true, valid: true }] }
};
close(combatAnalyzerGemFactors(data, malformedSnapshot, {}).damageFactor, 1, 'level 0 gem must have no effect');

const aliasSnapshot = {
  profile: { secondClass: '감사' },
  arkGrid: { slots: [{ name: '감사 코어', point: 3 }] },
  gems: { items: [{ slot: 0, skillName: '컴바인 A', kind: 'damage', level: 8, attackBonus: true, valid: true }] }
};
const aliasData = { identitySkills: [], presets: [{ tag: 'alias', cores: [{ '감사 코어': 1 }], gems: [], value: { '컴파인 A': 1 } }] };
const aliasUpgrade = gemUpgradeEfficiency({ data: aliasData, snapshot: aliasSnapshot, skillEffects: {}, gem: aliasSnapshot.gems.items[0], nextLevel: 9 });
assert.ok(aliasUpgrade.gainPercent > 0);
assert.equal(aliasUpgrade.skillShare, 1);

const characterSource = await readFile(new URL('../api/character.js', import.meta.url), 'utf8');
const marketSource = await readFile(new URL('../api/market-prices.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
assert.match(characterSource, /additionalDamage:\s*\{\s*high:\s*2\.60,\s*mid:\s*1\.60,\s*low:\s*0\.70\s*\}/);
assert.match(marketSource, /additionalDamage[^\n]+values:\s*\{\s*high:\s*2\.60,\s*mid:\s*1\.60,\s*low:\s*0\.70\s*\}/);
assert.match(appSource, /metric === 'damage'\) return `환산 전투력 \+\$\{powerDelta\.toFixed\(2\)\}`/);
assert.match(appSource, /return `\$\{prefix\} \+\$\{Number\(estimate\.percent \|\| 0\)\.toFixed\(3\)\}%`/);

console.log('dealer simulator audit tests passed (200 generated builds + edge cases)');
