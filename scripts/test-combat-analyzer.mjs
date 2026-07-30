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
assert.ok(Math.abs(factors.damageFactor - (1 + 0.4 / 1.2)) < 1e-12, '아이덴티티를 포함한 전체 양수 딜 지분으로 보석 효율을 정규화해야 한다.');
assert.ok(Math.abs(factors.cooldownFactor - (1 / (1 - 0.9 * 0.22))) < 1e-12);
const damageUpgrade = gemUpgradeEfficiency({ data, snapshot, gem: snapshot.gems.items[0], nextLevel: 10 });
assert.ok(damageUpgrade.gainPercent > 1.49 && damageUpgrade.gainPercent < 1.51);
assert.equal(damageUpgrade.skillShare, 0.6);
const cooldownUpgrade = gemUpgradeEfficiency({ data, snapshot, gem: snapshot.gems.items[2], nextLevel: 10 });
assert.ok(cooldownUpgrade.gainPercent > 2.29 && cooldownUpgrade.gainPercent < 2.31);

const currentTreeEffects = {
  items: [{ name: '비상격', level: 14, currentTree: true, baseCooldownSeconds: 20, cooldown: { flatSeconds: 0, percentReduction: 0 } }]
};
const cycleCooldownUpgrade = gemUpgradeEfficiency({ data, snapshot, skillEffects: currentTreeEffects, gem: snapshot.gems.items[2], nextLevel: 10 });
assert.ok(cycleCooldownUpgrade.gainPercent > 0, '현재 스킬 초단위 모델에서도 작열 레벨 상승 효율이 증가해야 한다.');

const fallbackSnapshot = {
  ...snapshot,
  profile: { className: '데빌헌터', secondClass: '전술 탄환' },
  arkGrid: { slots: [] },
  gems: { items: [{ slot: 0, skillName: '심판의날', kind: 'damage', name: '9레벨 겁화의 보석', level: 9, valid: true }] }
};
const fallback = findCombatAnalyzerProfile(data, fallbackSnapshot, null);
assert.equal(fallback.tag, '강화 무기');
assert.equal(fallback.match, 'second-class');
assert.equal(combatAnalyzerGemFactors(data, fallbackSnapshot, null).damageFactor, 1.4, '직업각인 폴백에도 임의 0.7 감점을 적용하지 않는다.');

const currentData = JSON.parse(await readFile(new URL('../public/combat-analyzer.json', import.meta.url), 'utf8'));
assert.equal(currentData.version, 1);
assert.ok(currentData.presets.length >= 300);
assert.ok(Object.keys(currentData.fallbackBuilds).length >= 100);
assert.ok(currentData.identitySkills.length >= 50);
assert.ok(currentData.sourceAsset.startsWith('https://lopec.kr/'));

console.log('combat analyzer tests passed');
