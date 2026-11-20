import assert from 'node:assert/strict';
import { parseAccessoryText, parseEquipmentSnapshotItem } from '../api/character.js';
import { combatAnalyzerGemFactors } from '../public/combat-analyzer.js';
import { expectedHitDamage } from '../public/damage-math.js';
import { addEngravingEffects, relicEngravingEffect } from '../public/engraving-math.js';
import { extractCombatSkillEffects, parseSkillEffectText } from '../public/skill-effects.js';
import { supportContributionModel } from '../public/support-power.js';

const pair = [10, 10];
const sum = pair.reduce((total, value) => total + value, 0);
const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} vs ${expected}`);
const hit = stats => expectedHitDamage(stats).value;

// The percentage-point groups aggregate before the independent damage factors.
for (const key of ['evolutionDamage', 'additionalDamage', 'attackPower']) {
  close(hit({ [key]: sum }), 1.20, key);
}
close(hit({ evolutionDamage: 10, additionalDamage: 10 }), 1.21, '진피 × 추피');
const weapon = parseEquipmentSnapshotItem({ Type: '무기', Tooltip: JSON.stringify({
  Element_005: { type: 'ItemPartBox', value: { Element_001: '추가 피해 <FONT COLOR="#99FF99">+10.00%</FONT>' } }
}) });
assert.equal(weapon.qualityAdditionalDamage, 10);
assert.equal(parseEquipmentSnapshotItem({ Type: '무기', Quality: 100 }).qualityAdditionalDamage, null);
close(hit({ additionalDamage: weapon.qualityAdditionalDamage + 10 }), 1.20, '무기 품질 추피와 목걸이 추피');
close(hit({ critRate: 100, critDamage: 200 + sum }), 2.20, '치피 +10%p 두 번');
close(hit({ critRate: 100, critDamage: 200 + sum }) / hit({ critRate: 100 }), 1.10, '기본 치피 기준 상대 피해');

// Separate sources already classified as independent are multiplied by the engine.
// These checks do not classify new in-game sources or establish between-engraving rules.
close(hit({ enemyDamageSources: pair }), 1.21, '독립 적주피 출처');
close(hit({ critRate: 100, critHitDamageSources: pair }), 2 * 1.21, '독립 치명 적중 피해 출처');
close(hit({ critRate: 0, critHitDamageSources: pair }), 1, '적중 피해는 비치명에서 발동하지 않음');
const duplicateEngravingStat = pair.reduce((effects, attackPower) => addEngravingEffects(effects, { attackPower }), {});
close(hit(duplicateEngravingStat), 1.20, '공증으로 분류된 두 수치의 합산 경로');
assert.ok(relicEngravingEffect('아드레날린', 4).attackPower > 0);
assert.ok(relicEngravingEffect('저주받은 인형', 4).enemyDamage > 0);

for (const marker of ['', '로', '가']) {
  const effects = parseSkillEffectText(`치명타${marker} 적중 시 적에게 주는 피해가 10% 증가하며, 적에게 주는 피해가 5% 증가한다.`);
  assert.equal(effects.enemyDamage, 5);
  assert.equal(effects.critHitDamage, 10);
  close(hit({ ...effects, critRate: 50, critDamage: 250 }), 1.875 * 1.05, '회심과 기본 적주피 분리');
}
const bracelet = parseAccessoryText([
  '공격이 치명타로 적중 시 적에게 주는 피해가 10% 증가한다.',
  '백어택 스킬이 적에게 주는 피해가 3% 증가한다.',
  '헤드 어택 스킬이 적에게 주는 피해가 4% 증가한다.',
  '방향성 공격이 아닌 스킬이 적에게 주는 피해가 5% 증가한다.',
  '적에게 주는 피해가 2% 증가하며, 무력화 상태의 적에게 주는 피해가 8% 증가한다.'
].join(' '), '팔찌', '고대');
assert.equal(bracelet.enemyDamage, 2);
assert.equal(bracelet.critHitDamage, 10);
assert.deepEqual(bracelet.directionalEnemyDamage, { back: 3, head: 4, nonDirectional: 5 });
assert.deepEqual(bracelet.optionSlots.map(slot => slot.text), [
  '이중 적주피 +2.00% / 무력화 피해 +8.00%', '백어택 주피 +3.00%', '헤드어택 주피 +4.00%', '비방향성 주피 +5.00%'
]);

// Direct skill damage tripods model independent effects. Other tripod wordings
// have their own destinations and need individual game evidence.
const skill = extractCombatSkillEffects([{
  Name: '검증 기술', Level: 10,
  Tooltip: JSON.stringify({ Element_005: { type: 'SingleTextBox', value: '공격 타입 : 백 어택' } }),
  Tripods: pair.map((percent, i) => ({
    Name: `검증 트라이포드 ${i + 1}`, IsSelected: true, Tooltip: `피해가 ${percent}% 증가한다.`
  }))
}]).items[0];
close(hit(skill.effects), 1.21, '독립 스킬 피해 트라이포드');
assert.equal(JSON.parse(JSON.stringify(skill)).attackDirection, '백', '원본 툴팁을 생략한 캐시에도 공격 방향 보존');

// The official gem guide selects the highest matching effect, including when
// the equivalent 10% gem appears twice or the stronger gem is listed second.
const profile = { tag: '감사', value: { '검증 기술': 100 } };
const gemLevels = { tier4Damage: [8, 10, 12], tier4Cooldown: [8, 10, 12] };
const factors = (levels, kind, skillEffects = {}) => {
  const name = kind === 'damage' ? '겁화의 보석' : '작열의 보석';
  const items = levels.map(level => ({ skillName: '검증 기술', kind, name, level }));
  return combatAnalyzerGemFactors({ gemTables: gemLevels }, { gems: { items } }, skillEffects, { profile });
};
close(factors([2, 2], 'damage').damageFactor, 1.10, '동일 10% 피해 보석');
close(factors([1, 3], 'damage').damageFactor, 1.12, '최대 피해 보석');
close(factors([3, 1], 'damage').damageFactor, 1.12, '보석 슬롯 순서 독립');
const skillEffects = { cycleItems: [{ name: '검증 기술', currentTree: true, cooldownEligible: true, baseCooldownSeconds: 10 }] };
close(factors([3, 3], 'cooldown', skillEffects).averageCooldown, 10, '동일 10% 재감 보석');
const fallbackCooldownGems = [
  { skillName: '검증 기술', kind: 'cooldown', name: '작열의 보석', level: 3 },
  { skillName: '다른 기술', kind: 'cooldown', name: '작열의 보석', level: 2 }
];
const fallbackCooldown = items => combatAnalyzerGemFactors({}, { gems: { items } }, {}, { profile }).averageCooldown;
close(fallbackCooldown([...fallbackCooldownGems, { ...fallbackCooldownGems[0] }]),
  fallbackCooldown(fallbackCooldownGems), '지분·쿨타임이 없는 보석 추정에서도 중복을 제외');

// Two bonuses strengthen the magnitude of one buff. They do not create two
// independently applied copies of that party buff.
const bard = { profile: { className: '바드', secondClass: '절실한 구원', baseAttackPower: 170000,
  stats: [{ type: '공격력', value: 200000 }] } };
const support = supportContributionModel(bard);
assert.equal(support.detail.attackPower, 170000);
assert.equal(support.detail.attackPowerBasis, 'base');
const strengthened = supportContributionModel({ ...bard, effects: {
  accessory: { items: [{ effects: { brandPower: pair[0], allyAttackBuff: pair[0], allyDamageBuff: pair[0] } }] },
  bracelet: { items: [{ effects: { brandPower: pair[1], allyAttackBuff: pair[1], allyDamageBuff: pair[1] } }] }
} });
assert.equal(strengthened.detail.allyAttackA, 20);
assert.equal(strengthened.detail.allyAttackB, 20);
assert.equal(strengthened.detail.allyDamageBonus, 20);
assert.equal(strengthened.detail.brandBonus, 20);
close(strengthened.allTimeBuffPower, (1 + Math.floor(.22 * 170000 * 1.2) / 170000
  * strengthened.detail.overallAttackUptime) * 1.12, '공증 한 번과 강화된 낙인의 곱');
const bardWithGem = supportContributionModel({ ...bard, gems: {
  items: pair.map(level => ({ skillName: '세레나데 스킬', name: '겁화의 보석', level, kind: 'damage' }))
} });
assert.equal(bardWithGem.detail.allyDamageBonus, 10);
assert.equal(bardWithGem.detail.awakeningAllyDamageBonus, 0);
close(bardWithGem.fullBuffPower / support.fullBuffPower, 1.143 / 1.13, '아이덴티티 보석의 효과 범위');

const critical = { critRate: 100, skillCritBonus: pair[0], adrenalineCritRate: pair[1], critDamage: 250 };
close(hit(critical), .8 * 2.5 + .2 * 4, '11/18 공식 치적 120% 예시');
close(hit({ ...critical, critRate: 200 }), .8 * 4 + .2 * 5.5, '치적 220% 단계 증가');
const tagged = expectedHitDamage({ ...critical, critHitDamage: 10 });
close(tagged.value, 2.5 * 1.1 + .2 * 1.5, '회심-다중치명 현행 추정식을 고정');
assert.equal(tagged.critHitStackingUnverified, true);
const blunt = expectedHitDamage({ ...critical, critCap: 80, overCritToEvolutionDamageRate: 1.4, evolutionDamage: 19 + sum });
assert.equal(blunt.effectiveCritRate, 80);
assert.equal(blunt.critical.multiCritChance, 0);
close(blunt.convertedEvolutionDamage, 56, '뭉가 전환 1회');
close(blunt.evo, 95, '기본 19 + 공통 20 + 변환 56');
close(blunt.value, 2.2 * 1.95, '뭉가 기대값');
console.log('damage operation groups, effect scopes, and stacking regressions passed');
