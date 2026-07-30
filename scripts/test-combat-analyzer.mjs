import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  combatAnalyzerGemFactors,
  findCombatAnalyzerProfile,
  gemUpgradeEfficiency
} from '../public/combat-analyzer.js';

const data = {
  gemTables: {
    tier4Damage: [8, 12, 16, 20, 24, 28, 32, 36, 40, 44],
    tier4Cooldown: [6, 8, 10, 12, 14, 16, 18, 20, 22, 24]
  },
  identitySkills: ['아이덴티티'],
  presets: [{
    tag: '322 수라',
    cores: [{ '그림자 주먹': 14 }, { 수라결: 14 }, { 수라: 14 }],
    gems: [],
    value: { 비상격: 0.6, 진파공권: 0.4, 아이덴티티: 0.2 }
  }],
  fallbackBuilds: { '수라의 길': { 비상격: 0.5, 진파공권: 0.5 }, '강화 무기': { 심판의날: 1 } }
};
const snapshot = {
  profile: { className: '브레이커', secondClass: '수라의 길' },
  arkGrid: { slots: [{ name: '그림자 주먹', point: 14 }, { name: '수라결', point: 15 }, { name: '수라', point: 14 }] },
  gems: { items: [
    { slot: 0, skillName: '비상격', kind: 'damage', name: '9레벨 겁화의 보석', level: 9, valid: true },
    { slot: 1, skillName: '진파공권', kind: 'damage', name: '9레벨 겁화의 보석', level: 9, valid: true },
    { slot: 2, skillName: '비상격', kind: 'cooldown', name: '9레벨 작열의 보석', level: 9, valid: true }
  ] }
};

assert.equal(findCombatAnalyzerProfile(data, snapshot, null).tag, '322 수라');
const factors = combatAnalyzerGemFactors(data, snapshot, null);
assert.ok(Math.abs(factors.damageFactor - 1.4) < 1e-12);
assert.ok(Math.abs(factors.cooldownFactor - (1 / (1 - 0.9 * 0.22))) < 1e-12);
const damageUpgrade = gemUpgradeEfficiency({ data, snapshot, gem: snapshot.gems.items[0], nextLevel: 10 });
assert.ok(damageUpgrade.gainPercent > 1.7 && damageUpgrade.gainPercent < 1.8);
assert.equal(damageUpgrade.skillShare, 0.6);
const cooldownUpgrade = gemUpgradeEfficiency({ data, snapshot, gem: snapshot.gems.items[2], nextLevel: 10 });
assert.ok(cooldownUpgrade.gainPercent > 2.29 && cooldownUpgrade.gainPercent < 2.31);

const fallbackSnapshot = {
  ...snapshot,
  profile: { className: '데빌헌터', secondClass: '전술 탄환' },
  arkGrid: { slots: [] },
  gems: { items: [{ slot: 0, skillName: '심판의날', kind: 'damage', name: '9레벨 겁화의 보석', level: 9, valid: true }] }
};
const fallback = findCombatAnalyzerProfile(data, fallbackSnapshot, null);
assert.equal(fallback.tag, '강화 무기');
assert.equal(fallback.match, 'second-class');
assert.equal(combatAnalyzerGemFactors(data, fallbackSnapshot, null).damageFactor, 1.28);

const currentData = JSON.parse(await readFile(new URL('../public/combat-analyzer.json', import.meta.url), 'utf8'));
assert.equal(currentData.version, 1);
assert.ok(currentData.presets.length >= 300);
assert.ok(Object.keys(currentData.fallbackBuilds).length >= 100);
assert.ok(currentData.identitySkills.length >= 50);
assert.ok(currentData.sourceAsset.startsWith('https://lopec.kr/'));

console.log('combat analyzer tests passed');
