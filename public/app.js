import { calculateBluntSpike, calculatePracticalRecommendationScore, calculateSonicBreakEvolutionDamage } from './evolution-math.js?v=5.8.5';
import { advancedHoningStageForLevel, optimizeAdvancedHoning, summarizeAdvancedHoningStrategy } from './advanced-honing-math.js?v=5.8.5';
import { gemFusionPurchaseCount, isBoundGem } from './gem-math.js?v=5.8.5';
import { calibrationScopeMatches, confidenceTier, findClassHoningSample } from './combat-power-calibration.js?v=5.8.5';
import { ADRENALINE_ENGRAVING_NAME, RELIC_ENGRAVING_RULES, adjustedEngravingEffects, clampRelicBookLevel, describeEngravingEffect, relicEngravingEffect } from './engraving-math.js?v=5.8.5';

const VERSION = '5.8.5';
const COOLDOWN_NODE_NAMES = ['최적화 훈련', '끝없는 마나', '무한한 마력'];
const MANA_SKILL_NODE_NAMES = ['끝없는 마나', '금단의 주문', '무한한 마력'];
function isCooldownExcluded() { return Boolean(document.getElementById('excludeCooldown')?.checked); }
function isNoManaMainSkillEnabled() { return Boolean(document.getElementById('noManaMainSkill')?.checked); }
function hasCooldownEffect(name) {
  const node = getNode(name);
  if (!node) return COOLDOWN_NODE_NAMES.includes(name);
  return COOLDOWN_NODE_NAMES.includes(name) || Object.values(node.levels || {}).some(effect => Number(effect?.cooldownReduction || 0) > 0);
}
function hasCooldownCandidate(tier2Entries, fourNames, fiveName) {
  return [
    ...(tier2Entries || []).map(x => x.name),
    ...(fourNames || []),
    fiveName
  ].filter(Boolean).some(name => hasCooldownEffect(name));
}

function emptyEngravingState() {
  return { effects: { critRate: 0, critDamage: 0, critHitDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0, attackSpeed: 0, conditionalDamage: 0 }, items: [], rawText: '', adrenaline: { adopted: false, level: 0, critRate: 0, attackPower: 0 } };
}

const $ = (id) => document.getElementById(id);
const EVOLUTION_TIERS = [1, 2, 3, 4, 5];
const state = { evolution: null, index: new Map(), selected: {}, apiSelected: {}, foundEffects: [], profileStats: { crit: 0, swift: 0, spec: 0 }, accessory: { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] }, bracelet: { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] }, abilityStone: { attackPower: 0, effects: { critRate: 0, critDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0, conditionalDamage: 0 }, engravings: [], items: [] }, engraving: emptyEngravingState(), arkGrid: { critRate: 0, critDamage: 0, attackSpeed: 0, moveSpeed: 0, enemyDamage: 0, additionalDamage: 0, items: [] }, enlightenment: { critRate: 0, critDamage: 0, critHitDamage: 0, evolutionDamage: 0, enemyDamage: 0, additionalDamage: 0, attackSpeed: 0, moveSpeed: 0, items: [] }, powerSnapshot: null, powerCostEstimates: [], combatPowerModel: null, specEfficiencyFilter: 'all' };
let simulatorRendered = false;

function engravingItemByName(name) {
  return (state.engraving?.items || []).find(item => item?.name === name) || null;
}

function populateAdrenalineReplacementOptions(syncLevel = false) {
  const select = $('adrenalineReplacementName');
  if (!select) return;
  const originalHasAdrenaline = !!state.engraving?.adrenaline?.adopted;
  const equippedNames = new Set((state.engraving?.items || []).map(item => item?.name).filter(Boolean));
  const supportedEquipped = [...equippedNames].filter(name => name !== ADRENALINE_ENGRAVING_NAME && RELIC_ENGRAVING_RULES[name]);
  const candidates = originalHasAdrenaline
    ? Object.keys(RELIC_ENGRAVING_RULES).filter(name => name !== ADRENALINE_ENGRAVING_NAME && !equippedNames.has(name))
    : supportedEquipped;
  const names = candidates.length ? candidates : Object.keys(RELIC_ENGRAVING_RULES).filter(name => name !== ADRENALINE_ENGRAVING_NAME);
  const previous = select.value;
  select.innerHTML = names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  if (names.includes(previous)) select.value = previous;
  else select.value = names[0] || '';

  if (syncLevel) {
    const item = engravingItemByName(select.value);
    $('adrenalineReplacementBookLevel').value = String(clampRelicBookLevel(item?.bookLevel ?? 0));
  }
}

function getEngravingSimulation() {
  const adrenalineEnabled = !!$('adrenalineEnabled')?.checked;
  const adrenalineBookLevel = clampRelicBookLevel($('adrenalineBookLevel')?.value);
  const replacementName = $('adrenalineReplacementName')?.value || '';
  const replacementBookLevel = clampRelicBookLevel($('adrenalineReplacementBookLevel')?.value);
  const originalReplacement = engravingItemByName(replacementName);
  const adjusted = adjustedEngravingEffects(state.engraving?.effects, {
    originalHasAdrenaline: !!state.engraving?.adrenaline?.adopted,
    adrenalineEnabled,
    replacementName,
    replacementBookLevel,
    originalReplacementEffect: originalReplacement?.effects || null
  });
  return {
    ...adjusted,
    adrenalineEnabled,
    adrenalineBookLevel,
    adrenalineEffect: adrenalineEnabled ? relicEngravingEffect(ADRENALINE_ENGRAVING_NAME, adrenalineBookLevel) : relicEngravingEffect('', 0),
    replacementName,
    replacementBookLevel,
    originalReplacement
  };
}

function updateEngravingControlPreviews() {
  const adrenalineEffect = relicEngravingEffect(ADRENALINE_ENGRAVING_NAME, $('adrenalineBookLevel')?.value);
  if ($('adrenalineEffectPreview')) $('adrenalineEffectPreview').textContent = describeEngravingEffect(adrenalineEffect);
  const replacementName = $('adrenalineReplacementName')?.value || '';
  const replacementEffect = relicEngravingEffect(replacementName, $('adrenalineReplacementBookLevel')?.value);
  if ($('adrenalineReplacementEffectPreview')) {
    const condition = replacementEffect.conditionalDamage ? ' (조건 충족 기준)' : '';
    $('adrenalineReplacementEffectPreview').textContent = `${describeEngravingEffect(replacementEffect)}${condition}`;
  }
}

const T4_GEAR_COST_RULES = {
  standard: {
    label: '결단/업화',
    names: ['결단', '업화'],
    stone: { weapon: '운명의 파괴석', armor: '운명의 수호석' },
    leapstone: '운명의 돌파석',
    fusion: '아비도스 융화제',
    growthLabel: '장비 성장',
    books: {
      weapon: ['야금술 : 업화 [11-14]', '야금술 : 업화 [15-18]', '야금술 : 업화 [19-20]'],
      armor: ['재봉술 : 업화 [11-14]', '재봉술 : 업화 [15-18]', '재봉술 : 업화 [19-20]']
    }
  },
  upperAncient: {
    label: '전율',
    names: ['전율'],
    stone: { weapon: '운명의 파괴석 결정', armor: '운명의 수호석 결정' },
    leapstone: '위대한 운명의 돌파석',
    fusion: '상급 아비도스 융화제',
    growthLabel: '장비 성장',
    limitBreakLabel: '한계돌파',
    limitBreakMaterials: ['고통의 가시'],
    books: { weapon: [], armor: [] }
  }
};
const T4_SHARED_COST_MATERIALS = ['운명의 파편 주머니(대)', '빙하의 숨결', '용암의 숨결'];
const BOUND_ONLY_MATERIALS = new Set(['고통의 가시', '아그리스의 비늘', '낙뢰의 뿔']);
const T4_ADVANCED_HONING_TEMPERING_COSTS = {
  1: { weapon: { name: '아그리스의 비늘', amount: 60 }, armor: { name: '아그리스의 비늘', amount: 24 } },
  2: { weapon: { name: '아그리스의 비늘', amount: 60 }, armor: { name: '아그리스의 비늘', amount: 24 } },
  3: { weapon: { name: '낙뢰의 뿔', amount: 120 }, armor: { name: '낙뢰의 뿔', amount: 48 } },
  4: { weapon: { name: '낙뢰의 뿔', amount: 120 }, armor: { name: '낙뢰의 뿔', amount: 48 } }
};
const T4_ADVANCED_HONING_ATTEMPT_COSTS = {
  armor: [
    { stage: 1, materials: { '운명의 수호석': 150, '운명의 돌파석': 4, '아비도스 융화제': 5, '운명의 파편': 300, '골드': 475, '빙하의 숨결': 4, '장인의 재봉술 : 1단계': 1 } },
    { stage: 2, materials: { '운명의 수호석': 270, '운명의 돌파석': 5, '아비도스 융화제': 5, '운명의 파편': 600, '골드': 900, '빙하의 숨결': 6, '장인의 재봉술 : 2단계': 1 } },
    { stage: 3, materials: { '운명의 수호석': 1000, '운명의 돌파석': 18, '아비도스 융화제': 17, '운명의 파편': 7000, '골드': 2000, '빙하의 숨결': 20, '장인의 재봉술 : 3단계': 1 } },
    { stage: 4, materials: { '운명의 수호석': 1200, '운명의 돌파석': 23, '아비도스 융화제': 19, '운명의 파편': 8000, '골드': 2400, '빙하의 숨결': 24, '장인의 재봉술 : 4단계': 1 } }
  ],
  weapon: [
    { stage: 1, materials: { '운명의 파괴석': 180, '운명의 돌파석': 5, '아비도스 융화제': 8, '운명의 파편': 500, '골드': 563, '용암의 숨결': 4, '장인의 야금술 : 1단계': 1 } },
    { stage: 2, materials: { '운명의 파괴석': 330, '운명의 돌파석': 7, '아비도스 융화제': 9, '운명의 파편': 1000, '골드': 1250, '용암의 숨결': 6, '장인의 야금술 : 2단계': 1 } },
    { stage: 3, materials: { '운명의 파괴석': 1200, '운명의 돌파석': 25, '아비도스 융화제': 28, '운명의 파편': 11500, '골드': 3000, '용암의 숨결': 20, '장인의 야금술 : 3단계': 1 } },
    { stage: 4, materials: { '운명의 파괴석': 1400, '운명의 돌파석': 32, '아비도스 융화제': 30, '운명의 파편': 13000, '골드': 4000, '용암의 숨결': 24, '장인의 야금술 : 4단계': 1 } }
  ]
};
const T4_NORMAL_GEAR_GROWTH_COSTS = {
  ancient: {
    label: '고대 장비',
    armor: [
      { from: 10, to: 11, fragment: 12000, silver: 300000 },
      { from: 11, to: 12, fragment: 13000, silver: 325000 },
      { from: 12, to: 13, fragment: 19000, silver: 475000 },
      { from: 13, to: 14, fragment: 22000, silver: 550000 },
      { from: 14, to: 15, fragment: 25000, silver: 625000 },
      { from: 15, to: 16, fragment: 29000, silver: 725000 },
      { from: 16, to: 17, fragment: 39000, silver: 975000 },
      { from: 17, to: 18, fragment: 45000, silver: 1125000 },
      { from: 18, to: 19, fragment: 51000, silver: 1173000 },
      { from: 19, to: 20, fragment: 63000, silver: 1149000 },
      { from: 20, to: 21, fragment: 72000, silver: 1440000 },
      { from: 21, to: 22, fragment: 81000, silver: 1620000 },
      { from: 22, to: 23, fragment: 91000, silver: 1820000 },
      { from: 23, to: 24, fragment: 102000, silver: 2040000 },
      { from: 24, to: 25, fragment: 114000, silver: 2280000 }
    ],
    weapon: [
      { from: 10, to: 11, fragment: 21000, silver: 525000 },
      { from: 11, to: 12, fragment: 23000, silver: 575000 },
      { from: 12, to: 13, fragment: 33000, silver: 825000 },
      { from: 13, to: 14, fragment: 38000, silver: 950000 },
      { from: 14, to: 15, fragment: 43000, silver: 1075000 },
      { from: 15, to: 16, fragment: 49000, silver: 1225000 },
      { from: 16, to: 17, fragment: 66000, silver: 1655000 },
      { from: 17, to: 18, fragment: 75000, silver: 1875000 },
      { from: 18, to: 19, fragment: 85000, silver: 1953000 },
      { from: 19, to: 20, fragment: 106000, silver: 2438000 },
      { from: 20, to: 21, fragment: 120000, silver: 2400000 },
      { from: 21, to: 22, fragment: 135000, silver: 2700000 },
      { from: 22, to: 23, fragment: 152000, silver: 3040000 },
      { from: 23, to: 24, fragment: 170000, silver: 3400000 },
      { from: 24, to: 25, fragment: 190000, silver: 3800000 }
    ]
  }
};
const T4_NORMAL_HONING_BASE_RATES = {
  10: 10,
  11: 10,
  12: 5,
  13: 5,
  14: 4,
  15: 4,
  16: 3,
  17: 3,
  18: 3,
  19: 1.5,
  20: 1.5,
  21: 1,
  22: 1,
  23: 0.5,
  24: 0.5
};
const T4_NORMAL_HONING_FAIL_BONUS_RATE = 0.1;
const T4_NORMAL_HONING_MAX_RATE_MULTIPLIER = 2;
const T4_NORMAL_HONING_ARTISAN_FACTOR = 0.46511;
const T4_NORMAL_HONING_ARTISAN_LIMIT = 100;
const T4_NORMAL_HONING_BOOK_BONUS_MULTIPLIER = 1;
const T4_NORMAL_HONING_FULL_BREATH_BONUS_MULTIPLIER = 1;
const T4_NORMAL_REFINE_ATTEMPT_COSTS = {
  ancient: {
    label: '에기르 고대 장비',
    armor: [
      { from: 10, to: 11, materials: { '운명의 수호석': 750, '운명의 돌파석': 11, '아비도스 융화제': 7, '운명의 파편': 3000, '골드': 970, '실링': 33000, '빙하의 숨결': 20, '재봉술 : 업화 [11-14]': 1 } },
      { from: 11, to: 12, materials: { '운명의 수호석': 780, '운명의 돌파석': 13, '아비도스 융화제': 7, '운명의 파편': 3180, '골드': 1070, '실링': 33000, '빙하의 숨결': 20, '재봉술 : 업화 [11-14]': 1 } },
      { from: 12, to: 13, materials: { '운명의 수호석': 840, '운명의 돌파석': 14, '아비도스 융화제': 9, '운명의 파편': 4560, '골드': 1190, '실링': 33000, '빙하의 숨결': 20, '재봉술 : 업화 [11-14]': 1 } },
      { from: 13, to: 14, materials: { '운명의 수호석': 930, '운명의 돌파석': 16, '아비도스 융화제': 9, '운명의 파편': 4920, '골드': 1320, '실링': 33000, '빙하의 숨결': 20, '재봉술 : 업화 [11-14]': 1 } },
      { from: 14, to: 15, materials: { '운명의 수호석': 1020, '운명의 돌파석': 18, '아비도스 융화제': 11, '운명의 파편': 5280, '골드': 1460, '실링': 33000, '빙하의 숨결': 20, '재봉술 : 업화 [15-18]': 1 } },
      { from: 15, to: 16, materials: { '운명의 수호석': 1170, '운명의 돌파석': 20, '아비도스 융화제': 11, '운명의 파편': 5640, '골드': 1600, '실링': 33000, '빙하의 숨결': 20, '재봉술 : 업화 [15-18]': 1 } },
      { from: 16, to: 17, materials: { '운명의 수호석': 1320, '운명의 돌파석': 22, '아비도스 융화제': 15, '운명의 파편': 7200, '골드': 1760, '실링': 39000, '빙하의 숨결': 20, '재봉술 : 업화 [15-18]': 1 } },
      { from: 17, to: 18, materials: { '운명의 수호석': 1470, '운명의 돌파석': 23, '아비도스 융화제': 15, '운명의 파편': 7740, '골드': 1930, '실링': 39000, '빙하의 숨결': 20, '재봉술 : 업화 [15-18]': 1 } },
      { from: 18, to: 19, materials: { '운명의 수호석': 1620, '운명의 돌파석': 25, '아비도스 융화제': 15, '운명의 파편': 8220, '골드': 2110, '실링': 39000, '빙하의 숨결': 20, '재봉술 : 업화 [19-20]': 1 } },
      { from: 19, to: 20, materials: { '운명의 수호석': 1770, '운명의 돌파석': 27, '아비도스 융화제': 21, '운명의 파편': 9600, '골드': 2300, '실링': 54000, '빙하의 숨결': 25, '재봉술 : 업화 [19-20]': 1 } },
      { from: 20, to: 21, materials: { '운명의 수호석': 1920, '운명의 돌파석': 29, '아비도스 융화제': 21, '운명의 파편': 10260, '골드': 2500, '실링': 54000, '빙하의 숨결': 25 } },
      { from: 21, to: 22, materials: { '운명의 수호석': 2220, '운명의 돌파석': 31, '아비도스 융화제': 21, '운명의 파편': 10920, '골드': 2710, '실링': 72000, '빙하의 숨결': 25 } },
      { from: 22, to: 23, materials: { '운명의 수호석': 2400, '운명의 돌파석': 34, '아비도스 융화제': 21, '운명의 파편': 11520, '골드': 2920, '실링': 72000, '빙하의 숨결': 25 } },
      { from: 23, to: 24, materials: { '운명의 수호석': 2520, '운명의 돌파석': 36, '아비도스 융화제': 30, '운명의 파편': 12240, '골드': 3150, '실링': 90000, '빙하의 숨결': 50 } },
      { from: 24, to: 25, materials: { '운명의 수호석': 2700, '운명의 돌파석': 40, '아비도스 융화제': 30, '운명의 파편': 12900, '골드': 3390, '실링': 90000, '빙하의 숨결': 50 } }
    ],
    weapon: [
      { from: 10, to: 11, materials: { '운명의 파괴석': 1250, '운명의 돌파석': 18, '아비도스 융화제': 12, '운명의 파편': 5000, '골드': 1620, '실링': 55000, '용암의 숨결': 20, '야금술 : 업화 [11-14]': 1 } },
      { from: 11, to: 12, materials: { '운명의 파괴석': 1300, '운명의 돌파석': 21, '아비도스 융화제': 12, '운명의 파편': 5300, '골드': 1790, '실링': 55000, '용암의 숨결': 20, '야금술 : 업화 [11-14]': 1 } },
      { from: 12, to: 13, materials: { '운명의 파괴석': 1400, '운명의 돌파석': 24, '아비도스 융화제': 15, '운명의 파편': 7600, '골드': 1990, '실링': 55000, '용암의 숨결': 20, '야금술 : 업화 [11-14]': 1 } },
      { from: 13, to: 14, materials: { '운명의 파괴석': 1550, '운명의 돌파석': 27, '아비도스 융화제': 15, '운명의 파편': 8200, '골드': 2200, '실링': 55000, '용암의 숨결': 20, '야금술 : 업화 [11-14]': 1 } },
      { from: 14, to: 15, materials: { '운명의 파괴석': 1700, '운명의 돌파석': 30, '아비도스 융화제': 18, '운명의 파편': 8800, '골드': 2430, '실링': 55000, '용암의 숨결': 20, '야금술 : 업화 [15-18]': 1 } },
      { from: 15, to: 16, materials: { '운명의 파괴석': 1950, '운명의 돌파석': 33, '아비도스 융화제': 18, '운명의 파편': 9400, '골드': 2670, '실링': 55000, '용암의 숨결': 20, '야금술 : 업화 [15-18]': 1 } },
      { from: 16, to: 17, materials: { '운명의 파괴석': 2200, '운명의 돌파석': 36, '아비도스 융화제': 25, '운명의 파편': 12000, '골드': 2940, '실링': 65000, '용암의 숨결': 20, '야금술 : 업화 [15-18]': 1 } },
      { from: 17, to: 18, materials: { '운명의 파괴석': 2450, '운명의 돌파석': 39, '아비도스 융화제': 25, '운명의 파편': 12900, '골드': 3220, '실링': 65000, '용암의 숨결': 20, '야금술 : 업화 [15-18]': 1 } },
      { from: 18, to: 19, materials: { '운명의 파괴석': 2700, '운명의 돌파석': 42, '아비도스 융화제': 25, '운명의 파편': 13700, '골드': 3510, '실링': 65000, '용암의 숨결': 20, '야금술 : 업화 [19-20]': 1 } },
      { from: 19, to: 20, materials: { '운명의 파괴석': 2950, '운명의 돌파석': 45, '아비도스 융화제': 35, '운명의 파편': 16000, '골드': 3830, '실링': 90000, '용암의 숨결': 25, '야금술 : 업화 [19-20]': 1 } },
      { from: 20, to: 21, materials: { '운명의 파괴석': 3200, '운명의 돌파석': 48, '아비도스 융화제': 35, '운명의 파편': 17100, '골드': 4160, '실링': 90000, '용암의 숨결': 25 } },
      { from: 21, to: 22, materials: { '운명의 파괴석': 3700, '운명의 돌파석': 52, '아비도스 융화제': 35, '운명의 파편': 18200, '골드': 4510, '실링': 120000, '용암의 숨결': 25 } },
      { from: 22, to: 23, materials: { '운명의 파괴석': 4000, '운명의 돌파석': 56, '아비도스 융화제': 35, '운명의 파편': 19200, '골드': 4870, '실링': 120000, '용암의 숨결': 25 } },
      { from: 23, to: 24, materials: { '운명의 파괴석': 4200, '운명의 돌파석': 60, '아비도스 융화제': 50, '운명의 파편': 20400, '골드': 5250, '실링': 150000, '용암의 숨결': 50 } },
      { from: 24, to: 25, materials: { '운명의 파괴석': 4500, '운명의 돌파석': 65, '아비도스 융화제': 50, '운명의 파편': 21500, '골드': 5650, '실링': 150000, '용암의 숨결': 50 } }
    ]
  },
  upperAncient: {
    label: '세르카 상위고대 장비',
    armor: [
      { from: 11, to: 12, materials: { '운명의 수호석 결정': 930, '위대한 운명의 돌파석': 11, '상급 아비도스 융화제': 11, '운명의 파편': 9570, '골드': 2450, '실링': 13200, '빙하의 숨결': 20 } },
      { from: 12, to: 13, materials: { '운명의 수호석 결정': 1030, '위대한 운명의 돌파석': 12, '상급 아비도스 융화제': 12, '운명의 파편': 10540, '골드': 2700, '실링': 13200, '빙하의 숨결': 20 } },
      { from: 13, to: 14, materials: { '운명의 수호석 결정': 1120, '위대한 운명의 돌파석': 13, '상급 아비도스 융화제': 13, '운명의 파편': 11520, '골드': 2950, '실링': 13200, '빙하의 숨결': 20 } },
      { from: 14, to: 15, materials: { '운명의 수호석 결정': 1240, '위대한 운명의 돌파석': 14, '상급 아비도스 융화제': 15, '운명의 파편': 12690, '골드': 3250, '실링': 13200, '빙하의 숨결': 20 } },
      { from: 15, to: 16, materials: { '운명의 수호석 결정': 1330, '위대한 운명의 돌파석': 15, '상급 아비도스 융화제': 16, '운명의 파편': 13670, '골드': 3500, '실링': 13200, '빙하의 숨결': 20 } },
      { from: 16, to: 17, materials: { '운명의 수호석 결정': 1450, '위대한 운명의 돌파석': 17, '상급 아비도스 융화제': 17, '운명의 파편': 14840, '골드': 3800, '실링': 15600, '빙하의 숨결': 20 } },
      { from: 17, to: 18, materials: { '운명의 수호석 결정': 1560, '위대한 운명의 돌파석': 18, '상급 아비도스 융화제': 19, '운명의 파편': 16010, '골드': 4100, '실링': 15600, '빙하의 숨결': 20 } },
      { from: 18, to: 19, materials: { '운명의 수호석 결정': 1700, '위대한 운명의 돌파석': 20, '상급 아비도스 융화제': 20, '운명의 파편': 17380, '골드': 4450, '실링': 15600, '빙하의 숨결': 20 } },
      { from: 19, to: 20, materials: { '운명의 수호석 결정': 1810, '위대한 운명의 돌파석': 21, '상급 아비도스 융화제': 22, '운명의 파편': 18550, '골드': 4750, '실링': 21600, '빙하의 숨결': 25 } },
      { from: 20, to: 21, materials: { '운명의 수호석 결정': 1950, '위대한 운명의 돌파석': 23, '상급 아비도스 융화제': 23, '운명의 파편': 19920, '골드': 5100, '실링': 21600, '빙하의 숨결': 25 } },
      { from: 21, to: 22, materials: { '운명의 수호석 결정': 2080, '위대한 운명의 돌파석': 24, '상급 아비도스 융화제': 25, '운명의 파편': 21280, '골드': 5450, '실링': 28800, '빙하의 숨결': 25 } },
      { from: 22, to: 23, materials: { '운명의 수호석 결정': 2200, '위대한 운명의 돌파석': 26, '상급 아비도스 융화제': 26, '운명의 파편': 22460, '골드': 5750, '실링': 28800, '빙하의 숨결': 25 } },
      { from: 23, to: 24, materials: { '운명의 수호석 결정': 2330, '위대한 운명의 돌파석': 27, '상급 아비도스 융화제': 28, '운명의 파편': 23820, '골드': 6100, '실링': 36000, '빙하의 숨결': 50 } },
      { from: 24, to: 25, materials: { '운명의 수호석 결정': 2450, '위대한 운명의 돌파석': 29, '상급 아비도스 융화제': 30, '운명의 파편': 25000, '골드': 6400, '실링': 36000, '빙하의 숨결': 50 } }
    ],
    weapon: [
      { from: 11, to: 12, materials: { '운명의 파괴석 결정': 1700, '위대한 운명의 돌파석': 17, '상급 아비도스 융화제': 18, '운명의 파편': 15890, '골드': 4050, '실링': 22000, '용암의 숨결': 20 } },
      { from: 12, to: 13, materials: { '운명의 파괴석 결정': 1890, '위대한 운명의 돌파석': 19, '상급 아비도스 융화제': 21, '운명의 파편': 17660, '골드': 4500, '실링': 22000, '용암의 숨결': 20 } },
      { from: 13, to: 14, materials: { '운명의 파괴석 결정': 2080, '위대한 운명의 돌파석': 21, '상급 아비도스 융화제': 23, '운명의 파편': 19420, '골드': 4950, '실링': 22000, '용암의 숨결': 20 } },
      { from: 14, to: 15, materials: { '운명의 파괴석 결정': 2270, '위대한 운명의 돌파석': 23, '상급 아비도스 융화제': 25, '운명의 파편': 21190, '골드': 5400, '실링': 22000, '용암의 숨결': 20 } },
      { from: 15, to: 16, materials: { '운명의 파괴석 결정': 2460, '위대한 운명의 돌파석': 25, '상급 아비도스 융화제': 27, '운명의 파편': 22960, '골드': 5850, '실링': 22000, '용암의 숨결': 20 } },
      { from: 16, to: 17, materials: { '운명의 파괴석 결정': 2690, '위대한 운명의 돌파석': 28, '상급 아비도스 융화제': 29, '운명의 파편': 25120, '골드': 6400, '실링': 26000, '용암의 숨결': 20 } },
      { from: 17, to: 18, materials: { '운명의 파괴석 결정': 2900, '위대한 운명의 돌파석': 30, '상급 아비도스 융화제': 32, '운명의 파편': 27080, '골드': 6900, '실링': 26000, '용암의 숨결': 20 } },
      { from: 18, to: 19, materials: { '운명의 파괴석 결정': 3110, '위대한 운명의 돌파석': 32, '상급 아비도스 융화제': 34, '운명의 파편': 29040, '골드': 7400, '실링': 26000, '용암의 숨결': 20 } },
      { from: 19, to: 20, materials: { '운명의 파괴석 결정': 3340, '위대한 운명의 돌파석': 34, '상급 아비도스 융화제': 37, '운명의 파편': 31200, '골드': 7950, '실링': 36000, '용암의 숨결': 25 } },
      { from: 20, to: 21, materials: { '운명의 파괴석 결정': 3570, '위대한 운명의 돌파석': 37, '상급 아비도스 융화제': 39, '운명의 파편': 33360, '골드': 8500, '실링': 36000, '용암의 숨결': 25 } },
      { from: 21, to: 22, materials: { '운명의 파괴석 결정': 3800, '위대한 운명의 돌파석': 39, '상급 아비도스 융화제': 42, '운명의 파편': 35520, '골드': 9050, '실링': 48000, '용암의 숨결': 25 } },
      { from: 22, to: 23, materials: { '운명의 파괴석 결정': 4030, '위대한 운명의 돌파석': 42, '상급 아비도스 융화제': 44, '운명의 파편': 37680, '골드': 9600, '실링': 48000, '용암의 숨결': 25 } },
      { from: 23, to: 24, materials: { '운명의 파괴석 결정': 4260, '위대한 운명의 돌파석': 44, '상급 아비도스 융화제': 47, '운명의 파편': 39840, '골드': 10150, '실링': 60000, '용암의 숨결': 50 } },
      { from: 24, to: 25, materials: { '운명의 파괴석 결정': 4500, '위대한 운명의 돌파석': 47, '상급 아비도스 융화제': 50, '운명의 파편': 42000, '골드': 10700, '실링': 60000, '용암의 숨결': 50 } }
    ]
  }
};
const DEFAULT_PHEON_CRYSTAL_PER_ONE = 8.5;
const PHEON_COST_RULES = [
  { label: '어빌리티 스톤', cost: 9, note: '경매장 구매' },
  { label: '고대 악세', cost: 35, note: '목걸이/귀걸이/반지 부위당' },
  { label: '영웅 아바타', cost: 10, note: '거래횟수 2회 이하' },
  { label: '전설 아바타', cost: 30, note: '거래횟수 2회 이하' },
  { label: '아크그리드 젬 고급', cost: 3, note: '거래소 구매' },
  { label: '아크그리드 젬 희귀', cost: 6, note: '거래소 구매' },
  { label: '아크그리드 젬 영웅', cost: 12, note: '거래소 구매' }
];
let t4MaterialPriceCache = null;
let t4MaterialPriceInflight = null;
let crystalPriceCache = null;
let crystalPriceInflight = null;
const marketResponseCache = new Map();
const marketRequestInflight = new Map();
const MARKET_CLIENT_CACHE_TTL_MS = 60 * 1000;

function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m]); }
function escapeRegExp(v) { return String(v || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function stripHtml(v) { return String(v ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#40;/g, '(').replace(/&#41;/g, ')').replace(/&#37;/g, '%').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim(); }
function collectTextDeep(value, bucket = []) {
  if (value == null) return bucket;
  if (typeof value === 'string') {
    const cleaned = stripHtml(value);
    if (cleaned) bucket.push(cleaned);
    const t = value.trim();
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { collectTextDeep(JSON.parse(t), bucket); } catch {}
    }
    return bucket;
  }
  if (typeof value === 'number' || typeof value === 'boolean') { bucket.push(String(value)); return bucket; }
  if (Array.isArray(value)) { for (const item of value) collectTextDeep(item, bucket); return bucket; }
  if (typeof value === 'object') { for (const v of Object.values(value)) collectTextDeep(v, bucket); return bucket; }
  return bucket;
}
function effectFullText(effect) {
  const parts = collectTextDeep({ name: effect?.name, level: effect?.level, description: effect?.description, tooltip: effect?.tooltip, raw: effect?.raw });
  return [...new Set(parts)].join(' ');
}
function num(v, fallback = 0) { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : fallback; }
function pct(v) { return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; }
function fmt(v) { return Number(v || 0).toFixed(2); }
function round2(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
function formatNumber(v) { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString('ko-KR') : '-'; }
function item(label, value) { return `<div class="cell"><b>${label}</b><span>${escapeHtml(value ?? '-')}</span></div>`; }
function setMessage(text) { const el = $('message'); if (!text) { el.classList.add('hidden'); el.textContent = ''; return; } el.classList.remove('hidden'); el.textContent = text; }
function getStat(profile, type) { return (profile?.Stats || []).find(s => s.Type === type)?.Value ?? '-'; }

function parseProfileStats(profile) {
  const stat = (type) => num((profile?.Stats || []).find(s => s.Type === type)?.Value, 0);
  return { crit: stat('치명'), swift: stat('신속'), spec: stat('특화') };
}
function tier1StatBonus(name, selection = state.selected) {
  const level = Number(selection?.[name]?.level || 0);
  return level * 50;
}
function applyProfileDefaults(profile, selection = state.selected) {
  state.profileStats = parseProfileStats(profile);
  // Open API의 치명/신속 수치는 현재 진화 1티어 선택분이 이미 들어간 값입니다.
  // v3부터는 진화 1티어를 먼저 제외한 뒤, 사용자가 선택한 레벨을 다시 더해 계산합니다.
  const baseCritStat = Math.max(0, state.profileStats.crit - tier1StatBonus('치명', selection));
  const baseSwiftStat = Math.max(0, state.profileStats.swift - tier1StatBonus('신속', selection));
  $('baseCritStat').value = Math.round(baseCritStat);
  $('baseSwiftStat').value = Math.round(baseSwiftStat);
}
function critRateFromStat(critStat) { return Number(critStat || 0) * 0.03579; }
function speedFromSwift(swiftStat) { return Number(swiftStat || 0) / 58.21; }
function buildIndex(db) {
  const map = new Map();
  for (const [tier, names] of Object.entries(db?.tiers || {})) for (const name of names || []) map.set(name, Number(tier));
  for (const node of db?.nodes || []) map.set(node.name, Number(node.tier));
  return map;
}
function getNode(name) { return (state.evolution?.nodes || []).find(n => n.name === name); }
function getLevelEffect(name, level) {
  if (name === '치명') return { critStat: level * 50 };
  if (name === '신속') return { swiftStat: level * 50 };
  if (['특화','제압','인내','숙련'].includes(name)) return { statBonus: level * 50 };
  const node = getNode(name);
  return node?.levels?.[String(level)] || {};
}
function getContextualLevelEffect(name, level) {
  const effect = { ...getLevelEffect(name, level) };
  if (!isNoManaMainSkillEnabled()) return effect;
  if (name === '끝없는 마나' || name === '무한한 마력') {
    delete effect.cooldownReduction;
    effect.manaConditionNote = '주력기 마나 사용 안함: 마나 스킬 쿨감 제외';
  }
  if (name === '금단의 주문') {
    effect.evolutionDamage = Number(level || 0) * 5;
    effect.manaConditionNote = '주력기 마나 사용 안함: 마나 스킬 추가 진피 제외';
  }
  if (name === '마나 용광로') {
    effect.evolutionDamage = 0;
    effect.manaConditionNote = '주력기 마나 사용 안함: 마나 소모 조건 진피 제외';
  }
  return effect;
}
function allOptions(tier) { return [...new Set([...(state.evolution?.tiers?.[String(tier)] || []), ...(state.evolution?.nodes || []).filter(n => Number(n.tier) === Number(tier)).map(n => n.name)])]; }
function defaultSelection() {
  return {
    '치명': { level: 29, source: 'default' },
    '신속': { level: 11, source: 'default' },
    '예리한 감각': { level: 1, source: 'default' },
    '한계 돌파': { level: 1, source: 'default' },
    '최적화 훈련': { level: 1, source: 'default' },
    '일격': { level: 2, source: 'default' },
    '회심': { level: 1, source: 'default' },
    '달인': { level: 1, source: 'default' },
    '뭉툭한 가시': { level: 2, source: 'default' }
  };
}
function readEffects(arkPassive) {
  const effects = Array.isArray(arkPassive?.Effects) ? arkPassive.Effects : [];
  return effects.map((e, index) => ({ index, name: e?.Name || '', level: Number(e?.Level || 0), description: stripHtml(e?.Description || ''), tooltip: stripHtml(e?.Tooltip || ''), raw: e })).filter(e => e.name);
}

function normalizeMatchToken(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}
function addMatchesTo(out, key, text, regexList) {
  // 깨달음 Tooltip은 같은 문장이 raw JSON, Element_*, Description 쪽에 반복되어 들어오는 경우가 있습니다.
  // 그래서 한 효과 안에서 같은 계열 수치는 합산하지 않고 가장 큰 유효값 1개만 사용합니다.
  // 예: 블래스터 깨달음 치피 40%가 중복 파싱되어 80%가 되는 문제 방지.
  let best = 0;
  const seen = new Set();
  for (const re of regexList) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      const value = Number(match[1] || 0);
      if (!Number.isFinite(value)) continue;
      const token = `${key}:${value}:${normalizeMatchToken(match[0])}`;
      if (seen.has(token)) continue;
      seen.add(token);
      best = Math.max(best, value);
    }
  }
  if (best > 0) out[key] += best;
}
function parsePercentEffectText(text) {
  const out = { critRate: 0, critDamage: 0, critHitDamage: 0, evolutionDamage: 0, enemyDamage: 0, additionalDamage: 0 };
  const source = stripHtml(text);
  addMatchesTo(out, 'critRate', source, [
    /치명타\s*적중률(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:만큼)?\s*(?:증가|상승)?/g,
    /치명타\s*확률(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:만큼)?\s*(?:증가|상승)?/g,
    /치명타\s*(?:적중률|확률)[^0-9+]{0,30}\+?(\d+(?:\.\d+)?)%/g
  ]);
  addMatchesTo(out, 'critDamage', source, [
    /치명타\s*피해(?:량)?(?:이|가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:만큼)?\s*(?:증가|상승)?/g
  ]);
  addMatchesTo(out, 'evolutionDamage', source, [
    /진화형?\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:만큼)?\s*(?:증가|상승)?/g,
    /진화\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:만큼)?\s*(?:증가|상승)?/g,
    /진피\s*(?:\+)?(\d+(?:\.\d+)?)%/g
  ]);
  addMatchesTo(out, 'additionalDamage', source, [
    /추가\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:만큼)?\s*(?:증가|상승)?/g
  ]);
  // 회심: "공격이 치명타로 적중 시 적에게 주는 피해"는 치피가 아니라
  // 치명타 발생분에만 적용되는 조건부 적주피다. 일반 적주피에 무조건 합산하지 않는다.
  addMatchesTo(out, 'critHitDamage', source, [
    /공격이\s*치명타로\s*적중\s*시\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가|상승)?/g
  ]);
  addMatchesTo(out, 'enemyDamage', source, [
    /(?<!무력화\s*상태의\s*)(?<!치명타로\s*적중\s*시\s*)적에게\s*주는\s*(?:모든\s*)?피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:만큼)?\s*(?:증가|상승)?/g,
    /백어택\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /헤드어택\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /방향성\s*공격이\s*아닌\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ]);
  for (const key of Object.keys(out)) out[key] = Math.round(out[key] * 100) / 100;
  return out;
}
function hasAnyEffect(effects) {
  return ['critRate','critDamage','critHitDamage','evolutionDamage','enemyDamage','additionalDamage'].some(k => Math.abs(Number(effects?.[k] || 0)) > 0);
}
function isKnownEvolutionEffect(effect) {
  const name = normalizeNodeName(effect?.name || '');
  const joined = normalizeNodeName(`${effect?.name || ''} ${effect?.description || ''} ${effect?.tooltip || ''}`);

  // ArkPassive.Effects가 '진화/깨달음/도약' 같은 카테고리 단위로 내려오는 경우가 있습니다.
  // 특히 깨달음 설명에는 '치명타'라는 단어가 들어가는데, 기존 로직은 1티어 노드 '치명'과
  // 부분 문자열로 매칭되어 깨달음을 진화 노드로 오인했습니다.
  if (name.includes('깨달음')) return false;
  if (name.includes('도약')) return false;
  if (name.includes('진화')) return true;

  return (state.evolution?.nodes || []).some(node => {
    if (name === node.name) return true;
    const nodeName = String(node.name || '');
    // 치명/신속/특화처럼 일반 단어와 겹치는 1티어 스탯명은 부분 매칭하지 않습니다.
    if (['치명','특화','신속','제압','인내','숙련'].includes(nodeName)) return false;
    const escaped = escapeRegExp(nodeName);
    return new RegExp(`(?:\\[진화\\]|진화|^|\\s)${escaped}(?:\\s*Lv\\.?|\\s*레벨|\\s*\\(|\\s|$)`, 'i').test(joined);
  });
}
function levelNearName(text, nodeName, fallback = 1) {
  const source = String(text || '');
  const escaped = escapeRegExp(nodeName);
  const near = source.match(new RegExp(`${escaped}.{0,80}(?:Lv\\.?|레벨)\\s*(\\d+)`, 'i'))
    || source.match(new RegExp(`${escaped}.{0,80}([1-5])\\s*단계`, 'i'));
  if (near) return Number(near[1]);
  return fallback;
}
function enlightenmentSignature(effect, parsed) {
  const values = ['critRate','critDamage','critHitDamage','evolutionDamage','enemyDamage','additionalDamage','attackSpeed','moveSpeed']
    .map(k => `${k}:${Number(parsed?.[k] || 0).toFixed(3)}`).join('|');
  const special = parsed?.windfuryAgility ? `|windfury:${parsed.windfuryAgility.level}` : '';
  return `${normalizeNodeName(effect?.name || '')}|lv:${Number(effect?.level || 0)}|${values}${special}`;
}
function isLeapEffect(effect, joinedText = '') {
  const source = normalizeNodeName(`${effect?.name || ''} ${effect?.description || ''} ${effect?.tooltip || ''} ${joinedText || ''}`);
  const normalized = normalizeNodeName(source).toLowerCase();

  // v4.6.6: 보조 안전장치. 기본 구분은 extractEnlightenmentEffects의 Name 화이트리스트에서 처리합니다.
  // Open API가 도약 효과를 깨달음과 같은 ArkPassive.Effects 묶음으로 내려주는 경우가 있어
  // 깨달음 파싱에서 도약 텍스트가 포함된 항목은 전부 제외합니다.
  return normalized.includes('도약') || normalized.includes('leap');
}
function extractEnlightenmentEffects(effects) {
  const result = { critRate: 0, critDamage: 0, critHitDamage: 0, evolutionDamage: 0, enemyDamage: 0, additionalDamage: 0, attackSpeed: 0, moveSpeed: 0, items: [] };
  const applied = new Set();
  for (const effect of effects || []) {
    const categoryName = normalizeNodeName(effect?.name || '');
    // v4.6.6: Open API의 ArkPassive.Effects는 Name 값으로 깨달음/진화/도약을 구분합니다.
    // 깨달음 계산에는 Name이 정확히 '깨달음'인 항목만 사용합니다.
    // 도약은 Name이 '도약'으로 내려오므로 이 단계에서 자동 제외됩니다.
    if (categoryName !== '깨달음') continue;

    const joined = effectFullText(effect);
    const normalized = normalizeNodeName(`${effect?.name || ''} ${joined}`);
    const parsed = parsePercentEffectText(joined);

    // 기상술사 질풍노도/기민함처럼 문장 안에 고정 수치가 아니라
    // 공속/이속 증가량을 참조하는 깨달음 효과는 별도 계산합니다.
    const baseLevel = Math.max(1, Number(effect?.level || parseLevelFromText(joined, 1) || 1));
    if (normalized.includes('질풍노도')) {
      parsed.attackSpeed = (parsed.attackSpeed || 0) + 12;
      parsed.moveSpeed = (parsed.moveSpeed || 0) + 12;
    }
    if (normalized.includes('기민함')) {
      const lv = Math.min(3, levelNearName(joined, '기민함', baseLevel));
      const critDamageRate = [0, 0.4, 0.8, 1.2][lv] || 0;
      const critRateRate = [0, 0.1, 0.2, 0.3][lv] || 0;
      parsed.windfuryAgility = { level: lv, critDamageRate, critRateRate };
    }
    if (normalized.includes('자연의 흐름')) {
      const lv = Math.min(5, levelNearName(joined, '자연의 흐름', baseLevel));
      parsed.enemyDamage += lv * 1.2;
    }
    if (normalized.includes('바람의 길')) {
      const lv = Math.min(5, levelNearName(joined, '바람의 길', baseLevel));
      parsed.enemyDamage += lv * 1.2; // 최대 2중첩 기준: 0.6/1.2/1.8/2.4/3.0 × 2
    }

    if (!hasAnyEffect(parsed) && !parsed.attackSpeed && !parsed.moveSpeed && !parsed.windfuryAgility) continue;
    const sig = enlightenmentSignature(effect, parsed);
    if (applied.has(sig)) continue;
    applied.add(sig);
    for (const key of ['critRate','critDamage','critHitDamage','evolutionDamage','enemyDamage','additionalDamage','attackSpeed','moveSpeed']) result[key] += Number(parsed[key] || 0);
    result.items.push({ name: effect.name || '깨달음 효과', level: effect.level || 0, effects: parsed });
  }
  for (const key of ['critRate','critDamage','critHitDamage','evolutionDamage','enemyDamage','additionalDamage','attackSpeed','moveSpeed']) result[key] = Math.round(result[key] * 100) / 100;
  return result;
}

function normalizeNodeName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim();
}
function parseLevelFromText(text, fallback = 1) {
  const source = String(text || '');
  const m = source.match(/(?:Lv\.?|레벨)\s*(\d+)/i) || source.match(/(\d+)\s*레벨/);
  const level = Number(m?.[1] || fallback || 1);
  return Number.isFinite(level) && level > 0 ? level : 1;
}
function classifyEvolution(effects) {
  const selected = {};
  const knownNodes = state.evolution?.nodes || [];
  for (const effect of effects || []) {
    const joined = normalizeNodeName(`${effect.name} ${effect.description} ${effect.tooltip}`);

    // 1) API가 노드명을 Name으로 직접 주는 경우
    const direct = getNode(effect.name);
    if (direct) {
      const level = Math.min(effect.level || parseLevelFromText(joined, 1), direct.maxLevel || 1);
      selected[direct.name] = { level, source: 'api' };
      continue;
    }

    // 2) API가 설명/툴팁 문자열 안에 진화 노드명을 넣어주는 경우
    for (const node of knownNodes) {
      if (!joined.includes(node.name)) continue;
      const escaped = node.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const near = joined.match(new RegExp(`${escaped}[^\d]*(?:Lv\\.?|레벨)?\\s*(\\d+)?`, 'i'));
      const level = Math.min(parseLevelFromText(near?.[0] || joined, effect.level || 1), node.maxLevel || 1);
      selected[node.name] = { level, source: 'api' };
    }
  }
  // 검색 캐릭터의 진화 노드가 안 읽히면 이전 캐릭터/기본값을 쓰지 않고 빈 선택으로 둡니다.
  return selected;
}


function renderCharacter(profile, arkPassive = null) {
  const el = $('characterCard');
  const image = profile?.CharacterImage || '';
  el.innerHTML = `
    <div class="characterIdentity">
      ${image ? `<img src="${escapeHtml(image)}" alt="" />` : ''}
      <div><div class="characterNameLine"><h2>${escapeHtml(profile?.CharacterName || '-')} / ${escapeHtml(profile?.CharacterClassName || '-')}</h2>${arkPassive?.Title ? `<span>${escapeHtml(arkPassive.Title)}</span>` : ''}</div><p>서버 ${escapeHtml(profile?.ServerName || '-')} · 아이템 레벨 ${escapeHtml(profile?.ItemAvgLevel || '-')} · 전투력 ${escapeHtml(profile?.CombatPower || '-')}</p></div>
    </div>
    <button id="simulatorJumpButton" class="simulatorJumpButton" type="button">시뮬레이터</button>
  `;
  el.classList.remove('hidden');
  $('simulatorJumpButton')?.addEventListener('click', () => {
    openSimulatorPage();
  });
}
function openSimulatorPage() {
  if (!state.powerSnapshot) return setMessage('캐릭터 검색 후 시뮬레이터를 열 수 있습니다.');
  if (!simulatorRendered) renderPowerSnapshot(state.powerSnapshot);
  document.body.classList.add('simulatorMode');
  document.body.classList.remove('marketMode', 'avatarMode');
  document.querySelectorAll('.tabButton').forEach(btn => btn.classList.remove('active'));
  $('powerSnapshotPanel')?.classList.remove('hidden');
  $('powerSnapshotPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function closeSimulatorPage() {
  document.body.classList.remove('simulatorMode');
  $('powerSnapshotPanel')?.classList.add('hidden');
  document.querySelector('[data-tab="calculator"]')?.classList.add('active');
  $('characterCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function gearQualityClass(value) {
  const quality = Number(value);
  if (!Number.isFinite(quality)) return 'qualityUnknown';
  if (quality >= 100) return 'qualityLegend';
  if (quality > 80) return 'qualityEpic';
  if (quality > 60) return 'qualityRare';
  return 'qualityUncommon';
}
function powerItemIcon(item, options = {}) {
  const icon = item?.icon ? `<img src="${escapeHtml(item.icon)}" alt="">` : `<i>${escapeHtml(item?.type?.slice(0, 1) || '?')}</i>`;
  if (options.hideQuality) return `<div class="powerItemIcon noQuality">${icon}</div>`;
  const quality = item?.quality != null ? Number(item.quality) : null;
  const qualityLabel = quality != null ? `품질 ${quality}` : '품질 -';
  return `<div class="powerItemIcon ${gearQualityClass(quality)}">${icon}<b>${escapeHtml(qualityLabel)}</b></div>`;
}
function powerEffectPills(effects = {}, fallback = '파싱 효과 없음') {
  const rows = powerEffectRows(effects);
  if (!rows.length) return `<span class="powerEffectEmpty">${escapeHtml(fallback)}</span>`;
  return rows.map(row => `<span class="powerEffectPill ${row.gradeClass || ''}">${escapeHtml(row.text)}</span>`).join('');
}
const DEALER_POWER_OPTION_KEYS = new Set(['statTrio', 'critRate', 'critDamage', 'critHitDamage', 'enemyDamage', 'additionalDamage', 'attackPowerPercent', 'weaponPowerPercent', 'attackPowerFlat', 'weaponPowerFlat', 'critStat', 'swiftStat', 'specStat', 'attackPower']);
const SUPPORT_POWER_OPTION_KEYS = new Set(['identityGain', 'brandPower', 'allyAttackBuff', 'allyDamageBuff', 'partyHeal', 'partyShield']);
function powerOptionRole(key) {
  if (DEALER_POWER_OPTION_KEYS.has(key)) return 'dealer';
  if (SUPPORT_POWER_OPTION_KEYS.has(key)) return 'support';
  return 'utility';
}
function powerOptionGradeClass(key, grade) {
  if (powerOptionRole(key) !== 'dealer') return 'optionNeutral';
  return accessoryOptionGradeClass(grade);
}
function powerEffectRows(effects = {}) {
  const rows = [];
  const statTrio = [
    ['strength', '힘'],
    ['dexterity', '민첩'],
    ['intelligence', '지능']
  ].filter(([key]) => Math.abs(Number(effects?.[key] || 0)) > 0);
  if (statTrio.length) {
    const statValues = statTrio.map(([key]) => Number(effects[key]));
    const sameValue = statValues.length === 3 && statValues.every(value => value === statValues[0]);
    rows.push({
      key: 'statTrio',
      role: 'dealer',
      gradeClass: 'optionDealer',
      text: sameValue
        ? `힘/민/지 +${formatNumber(statValues[0])}`
        : statTrio.map(([key, label]) => `${label} +${formatNumber(Number(effects[key]))}`).join(' / ')
    });
  }
  const slotKeys = new Set();
  for (const slot of effects?.optionSlots || []) {
    if (!slot?.text) continue;
    const gradeClass = powerOptionGradeClass(slot.key, slot.grade);
    if (slot.key) slotKeys.add(slot.key);
    rows.push({ key: slot.key || 'braceletSlot', role: powerOptionRole(slot.key), grade: slot.grade || '', gradeClass, text: slot.text });
  }
  const effectDefs = [
    ['critRate', '치적'],
    ['critDamage', '치피'],
    ['critHitDamage', '치명타 피해'],
    ['enemyDamage', '적주피'],
    ['additionalDamage', '추피'],
    ['attackPowerPercent', '공격력%'],
    ['weaponPowerPercent', '무공%'],
    ['attackPowerFlat', '공격력'],
    ['weaponPowerFlat', '무공'],
    ['critStat', '치명'],
    ['swiftStat', '신속'],
    ['specStat', '특화'],
    ['identityGain', '아덴'],
    ['brandPower', '낙인력'],
    ['allyAttackBuff', '아군 공증'],
    ['allyDamageBuff', '아군 피해'],
    ['partyHeal', '파티 회복'],
    ['partyShield', '파티 보호'],
    ['maxHp', '최생'],
    ['maxMana', '최마'],
    ['statusDuration', '상태이상'],
    ['combatHpRegen', '전투 회복'],
    ['attackMoveSpeed', '공이속'],
    ['seedDamage', '시드 피해'],
    ['seedDamageReduction', '시드 피감'],
    ['physicalDefense', '물방'],
    ['magicDefense', '마방'],
    ['resourceRecovery', '자원 회복'],
    ['spaceCooldown', '이동기 쿨'],
    ['attackPower', '공격력']
  ].filter(([key]) => {
    if (slotKeys.has(key)) return false;
    if (key === 'critHitDamage' && (slotKeys.has('critRate') || slotKeys.has('critDamage'))) return false;
    return Math.abs(Number(effects?.[key] || 0)) > 0;
  });
  for (const [key, label] of effectDefs) {
    const value = Number(effects[key]);
    const role = powerOptionRole(key);
    const grade = effects?.optionGrades?.[key] || '';
    const gradeClass = powerOptionGradeClass(key, grade);
    const isFlat = key.endsWith('Flat') || ['critStat', 'swiftStat', 'specStat', 'maxHp', 'maxMana', 'combatHpRegen', 'physicalDefense', 'magicDefense'].includes(key);
    const text = isFlat ? `+${formatNumber(value)}` : pct(value);
    rows.push({ key, role, grade, gradeClass, text: `${label} ${text}` });
  }
  return rows;
}
function accessoryOptionGradeClass(grade) {
  if (grade === '상') return 'optionHigh';
  if (grade === '중') return 'optionMid';
  if (grade === '하') return 'optionLow';
  return '';
}
function renderPowerEquipmentRow(item) {
  const honing = item.honingLevel != null ? `+${item.honingLevel}` : '확인 필요';
  const advanced = item.advancedHoningExcluded ? '' : (item.advancedHoningLevel != null ? `상재 ${item.advancedHoningLevel}` : '상재 미확인');
  const quality = item.quality != null ? `품질 ${item.quality}` : '품질 미확인';
  const qualityClass = gearQualityClass(item.quality);
  return `<div class="powerEquipmentRow">
    ${powerItemIcon(item)}
    <div class="powerEquipmentFields">
      <b>${escapeHtml(item.name || item.type || '-')}</b>
      <div class="powerFieldGrid">
        <span>${escapeHtml(item.itemLevel || '-')}</span>
        <span>${escapeHtml(item.type || '-')}</span>
        <span>${escapeHtml(honing)}</span>
        <span class="powerGearQuality ${qualityClass}">${escapeHtml(quality)}</span>
        ${advanced ? `<span>${escapeHtml(advanced)}</span>` : ''}
      </div>
    </div>
  </div>`;
}
function optionRowsWithPlaceholders(rows, count = 3) {
  const next = rows.slice();
  while (next.length < count) next.push({ key: `empty${next.length}`, text: '옵션 없음', gradeClass: '' });
  return next;
}
function braceletMetaRows(effects = {}) {
  const rows = [];
  const statMap = [
    ['critStat', '치명'],
    ['swiftStat', '신속'],
    ['specStat', '특화'],
    ['strength', '힘'],
    ['dexterity', '민첩'],
    ['intelligence', '지능']
  ];
  for (const [key, label] of statMap) {
    const value = Number(effects?.[key] || 0);
    if (Math.abs(value) > 0) rows.push({ key, text: `${label} ${formatNumber(value)}` });
  }
  return rows;
}
function renderPowerStoneRow(item, engravings = '') {
  if (!item) return '';
  const tierGrade = ['T4', item.grade || '-'].filter(Boolean).join(' - ');
  const engravingText = engravings || '각인 정보 없음';
  return `<div class="powerAccessoryRow extraRow powerStoneRow">
    ${powerItemIcon(item, { hideQuality: true })}
    <div class="powerStoneSummary">
      <span>${escapeHtml(`${tierGrade} - ${engravingText}`)}</span>
    </div>
  </div>`;
}
function renderPowerEngravingPanel(engraving = {}) {
  const items = Array.isArray(engraving?.items) ? engraving.items : [];
  const rows = items
    .filter(item => item?.name)
    .map(item => {
      const grade = item.grade ? `${item.grade}` : '';
      const level = item.bookLevel != null ? `Lv.${item.bookLevel}` : '';
      const meta = [grade, level].filter(Boolean).join(' ');
      const gradeClass = grade === '영웅' ? 'gradeHero' : grade === '전설' ? 'gradeLegend' : grade === '유물' ? 'gradeRelic' : '';
      return `<div class="powerEngravingItem ${gradeClass}">
        <b>${escapeHtml(item.name)}</b>
        ${meta ? `<span>${escapeHtml(meta)}</span>` : ''}
      </div>`;
    })
    .join('');
  if (!rows) return '';
  return `<div class="powerEngravingPanel">
    <div class="powerBuildHeader"><b>장착 각인서</b><span>API 파싱</span></div>
    <div class="powerEngravingList">${rows}</div>
  </div>`;
}
function renderPowerBraceletRow(item, effects) {
  if (!item) return '';
  const allRows = powerEffectRows(effects);
  const metaRows = braceletMetaRows(effects);
  const slottedKeys = new Set((effects?.optionSlots || []).map(slot => slot?.key).filter(Boolean));
  const hiddenBySlot = new Set();
  if (slottedKeys.has('critRate') || slottedKeys.has('critDamage')) hiddenBySlot.add('critHitDamage');
  if (slottedKeys.has('enemyDamage')) hiddenBySlot.add('enemyDamage');
  if (slottedKeys.has('additionalDamage')) hiddenBySlot.add('additionalDamage');
  if (slottedKeys.has('weaponPowerFlat')) hiddenBySlot.add('weaponPowerFlat');
  const optionRows = allRows.filter(row => !['statTrio', 'critStat', 'swiftStat', 'specStat'].includes(row.key) && !hiddenBySlot.has(row.key));
  const displayRows = optionRows.length ? optionRows : [{ text: '파싱 효과 없음', gradeClass: '' }];
  const metaHtml = [
    `<b>${escapeHtml(item.grade || '-')}</b>`,
    ...metaRows.map(row => `<span>${escapeHtml(row.text)}</span>`)
  ].join('');
  const effectHtml = displayRows
    .map(row => {
      const grade = row.gradeClass ? row.gradeClass.replace('option', '') : '';
      const gradeLabel = row.grade || (grade === 'High' ? '상' : grade === 'Mid' ? '중' : grade === 'Low' ? '하' : '-');
      return `<div class="powerAccessoryOption ${row.gradeClass || ''}"><b>${escapeHtml(gradeLabel)}</b><span>${escapeHtml(row.text)}</span></div>`;
    }).join('');
  return `<div class="powerAccessoryRow powerBraceletRow">
    ${powerItemIcon(item, { hideQuality: true })}
    <div class="powerBraceletContent">
      <div class="powerBraceletMeta">${metaHtml}</div>
      <div class="powerAccessoryOptions">${effectHtml}</div>
    </div>
  </div>`;
}
function renderPowerAccessoryRow(item, effects, extra = '', options = {}) {
  if (!item) return '';
  const rows = powerEffectRows(effects);
  const statRow = rows.find(row => row.key === 'statTrio');
  const optionRows = rows.filter(row => row.key !== 'statTrio');
  const tierGrade = ['T4', item.grade || '-'].filter(Boolean).join(' ');
  const itemValue = statRow?.text || item.itemLevel || item.type || '-';
  const displayRows = optionRows.length ? optionRowsWithPlaceholders(optionRows, 3) : optionRowsWithPlaceholders([{ text: '파싱 효과 없음', gradeClass: '' }], 3);
  const effectHtml = displayRows
    .map(row => {
      const grade = row.gradeClass ? row.gradeClass.replace('option', '') : '';
      const gradeLabel = row.grade || (grade === 'High' ? '상' : grade === 'Mid' ? '중' : grade === 'Low' ? '하' : '-');
      return `<div class="powerAccessoryOption ${row.gradeClass || ''}"><b>${escapeHtml(gradeLabel)}</b><span>${escapeHtml(row.text)}</span></div>`;
    }).join('');
  return `<div class="powerAccessoryRow ${options.extraRow ? 'extraRow' : ''}">
    ${powerItemIcon(item, { hideQuality: options.hideQuality })}
    <div class="powerAccessorySummary">
      <span>${escapeHtml(tierGrade)}</span>
      <span>${escapeHtml(itemValue)}</span>
      ${extra ? `<em>${escapeHtml(extra)}</em>` : ''}
    </div>
    <div class="powerAccessoryOptions">${effectHtml}</div>
    <div class="powerAccessoryName">
      <b>${escapeHtml(item.name || item.type || '-')}</b>
    </div>
  </div>`;
}
function sortCombatEquipmentForDisplay(items = []) {
  const order = { '투구': 0, '머리장식': 0, '어깨': 1, '견갑': 1, '상의': 2, '하의': 3, '장갑': 4, '무기': 5 };
  return items.slice().sort((a, b) => {
    const av = order[a?.type] ?? 99;
    const bv = order[b?.type] ?? 99;
    return av - bv;
  });
}
function renderPowerArkGridPanel(arkGrid) {
  const slots = Array.isArray(arkGrid?.slots) ? arkGrid.slots : [];
  const summary = Array.isArray(arkGrid?.gemSummary) ? arkGrid.gemSummary : [];
  if (!slots.length && !summary.length) return '';
  const coreHtml = slots.map(slot => {
    const label = slot?.name || `${slot?.side || ''} ${slot?.symbol || ''}`.trim() || '-';
    const gemTitle = [slot?.gemName, ...(slot?.activeTexts || [])].filter(Boolean).join(' · ');
    const icon = slot?.icon ? `<img src="${escapeHtml(slot.icon)}" alt="">` : `<i>${escapeHtml(slot?.symbol || '?')}</i>`;
    return `<div class="powerArkCore" title="${escapeHtml(gemTitle || label)}">
      <div>${icon}</div>
      <b>${escapeHtml(label)}</b>
      <span>${Number(slot?.point || 0)}P</span>
    </div>`;
  }).join('');
  const summaryHtml = summary.length
    ? summary.map(row => `<div><span>${escapeHtml(row.label)}</span><b>${formatNumber(row.value)}</b></div>`).join('')
    : '<p>아크 그리드 젬 수치를 찾지 못했습니다.</p>';
  return `<div class="powerArkGridPanel">
    <h4>아크그리드</h4>
    <div class="powerArkCoreList">${coreHtml}</div>
    <div class="powerArkGemSummary"><b>아크 그리드 젬</b><div>${summaryHtml}</div></div>
  </div>`;
}
function classifyT4GearCostRule(item) {
  const source = `${item?.name || ''} ${item?.grade || ''}`;
  if (source.includes('전율')) return { key: 'upperAncient', ...T4_GEAR_COST_RULES.upperAncient };
  if (source.includes('결단') || source.includes('업화')) return { key: 'standard', ...T4_GEAR_COST_RULES.standard };
  return { key: 'unknown', label: '미분류', names: [], stone: {}, leapstone: '', fusion: '', books: { weapon: [], armor: [] } };
}
function isWeaponGear(item) {
  return String(item?.type || item?.name || '').includes('무기');
}
function isLimitBreakGrowth(item, rule) {
  return rule?.key === 'upperAncient' && Number(item?.honingLevel || 0) === 20;
}
function currentAdvancedHoningLevel(item) {
  const value = Number(item?.advancedHoningLevel);
  return Number.isFinite(value) && value >= 0 ? Math.min(40, Math.floor(value)) : 0;
}
function advancedHoningTargetLevel(item) {
  const current = currentAdvancedHoningLevel(item);
  if (current >= 40) return 40;
  return Math.min(40, advancedHoningStageForLevel(current) * 10);
}
function isAdvancedHoningCandidate(item) {
  return !item?.advancedHoningExcluded
    && classifyT4GearCostRule(item).key === 'standard'
    && currentAdvancedHoningLevel(item) < 40;
}
function advancedHoningAttemptRowForGear(item) {
  if (!isAdvancedHoningCandidate(item)) return null;
  const slot = isWeaponGear(item) ? 'weapon' : 'armor';
  const level = currentAdvancedHoningLevel(item);
  const stage = advancedHoningStageForLevel(level);
  return (T4_ADVANCED_HONING_ATTEMPT_COSTS[slot] || []).find(row => Number(row.stage) === stage) || null;
}
function advancedHoningTemperingMaterial(item) {
  if (!isAdvancedHoningCandidate(item)) return null;
  const stage = advancedHoningStageForLevel(currentAdvancedHoningLevel(item));
  const slot = isWeaponGear(item) ? 'weapon' : 'armor';
  return T4_ADVANCED_HONING_TEMPERING_COSTS[stage]?.[slot] || null;
}
function costMaterialNamesForGear(item) {
  const rule = classifyT4GearCostRule(item);
  const slot = isWeaponGear(item) ? 'weapon' : 'armor';
  if (isLimitBreakGrowth(item, rule)) return [...(rule.limitBreakMaterials || [])];
  const advancedRow = advancedHoningAttemptRowForGear(item);
  const advancedNames = Object.keys(advancedRow?.materials || {}).filter(name => name !== '골드' && name !== '실링');
  const tempering = advancedHoningTemperingMaterial(item);
  const names = [
    ...T4_SHARED_COST_MATERIALS,
    rule.stone?.[slot],
    rule.leapstone,
    rule.fusion,
    ...(rule.books?.[slot] || []),
    ...advancedNames,
    tempering?.name
  ];
  return [...new Set(names.filter(Boolean))];
}
function buildT4CostPrep(snapshot) {
  const combat = snapshot?.equipment?.combat || [];
  const gear = combat.map(item => {
    const rule = classifyT4GearCostRule(item);
    return {
      item,
      rule,
      slot: isWeaponGear(item) ? 'weapon' : 'armor',
      growthLabel: isLimitBreakGrowth(item, rule) ? rule.limitBreakLabel : (rule.growthLabel || '장비 성장'),
      materials: costMaterialNamesForGear(item)
    };
  });
  const materialNames = [...new Set(gear.flatMap(row => row.materials).filter(name => !BOUND_ONLY_MATERIALS.has(name)))];
  const boundMaterialNames = [...new Set(gear.flatMap(row => row.materials).filter(name => BOUND_ONLY_MATERIALS.has(name)))];
  return { gear, materialNames, boundMaterialNames };
}
function normalRefineCostSetForGear(item) {
  const rule = classifyT4GearCostRule(item);
  if (rule.key === 'standard') return T4_NORMAL_REFINE_ATTEMPT_COSTS.ancient;
  if (rule.key === 'upperAncient') return T4_NORMAL_REFINE_ATTEMPT_COSTS.upperAncient;
  return null;
}
function normalGrowthCostSetForGear(item) {
  const rule = classifyT4GearCostRule(item);
  if (rule.key === 'standard') return T4_NORMAL_GEAR_GROWTH_COSTS.ancient;
  return null;
}
function normalCostRowForGear(item, table) {
  if (!table) return null;
  const rows = isWeaponGear(item) ? table.weapon : table.armor;
  const from = Number(item?.honingLevel || 0);
  return (rows || []).find(row => Number(row.from) === from) || null;
}
function addMaterialAmount(target, name, amount) {
  const qty = Number(amount || 0);
  if (!name || !Number.isFinite(qty) || qty <= 0) return;
  target[name] = Number(target[name] || 0) + qty;
}
function mergedNextNormalRefineMaterials(item) {
  const attemptRow = normalCostRowForGear(item, normalRefineCostSetForGear(item));
  if (!attemptRow) return null;
  const materials = {};
  for (const [name, amount] of Object.entries(attemptRow.materials || {})) addMaterialAmount(materials, name, amount);
  const growthRow = normalCostRowForGear(item, normalGrowthCostSetForGear(item));
  if (growthRow) {
    addMaterialAmount(materials, '운명의 파편', growthRow.fragment);
    addMaterialAmount(materials, '실링', growthRow.silver);
  }
  return { from: attemptRow.from, to: attemptRow.to, materials, hasGrowth: Boolean(growthRow) };
}
function materialCostCheckboxNames(name) {
  if (name === '운명의 파편') return ['운명의 파편 주머니(소)', '운명의 파편 주머니(중)', '운명의 파편 주머니(대)'];
  return [name];
}
function isMaterialCostEnabled(name) {
  const rows = materialCostCheckboxNames(name)
    .map(key => document.querySelector(`.powerCostMaterial[data-material-name="${CSS.escape(key)}"] input`))
    .filter(Boolean);
  if (!rows.length) return true;
  return rows.some(input => input.checked);
}
function marketItemForMaterial(priceMap, name) {
  if (!priceMap) return null;
  if (name === '운명의 파편') {
    const pouchItems = ['운명의 파편 주머니(소)', '운명의 파편 주머니(중)', '운명의 파편 주머니(대)']
      .map(key => priceMap.get(key))
      .filter(item => item && !item.missing && Number(item.shardUnitPrice || 0) > 0);
    pouchItems.sort((a, b) => Number(a.shardUnitPrice || 0) - Number(b.shardUnitPrice || 0));
    return pouchItems[0] || null;
  }
  return priceMap.get(name) || null;
}
function unitGoldForMaterial(priceMap, name) {
  const item = marketItemForMaterial(priceMap, name);
  if (!item || item.missing) return 0;
  if (name === '운명의 파편') return Number(item.shardUnitPrice || 0);
  return Number(item.effectiveUnitPrice || item.unitPrice || item.price || 0);
}
function calculateMaterialGoldCost(materials, priceMap) {
  const rows = [];
  let tradeGold = 0;
  let fixedGold = 0;
  let silver = 0;
  for (const [name, amount] of Object.entries(materials || {})) {
    const qty = Number(amount || 0);
    if (!qty) continue;
    if (name === '골드') {
      fixedGold += qty;
      rows.push({ name, required: qty, unitGold: 1, gold: qty, fixed: true });
      continue;
    }
    if (name === '실링') {
      silver += qty;
      rows.push({ name, required: qty, unitGold: 0, gold: 0, silver: true });
      continue;
    }
    const enabled = isMaterialCostEnabled(name);
    const unitGold = enabled ? unitGoldForMaterial(priceMap, name) : 0;
    const gold = qty * unitGold;
    tradeGold += gold;
    rows.push({ name, required: qty, unitGold, gold, enabled, missingPrice: enabled && !unitGold });
  }
  return { rows, tradeGold, fixedGold, silver, totalGold: tradeGold + fixedGold };
}
function normalHoningBaseRatePercent(next) {
  const from = Number(next?.from || 0);
  const rate = Number(T4_NORMAL_HONING_BASE_RATES[from] || 0);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}
function normalHoningAttemptRatePercent(ratePercent, attempt, supportRatePercent = 0) {
  const base = Number(ratePercent || 0);
  const support = Number(supportRatePercent || 0);
  const turn = Math.max(1, Math.floor(Number(attempt || 1)));
  if (!Number.isFinite(base) || base <= 0) return 0;
  const bonus = base * T4_NORMAL_HONING_FAIL_BONUS_RATE * (turn - 1);
  return Math.min(base * T4_NORMAL_HONING_MAX_RATE_MULTIPLIER, base + bonus) + (Number.isFinite(support) && support > 0 ? support : 0);
}
function normalHoningArtisanGainPercent(attemptRatePercent) {
  const gain = Number(attemptRatePercent || 0) * T4_NORMAL_HONING_ARTISAN_FACTOR;
  return Number.isFinite(gain) && gain > 0 ? gain : 0;
}
function normalHoningPityAttempts(ratePercent, supportRatePercent = 0) {
  if (!Number.isFinite(Number(ratePercent)) || Number(ratePercent) <= 0) return 0;
  let artisan = 0;
  for (let attempt = 1; attempt < 10000; attempt += 1) {
    artisan += normalHoningArtisanGainPercent(normalHoningAttemptRatePercent(ratePercent, attempt, supportRatePercent));
    if (artisan >= T4_NORMAL_HONING_ARTISAN_LIMIT) return attempt + 1;
  }
  return 0;
}
function buildNormalHoningRateSchedule(ratePercent, pityAttempts, supportRatePercent = 0) {
  const cap = Math.floor(Number(pityAttempts || 0));
  if (!cap) return [];
  return Array.from({ length: cap }, (_, index) => round2(normalHoningAttemptRatePercent(ratePercent, index + 1, supportRatePercent)));
}
function expectedAttemptsWithPity(ratePercent, pityAttempts, supportRatePercent = 0) {
  const cap = Math.floor(Number(pityAttempts || 0));
  if (!Number.isFinite(cap) || cap <= 0) return 0;
  let expected = 0;
  let survive = 1;
  for (let attempt = 1; attempt <= cap; attempt += 1) {
    expected += survive;
    if (attempt === cap) break;
    const p = normalHoningAttemptRatePercent(ratePercent, attempt, supportRatePercent) / 100;
    if (!Number.isFinite(p) || p <= 0) return 0;
    survive *= Math.max(0, 1 - p);
  }
  return expected;
}
function normalHoningOptionalNames(materials) {
  const names = Object.keys(materials || {});
  return {
    breathName: names.find(name => name.includes('숨결')) || '',
    bookName: names.find(name => name.includes('재봉술') || name.includes('야금술')) || ''
  };
}
function cloneMaterialsWithoutOptional(materials, optional) {
  const copy = { ...(materials || {}) };
  if (optional?.breathName) delete copy[optional.breathName];
  if (optional?.bookName) delete copy[optional.bookName];
  return copy;
}
function normalHoningSupportRatePercent(ratePercent, strategy) {
  const base = Number(ratePercent || 0);
  if (!Number.isFinite(base) || base <= 0) return 0;
  const maxBreath = Number(strategy?.maxBreath || 0);
  const breathCount = Number(strategy?.breathCount || 0);
  const breathRatio = maxBreath > 0 ? Math.max(0, Math.min(maxBreath, breathCount)) / maxBreath : 0;
  const breathBonus = base * T4_NORMAL_HONING_FULL_BREATH_BONUS_MULTIPLIER * breathRatio;
  const bookBonus = strategy?.useBook ? base * T4_NORMAL_HONING_BOOK_BONUS_MULTIPLIER : 0;
  return breathBonus + bookBonus;
}
function buildNormalHoningStrategyMaterials(baseMaterials, optional, strategy) {
  const materials = { ...(baseMaterials || {}) };
  if (optional?.breathName && Number(strategy?.breathCount || 0) > 0) {
    addMaterialAmount(materials, optional.breathName, Math.floor(Number(strategy.breathCount || 0)));
  }
  if (optional?.bookName && strategy?.useBook) addMaterialAmount(materials, optional.bookName, 1);
  return materials;
}
function describeNormalHoningStrategy(strategy) {
  const parts = [];
  if (Number(strategy?.maxBreath || 0) > 0) parts.push(`숨결 ${formatNumber(strategy.breathCount || 0)}/${formatNumber(strategy.maxBreath || 0)}`);
  if (strategy?.bookName) parts.push(strategy.useBook ? '책 사용' : '책 미사용');
  return parts.length ? parts.join(' · ') : '보조재료 없음';
}
function calculateNormalHoningExpectedCostForStrategy(cost, next, strategy = {}) {
  const ratePercent = normalHoningBaseRatePercent(next);
  const supportRatePercent = normalHoningSupportRatePercent(ratePercent, strategy);
  const pityAttempts = normalHoningPityAttempts(ratePercent, supportRatePercent);
  const expectedAttempts = expectedAttemptsWithPity(ratePercent, pityAttempts, supportRatePercent);
  const rateSchedule = buildNormalHoningRateSchedule(ratePercent, Math.min(pityAttempts, 11), supportRatePercent);
  const totalGold = Number(cost?.totalGold || 0);
  return {
    ratePercent,
    supportRatePercent,
    pityAttempts,
    expectedAttempts,
    maxRatePercent: normalHoningAttemptRatePercent(ratePercent, 11, supportRatePercent),
    rateSchedule,
    expectedGold: totalGold > 0 && expectedAttempts > 0 ? totalGold * expectedAttempts : 0,
    basis: ratePercent > 0 ? 'support-optimized-fail-bonus-with-artisan' : 'missing-base-rate'
  };
}
function calculateNormalHoningExpectedCost(baseMaterials, next, priceMap) {
  const optional = normalHoningOptionalNames(next.materials);
  const maxBreath = Math.floor(Number(optional.breathName ? next.materials?.[optional.breathName] : 0) || 0);
  const bookOptions = optional.bookName ? [false, true] : [false];
  const rows = [];
  const breathOptions = maxBreath > 0 ? [0, maxBreath] : [0];
  for (const breathCount of breathOptions) {
    for (const useBook of bookOptions) {
      const strategy = { breathCount, maxBreath, useBook, bookName: optional.bookName };
      const materials = buildNormalHoningStrategyMaterials(baseMaterials, optional, strategy);
      const cost = calculateMaterialGoldCost(materials, priceMap);
      const expected = calculateNormalHoningExpectedCostForStrategy(cost, next, strategy);
      rows.push({ strategy, materials, cost, expectedCost: expected, label: describeNormalHoningStrategy(strategy) });
    }
  }
  rows.sort((a, b) => {
    const av = Number(a.expectedCost?.expectedGold || 0) || Infinity;
    const bv = Number(b.expectedCost?.expectedGold || 0) || Infinity;
    return av - bv;
  });
  return rows[0] || null;
}
let combatPowerModelPromise = null;
async function loadCombatPowerModel() {
  if (state.combatPowerModel) return state.combatPowerModel;
  if (!combatPowerModelPromise) {
    combatPowerModelPromise = fetch('/combat-power-model.json', { cache: 'no-store' })
      .then(res => res.ok ? res.json() : null)
      .then(model => {
        state.combatPowerModel = model || null;
        return state.combatPowerModel;
      })
      .catch(() => {
        state.combatPowerModel = null;
        return null;
      });
  }
  return combatPowerModelPromise;
}
function isPowerWeaponItem(item) {
  return powerGearSlot(item) === 'weapon';
}
function powerGearSlot(item) {
  const text = `${item?.type || ''} ${item?.name || ''}`;
  if (text.includes('무기') || text.includes('臾닿린')) return 'weapon';
  if (text.includes('투구') || text.includes('머리') || text.includes('?ш뎄')) return 'head';
  if (text.includes('상의') || text.includes('?곸쓽')) return 'top';
  if (text.includes('하의') || text.includes('?섏쓽')) return 'bottom';
  if (text.includes('장갑') || text.includes('?κ컩')) return 'gloves';
  if (text.includes('어깨') || text.includes('견갑') || text.includes('?닿묠')) return 'shoulder';
  return 'armor';
}
function snapshotOfficialCombatPower(snapshot) {
  const value = Number(snapshot?.profile?.combatPower || snapshot?.accuracyTarget?.officialCombatPower || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}
function currentSnapshotCombatGear(snapshot, item) {
  const combat = Array.isArray(snapshot?.equipment?.combat) ? snapshot.equipment.combat : [];
  if (!combat.length || !item) return item || null;
  const sameName = combat.find(row => row?.name && item?.name && row.name === item.name);
  if (sameName) return sameName;
  const sameType = combat.find(row => row?.type && item?.type && row.type === item.type);
  return sameType || item;
}
function normalizePowerModelText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
function externalSpecCalibration(category, key) {
  const table = state.combatPowerModel?.externalSpecUpCalibrations?.[category] || {};
  return table[key] || null;
}
function normalizeSpecCalibrationRow(row) {
  if (typeof row === 'number') return { percent: row, confidence: 'estimated' };
  return row && typeof row === 'object' ? row : null;
}
function calibrationPowerEstimate(category, key, snapshot = state.powerSnapshot) {
  const row = normalizeSpecCalibrationRow(externalSpecCalibration(category, key));
  if (!row) return null;
  const official = snapshotOfficialCombatPower(snapshot);
  let percent = Number(row.percent || 0);
  const itemLevel = Number(snapshot?.profile?.itemAvgLevel || 0);
  const referenceItemLevel = Number(row.referenceItemLevel || 0);
  const slopePerItemLevel = Number(row.slopePerItemLevel || 0);
  if (itemLevel > 0 && referenceItemLevel > 0 && Number.isFinite(slopePerItemLevel)) {
    percent += (itemLevel - referenceItemLevel) * slopePerItemLevel;
  }
  const delta = Number(row.delta || 0);
  const value = official > 0 && percent > 0 ? official * percent / 100 : delta;
  if (!(value > 0)) return null;
  const requestedConfidence = row.confidence || 'estimated';
  const confidence = confidenceTier(requestedConfidence) === 0 && !calibrationScopeMatches(row, snapshot)
    ? 'estimated'
    : requestedConfidence;
  return {
    value: round2(value),
    percent: percent > 0 ? round2(percent) : official > 0 ? round2((value / official) * 100) : 0,
    confidence,
    basis: row.basis || row.source || 'external spec-up calibration',
    source: row.source || ''
  };
}
function normalHoningCalibrationKey(snapshot, item, next = null) {
  const profile = snapshot?.profile || {};
  const arkGridSlots = Array.isArray(snapshot?.arkGrid?.slots) ? snapshot.arkGrid.slots : [];
  const coreKey = arkGridSlots
    .map(slot => [slot?.side, slot?.symbol, slot?.name, slot?.grade, slot?.point].map(normalizePowerModelText).join(':'))
    .join('|');
  return [
    normalizePowerModelText(profile.className),
    normalizePowerModelText(profile.secondClass),
    coreKey,
    powerGearSlot(item),
    Number(next?.from ?? item?.honingLevel ?? 0),
    Number(next?.to ?? Number(item?.honingLevel || 0) + 1)
  ].join('||');
}
function normalHoningFallback(snapshot, item, next = null) {
  const normal = state.combatPowerModel?.upgradeDelta?.normalHoning || {};
  const official = snapshotOfficialCombatPower(snapshot);
  const className = normalizePowerModelText(snapshot?.profile?.className);
  const slot = powerGearSlot(item);
  const fromLevel = Number(next?.from ?? item?.honingLevel ?? 0);
  const toLevel = Number(next?.to ?? fromLevel + 1);
  const slotLevelKey = `${slot}:${fromLevel}:${toLevel}`;
  const scopedSample = findClassHoningSample(normal.scopedSamples, snapshot, slot, fromLevel, toLevel);
  const scopedPercent = Number(scopedSample?.percent);
  if (official > 0 && Number.isFinite(scopedPercent) && scopedPercent > 0) {
    return {
      value: official * scopedPercent / 100,
      percent: scopedPercent,
      confidence: 'class-sampled',
      basis: scopedSample?.basis || 'Lopec same-class slot/range before-after sample'
    };
  }
  const legacyClassRows = Object.entries(normal.percentByClassSpecSlotLevel || {}).map(([key, row]) => {
    const [rowClassName, secondClass, transition = ''] = key.split('||');
    const [rowSlot, from, to] = transition.split(':');
    return { ...(typeof row === 'object' ? row : { percent: row }), className: rowClassName, secondClass, slot: rowSlot, from: Number(from), to: Number(to) };
  });
  const legacyClassSample = findClassHoningSample(legacyClassRows, snapshot, slot, fromLevel, toLevel);
  const legacyClassPercent = Number(legacyClassSample?.percent);
  if (official > 0 && Number.isFinite(legacyClassPercent) && legacyClassPercent > 0) {
    return {
      value: official * legacyClassPercent / 100,
      percent: legacyClassPercent,
      confidence: 'class-sampled',
      basis: legacyClassSample?.basis || 'Lopec same-class slot/range before-after sample'
    };
  }
  const slotLevel = normal.percentBySlotLevel?.[slotLevelKey];
  const slotLevelPercent = Number(slotLevel?.percent ?? slotLevel);
  const slotLevelAllowed = normalizePowerModelText(slotLevel?.className || slotLevel?.scope?.className) === className;
  if (slotLevelAllowed && official > 0 && Number.isFinite(slotLevelPercent) && slotLevelPercent > 0) {
    return {
      value: official * slotLevelPercent / 100,
      percent: slotLevelPercent,
      confidence: 'class-sampled',
      basis: slotLevel?.basis || 'same-class slot and honing-level calibrated percent'
    };
  }
  return null;
}
function findNormalHoningCalibration(snapshot, item, next = null) {
  const model = state.combatPowerModel;
  const normal = model?.upgradeDelta?.normalHoning || {};
  const key = normalHoningCalibrationKey(snapshot, item, next);
  const direct = normal.calibrationsByKey?.[key];
  if (direct && Number(direct.delta || 0) > 0) return { key, ...direct };
  const rows = Array.isArray(normal.calibrations) ? normal.calibrations : [];
  const found = rows.find(row => row?.key === key && Number(row.delta || 0) > 0);
  return found ? { key, ...found } : null;
}
function estimateNormalHoningPowerDelta(item, snapshot, next = null) {
  const calibration = findNormalHoningCalibration(snapshot, item, next);
  if (calibration) {
    const official = snapshotOfficialCombatPower(snapshot);
    const deltaPercent = Number(calibration.deltaPercent);
    if (official > 0 && Number.isFinite(deltaPercent) && deltaPercent > 0) {
      return {
        value: round2(official * deltaPercent / 100),
        percent: round2(deltaPercent),
        confidence: calibration.confidence || 'verified',
        basis: calibration.basis || 'build-specific verified percent'
      };
    }
    return {
      value: round2(Number(calibration.delta)),
      confidence: calibration.confidence || 'verified',
      basis: calibration.basis || 'build-specific verified'
    };
  }
  const fallback = normalHoningFallback(snapshot, item, next);
  if (fallback) {
    return {
      value: round2(fallback.value),
      percent: round2(fallback.percent),
      confidence: fallback.confidence,
      basis: fallback.basis
    };
  }
  return {
    value: 0,
    confidence: 'unverified',
    basis: 'class/build/ark-grid CP delta is not verified yet'
  };
}
function calculateNextNormalRefineEstimates(snapshot, priceMap) {
  const combat = snapshot?.equipment?.combat || [];
  return combat.map(item => {
    const next = mergedNextNormalRefineMaterials(item);
    if (!next) {
      return {
        category: 'normalHoning',
        item,
        available: false,
        reason: '해당 강화 구간 비용표 없음',
        from: Number(item?.honingLevel || 0),
        to: Number(item?.honingLevel || 0) + 1
      };
    }
    const optional = normalHoningOptionalNames(next.materials);
    const baseMaterials = cloneMaterialsWithoutOptional(next.materials, optional);
    const optimized = calculateNormalHoningExpectedCost(baseMaterials, next, priceMap);
    const cost = optimized?.cost || calculateMaterialGoldCost(baseMaterials, priceMap);
    const powerEstimate = estimateNormalHoningPowerDelta(item, snapshot, next);
    const expectedCost = optimized?.expectedCost || calculateNormalHoningExpectedCostForStrategy(cost, next);
    const powerVerified = Number(powerEstimate.value || 0) > 0;
    return { category: 'normalHoning', item, available: powerVerified, reason: powerVerified ? '' : '현재 직업·부위·강화 구간 전투력 미검증', ...next, cost, expectedCost, supportStrategy: optimized?.strategy || null, supportLabel: optimized?.label || '보조재료 없음', powerDelta: powerEstimate.value, powerEstimate };
  });
}
function estimateAdvancedHoningPowerDelta(item, snapshot, levels = 1) {
  const advanced = state.combatPowerModel?.upgradeDelta?.advancedHoning || {};
  const official = snapshotOfficialCombatPower(snapshot);
  const slot = powerGearSlot(item);
  const group = slot === 'weapon' ? 'weapon' : 'armor';
  const percentPerLevel = Number(advanced.percentBySlot?.[slot] ?? advanced[`${group}Percent`] ?? 0);
  const count = Math.max(1, Number(levels || 1));
  if (!(official > 0) || !(percentPerLevel > 0)) {
    return { value: 0, percent: 0, confidence: 'unverified', basis: '상급 재련 전투력 변화량 표본 부족' };
  }
  const percent = (Math.pow(1 + percentPerLevel / 100, count) - 1) * 100;
  return {
    value: round2(official * percent / 100),
    percent: round2(percent),
    confidence: advanced.confidence || 'estimated',
    basis: advanced.basis || '상급 재련 1레벨당 현재 공식 전투력 비율 추정'
  };
}
function advancedHoningOptionalCosts(materials, priceMap) {
  const optional = normalHoningOptionalNames(materials);
  const breathAmount = Number(optional.breathName ? materials?.[optional.breathName] : 0) || 0;
  const bookAmount = Number(optional.bookName ? materials?.[optional.bookName] : 0) || 0;
  const breathCost = optional.breathName ? calculateMaterialGoldCost({ [optional.breathName]: breathAmount }, priceMap) : { totalGold: 0, rows: [] };
  const bookCost = optional.bookName ? calculateMaterialGoldCost({ [optional.bookName]: bookAmount }, priceMap) : { totalGold: 0, rows: [] };
  return {
    optional,
    breathAmount,
    bookAmount,
    breathGold: Number(breathCost.totalGold || 0),
    bookGold: Number(bookCost.totalGold || 0),
    allowBreath: Boolean(optional.breathName) && !(breathCost.rows || []).some(row => row.missingPrice),
    allowBook: Boolean(optional.bookName) && !(bookCost.rows || []).some(row => row.missingPrice)
  };
}
function calculateNextAdvancedHoningEstimates(snapshot, priceMap) {
  const combat = snapshot?.equipment?.combat || [];
  return combat.filter(isAdvancedHoningCandidate).map(item => {
    const current = currentAdvancedHoningLevel(item);
    const stage = advancedHoningStageForLevel(current);
    const attemptRow = advancedHoningAttemptRowForGear(item);
    if (!attemptRow) return null;
    const optionalCosts = advancedHoningOptionalCosts(attemptRow.materials, priceMap);
    const baseMaterials = cloneMaterialsWithoutOptional(attemptRow.materials, optionalCosts.optional);
    const baseCost = calculateMaterialGoldCost(baseMaterials, priceMap);
    const target = advancedHoningTargetLevel(item);
    const remainingLevels = Math.max(1, target - current);
    const optimized = optimizeAdvancedHoning({
      stage,
      levels: remainingLevels,
      baseGold: baseCost.totalGold,
      breathGold: optionalCosts.breathGold,
      bookGold: optionalCosts.bookGold,
      allowBreath: optionalCosts.allowBreath,
      allowBook: optionalCosts.allowBook,
      startExperience: 0,
      startOrbs: 0
    });
    const expectedGold = Number(optimized.expectedTotalGold || 0);
    const powerEstimate = estimateAdvancedHoningPowerDelta(item, snapshot, remainingLevels);
    const tempering = current % 10 === 0 ? advancedHoningTemperingMaterial(item) : null;
    const supportLabel = summarizeAdvancedHoningStrategy(optimized.usage);
    return {
      category: 'advancedHoning',
      item,
      available: expectedGold > 0 && powerEstimate.value > 0,
      from: current,
      to: target,
      cost: baseCost,
      expectedCost: {
        expectedGold,
        expectedAttempts: Number(optimized.expectedTotalAttempts || 0),
        expectedTotalGold: Number(optimized.expectedTotalGold || 0),
        expectedTotalAttempts: Number(optimized.expectedTotalAttempts || 0),
        expectedGoldPerLevel: Number(optimized.expectedGoldPerLevel || 0),
        expectedAttemptsPerLevel: Number(optimized.expectedAttemptsPerLevel || 0),
        remainingLevels,
        stage,
        ancestorOrbGain: optimized.ancestorOrbGain,
        basis: '2026-06-24 선조 구슬 2개 및 선택재료 상태별 최저 기대 비용'
      },
      supportLabel,
      powerDelta: powerEstimate.value,
      powerEstimate,
      tempering,
      stepLabel: `상재 ${current} → ${target}`,
      stepDetail: `상급 재련 ${stage}단계 · 남은 ${remainingLevels}레벨 전체`,
      reason: '2026년 6월 완화 · 경험치/구슬 0 기준'
    };
  }).filter(Boolean);
}
const SPEC_ACCESSORY_CANDIDATES = [
  { part: 'necklace', label: '목걸이', combo: 'highHigh', comboLabel: '상상', gradePair: ['상', '상'], gradeKeys: ['enemyDamage', 'additionalDamage'], effects: { enemyDamage: 2.0, additionalDamage: 2.6 } },
  { part: 'necklace', label: '목걸이', combo: 'highMid', comboLabel: '상중', gradePair: ['상', '중'], gradeKeys: ['enemyDamage', 'additionalDamage'], effects: { enemyDamage: 2.0, additionalDamage: 1.6 } },
  { part: 'necklace', label: '목걸이', combo: 'reverseHighMid', comboLabel: '중상', gradePair: ['중', '상'], gradeKeys: ['enemyDamage', 'additionalDamage'], effects: { enemyDamage: 1.2, additionalDamage: 2.6 } },
  { part: 'earring', label: '귀걸이', combo: 'highHigh', comboLabel: '상상', gradePair: ['상', '상'], gradeKeys: ['attackPowerPercent', 'weaponPowerPercent'], effects: { attackPowerPercent: 1.55, weaponPowerPercent: 3.0 } },
  { part: 'earring', label: '귀걸이', combo: 'highMid', comboLabel: '상중', gradePair: ['상', '중'], gradeKeys: ['attackPowerPercent', 'weaponPowerPercent'], effects: { attackPowerPercent: 1.55, weaponPowerPercent: 1.8 } },
  { part: 'earring', label: '귀걸이', combo: 'reverseHighMid', comboLabel: '중상', gradePair: ['중', '상'], gradeKeys: ['attackPowerPercent', 'weaponPowerPercent'], effects: { attackPowerPercent: 0.95, weaponPowerPercent: 3.0 } },
  { part: 'ring', label: '반지', combo: 'highHigh', comboLabel: '상상', gradePair: ['상', '상'], gradeKeys: ['critDamage', 'critRate'], effects: { critDamage: 4.0, critRate: 1.55 } },
  { part: 'ring', label: '반지', combo: 'highMid', comboLabel: '상중', gradePair: ['상', '중'], gradeKeys: ['critDamage', 'critRate'], effects: { critDamage: 4.0, critRate: 0.95 } },
  { part: 'ring', label: '반지', combo: 'reverseHighMid', comboLabel: '중상', gradePair: ['중', '상'], gradeKeys: ['critDamage', 'critRate'], effects: { critDamage: 2.4, critRate: 1.55 } }
];
const ACCESSORY_GRADE_SCORE = { 하: 1, 중: 2, 상: 3 };
function accessoryUpgradeCandidates(equipped) {
  const rows = [];
  for (const candidate of SPEC_ACCESSORY_CANDIDATES) {
    const matching = (equipped || []).filter(item => item?.type === candidate.label);
    matching.forEach((equippedItem, itemIndex) => {
      const grades = equippedItem?.effects?.optionGrades || {};
      const currentPair = candidate.gradeKeys.map(key => grades[key] || '');
      if (currentPair.some(grade => !ACCESSORY_GRADE_SCORE[grade])) return;
      const noDowngrade = candidate.gradePair.every((grade, index) => ACCESSORY_GRADE_SCORE[grade] >= ACCESSORY_GRADE_SCORE[currentPair[index]]);
      const hasUpgrade = candidate.gradePair.some((grade, index) => ACCESSORY_GRADE_SCORE[grade] > ACCESSORY_GRADE_SCORE[currentPair[index]]);
      if (!noDowngrade || !hasUpgrade) return;
      rows.push({
        ...candidate,
        equippedItem,
        itemIndex,
        instanceLabel: matching.length > 1 ? `${candidate.label} ${itemIndex + 1}` : candidate.label,
        currentPair,
        currentPairLabel: currentPair.join('')
      });
    });
  }
  return rows;
}
function accessoryTransitionPercent(effectKey, fromGrade, toGrade, snapshot = state.powerSnapshot) {
  if (fromGrade === toGrade) return 0;
  const row = normalizeSpecCalibrationRow(externalSpecCalibration('accessoryEffect', `${effectKey}:${fromGrade}:${toGrade}`));
  if (!row) return 0;
  let percent = Number(row.percent || 0);
  const itemLevel = Number(snapshot?.profile?.itemAvgLevel || 0);
  const referenceItemLevel = Number(row.referenceItemLevel || 0);
  const slopePerItemLevel = Number(row.slopePerItemLevel || 0);
  if (itemLevel > 0 && referenceItemLevel > 0 && Number.isFinite(slopePerItemLevel)) {
    percent += (itemLevel - referenceItemLevel) * slopePerItemLevel;
  }
  return Math.max(0, percent);
}
function accessoryEffectDelta(candidate) {
  const current = candidate?.equippedItem?.effects || {};
  const target = candidate?.effects || {};
  const delta = {};
  for (const key of candidate?.gradeKeys || []) delta[key] = Math.max(0, Number(target[key] || 0) - Number(current[key] || 0));
  return delta;
}
function legacyAccessoryPowerEstimate(candidate, snapshot) {
  const value = round2(accessoryPowerDeltaFromEffects(accessoryEffectDelta(candidate)));
  const official = snapshotOfficialCombatPower(snapshot);
  return {
    value,
    percent: official > 0 && value > 0 ? round2((value / official) * 100) : 0,
    confidence: 'estimated',
    basis: 'accessory effect-difference coefficient fallback'
  };
}
function accessoryPowerEstimate(candidate, snapshot = state.powerSnapshot) {
  const official = snapshotOfficialCombatPower(snapshot);
  let factor = 1;
  for (let index = 0; index < candidate.gradeKeys.length; index += 1) {
    const percent = accessoryTransitionPercent(candidate.gradeKeys[index], candidate.currentPair[index], candidate.gradePair[index], snapshot);
    if (candidate.currentPair[index] !== candidate.gradePair[index] && !(percent > 0)) return legacyAccessoryPowerEstimate(candidate, snapshot);
    factor *= 1 + percent / 100;
  }
  const percent = (factor - 1) * 100;
  if (!(official > 0 && percent > 0)) return legacyAccessoryPowerEstimate(candidate, snapshot);
  return {
    value: round2(official * percent / 100),
    percent: round2(percent),
    confidence: 'class-estimated',
    basis: 'Lopec accessory option transition calibration; five dealer-class samples, build-specific estimate'
  };
}
function combatPowerFeaturePerUnit(key) {
  const value = Number(state.combatPowerModel?.features?.[key]?.perUnit || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}
function accessoryPowerDeltaFromEffects(effects = {}) {
  const keyMap = {
    additionalDamage: 'accessoryAdditionalDamage',
    enemyDamage: 'accessoryEnemyDamage',
    attackPowerPercent: 'accessoryAttackPowerPercent',
    weaponPowerPercent: 'accessoryWeaponPowerPercent',
    critDamage: 'braceletCritDamage',
    critRate: 'braceletCritRate'
  };
  return Object.entries(effects).reduce((sum, [key, value]) => sum + Number(value || 0) * combatPowerFeaturePerUnit(keyMap[key]), 0);
}
function engravingPowerEstimateFromEffects(effects = {}, snapshot = state.powerSnapshot, book = null) {
  const bookName = normalizePowerModelText(book?.name);
  const from = Number(book?.bookLevel || 0);
  const to = Number(book?.nextBookLevel || 0);
  const calibration = bookName && Number.isFinite(from) && to > from ? calibrationPowerEstimate('engraving', `${bookName}:${from}:${to}`, snapshot) : null;
  if (calibration) return calibration;
  const official = snapshotOfficialCombatPower(snapshot);
  const modelDelta =
    Number(effects.attackPower || 0) * combatPowerFeaturePerUnit('engravingAttackPower') +
    Number(effects.enemyDamage || 0) * combatPowerFeaturePerUnit('engravingEnemyDamage') +
    Number(effects.additionalDamage || 0) * combatPowerFeaturePerUnit('engravingAdditionalDamage') +
    Number(effects.critRate || 0) * combatPowerFeaturePerUnit('engravingCritRate') +
    Number(effects.critDamage || 0) * combatPowerFeaturePerUnit('engravingCritDamage');
  if (modelDelta > 0) return { value: round2(modelDelta), percent: official > 0 ? round2((modelDelta / official) * 100) : 0, confidence: 'estimated', basis: 'engraving combat-power coefficient model' };
  const estimatedPercent =
    Number(effects.enemyDamage || 0) +
    Number(effects.additionalDamage || 0) +
    Number(effects.conditionalDamage || 0) +
    Number(effects.attackPower || 0) +
    Number(effects.critRate || 0) * 0.35 +
    Number(effects.critDamage || 0) * 0.25;
  const percent = Math.max(0, estimatedPercent);
  return { value: official > 0 ? round2((official * percent) / 100) : 0, percent: round2(percent), confidence: 'estimated', basis: 'engraving effect delta heuristic' };
}
function specMarketCost(price, pheonCost = 0) {
  const crystalGoldPer100 = Number($('crystalGoldPer100Input')?.value || 0);
  const pheonCrystalPerOne = Number($('pheonCrystalPerOneInput')?.value || DEFAULT_PHEON_CRYSTAL_PER_ONE);
  const pheonGold = crystalGoldPer100 > 0 && pheonCrystalPerOne > 0 ? (crystalGoldPer100 / 100) * pheonCrystalPerOne * Number(pheonCost || 0) : 0;
  return { totalGold: Number(price || 0) + pheonGold, tradeGold: Number(price || 0), fixedGold: pheonGold, silver: 0 };
}
async function calculateAccessorySpecEstimates() {
  const equipped = state.powerSnapshot?.effects?.accessory?.items || state.accessory?.items || [];
  const candidates = accessoryUpgradeCandidates(equipped);
  const rows = await Promise.all(candidates.map(async candidate => {
    try {
      const data = await fetchMarketJson(`/api/market-prices?mode=accessory&part=${encodeURIComponent(candidate.part)}&combo=${encodeURIComponent(candidate.combo)}&_=${Date.now()}`);
      const item = data.lowest || data.items?.[0] || null;
      const price = Number(item?.price || 0);
      const powerEstimate = accessoryPowerEstimate(candidate, state.powerSnapshot);
      const powerDelta = round2(powerEstimate.value);
      return {
        category: 'accessory',
        item: { type: candidate.instanceLabel, name: candidate.equippedItem?.name || `${candidate.label} ${candidate.comboLabel}`, icon: item?.icon || '', quality: item?.quality },
        available: price > 0 && powerDelta > 0,
        from: '',
        to: candidate.comboLabel,
        cost: specMarketCost(price, item?.pheonCost || 0),
        expectedCost: { expectedGold: specMarketCost(price, item?.pheonCost || 0).totalGold },
        powerDelta,
        powerEstimate,
        supportLabel: `${candidate.label} ${candidate.comboLabel} 최저가`,
        stepLabel: candidate.instanceLabel,
        stepDetail: `${candidate.currentPairLabel} → ${candidate.comboLabel}`,
        reason: price > 0 ? '악세 최저가 기준' : '악세 시세 없음'
      };
    } catch (error) {
      return { category: 'accessory', item: { type: candidate.label, name: `${candidate.label} ${candidate.comboLabel}` }, available: false, reason: error.message || '악세 시세 조회 실패', powerDelta: 0, cost: {}, expectedCost: {} };
    }
  }));
  return rows;
}
function gemKindLabel(gem) {
  const text = `${gem?.kind || ''} ${gem?.name || ''}`;
  if (text.includes('cooldown') || text.includes('작열')) return '작열';
  return '겁화';
}
function isSupportPowerSnapshot(snapshot) {
  const className = normalizePowerModelText(snapshot?.profile?.className);
  if (['바드', '도화가', '홀리나이트'].includes(className)) return true;
  const items = Array.isArray(snapshot?.effects?.accessory?.items) ? snapshot.effects.accessory.items : [];
  const supportTotal = items.reduce((sum, item) => sum + ['brandPower', 'allyAttackBuff', 'allyDamageBuff'].reduce((part, key) => part + Number(item?.effects?.[key] || 0), 0), 0);
  return className === '발키리' && supportTotal > 0;
}
function gemPowerEstimate(snapshot, currentLevel, nextLevel, count) {
  const role = isSupportPowerSnapshot(snapshot) ? 'support' : 'dealer';
  const row = normalizeSpecCalibrationRow(externalSpecCalibration('gem', `${role}:${currentLevel}:${nextLevel}`));
  if (!row) return null;
  const official = snapshotOfficialCombatPower(snapshot);
  const averageLevel = Number(snapshot?.gems?.summary?.averageLevel || 0);
  const totalGems = Math.max(1, Number(snapshot?.gems?.summary?.total || snapshot?.gems?.items?.length || 11));
  const referenceAverage = Number(row.referenceAverage || averageLevel);
  const slopePerAverageLevel = Number(row.slopePerAverageLevel || 0);
  let factor = 1;
  for (let index = 0; index < count; index += 1) {
    const stepAverage = averageLevel + index / totalGems;
    const stepPercent = Math.max(0, Number(row.percent || 0) + (stepAverage - referenceAverage) * slopePerAverageLevel);
    factor *= 1 + stepPercent / 100;
  }
  const percent = (factor - 1) * 100;
  const requestedConfidence = row.confidence || 'estimated';
  const confidence = confidenceTier(requestedConfidence) === 0 && !calibrationScopeMatches(row, snapshot)
    ? 'estimated'
    : requestedConfidence;
  return {
    value: round2(official * percent / 100),
    percent: round2(percent),
    confidence,
    basis: row.basis || `Lopec ${role} gem level transition calibration`
  };
}
async function calculateGemSpecEstimates(snapshot) {
  const gems = Array.isArray(snapshot?.gems?.items) ? snapshot.gems.items : [];
  const candidates = gems.filter(gem => Number(gem.level || 0) > 0 && Number(gem.level || 0) < 10);
  if (!candidates.length) return [];
  let data = null;
  try { data = await fetchMarketJson(`/api/market-prices?mode=gemList&_=${Date.now()}`); } catch (error) {
    return [{ category: 'gem', item: { type: '보석', name: '보석 시세' }, available: false, reason: error.message || '보석 시세 조회 실패', powerDelta: 0, cost: {}, expectedCost: {} }];
  }
  return candidates.map(gem => {
    const kind = gemKindLabel(gem);
    const currentLevel = Number(gem.level || 0);
    const nextLevel = currentLevel + 1;
    const row = (data.rows || []).find(item => Number(item.level || 0) === currentLevel);
    const market = kind === '작열' ? row?.cooldown : row?.damage;
    const bound = isBoundGem(gem);
    const buyCount = gemFusionPurchaseCount(gem);
    const price = Number(market?.price || 0) * buyCount;
    const calibration = gemPowerEstimate(snapshot, currentLevel, nextLevel, 1);
    const perGemDelta = combatPowerFeaturePerUnit('gemAverage') / Math.max(1, gems.length || 11);
    const powerDelta = calibration?.value || round2(perGemDelta);
    const powerEstimate = calibration
      ? calibration
      : { confidence: 'estimated', basis: 'gem average combat-power coefficient model' };
    const skillName = String(gem.skillName || '').trim();
    const slotLabel = skillName || `보석 슬롯 ${Number(gem.slot || 0) + 1}`;
    return {
      category: 'gem',
      item: { type: '보석', name: `${slotLabel} ${kind} ${currentLevel}→${nextLevel}레벨`, icon: gem.icon || market?.icon || '' },
      available: price > 0 && powerDelta > 0,
      from: currentLevel,
      to: nextLevel,
      cost: specMarketCost(price, 0),
      expectedCost: { expectedGold: price },
      powerDelta,
      powerEstimate,
      supportLabel: `${kind} ${currentLevel}레벨 최저가 × ${buyCount}개${bound ? ' · 장착 보석 귀속' : ''}`,
      stepLabel: `${slotLabel} ${kind}`,
      stepDetail: `Lv.${currentLevel} → Lv.${nextLevel}`,
      reason: price > 0
        ? bound
          ? '장착 보석 귀속 · 같은 레벨 3개 구매 후 합성 기준'
          : '보유 1개 + 구매 2개 합성 기준'
        : '보석 시세 없음'
    };
  });
}
async function calculateEngravingSpecEstimates(snapshot) {
  const books = Array.isArray(snapshot?.effects?.engraving?.items) ? snapshot.effects.engraving.items : [];
  const candidates = books.filter(item => item?.grade === '유물' && Number(item.bookLevel || 0) < 4 && item?.deltaEffects && Object.keys(item.deltaEffects).length);
  if (!candidates.length) return [];
  const rows = await Promise.all(candidates.map(async book => {
    try {
      const data = await fetchMarketJson(`/api/market-prices?mode=engraving&name=${encodeURIComponent(book.name)}&_=${Date.now()}`);
      const item = data.lowest || data.items?.[0] || null;
      const unitPrice = Number(item?.price || 0);
      const buyCount = 5;
      const price = unitPrice * buyCount;
      const powerEstimate = engravingPowerEstimateFromEffects(book.deltaEffects, snapshot, book);
      const powerDelta = round2(powerEstimate.value);
      return {
        category: 'engraving',
        item: { type: '각인서', name: `${book.name} 유물 Lv.${book.bookLevel}→${book.nextBookLevel}`, icon: item?.icon || '' },
        available: price > 0 && powerDelta > 0,
        from: book.bookLevel,
        to: book.nextBookLevel,
        cost: specMarketCost(price, 0),
        expectedCost: { expectedGold: price },
        powerDelta,
        powerEstimate,
        supportLabel: `${book.name} 유물 각인서 최저가 × ${buyCount}장`,
        stepLabel: `${book.name} 각인서`,
        stepDetail: `Lv.${book.bookLevel} → Lv.${book.nextBookLevel}`,
        reason: price > 0 ? '각인서 최저가 기준' : '각인서 시세 없음'
      };
    } catch (error) {
      return { category: 'engraving', item: { type: '각인서', name: `${book.name} 유물 각인서` }, available: false, reason: error.message || '각인서 시세 조회 실패', powerDelta: 0, cost: {}, expectedCost: {} };
    }
  }));
  return rows;
}
async function calculateMarketSpecEstimates(snapshot) {
  const [accessories, gems, engravings] = await Promise.all([
    calculateAccessorySpecEstimates(),
    calculateGemSpecEstimates(snapshot),
    calculateEngravingSpecEstimates(snapshot)
  ]);
  return [...accessories, ...gems, ...engravings];
}
async function storePowerCostEstimates(priceMap) {
  const honingRows = calculateNextNormalRefineEstimates(state.powerSnapshot, priceMap);
  const advancedHoningRows = calculateNextAdvancedHoningEstimates(state.powerSnapshot, priceMap);
  const gearRows = [...honingRows, ...advancedHoningRows];
  state.powerCostEstimates = gearRows;
  renderSpecEfficiencyTable();
  try {
    const marketRows = await calculateMarketSpecEstimates(state.powerSnapshot);
    state.powerCostEstimates = [...gearRows, ...marketRows];
  } catch {
    state.powerCostEstimates = gearRows;
  }
  renderSpecEfficiencyTable();
  return state.powerCostEstimates;
}
function renderSpecEfficiencyShell() {
  return `<div class="powerSnapshotBlock powerEfficiencyPanel">
    <div class="powerCostHead">
      <div><h3>스펙업 효율 순위</h3><p>전투력 상승률과 기대 골드를 한 줄에서 비교합니다.</p></div>
      <strong>낮을수록 효율적</strong>
    </div>
    <div id="combatPowerCoverage" class="combatPowerCoverage"></div>
    <div class="specEfficiencyToolbar" role="group" aria-label="스펙업 종류">
      <button type="button" data-spec-filter="all" class="specEfficiencyFilter active">전체</button>
      <button type="button" data-spec-filter="normalHoning" class="specEfficiencyFilter">일반 재련</button>
      <button type="button" data-spec-filter="advancedHoning" class="specEfficiencyFilter">상급 재련</button>
      <button type="button" data-spec-filter="accessory" class="specEfficiencyFilter">악세</button>
      <button type="button" data-spec-filter="gem" class="specEfficiencyFilter">보석</button>
      <button type="button" data-spec-filter="engraving" class="specEfficiencyFilter">각인</button>
    </div>
    <div id="specEfficiencyTable" class="specEfficiencyTable">
      <p class="powerCostHint">재료 시세를 불러오는 중입니다.</p>
    </div>
  </div>`;
}
function specEfficiencyScore(row) {
  const expectedGold = Number(row?.expectedCost?.expectedGold || 0);
  const percent = specEfficiencyPercent(row);
  if (!row?.available || expectedGold <= 0 || percent <= 0) return Infinity;
  return expectedGold / percent;
}
function specEfficiencyPercent(row) {
  const direct = Number(row?.powerEstimate?.percent || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const official = snapshotOfficialCombatPower(state.powerSnapshot);
  const delta = Number(row?.powerDelta || 0);
  return official > 0 && delta > 0 ? (delta / official) * 100 : 0;
}
function formatSpecGold(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return '-';
  if (n >= 10000) {
    const valueText = (n / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
    return `${valueText}만`;
  }
  return `${Math.round(n).toLocaleString('ko-KR')}G`;
}
function specEfficiencyReason(row) {
  if (row?.category === 'accessory' || row?.category === 'gem' || row?.category === 'engraving') {
    const reason = row.reason || '시세 기준';
    const confidence = row.powerEstimate?.confidence;
    if (confidence === 'verified') return `${reason} · 검증 전투력`;
    if (confidence === 'class-sampled') return `${reason} · 동일 직업 표본`;
    if (confidence === 'class-estimated') return `${reason} · 직업별 추정 전투력`;
    return `${reason} · 추정 전투력`;
  }
  if (row?.category === 'advancedHoning') {
    if (!row?.available) return row.reason || '상급 재련 비용 또는 전투력 변화량 미확인';
    const missing = (row.cost?.rows || []).filter(item => item.missingPrice).map(item => item.name);
    if (missing.length) return `시세 없음: ${missing.slice(0, 2).join(', ')}${missing.length > 2 ? ' 외' : ''}`;
    return `${row.reason || '2026년 6월 완화'} · 추정 전투력`;
  }
  if (row?.available && !Number(row.expectedCost?.ratePercent || 0)) return '강화 확률 미확인';
  if (!row?.available) return row.reason || '비용표 없음';
  const missing = (row.cost?.rows || []).filter(item => item.missingPrice).map(item => item.name);
  if (missing.length) return `시세 없음: ${missing.slice(0, 2).join(', ')}${missing.length > 2 ? ' 외' : ''}`;
  const confidence = row.powerEstimate?.confidence;
  if (confidence === 'verified' || confidence === 'reference-verified') return row.hasGrowth ? '검증 전투력 · 장비 성장 포함' : '검증 전투력';
  if (confidence === 'class-sampled') return row.hasGrowth ? '동일 직업 표본 · 장비 성장 포함' : '동일 직업 표본';
  if (confidence === 'class-estimated') return row.hasGrowth ? '직업별 추정 · 장비 성장 포함' : '직업별 추정';
  if (confidence === 'estimated') return row.hasGrowth ? '추정 전투력 · 장비 성장 포함' : '추정 전투력';
  if (row.hasGrowth) return '전투력 미검증 · 장비 성장 포함';
  return '전투력 미검증';
}
function combatPowerAccuracyHint() {
  const validation = state.combatPowerModel?.validation || {};
  const classSamples = Number(validation.honing?.scopedTransitionSamples || validation.honing?.classSpecSamples || 0);
  return `로펙 전후값 ${classSamples}개 표본과 공식 API 현재 전투력을 대조합니다. 같은 직업·부위·강화 구간의 표본을 공통 적용하며, 세부 직업과 아크그리드는 매칭 조건에서 제외합니다.`;
}
function specPowerDeltaText(row, powerDelta) {
  if (!(powerDelta > 0)) return '전투력 -';
  const confidence = row?.powerEstimate?.confidence;
  if (confidence === 'verified' || confidence === 'reference-verified') return `전투력 +${powerDelta.toFixed(2)}`;
  if (confidence === 'class-sampled') return `표본 +${powerDelta.toFixed(2)}`;
  return `전투력 약 +${powerDelta.toFixed(2)}`;
}
function specEfficiencyFilterMatches(row, filter) {
  if (!filter || filter === 'all') return true;
  return row?.category === filter;
}
function specConfidenceMeta(row) {
  const confidence = row?.powerEstimate?.confidence || 'unverified';
  if (confidence === 'verified' || confidence === 'reference-verified') return { className: 'verified', label: '검증' };
  if (confidence === 'class-sampled') return { className: 'sampled', label: '직업 표본' };
  if (confidence === 'estimated' || confidence === 'class-estimated') return { className: 'estimated', label: '추정' };
  return { className: 'unverified', label: '미검증' };
}
function bindSpecEfficiencyFilters() {
  document.querySelectorAll('[data-spec-filter]').forEach(button => {
    const filter = button.dataset.specFilter || 'all';
    button.classList.toggle('active', filter === state.specEfficiencyFilter);
    button.onclick = () => {
      state.specEfficiencyFilter = filter;
      renderSpecEfficiencyTable();
    };
  });
}
function updateCombatPowerCoverage(estimates) {
  const el = $('combatPowerCoverage');
  if (!el) return;
  const profile = state.powerSnapshot?.profile || {};
  const confidenceValues = estimates.map(row => row?.powerEstimate?.confidence || 'unverified');
  const verified = confidenceValues.filter(value => confidenceTier(value) === 0).length;
  const sampled = confidenceValues.filter(value => value === 'class-sampled').length;
  const status = verified > 0 ? 'verified' : sampled > 0 ? 'sampled' : 'estimated';
  const label = verified > 0 ? '현재 빌드 검증값 있음' : sampled > 0 ? '동일 직업 표본 있음' : '현재 구간은 미검증';
  el.className = `combatPowerCoverage ${status}`;
  el.innerHTML = `<div><span>${escapeHtml(profile.className || '-')} · ${escapeHtml(profile.secondClass || '세팅 미확인')}</span><b>${escapeHtml(label)}</b></div><p>검증 ${verified} · 직업 표본 ${sampled} · 추정/미검증 ${Math.max(0, estimates.length - verified - sampled)}</p>`;
}
function renderSpecEfficiencyTable() {
  const el = $('specEfficiencyTable');
  if (!el) return;
  const allEstimates = Array.isArray(state.powerCostEstimates) ? state.powerCostEstimates.slice() : [];
  updateCombatPowerCoverage(allEstimates);
  bindSpecEfficiencyFilters();
  const estimates = allEstimates.filter(row => specEfficiencyFilterMatches(row, state.specEfficiencyFilter));
  if (!estimates.length) {
    el.innerHTML = `<p class="powerCostHint">${allEstimates.length ? '선택한 종류의 스펙업 후보가 없습니다.' : '재료 시세를 불러오는 중입니다.'}</p>`;
    return;
  }
  const sortedEstimates = estimates.sort((a, b) => {
    const aScore = specEfficiencyScore(a);
    const bScore = specEfficiencyScore(b);
    if (aScore !== bScore) return aScore - bScore;
    return confidenceTier(a?.powerEstimate?.confidence) - confidenceTier(b?.powerEstimate?.confidence);
  });
  const finiteScores = sortedEstimates.map(specEfficiencyScore).filter(Number.isFinite);
  const bestScore = finiteScores.length ? Math.min(...finiteScores) : 0;
  let rankedIndex = 0;
  const rows = sortedEstimates
    .map(row => {
      const item = row.item || {};
      const cost = row.cost || {};
      const totalGold = row.available ? Number(cost.totalGold || 0) : 0;
      const tradeGold = Number(cost.tradeGold || 0);
      const fixedGold = Number(cost.fixedGold || 0);
      const silver = Number(cost.silver || 0);
      const expected = row.expectedCost || {};
      const expectedGold = Number(expected.expectedGold || 0);
      const ratePercent = Number(expected.ratePercent || 0);
      const pityAttempts = Number(expected.pityAttempts || 0);
      const expectedAttempts = Number(expected.expectedAttempts || 0);
      const supportLabel = row.supportLabel || '보조재료 없음';
      const powerDelta = Number(row.powerDelta || 0);
      const efficiencyPercent = specEfficiencyPercent(row);
      const efficiencyText = row.available && efficiencyPercent > 0 ? `${efficiencyPercent.toFixed(3)}%` : '-';
      const scoreText = row.available && expectedGold > 0 && efficiencyPercent > 0 ? formatSpecGold(expectedGold / efficiencyPercent) : '-';
      const marketCostText = ['accessory', 'gem', 'engraving'].includes(row.category);
      const advancedHoningCostText = row.category === 'advancedHoning';
      const expectedGoldText = expectedGold > 0 ? formatSpecGold(expectedGold) : '-';
      const temperingText = row.tempering ? ` · 담금질 ${row.tempering.name} ${formatNumber(row.tempering.amount)}개` : '';
      const expectedDetailText = expectedGold > 0 && advancedHoningCostText
        ? `최저가: ${supportLabel} · 총 기대 ${expectedAttempts.toFixed(2)}회${temperingText}`
        : expectedGold > 0 && marketCostText
        ? `최저가: ${supportLabel} · 거래 ${formatGold(tradeGold)}${fixedGold > 0 ? ` · 페온 ${formatGold(fixedGold)}` : ''}`
        : expectedGold > 0
        ? `최저가: ${supportLabel} · 평균 ${formatGold(expectedGold)} · 장기백 ${formatGold((expected.pityAttempts || 0) * totalGold)}`
        : `1회 ${formatGold(totalGold)} · 거래 ${formatGold(tradeGold)} · 고정 ${formatGold(fixedGold)} · 실링 ${formatNumber(silver)}`;
      const powerText = specPowerDeltaText(row, powerDelta);
      const stepMainText = row.stepLabel || `+${Number(row.from || item.honingLevel || 0)} → +${Number(row.to || 0)}`;
      const upgradeDetailText = row.stepDetail || stepMainText;
      const powerDeltaText = powerText;
      const score = specEfficiencyScore(row);
      const rankText = Number.isFinite(score) ? String(++rankedIndex) : '-';
      const meterWidth = bestScore > 0 && Number.isFinite(score) ? Math.max(8, Math.min(100, (bestScore / score) * 100)) : 0;
      const confidenceMeta = specConfidenceMeta(row);
      return `<div class="specEfficiencyRow ${row.available ? '' : 'disabled'} confidence-${confidenceMeta.className}" data-category="${escapeHtml(row.category || '')}">
        <div class="specEfficiencyTarget">
          <span class="specEfficiencyRank">${rankText}</span>
          ${powerItemIcon(item, { hideQuality: true })}
          <div>
            <div class="specEfficiencyTargetTitle"><b>${escapeHtml(item.type || '-')}</b><em class="confidencePill ${confidenceMeta.className}">${confidenceMeta.label}</em></div>
            <span>${escapeHtml(item.name || '-')} · ${escapeHtml(stepMainText)}</span>
            <div class="efficiencyMeter"><i style="width:${meterWidth.toFixed(1)}%"></i></div>
          </div>
        </div>
        <div class="specEfficiencyStep"><b>${escapeHtml(efficiencyText)}</b><span>${escapeHtml(powerDeltaText)}</span></div>
        <div class="specEfficiencyExpected">
          <b>${escapeHtml(expectedGoldText)}</b>
          <span>기대 비용</span>
        </div>
        <div class="specEfficiencyCost">
          <b>${escapeHtml(scoreText)}</b>
          <span>1% 상승당</span>
        </div>
        <div class="specEfficiencyDetail">${escapeHtml(upgradeDetailText)} · ${escapeHtml(expectedDetailText)} · ${escapeHtml(specEfficiencyReason(row))}</div>
      </div>`;
    }).join('');
  el.innerHTML = `<div class="specEfficiencyHeader">
    <span>스펙업 목표</span><span>효율</span><span>비용</span><span>비용/효율</span>
  </div>${rows}
  <p class="powerCostHint">1% 상승당 기대 골드가 낮은 순서로 정렬하고, 효율이 같으면 검증 범위가 높은 후보를 먼저 표시합니다. 상급 재련은 현재 단계에서 다음 10단위 완료 지점까지의 총 기대비용을 사용합니다. ${escapeHtml(combatPowerAccuracyHint())}</p>`;
}
function renderAdvancedHoningAttemptCostTable() {
  const renderRows = (rows = []) => rows.map(row => {
    const materialHtml = Object.entries(row.materials || {}).map(([name, amount]) => `
      <span class="advancedCostItem">
        <b>${escapeHtml(name)}</b>
        <em>${formatNumber(amount)}</em>
      </span>
    `).join('');
    return `<div class="advancedCostStage">
      <strong>${row.stage}단계</strong>
      <div>${materialHtml}</div>
    </div>`;
  }).join('');
  return `<div class="advancedHoningCostTable">
    <div class="powerBuildHeader"><b>상급 재련 1회 재료</b><span>2026-06-24 완화 기준 · 1~4단계</span></div>
    <div class="advancedHoningColumns">
      <section>
        <h4>방어구</h4>
        ${renderRows(T4_ADVANCED_HONING_ATTEMPT_COSTS.armor)}
      </section>
      <section>
        <h4>무기</h4>
        ${renderRows(T4_ADVANCED_HONING_ATTEMPT_COSTS.weapon)}
      </section>
    </div>
    <p class="powerCostHint">운명의 파편은 가장 싼 주머니 단가로 환산하며, 선조의 가호와 3단계 이상 강화 선조의 가호까지 상태별 최저 기대 비용으로 계산합니다.</p>
  </div>`;
}
function renderNormalGearGrowthCostTable() {
  const data = T4_NORMAL_GEAR_GROWTH_COSTS.ancient;
  const renderRows = (rows = []) => rows.map(row => `
    <tr>
      <td>${row.from}→${row.to}</td>
      <td>${formatNumber(row.fragment)}</td>
      <td>${formatNumber(row.silver)}</td>
    </tr>
  `).join('');
  const renderTable = (title, rows) => `<section>
    <h4>${escapeHtml(title)}</h4>
    <div class="normalGrowthScroll">
      <table class="normalGrowthTable">
        <thead><tr><th>구간</th><th>운명의 파편</th><th>실링</th></tr></thead>
        <tbody>${renderRows(rows)}</tbody>
      </table>
    </div>
  </section>`;
  return `<div class="advancedHoningCostTable normalGrowthCostTable">
    <div class="powerBuildHeader"><b>일반 재련 장비 성장</b><span>${escapeHtml(data.label)} · 성장 재료</span></div>
    <div class="advancedHoningColumns">
      ${renderTable('방어구', data.armor)}
      ${renderTable('무기', data.weapon)}
    </div>
    <p class="powerCostHint">장비 성장은 골드 없이 운명의 파편과 실링만 사용합니다. 이후 1회 재련 재료표와 합쳐서 총 강화 비용으로 계산할 예정입니다.</p>
  </div>`;
}
function renderNormalRefineAttemptCostTable() {
  const ruleSets = [
    {
      data: T4_NORMAL_REFINE_ATTEMPT_COSTS.ancient,
      armorColumns: ['운명의 수호석', '운명의 돌파석', '아비도스 융화제', '운명의 파편', '골드', '실링', '빙하의 숨결'],
      weaponColumns: ['운명의 파괴석', '운명의 돌파석', '아비도스 융화제', '운명의 파편', '골드', '실링', '용암의 숨결']
    },
    {
      data: T4_NORMAL_REFINE_ATTEMPT_COSTS.upperAncient,
      armorColumns: ['운명의 수호석 결정', '위대한 운명의 돌파석', '상급 아비도스 융화제', '운명의 파편', '골드', '실링', '빙하의 숨결'],
      weaponColumns: ['운명의 파괴석 결정', '위대한 운명의 돌파석', '상급 아비도스 융화제', '운명의 파편', '골드', '실링', '용암의 숨결']
    }
  ];
  const renderRows = (rows = [], columns = []) => rows.map(row => {
    const book = Object.keys(row.materials || {}).find(name => name.includes('재봉술') || name.includes('야금술'));
    return `<tr>
      <td>${row.from}→${row.to}</td>
      ${columns.map(name => `<td>${formatNumber(row.materials?.[name] || 0)}</td>`).join('')}
      <td>${book ? escapeHtml(book.replace(' : 업화 ', ' ')) : '-'}</td>
    </tr>`;
  }).join('');
  const renderTable = (title, rows, columns) => `<section>
    <h4>${escapeHtml(title)}</h4>
    <div class="normalGrowthScroll normalRefineScroll">
      <table class="normalGrowthTable normalRefineTable">
        <thead><tr><th>구간</th>${columns.map(name => `<th>${escapeHtml(name.replace('운명의 ', '').replace('아비도스 ', ''))}</th>`).join('')}<th>책</th></tr></thead>
        <tbody>${renderRows(rows, columns)}</tbody>
      </table>
    </div>
  </section>`;
  const renderRuleSet = ({ data, armorColumns, weaponColumns }) => `<div class="normalRefineRuleSet">
    <div class="powerBuildHeader"><b>${escapeHtml(data.label)}</b><span>성장 재료 미포함</span></div>
    <div class="advancedHoningColumns">
      ${renderTable('방어구', data.armor, armorColumns)}
      ${data.weapon?.length ? renderTable('무기', data.weapon, weaponColumns) : '<section><h4>무기</h4><p class="powerCostHint">데이터 입력 대기</p></section>'}
    </div>
  </div>`;
  return `<div class="advancedHoningCostTable normalRefineCostTable">
    <div class="powerBuildHeader"><b>일반 재련 1회 재료</b><span>성장 재료 미포함</span></div>
    ${ruleSets.map(renderRuleSet).join('')}
    <p class="powerCostHint">세르카 무기 표는 데이터가 들어오는 대로 같은 구조에 추가합니다.</p>
  </div>`;
}
function renderPowerCostPrep(snapshot) {
  const prep = buildT4CostPrep(snapshot);
  const gearRows = prep.gear.map(row => {
    const item = row.item || {};
    const honing = item.honingLevel != null ? `+${item.honingLevel}` : '+?';
    const advancedLevel = currentAdvancedHoningLevel(item);
    const advancedTarget = advancedHoningTargetLevel(item);
    const advancedText = item.advancedHoningExcluded
      ? ' · 상재 40 계승 완료'
      : isAdvancedHoningCandidate(item) ? ` · 상재 ${advancedLevel}→${advancedTarget}` : '';
    const materialText = row.materials.length ? row.materials.join(' · ') : '수량표 입력 대기';
    return `<div class="powerCostGearRow">
      <b>${escapeHtml(item.type || '-')}</b>
      <span>${escapeHtml(row.rule.label)} · ${escapeHtml(honing)} · ${escapeHtml(row.growthLabel)}${escapeHtml(advancedText)}</span>
      <small>${escapeHtml(materialText)}</small>
    </div>`;
  }).join('');
  const materialRows = prep.materialNames.map(name => `<label class="powerCostMaterial" data-material-name="${escapeHtml(name)}">
    <input type="checkbox" checked />
    <span><b>${escapeHtml(name)}</b><small>단가 확인 중 · 체크 해제 시 귀속재료로 간주해 0골드</small></span>
  </label>`).join('');
  const boundRows = prep.boundMaterialNames.map(name => `<div class="powerCostMaterial boundOnly">
    <input type="checkbox" checked disabled />
    <span><b>${escapeHtml(name)}</b><small>${name === '고통의 가시' ? '그림자 레이드 세르카' : '상급 재련 담금질'} 귀속 재료 · 골드 비용 0</small></span>
  </div>`).join('');
  return `<div class="powerSnapshotBlock powerCostPrep">
    <div class="powerCostHead">
      <div><h3>T4 비용 계산</h3><p>일반 재련과 상급 재련의 거래 재료·귀속 재료·고정 골드를 나눠 기대 비용을 계산합니다.</p></div>
      <strong>시세 계산 연결</strong>
    </div>
    <div class="powerPheonPanel">
      <div class="powerBuildHeader"><b>페온/크리스탈 기준</b><span>LOSPI 최신 1시간 close</span></div>
      <div class="powerPheonGrid">
        <label><span>100 크리스탈당 골드</span><input id="crystalGoldPer100Input" type="number" min="0" step="1" value="" placeholder="불러오는 중" /></label>
        <label><span>페온 1개당 크리스탈</span><input id="pheonCrystalPerOneInput" type="number" min="0" step="0.1" value="${DEFAULT_PHEON_CRYSTAL_PER_ONE}" /></label>
        <div class="powerPheonResult"><span>페온 1개 환산</span><b id="pheonGoldPerOneText">-</b></div>
      </div>
      <div class="powerPheonRules">${PHEON_COST_RULES.map(rule => `<span><b>${escapeHtml(rule.label)}</b>${Number(rule.cost).toLocaleString('ko-KR')}페온<small>${escapeHtml(rule.note)}</small></span>`).join('')}</div>
      <p id="crystalPriceSourceText" class="powerCostHint">보석 제외 경매장 구매 비용 계산용입니다. 아바타는 거래 가능 횟수 3이면 페온 제외로 처리할 예정입니다.</p>
    </div>
    <div class="powerCostGrid">
      <div>
        <h4>현재 장비 규칙</h4>
        <div class="powerCostGearList">${gearRows || '<p>전투 장비를 찾지 못했습니다.</p>'}</div>
      </div>
      <div>
        <h4>재료 비용 적용</h4>
        <div id="powerCostMaterialList" class="powerCostMaterialList">${[materialRows, boundRows].filter(Boolean).join('') || '<p>적용할 재료가 없습니다.</p>'}</div>
        <p class="powerCostHint">원자료 표는 화면에 표시하지 않고, 현재 장비의 다음 재련 비용 계산에만 사용합니다. 체크 해제한 재료는 귀속으로 간주해 골드 비용에서 제외합니다.</p>
      </div>
    </div>
  </div>`;
}
async function loadT4MaterialPriceMap() {
  if (t4MaterialPriceCache) return t4MaterialPriceCache;
  if (t4MaterialPriceInflight) return t4MaterialPriceInflight;
  t4MaterialPriceInflight = fetchMarketJson(`/api/market-prices?mode=t4Materials&_=${Date.now()}`)
    .then(data => {
      const map = new Map();
      for (const item of data?.items || []) {
        map.set(item.requestedName || item.name, item);
      }
      t4MaterialPriceCache = map;
      return map;
    })
    .finally(() => { t4MaterialPriceInflight = null; });
  return t4MaterialPriceInflight;
}
async function loadCrystalPrice() {
  if (crystalPriceCache) return crystalPriceCache;
  if (crystalPriceInflight) return crystalPriceInflight;
  crystalPriceInflight = fetchMarketJson(`/api/crystal-price?_=${Date.now()}`)
    .then(data => {
      crystalPriceCache = data;
      return data;
    })
    .finally(() => { crystalPriceInflight = null; });
  return crystalPriceInflight;
}
function updatePheonGoldSummary() {
  const crystalInput = $('crystalGoldPer100Input');
  const pheonInput = $('pheonCrystalPerOneInput');
  const text = $('pheonGoldPerOneText');
  if (!crystalInput || !pheonInput || !text) return;
  const crystalGoldPer100 = Number(crystalInput.value || 0);
  const pheonCrystalPerOne = Number(pheonInput.value || DEFAULT_PHEON_CRYSTAL_PER_ONE);
  const pheonGold = crystalGoldPer100 > 0 && pheonCrystalPerOne > 0 ? (crystalGoldPer100 / 100) * pheonCrystalPerOne : 0;
  text.textContent = pheonGold > 0 ? `${formatGold(pheonGold)} / 페온` : '-';
}
function refreshPowerCostEstimatesFromMarketCache() {
  if (t4MaterialPriceCache) storePowerCostEstimates(t4MaterialPriceCache);
}
async function hydrateCrystalPrice() {
  const crystalInput = $('crystalGoldPer100Input');
  const pheonInput = $('pheonCrystalPerOneInput');
  const sourceText = $('crystalPriceSourceText');
  if (!crystalInput || !pheonInput) return;
  const onInput = () => {
    updatePheonGoldSummary();
    refreshPowerCostEstimatesFromMarketCache();
  };
  crystalInput.addEventListener('input', onInput);
  pheonInput.addEventListener('input', onInput);
  try {
    const data = await loadCrystalPrice();
    const value = Number(data?.crystalGoldPer100 || 0);
    if (value > 0) {
      crystalInput.value = String(Math.round(value));
      if (sourceText) {
        const latestTime = data?.latest?.dt ? ` · 기준 ${data.latest.dt}` : '';
        sourceText.textContent = `LOSPI 1시간 OHLC 최신 종가 기준${latestTime}. 실패하거나 맞지 않으면 직접 수정할 수 있습니다.`;
      }
    }
  } catch {
    if (sourceText) sourceText.textContent = 'LOSPI 시세를 불러오지 못했습니다. 100 크리스탈당 골드를 직접 입력하면 페온 비용을 계산합니다.';
  }
  updatePheonGoldSummary();
  refreshPowerCostEstimatesFromMarketCache();
}
async function hydratePowerCostMaterialPrices() {
  const list = $('powerCostMaterialList');
  if (!list) return;
  try {
    const priceMap = await loadT4MaterialPriceMap();
    list.querySelectorAll('.powerCostMaterial').forEach(row => {
      const name = row.dataset.materialName || '';
      if (!name || BOUND_ONLY_MATERIALS.has(name)) return;
      const item = priceMap.get(name);
      const small = row.querySelector('small');
      if (!small) return;
      if (!item || item.missing || !Number(item.price || 0)) {
        small.textContent = '시세 없음 · 체크 해제 시 귀속재료로 간주해 0골드';
        row.classList.add('missing');
        return;
      }
      if (Number(item.shardCount || 0) && Number(item.shardUnitPrice || 0)) {
        small.textContent = `파편 1개당 ${formatGold(item.shardUnitPrice)} · 주머니당 파편 ${Number(item.shardCount).toLocaleString('ko-KR')}개 기준 · 체크 해제 시 귀속재료로 간주해 0골드`;
        return;
      }
      const unit = Number(item.effectiveUnitPrice || item.unitPrice || item.price || 0);
      small.textContent = `단가 ${formatGold(unit)} · 체크 해제 시 귀속재료로 간주해 0골드`;
    });
    await loadCombatPowerModel();
    await storePowerCostEstimates(priceMap);
    list.querySelectorAll('.powerCostMaterial input').forEach(input => {
      input.addEventListener('change', () => storePowerCostEstimates(priceMap));
    });
  } catch {
    state.powerCostEstimates = [];
    renderSpecEfficiencyTable();
    list.querySelectorAll('.powerCostMaterial small').forEach(small => {
      small.textContent = '시세 확인 실패 · 시세탭 재료에서 다시 확인 가능';
    });
  }
}
function renderPowerSnapshot(snapshot) {
  const panel = $('powerSnapshotPanel');
  const view = $('powerSnapshotView');
  if (!panel || !view) return;
  if (!snapshot) {
    panel.classList.add('hidden');
    view.innerHTML = '';
    simulatorRendered = false;
    state.powerCostEstimates = [];
    return;
  }
  simulatorRendered = true;
  panel.classList.toggle('hidden', !document.body.classList.contains('simulatorMode'));
  const equipment = snapshot.equipment || {};
  const combat = equipment.combat || [];
  const accessories = equipment.accessories || [];
  const effects = snapshot.effects || {};
  const gems = snapshot.gems || { items: [], summary: {} };
  const gemItems = gems.items || [];
  const equippedGems = gemItems
    .slice()
    .sort((a, b) => Number(b.level || 0) - Number(a.level || 0))
    .map(gem => {
      const label = gem.kind === 'damage' ? '딜' : gem.kind === 'cooldown' ? '쿨' : '?';
      const icon = gem.icon ? `<img src="${escapeHtml(gem.icon)}" alt="">` : `<i>${escapeHtml(label)}</i>`;
      return `<span title="${escapeHtml(label)} Lv.${Number(gem.level || 0)} ${escapeHtml(gem.skillName || gem.name || '-')}">${icon}<b>${Number(gem.level || 0)}</b></span>`;
    })
    .join('');
  const gearRows = sortCombatEquipmentForDisplay(combat).map(renderPowerEquipmentRow).join('');
  const arkGridPanel = renderPowerArkGridPanel(snapshot.arkGrid);
  const accessoryEffectItems = effects.accessory?.items || [];
  const accessoryRows = accessories.map((item, index) => renderPowerAccessoryRow(item, accessoryEffectItems[index]?.effects)).join('');
  const braceletEffects = effects.bracelet?.items?.[0]?.effects || effects.bracelet || {};
  const braceletRow = renderPowerBraceletRow(equipment.bracelet, braceletEffects);
  const stone = equipment.abilityStone;
  const stoneEngravings = (effects.abilityStone?.items?.[0]?.engravings || effects.abilityStone?.engravings || []).map(e => `${e.name} Lv.${e.level}`).join(' · ');
  const stoneRow = renderPowerStoneRow(stone, stoneEngravings);
  const engravingPanel = renderPowerEngravingPanel(effects.engraving);
  const accessoryPanelRows = [accessoryRows, braceletRow, stoneRow, engravingPanel].filter(Boolean).join('');
  view.innerHTML = `
    <div class="powerSnapshotColumns">
      ${renderSpecEfficiencyShell()}
      <div class="powerRawHeader">
        <div><h3>현재 장비 분석</h3><p>효율 계산에 사용한 API 원자료를 확인합니다.</p></div>
        <span>보석 · 장비 · 악세 · 아크그리드</span>
      </div>
      <div class="powerSnapshotBlock"><h3>장착 보석</h3><div class="powerGemList">${equippedGems || '<span>보석 정보를 찾지 못했습니다.</span>'}</div></div>
      <div class="powerSnapshotBlock powerBuildPanel">
        <h3>장비 파싱</h3>
        <div class="powerBuildGrid">
          <div class="powerBuildColumn">
            <div class="powerBuildHeader"><b>장비</b><span>아바타 제외</span></div>
            <div class="powerEquipmentList">${gearRows || '<p>전투 장비를 찾지 못했습니다.</p>'}${arkGridPanel}</div>
          </div>
          <div class="powerBuildColumn">
            <div class="powerBuildHeader"><b>악세사리</b><span>팔찌/어빌리티 스톤 포함</span></div>
            <div class="powerAccessoryList">${accessoryPanelRows || '<p>악세사리 정보를 찾지 못했습니다.</p>'}</div>
          </div>
        </div>
      </div>
      ${renderPowerCostPrep(snapshot)}
    </div>
    <p class="powerSnapshotNote">일반/상급 재련 단계는 공식 API Tooltip에서 읽습니다. 상급 재련 전투력 상승량은 공개 산식이 없어 현재 공식 전투력 비율 기반 추정값으로 표시합니다.</p>
  `;
  hydratePowerCostMaterialPrices();
  hydrateCrystalPrice();
}
function renderSummary(profile, arkPassive) {
  $('summaryPanel').classList.remove('hidden');
  document.body.classList.add('calculatorReady');
  renderCombatStats();
}

function tierCost(tier) {
  let used = 0;
  for (const row of selectedEntries()) if (row.tier === tier) used += (getNode(row.name)?.costPerLevel || 0) * row.level;
  const max = { 1: 40, 2: 30, 3: 20, 4: 20, 5: 30 }[tier] || 0;
  return { used, max };
}
function clampLevelByTierBudget(name, desiredLevel) {
  const node = getNode(name);
  if (!node) return 0;
  const tier = Number(node.tier);
  const maxLevel = Number(node.maxLevel || 0);
  let next = Math.max(0, Math.min(maxLevel, desiredLevel));
  const tierMax = { 1: 40, 2: 30, 3: 20, 4: 20, 5: 30 }[tier] || Infinity;
  const cost = Number(node.costPerLevel || 0);
  if (!cost) return next;
  let usedWithoutThis = 0;
  for (const row of selectedEntries()) {
    if (row.name !== name && row.tier === tier) usedWithoutThis += (getNode(row.name)?.costPerLevel || 0) * row.level;
  }
  const availableLevels = Math.floor(Math.max(0, tierMax - usedWithoutThis) / cost);
  return Math.min(next, availableLevels);
}
function nodeEffectText(node, effect = {}) {
  const parts = [];
  const add = (key, label, suffix = '%') => {
    const value = Number(effect?.[key] || 0);
    if (Math.abs(value) > 0.0001) parts.push(`${label} ${value > 0 ? '+' : ''}${fmt(value)}${suffix}`);
  };
  if (effect.statBonus) parts.push(`${node.name} +${formatNumber(effect.statBonus)}`);
  add('critRate', '치명타 적중률');
  add('critDamage', '치명타 피해');
  add('critHitDamage', '치명타 적중 시 피해');
  add('evolutionDamage', '진화형 피해');
  add('additionalDamage', '추가 피해');
  add('enemyDamage', '적에게 주는 피해');
  add('finalDamage', '최종 피해');
  add('cooldownReduction', '재사용 대기시간 감소');
  add('manaReduction', '마나 소모량 감소');
  add('speedBonus', '공격/이동 속도');
  if (effect.critCap != null) parts.push(`치명타 적중률 상한 ${fmt(effect.critCap)}%`);
  if (effect.overCritToEvolutionDamageRate) parts.push(`초과 치적 1%당 진피 +${fmt(effect.overCritToEvolutionDamageRate)}%`);
  if (effect.overCritEvolutionDamageCap != null) parts.push(`초과 치적 진피 최대 +${fmt(effect.overCritEvolutionDamageCap)}%`);
  if (effect.sonicBreak) parts.push(`공이속 비례 진피 최대 +${fmt(effect.sonicBreak.maxEvolutionDamage || 0)}%`);
  return parts.join(' · ') || '딜 계산에 직접 반영되는 효과 없음';
}

function nodeTooltipHtml(node, selectedLevel) {
  const levels = Object.keys(node.levels || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  let shownLevels = levels;
  if (levels.length > 4) shownLevels = [...new Set([selectedLevel > 0 ? selectedLevel : levels[0], levels.at(-1)])];
  const levelRows = shownLevels.map(level => {
    const current = level === selectedLevel ? ' current' : '';
    const label = level === selectedLevel ? `현재 Lv.${level}` : `Lv.${level}`;
    return `<div class="nodeTooltipLevel${current}"><b>${label}</b><span>${escapeHtml(nodeEffectText(node, node.levels?.[String(level)] || {}))}</span></div>`;
  }).join('');
  const description = node.description ? `<p>${escapeHtml(node.description)}</p>` : '';
  return `<div class="nodeTooltipHead"><strong>${escapeHtml(node.name)}</strong><span>${Number(node.tier || 0)}티어 · 최대 Lv.${Number(node.maxLevel || 0)}</span></div>${description}<div class="nodeTooltipLevels">${levelRows || '<div class="nodeTooltipLevel"><span>딜 계산에 직접 반영되는 효과 없음</span></div>'}</div>`;
}

function hideNodeTooltip() {
  const tooltip = $('nodeTooltip');
  if (!tooltip) return;
  tooltip.classList.remove('visible');
  tooltip.setAttribute('aria-hidden', 'true');
}

function showNodeTooltip(card) {
  const tooltip = $('nodeTooltip');
  const node = getNode(card?.dataset?.name);
  if (!tooltip || !node || !card) return;
  const selectedLevel = Number(state.selected?.[node.name]?.level || 0);
  tooltip.innerHTML = nodeTooltipHtml(node, selectedLevel);
  tooltip.classList.add('visible');
  tooltip.setAttribute('aria-hidden', 'false');
  card.setAttribute('aria-describedby', 'nodeTooltip');
  const cardRect = card.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const gap = 9;
  const left = Math.max(8, Math.min(window.innerWidth - tooltipRect.width - 8, cardRect.left + cardRect.width / 2 - tooltipRect.width / 2));
  let top = cardRect.top - tooltipRect.height - gap;
  if (top < 8) top = Math.min(window.innerHeight - tooltipRect.height - 8, cardRect.bottom + gap);
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.max(8, Math.round(top))}px`;
}

function renderEvolutionTiers() {
  hideNodeTooltip();
  const html = EVOLUTION_TIERS.map(tier => {
    const cost = tierCost(tier);
    const over = cost.used > cost.max ? ' over' : '';
    const cards = allOptions(tier).map(name => {
      const node = getNode(name) || { name, maxLevel: 0, icon: '◆' };
      const selected = !!state.selected[name];
      const level = selected ? Number(state.selected[name]?.level || 0) : 0;
      const api = selected && state.selected[name]?.source === 'api' ? '<span class="apiMark">API</span>' : '';
      return `<button class="nodeCard ${selected && level > 0 ? 'selected' : ''}" type="button" data-tier="${tier}" data-name="${escapeHtml(name)}">
        <div class="nodeIcon">${node.iconImage ? `<img src="${escapeHtml(node.iconImage)}" alt="" />` : escapeHtml(node.icon || '◆')}</div>
        <div class="nodeName">${escapeHtml(name)}</div>
        <div class="nodeControls">
          <span class="minus" data-action="minus">−</span>
          <b>Lv.${level}</b>
          <span class="plus" data-action="plus">＋</span>
        </div>
        ${api}
      </button>`;
    }).join('');
    return `<div class="tierBlock"><h3 class="${over}">${tier}티어 <span>(${cost.max}P)</span> <em>(${cost.used}/${cost.max}P)</em></h3><div class="nodeGrid">${cards}</div></div>`;
  }).join('');
  $('evolutionTiers').innerHTML = html;
  $('evolutionTiers').querySelectorAll('.nodeCard').forEach(card => {
    card.addEventListener('click', onNodeCardClick);
    card.addEventListener('mouseenter', () => showNodeTooltip(card));
    card.addEventListener('mouseleave', hideNodeTooltip);
    card.addEventListener('focus', () => showNodeTooltip(card));
    card.addEventListener('blur', hideNodeTooltip);
  });
}
function onNodeCardClick(event) {
  const card = event.currentTarget;
  const name = card.dataset.name;
  const action = event.target?.dataset?.action || 'select';
  const cur = Number(state.selected[name]?.level || 0);
  let nextLevel = cur;
  if (action === 'minus') nextLevel = cur - 1;
  else if (action === 'plus') nextLevel = cur + 1;
  else nextLevel = cur > 0 ? 0 : 1;
  nextLevel = clampLevelByTierBudget(name, nextLevel);
  if (nextLevel <= 0) delete state.selected[name];
  else state.selected[name] = { level: nextLevel, source: 'manual' };
  renderEvolutionTiers();
  calculateAndRender();
}


function pushDamageSource(list, label, value) {
  const v = Number(value || 0);
  if (!Number.isFinite(v) || Math.abs(v) < 0.0001) return;
  list.push({ label, value: v });
}
function collectItemDamageSources(group, key, groupLabel) {
  const list = [];
  let usedItem = false;
  for (const item of group?.items || []) {
    const value = Number(item?.effects?.[key] || 0);
    if (!Number.isFinite(value) || Math.abs(value) < 0.0001) continue;
    usedItem = true;
    pushDamageSource(list, `${groupLabel} · ${item.type || item.name || '옵션'}`, value);
  }
  if (!usedItem && Number(group?.[key] || 0)) pushDamageSource(list, groupLabel, group[key]);
  return list;
}
function multiplyPercentSources(sources) {
  let multiplier = 1;
  for (const src of sources || []) {
    const v = typeof src === 'number' ? src : Number(src?.value || 0);
    if (!Number.isFinite(v)) continue;
    multiplier *= (1 + v / 100);
  }
  return multiplier;
}
function effectivePercentFromSources(sources) {
  return (multiplyPercentSources(sources) - 1) * 100;
}
function additivePercentFromSources(sources) {
  return (sources || []).reduce((sum, src) => {
    const v = typeof src === 'number' ? src : Number(src?.value || 0);
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);
}
function safePercentSources(sources, aggregateValue, aggregateLabel = '합산값') {
  const list = Array.isArray(sources) ? sources.filter(src => Math.abs(Number(src?.value ?? src ?? 0)) > 0.0001) : [];
  if (list.length) return list;
  const v = Number(aggregateValue || 0);
  return Math.abs(v) > 0.0001 ? [{ label: aggregateLabel, value: v }] : [];
}


function getBaseStats(selection = state.selected) {
  const engravingSimulation = getEngravingSimulation();
  const engravingEffects = engravingSimulation.effects;
  const adrenalineEffect = engravingSimulation.adrenalineEffect;
  const selectedCritStat = tier1StatBonus('치명', selection);
  const selectedSwiftStat = tier1StatBonus('신속', selection);
  const critStat = num($('baseCritStat').value) + selectedCritStat;
  const swiftStat = num($('baseSwiftStat').value) + selectedSwiftStat;
  const statCritRate = critRateFromStat(critStat);
  const swiftSpeedBonus = speedFromSwift(swiftStat);
  const extraCritRate = num($('extraCritRate').value);
  const extraCritDamage = num($('extraCritDamage').value);
  const skillCritDamage = 0;
  const extraEvolutionDamage = num($('extraEvolutionDamage').value);
  const extraAdditionalDamage = num($('extraAdditionalDamage').value);
  const extraEnemyDamage = num($('extraEnemyDamage').value);
  const extraAttackSpeed = num($('extraAttackSpeed').value);
  const extraMoveSpeed = num($('extraMoveSpeed').value);
  const critSynergy = $('critSynergyEnabled').checked ? 10 : 0;
  const backAttackCritRate = $('backAttackEnabled').checked ? 10 : 0;
  const backAttackEnemyDamage = $('backAttackEnabled').checked ? 5 : 0;
  const baseSpeed = 114;
  const enlightenmentAttackSpeed = num(state.enlightenment.attackSpeed);
  const enlightenmentMoveSpeed = num(state.enlightenment.moveSpeed);
  const braceletAttackMoveSpeed = num(state.bracelet.attackMoveSpeed);
  const arkGridAttackSpeed = num(state.arkGrid.attackSpeed);
  const arkGridMoveSpeed = num(state.arkGrid.moveSpeed);
  const engravingAttackSpeed = num(engravingEffects.attackSpeed);
  const attackSpeed = baseSpeed + swiftSpeedBonus + enlightenmentAttackSpeed + braceletAttackMoveSpeed + arkGridAttackSpeed + engravingAttackSpeed + extraAttackSpeed;
  const moveSpeed = baseSpeed + swiftSpeedBonus + enlightenmentMoveSpeed + braceletAttackMoveSpeed + arkGridMoveSpeed + extraMoveSpeed;
  let dynamicEnlightenmentCritRate = 0;
  let dynamicEnlightenmentCritDamage = 0;
  for (const item of state.enlightenment.items || []) {
    const wf = item?.effects?.windfuryAgility;
    if (!wf) continue;
    // 기상술사 '기민함'은 기본 공속/이속 증가량을 기준으로 계산합니다.
    // 로아의 공속/이속 상한은 각각 140%라서 증가량은 최대 40%까지만 반영됩니다.
    // Lv1: 치피 40% / 치적 10%, Lv2: 80% / 20%, Lv3: 120% / 30%
    // 최대값: Lv1 치피 16%·치적 4%, Lv2 치피 32%·치적 8%, Lv3 치피 48%·치적 12%
    const cappedAttackIncrease = Math.max(0, Math.min(attackSpeed, 140) - 100);
    const cappedMoveIncrease = Math.max(0, Math.min(moveSpeed, 140) - 100);
    dynamicEnlightenmentCritDamage += cappedAttackIncrease * Number(wf.critDamageRate || 0);
    dynamicEnlightenmentCritRate += cappedMoveIncrease * Number(wf.critRateRate || 0);
  }
  dynamicEnlightenmentCritRate = Math.round(dynamicEnlightenmentCritRate * 100) / 100;
  dynamicEnlightenmentCritDamage = Math.round(dynamicEnlightenmentCritDamage * 100) / 100;
  const enemyDamageSources = [
    ...collectItemDamageSources(state.accessory, 'enemyDamage', '악세'),
    ...collectItemDamageSources(state.bracelet, 'enemyDamage', '팔찌')
  ];
  pushDamageSource(enemyDamageSources, '깨달음', state.enlightenment.enemyDamage);
  pushDamageSource(enemyDamageSources, '아크그리드', state.arkGrid.enemyDamage);
  pushDamageSource(enemyDamageSources, '각인서/API', engravingEffects.enemyDamage);
  if (!engravingSimulation.adrenalineEnabled) pushDamageSource(enemyDamageSources, `${engravingSimulation.replacementName} · 조건 충족`, engravingSimulation.replacementEffect.conditionalDamage);
  pushDamageSource(enemyDamageSources, '어빌리티 스톤 각인 보너스', state.abilityStone?.effects?.enemyDamage);
  pushDamageSource(enemyDamageSources, '추가 입력', extraEnemyDamage);
  pushDamageSource(enemyDamageSources, '백어택', backAttackEnemyDamage);
  const critHitDamageSources = [
    ...collectItemDamageSources(state.accessory, 'critHitDamage', '악세'),
    ...collectItemDamageSources(state.bracelet, 'critHitDamage', '팔찌')
  ];
  pushDamageSource(critHitDamageSources, '깨달음 · 회심', state.enlightenment.critHitDamage);
  pushDamageSource(critHitDamageSources, '각인서/API', engravingEffects.critHitDamage);
  pushDamageSource(critHitDamageSources, '어빌리티 스톤 각인 보너스', state.abilityStone?.effects?.critHitDamage);
  return {
    critStat,
    swiftStat,
    statCritRate,
    critRate: statCritRate + num(state.accessory.critRate) + num(state.bracelet.critRate) + num(state.enlightenment.critRate) + num(state.arkGrid.critRate) + num(engravingEffects.critRate) + num(state.abilityStone?.effects?.critRate) + dynamicEnlightenmentCritRate + extraCritRate + critSynergy + backAttackCritRate,
    critDamage: 200 + num(state.accessory.critDamage) + num(state.bracelet.critDamage) + num(state.enlightenment.critDamage) + num(state.arkGrid.critDamage) + num(engravingEffects.critDamage) + num(state.abilityStone?.effects?.critDamage) + dynamicEnlightenmentCritDamage + extraCritDamage,
    critHitDamage: num(state.accessory.critHitDamage) + num(state.bracelet.critHitDamage) + num(state.enlightenment.critHitDamage) + num(engravingEffects.critHitDamage) + num(state.abilityStone?.effects?.critHitDamage),
    critHitDamageSources,
    evolutionDamage: num(state.enlightenment.evolutionDamage) + extraEvolutionDamage,
    additionalDamage: num(state.accessory.additionalDamage) + num(state.bracelet.additionalDamage) + num(state.enlightenment.additionalDamage) + num(state.arkGrid.additionalDamage) + num(engravingEffects.additionalDamage) + num(state.abilityStone?.effects?.additionalDamage) + extraAdditionalDamage,
    enemyDamage: effectivePercentFromSources(enemyDamageSources),
    enemyDamageSources,
    skillCritBonus: 0,
    critSynergy,
    backAttackCritRate,
    backAttackEnemyDamage,
    adrenalineCritRate: num(adrenalineEffect.critRate),
    adrenalineAttackPower: num(adrenalineEffect.attackPower),
    attackPower: num(adrenalineEffect.attackPower) + num(state.abilityStone?.attackPower) + num(state.abilityStone?.effects?.attackPower) + num(engravingEffects.attackPower),
    engravingEffects,
    replacementEngraving: engravingSimulation.adrenalineEnabled ? null : { name: engravingSimulation.replacementName, level: engravingSimulation.replacementBookLevel, effects: engravingSimulation.replacementEffect },
    swiftSpeedBonus,
    enlightenmentAttackSpeed,
    enlightenmentMoveSpeed,
    braceletAttackMoveSpeed,
    arkGridAttackSpeed,
    arkGridMoveSpeed,
    engravingAttackSpeed,
    dynamicEnlightenmentCritRate,
    dynamicEnlightenmentCritDamage,
    baseMoveAttackSpeed: baseSpeed,
    moveAttackSpeed: Math.min(attackSpeed, moveSpeed),
    attackSpeed,
    moveSpeed,
    extraCritRate,
    extraCritDamage,
    extraEvolutionDamage,
    extraAdditionalDamage,
    extraEnemyDamage,
    extraAttackSpeed,
    extraMoveSpeed
  };
}
function applyEffect(stats, effect, sourceLabel = '진화') {
  const out = { ...stats };
  if (effect.manaConditionNote) out.manaConditionNotes = [...(out.manaConditionNotes || []), { label: sourceLabel, note: effect.manaConditionNote }];
  if (effect.critStat) { out.critStat = (out.critStat || 0) + effect.critStat; out.statCritRate = critRateFromStat(out.critStat); out.critRate += critRateFromStat(effect.critStat); }
  if (effect.swiftStat) { out.swiftStat = (out.swiftStat || 0) + effect.swiftStat; out.swiftSpeedBonus = speedFromSwift(out.swiftStat || 0); out.attackSpeed = (out.baseMoveAttackSpeed || 114) + out.swiftSpeedBonus + (out.enlightenmentAttackSpeed || 0) + (out.braceletAttackMoveSpeed || 0) + (out.arkGridAttackSpeed || 0) + (out.engravingAttackSpeed || 0) + (out.extraAttackSpeed || 0); out.moveSpeed = (out.baseMoveAttackSpeed || 114) + out.swiftSpeedBonus + (out.enlightenmentMoveSpeed || 0) + (out.braceletAttackMoveSpeed || 0) + (out.arkGridMoveSpeed || 0) + (out.extraMoveSpeed || 0); out.moveAttackSpeed = Math.min(out.attackSpeed, out.moveSpeed); }
  if (effect.critRate) out.critRate += effect.critRate;
  if (effect.critDamage) out.critDamage += effect.critDamage;
  if (effect.critHitDamage) {
    out.critHitDamage = (out.critHitDamage || 0) + effect.critHitDamage;
    out.critHitDamageSources = [...(out.critHitDamageSources || []), { label: sourceLabel, value: effect.critHitDamage }];
  }
  if (effect.evolutionDamage) out.evolutionDamage += effect.evolutionDamage;
  if (effect.cooldownReduction && !isCooldownExcluded()) out.cooldownReduction = (out.cooldownReduction || 0) + effect.cooldownReduction;
  if (effect.sonicBreak) {
    const sonicDamage = calculateSonicBreakEvolutionDamage(
      out.attackSpeed || out.moveAttackSpeed || 100,
      out.moveSpeed || out.moveAttackSpeed || 100,
      effect.sonicBreak
    );
    out.evolutionDamage += sonicDamage;
    out.sonicBreakEvolutionDamage = (out.sonicBreakEvolutionDamage || 0) + sonicDamage;
  }
  if (effect.additionalDamage) out.additionalDamage += effect.additionalDamage;
  if (effect.enemyDamage) {
    out.enemyDamageSources = [...(out.enemyDamageSources || []), { label: '진화', value: effect.enemyDamage }];
    out.enemyDamage = effectivePercentFromSources(out.enemyDamageSources);
  }
  if (effect.finalDamage) {
    out.enemyDamageSources = [...(out.enemyDamageSources || []), { label: '진화', value: effect.finalDamage }];
    out.enemyDamage = effectivePercentFromSources(out.enemyDamageSources);
  }
  if (effect.attackPower) out.attackPower = (out.attackPower || 0) + effect.attackPower;
  if (effect.speedBonus) { out.attackSpeed = (out.attackSpeed || out.moveAttackSpeed || 0) + effect.speedBonus; out.moveSpeed = (out.moveSpeed || out.moveAttackSpeed || 0) + effect.speedBonus; out.moveAttackSpeed = Math.min(out.attackSpeed, out.moveSpeed); }
  if (effect.critCap != null) out.critCap = effect.critCap;
  if (effect.overCritToEvolutionDamageRate) out.overCritToEvolutionDamageRate = effect.overCritToEvolutionDamageRate;
  if (effect.overCritEvolutionDamageCap != null) out.overCritEvolutionDamageCap = effect.overCritEvolutionDamageCap;
  return out;
}
function selectedEntries(selection = state.selected) { return Object.entries(selection || {}).map(([name, data]) => ({ name, tier: getNode(name)?.tier, level: Number(data?.level || 0), source: data?.source })).filter(row => row.name && row.level > 0 && row.tier); }
function cloneSelection(selection = state.selected) { return JSON.parse(JSON.stringify(selection)); }
function selectionWithoutTiers(selection = state.selected, tiers = [4, 5]) {
  const next = cloneSelection(selection);
  const tierSet = new Set(tiers.map(Number));
  for (const row of selectedEntries(next)) {
    if (tierSet.has(Number(row.tier))) delete next[row.name];
  }
  return next;
}
function score(stats) {
  // Lost Ark damage buckets: same bucket effects are additive first, then each bucket is multiplied.
  // Expected value = crit EV × 진화형피해 × 추가피해 × 적에게주는피해 × 공격력증가.
  const rawCritRate = stats.critRate + stats.skillCritBonus + (stats.adrenalineCritRate || 0);
  let effectiveCritRate = rawCritRate;
  let evo = stats.evolutionDamage;
  let overCrit = 0;
  let convertedEvolutionDamage = 0;
  if (stats.critCap != null) {
    const bluntSpike = calculateBluntSpike(rawCritRate, stats);
    overCrit = bluntSpike.overCrit;
    convertedEvolutionDamage = bluntSpike.convertedEvolutionDamage;
    effectiveCritRate = bluntSpike.effectiveCritRate;
    evo += convertedEvolutionDamage;
  }
  const critChance = Math.max(0, Math.min(effectiveCritRate, 100)) / 100;
  const critHitSources = safePercentSources(stats.critHitDamageSources, stats.critHitDamage, '치명타 적중 주피');
  const critHitMultiplier = multiplyPercentSources(critHitSources);
  const critMultiplier = (1 - critChance) + critChance * (stats.critDamage / 100) * critHitMultiplier;
  const evoMultiplier = 1 + evo / 100;
  const addMultiplier = 1 + stats.additionalDamage / 100;
  const enemyMultiplier = stats.enemyDamageSources?.length ? multiplyPercentSources(stats.enemyDamageSources) : (1 + (stats.enemyDamage || 0) / 100);
  const effectiveEnemyDamage = (enemyMultiplier - 1) * 100;
  const effectiveCritHitDamage = (critHitMultiplier - 1) * 100;
  const displayEnemyDamage = additivePercentFromSources(stats.enemyDamageSources);
  const displayCritHitDamage = additivePercentFromSources(critHitSources);
  const attackMultiplier = 1 + (stats.attackPower || 0) / 100;
  // v4.8.8: 쿨감의 이론 DPS 증가분을 사용자가 입력한 '주력기 딜 지분'만큼 반영.
  // 쿨감 효과 제외 체크 시 끝마/무마/최적화 훈련 등 모든 cooldownReduction은 점수에서 0으로 처리.
  const cooldownExcluded = isCooldownExcluded();
  const cooldownReduction = cooldownExcluded ? 0 : Math.max(0, Math.min(Number(stats.cooldownReduction || 0), 95));
  const mainSkillDamageSharePct = cooldownExcluded ? 0 : Math.max(0, Math.min(Number($('mainSkillDamageShare')?.value ?? 60), 100));
  const cooldownRatio = mainSkillDamageSharePct / 100;
  const theoreticalCooldownGain = cooldownReduction > 0 ? (1 / (1 - cooldownReduction / 100) - 1) : 0;
  const cooldownMultiplier = 1 + theoreticalCooldownGain * cooldownRatio;
  const value = critMultiplier * evoMultiplier * addMultiplier * enemyMultiplier * attackMultiplier * cooldownMultiplier;
  return { value, cooldownReduction, cooldownRatio: cooldownRatio * 100, cooldownMultiplier, rawCritRate, critRate: rawCritRate, effectiveCritRate, critDamage: stats.critDamage, critHitDamage: effectiveCritHitDamage, displayCritHitDamage, evo, baseEvo: stats.evolutionDamage, convertedEvolutionDamage, overCrit, additionalDamage: stats.additionalDamage, enemyDamage: effectiveEnemyDamage, displayEnemyDamage, attackPower: stats.attackPower || 0, moveAttackSpeed: stats.moveAttackSpeed || 0, attackSpeed: stats.attackSpeed || stats.moveAttackSpeed || 0, moveSpeed: stats.moveSpeed || stats.moveAttackSpeed || 0 };
}
function cloneBaseStats(stats) {
  return {
    ...stats,
    enemyDamageSources: [...(stats.enemyDamageSources || [])],
    critHitDamageSources: [...(stats.critHitDamageSources || [])],
    manaConditionNotes: [...(stats.manaConditionNotes || [])]
  };
}
function statsWithSelection(selection = state.selected) {
  // v4.6.0 계산 엔진 순서 고정:
  // 1) 선택 세팅 기준 기본 스탯 생성
  // 2) 4/5티어 추천 계산이면 selection에서 현재 4/5티어를 이미 제거한 상태로 들어옴
  // 3) 해당 selection의 진화 노드를 전부 적용
  // 4) 모든 치적/치피/진피/추피/적주피/공증/공이속이 확정된 뒤 score()에서 뭉가를 마지막 처리
  let s = cloneBaseStats(getBaseStats(selection));
  const entries = selectedEntries(selection).sort((a, b) => Number(a.tier) - Number(b.tier));
  for (const row of entries) {
    if (row.name === '치명' || row.name === '신속') continue;
    s = applyEffect(s, getContextualLevelEffect(row.name, row.level), `진화 ${row.name}`);
  }
  return { stats: s, result: score(s) };
}

function sourceLine(label, value, detail = '') {
  const detailHtml = detail ? `<small>${escapeHtml(detail)}</small>` : '';
  return `<div class="sourceLine"><span>${escapeHtml(label)}${detailHtml}</span><b>${pct(Number(value || 0))}</b></div>`;
}
function sourceGroup(title, colorClass, lines, total) {
  const body = lines.length ? lines.join('') : `<div class="sourceLine muted"><span>해당 없음</span><b>+0.00%</b></div>`;
  return `<details class="sourceGroup ${colorClass}"><summary class="sourceHead"><strong>${escapeHtml(title)}</strong><em>${pct(Number(total || 0))}</em></summary><div class="sourceGroupBody">${body}</div></details>`;
}
function getStatNodeLine(name) {
  const lv = Number(state.selected?.[name]?.level || 0);
  return lv > 0 ? `${name} Lv.${lv} · +${lv * 50}` : '';
}

function enlightenmentAppliedDetailHtml(base) {
  const rows = [];
  for (const item of state.enlightenment.items || []) {
    const eff = item?.effects || {};
    const parts = [];
    const push = (label, key) => {
      const value = Number(eff?.[key] || 0);
      if (Number.isFinite(value) && Math.abs(value) > 0.0001) parts.push(`${label} ${pct(value)}`);
    };
    push('치적', 'critRate');
    push('치피', 'critDamage');
    push('진피', 'evolutionDamage');
    push('추피', 'additionalDamage');
    push('적주피', 'enemyDamage');
    if (eff?.windfuryAgility) {
      const cr = Number(base?.dynamicEnlightenmentCritRate || 0);
      const cd = Number(base?.dynamicEnlightenmentCritDamage || 0);
      const dyn = [];
      if (Math.abs(cr) > 0.0001) dyn.push(`치적 ${pct(cr)}`);
      if (Math.abs(cd) > 0.0001) dyn.push(`치피 ${pct(cd)}`);
      if (dyn.length) parts.push(`기민함 동적 ${dyn.join(' / ')}`);
    }
    if (!parts.length) continue;
    const lv = Number(item?.level || 0) ? ` Lv.${Number(item.level)}` : '';
    rows.push(`<div class="enlightenmentDetailLine"><b>${escapeHtml((item?.name || '깨달음 효과') + lv)}</b><span>${escapeHtml(parts.join(' / '))}</span></div>`);
  }
  if (!rows.length) {
    return `<details class="enlightenmentDetails"><summary>깨달음 적용 내역</summary><div class="enlightenmentDetailBody"><div class="enlightenmentDetailLine muted"><span>API에서 적용된 깨달음 수치가 없습니다.</span></div></div></details>`;
  }
  const totals = [];
  const pushTotal = (label, value) => {
    const v = Number(value || 0);
    if (Number.isFinite(v) && Math.abs(v) > 0.0001) totals.push(`${label} ${pct(v)}`);
  };
  pushTotal('치적', state.enlightenment.critRate + Number(base?.dynamicEnlightenmentCritRate || 0));
  pushTotal('치피', state.enlightenment.critDamage + Number(base?.dynamicEnlightenmentCritDamage || 0));
  pushTotal('치명타 적중 주피', state.enlightenment.critHitDamage);
  pushTotal('진피', state.enlightenment.evolutionDamage);
  pushTotal('추피', state.enlightenment.additionalDamage);
  pushTotal('적주피', state.enlightenment.enemyDamage);
  const totalLine = totals.length ? `<div class="enlightenmentDetailTotal"><strong>깨달음 합계</strong><em>${escapeHtml(totals.join(' / '))}</em></div>` : '';
  return `<details class="enlightenmentDetails"><summary>깨달음 적용 내역 / 중복 확인</summary><div class="enlightenmentDetailBody">${rows.join('')}${totalLine}<p>같은 깨달음 효과 안에서 RAW·Tooltip·Description 반복 문장은 가장 큰 유효값 1개만 반영합니다. v4.8.1부터 API Name이 '깨달음'인 항목만 깨달음으로 반영합니다. 도약/진화 항목은 깨달음 계산에서 제외합니다.</p></div></details>`;
}


function engravingAppliedDetailHtml() {
  const stoneItems = state.abilityStone?.items || [];
  const engravingItems = state.engraving?.items || [];
  const rows = [];
  for (const item of stoneItems) {
    const parts = [];
    for (const e of item.engravings || []) parts.push(`${e.name} Lv.${e.level}`);
    if (Number(item.attackPower || 0)) parts.push(`기본 공격력 ${pct(item.attackPower)}`);
    if (parts.length) rows.push(`<div class="enlightenmentDetailLine"><b>${escapeHtml(item.name || '어빌리티 스톤')}</b><span>${escapeHtml(parts.join(' / '))}</span></div>`);
  }
  if (engravingItems.length) {
    rows.push(`<div class="enlightenmentDetailLine"><b>각인서/API</b><span>${escapeHtml(engravingItems.map(e => `${e.name} ${e.grade ? '[' + e.grade + '] ' : ''}${Number.isFinite(Number(e.bookLevel)) ? (e.bookLevel * 5) + '장 Lv.' + e.bookLevel : 'Lv.' + (e.level ?? 0)}`).join(' / '))}</span></div>`);
  }
  const eff = state.engraving?.effects || {};
  const effParts = [];
  if (Number(eff.critRate || 0)) effParts.push(`치적 ${pct(eff.critRate)}`);
  if (Number(eff.critDamage || 0)) effParts.push(`치피 ${pct(eff.critDamage)}`);
  if (Number(eff.additionalDamage || 0)) effParts.push(`추피 ${pct(eff.additionalDamage)}`);
  if (Number(eff.enemyDamage || 0)) effParts.push(`적주피 ${pct(eff.enemyDamage)}`);
  if (Number(eff.attackPower || 0)) effParts.push(`공격력 ${pct(eff.attackPower)}`);
  if (Number(eff.attackSpeed || 0)) effParts.push(`공격 속도 ${pct(eff.attackSpeed)}`);
  if (Number(eff.conditionalDamage || 0)) effParts.push(`조건부 피해 ${pct(eff.conditionalDamage)}`);
  const adr = state.engraving?.adrenaline || {};
  if (adr.adopted) effParts.push(`아드레날린 치적 ${pct(adr.critRate || 0)}`, `아드레날린 공격력 ${pct(adr.attackPower || 0)}`);
  if (effParts.length) rows.push(`<div class="enlightenmentDetailLine"><b>각인서 효과 파싱값</b><span>${escapeHtml(effParts.join(' / '))}</span></div>`);
  const stoneEff = state.abilityStone?.effects || {};
  const stoneEffParts = [];
  if (stoneEff.critRate) stoneEffParts.push(`치적 +${fmt(stoneEff.critRate)}%`);
  if (stoneEff.critDamage) stoneEffParts.push(`치피 +${fmt(stoneEff.critDamage)}%`);
  if (stoneEff.additionalDamage) stoneEffParts.push(`추피 +${fmt(stoneEff.additionalDamage)}%`);
  if (stoneEff.enemyDamage) stoneEffParts.push(`적주피 +${fmt(stoneEff.enemyDamage)}%`);
  if (stoneEff.attackPower) stoneEffParts.push(`공격력 +${fmt(stoneEff.attackPower)}%`);
  if (stoneEff.conditionalDamage) stoneEffParts.push(`조건부 피해 +${fmt(stoneEff.conditionalDamage)}%`);
  if (stoneEffParts.length) rows.push(`<div class="enlightenmentDetailLine"><b>스톤 각인 보너스</b><span>${escapeHtml(stoneEffParts.join(' / '))}</span></div>`);
  if (!rows.length) return `<details class="enlightenmentDetails"><summary>어빌리티 스톤 / 각인서 적용 내역</summary><div class="enlightenmentDetailBody"><div class="enlightenmentDetailLine muted"><span>API에서 파싱된 어빌리티 스톤/각인서 효과가 없습니다.</span></div></div></details>`;
  return `<details class="enlightenmentDetails"><summary>어빌리티 스톤 / 각인서 적용 내역</summary><div class="enlightenmentDetailBody">${rows.join('')}</div></details>`;
}

function buildSourceSummary(current) {
  const base = getBaseStats();
  const critEvolution = [];
  const critDamageEvolution = [];
  const critHitEvolution = [];
  const evoEvolution = [];
  const addEvolution = [];
  const enemyEvolution = [];
  for (const row of selectedEntries()) {
    if (row.name === '치명' || row.name === '신속') continue;
    const eff = getContextualLevelEffect(row.name, row.level);
    const label = `[진화] ${row.name} (Lv.${row.level})`;
    if (eff.critRate) critEvolution.push(sourceLine(label, eff.critRate));
    if (eff.critDamage) critDamageEvolution.push(sourceLine(label, eff.critDamage));
    if (eff.critHitDamage) critHitEvolution.push(sourceLine(label + ' 치명타 적중 주피', eff.critHitDamage));
    if (eff.evolutionDamage) evoEvolution.push(sourceLine(label, eff.evolutionDamage));
    if (eff.sonicBreak) {
      const sonicDamage = calculateSonicBreakEvolutionDamage(
        current.stats.attackSpeed || current.stats.moveAttackSpeed || 100,
        current.stats.moveSpeed || current.stats.moveAttackSpeed || 100,
        eff.sonicBreak
      );
      if (sonicDamage) evoEvolution.push(sourceLine(label + ' 음속 전환', sonicDamage));
    }
    if (eff.additionalDamage) addEvolution.push(sourceLine(label, eff.additionalDamage));
    if (eff.enemyDamage || eff.finalDamage) enemyEvolution.push(sourceLine(label, Number(eff.enemyDamage || 0) + Number(eff.finalDamage || 0)));
  }
  if (current.result.convertedEvolutionDamage > 0) evoEvolution.push(sourceLine('[진화] 뭉가 전환', current.result.convertedEvolutionDamage, `80% 초과분 · Lv.2 전환 최대 60% / 총 뭉가 진피 75%`));
  const critLines = [sourceLine('치명 스탯', current.stats.statCritRate || 0, `치명 ${Math.round(current.stats.critStat || 0)}${getStatNodeLine('치명') ? ' · ' + getStatNodeLine('치명') : ''}`)];
  if (base.adrenalineCritRate) critLines.push(sourceLine('아드레날린', base.adrenalineCritRate));
  if (base.critSynergy) critLines.push(sourceLine('치적 시너지', base.critSynergy));
  if (base.backAttackCritRate) critLines.push(sourceLine('백어택', base.backAttackCritRate));
  if (state.accessory.critRate) critLines.push(sourceLine('악세', state.accessory.critRate));
  if (state.bracelet.critRate) critLines.push(sourceLine('팔찌', state.bracelet.critRate));
  if (state.enlightenment.critRate) critLines.push(sourceLine('깨달음', state.enlightenment.critRate));
  if (state.arkGrid.critRate) critLines.push(sourceLine('아크그리드', state.arkGrid.critRate));
  if (base.engravingEffects?.critRate) critLines.push(sourceLine('각인서/시뮬레이션', base.engravingEffects.critRate));
  if (state.abilityStone?.effects?.critRate) critLines.push(sourceLine('어빌리티 스톤 각인 보너스', state.abilityStone.effects.critRate));
  if (base.dynamicEnlightenmentCritRate) critLines.push(sourceLine('깨달음 · 기민함', base.dynamicEnlightenmentCritRate));
  if (base.extraCritRate) critLines.push(sourceLine('추가 입력', base.extraCritRate));
  critLines.push(...critEvolution);

  const critDamageLines = [sourceLine('기본 치명타 피해', 200)];
  if (state.accessory.critDamage) critDamageLines.push(sourceLine('악세', state.accessory.critDamage));
  if (state.bracelet.critDamage) critDamageLines.push(sourceLine('팔찌', state.bracelet.critDamage));
  if (state.enlightenment.critDamage) critDamageLines.push(sourceLine('깨달음', state.enlightenment.critDamage));
  if (state.arkGrid.critDamage) critDamageLines.push(sourceLine('아크그리드', state.arkGrid.critDamage));
  if (base.engravingEffects?.critDamage) critDamageLines.push(sourceLine('각인서/시뮬레이션', base.engravingEffects.critDamage));
  if (state.abilityStone?.effects?.critDamage) critDamageLines.push(sourceLine('어빌리티 스톤 각인 보너스', state.abilityStone.effects.critDamage));
  if (base.dynamicEnlightenmentCritDamage) critDamageLines.push(sourceLine('깨달음 · 기민함', base.dynamicEnlightenmentCritDamage));
  if (base.extraCritDamage) critDamageLines.push(sourceLine('추가 입력', base.extraCritDamage));
  critDamageLines.push(...critDamageEvolution);

  const critHitLines = [];
  for (const src of current.stats.critHitDamageSources || []) critHitLines.push(sourceLine(src.label || '치명타 적중 주피', Number(src.value || 0)));
  critHitLines.push(...critHitEvolution);
  if (!critHitLines.length && current.stats.critHitDamage) critHitLines.push(sourceLine('치명타 적중 주피', current.stats.critHitDamage));

  const evoLines = [];
  if (state.enlightenment.evolutionDamage) evoLines.push(sourceLine('깨달음', state.enlightenment.evolutionDamage));
  if (base.extraEvolutionDamage) evoLines.push(sourceLine('추가 입력', base.extraEvolutionDamage));
  evoLines.push(...evoEvolution);

  const addLines = [];
  if (state.accessory.additionalDamage) addLines.push(sourceLine('악세', state.accessory.additionalDamage));
  if (state.bracelet.additionalDamage) addLines.push(sourceLine('팔찌', state.bracelet.additionalDamage));
  if (state.enlightenment.additionalDamage) addLines.push(sourceLine('깨달음', state.enlightenment.additionalDamage));
  if (state.arkGrid.additionalDamage) addLines.push(sourceLine('아크그리드', state.arkGrid.additionalDamage));
  if (base.engravingEffects?.additionalDamage) addLines.push(sourceLine('각인서/시뮬레이션', base.engravingEffects.additionalDamage));
  if (state.abilityStone?.effects?.additionalDamage) addLines.push(sourceLine('어빌리티 스톤 각인 보너스', state.abilityStone.effects.additionalDamage));
  if (base.extraAdditionalDamage) addLines.push(sourceLine('추가 입력', base.extraAdditionalDamage));
  addLines.push(...addEvolution);

  const attackSpeedLines = [sourceLine('기본 + 만찬 + 서폿 진화', 114, '100% + 5% + 9%')];
  const moveSpeedLines = [sourceLine('기본 + 만찬 + 서폿 진화', 114, '100% + 5% + 9%')];
  if (current.stats.swiftSpeedBonus) {
    const swiftDetail = `신속 ${Math.round(current.stats.swiftStat || 0)}${getStatNodeLine('신속') ? ' · ' + getStatNodeLine('신속') : ''}`;
    attackSpeedLines.push(sourceLine('신속 스탯', current.stats.swiftSpeedBonus, swiftDetail));
    moveSpeedLines.push(sourceLine('신속 스탯', current.stats.swiftSpeedBonus, swiftDetail));
  }
  if (base.enlightenmentAttackSpeed) attackSpeedLines.push(sourceLine('깨달음', base.enlightenmentAttackSpeed));
  if (base.enlightenmentMoveSpeed) moveSpeedLines.push(sourceLine('깨달음', base.enlightenmentMoveSpeed));
  if (base.braceletAttackMoveSpeed) attackSpeedLines.push(sourceLine('팔찌', base.braceletAttackMoveSpeed));
  if (base.braceletAttackMoveSpeed) moveSpeedLines.push(sourceLine('팔찌', base.braceletAttackMoveSpeed));
  if (base.arkGridAttackSpeed) attackSpeedLines.push(sourceLine('아크그리드', base.arkGridAttackSpeed));
  if (base.arkGridMoveSpeed) moveSpeedLines.push(sourceLine('아크그리드', base.arkGridMoveSpeed));
  if (base.engravingAttackSpeed) attackSpeedLines.push(sourceLine('각인서/API', base.engravingAttackSpeed));
  if (base.extraAttackSpeed) attackSpeedLines.push(sourceLine('추가 입력', base.extraAttackSpeed));
  if (base.extraMoveSpeed) moveSpeedLines.push(sourceLine('추가 입력', base.extraMoveSpeed));

  const enemyLines = [];
  if (state.accessory.enemyDamage) enemyLines.push(sourceLine('악세', state.accessory.enemyDamage));
  if (state.bracelet.enemyDamage) enemyLines.push(sourceLine('팔찌', state.bracelet.enemyDamage));
  if (state.enlightenment.enemyDamage) enemyLines.push(sourceLine('깨달음', state.enlightenment.enemyDamage));
  if (state.arkGrid.enemyDamage) enemyLines.push(sourceLine('아크그리드', state.arkGrid.enemyDamage));
  if (base.engravingEffects?.enemyDamage) enemyLines.push(sourceLine('각인서/시뮬레이션', base.engravingEffects.enemyDamage));
  if (base.replacementEngraving?.effects?.conditionalDamage) enemyLines.push(sourceLine(`${base.replacementEngraving.name} · 조건 충족`, base.replacementEngraving.effects.conditionalDamage));
  if (state.abilityStone?.effects?.enemyDamage) enemyLines.push(sourceLine('어빌리티 스톤 각인 보너스', state.abilityStone.effects.enemyDamage));
  if (base.extraEnemyDamage) enemyLines.push(sourceLine('추가 입력', base.extraEnemyDamage));
  if (base.backAttackEnemyDamage) enemyLines.push(sourceLine('백어택', base.backAttackEnemyDamage));
  enemyLines.push(...enemyEvolution);

  const attackPowerLines = [];
  if (base.adrenalineAttackPower) attackPowerLines.push(sourceLine('아드레날린', base.adrenalineAttackPower));
  if (state.abilityStone?.attackPower) attackPowerLines.push(sourceLine('어빌리티 스톤', state.abilityStone.attackPower, '기본 공격력 보너스'));
  if (state.abilityStone?.effects?.attackPower) attackPowerLines.push(sourceLine('어빌리티 스톤 각인 보너스', state.abilityStone.effects.attackPower));
  if (base.engravingEffects?.attackPower) attackPowerLines.push(sourceLine('각인서/시뮬레이션', base.engravingEffects.attackPower));

  $('sourceSummary').innerHTML = `
    <div class="sourceTitle"><div><h3>계산 요약</h3><p>표시는 출처별 합산값, 기대값은 로아식 합연산/곱연산으로 계산합니다.</p></div><button id="resetViewButton" type="button">초기화</button></div>
    ${sourceGroup('치명타 확률', 'blue', critLines, current.result.critRate)}
    ${sourceGroup('치명타 피해', 'purple', critDamageLines, current.result.critDamage)}
    ${sourceGroup('치명타 적중 주피', 'pink', critHitLines, current.result.critHitDamage)}
    ${sourceGroup('진피', 'orange', evoLines, current.result.evo)}
    ${sourceGroup('추피', 'green', addLines, current.result.additionalDamage)}
    ${sourceGroup('적주피', 'pink', enemyLines, current.result.enemyDamage)}
    ${sourceGroup('공격력 증가', 'green', attackPowerLines, current.result.attackPower)}
    ${sourceGroup('공격 속도', 'cyan', attackSpeedLines, current.result.attackSpeed)}
    ${sourceGroup('이동 속도', 'cyan', moveSpeedLines, current.result.moveSpeed)}
    ${enlightenmentAppliedDetailHtml(base)}
    ${engravingAppliedDetailHtml()}
    <div class="sourceFoot">UI의 치피·진피·추피는 합산 표시이며, 적주피·치명타 적중 주피는 내부 기대값에서 출처별 곱연산으로 적용됩니다. 뭉가 Lv.2는 <b>기본 진피 15% + 초과 치적 전환 최대 60% = 총 75%</b> 기준입니다.</div>
  `;
  const reset = $('resetViewButton');
  if (reset) reset.addEventListener('click', () => { state.selected = JSON.parse(JSON.stringify(state.apiSelected || {})); renderEvolutionTiers(); calculateAndRender(); });
}

function renderCombatStats(current = statsWithSelection(state.selected)) {
  buildSourceSummary(current);
}

function keenEfficiency(current, bonusCritDamage) {
  const critRate = Math.max(0, Math.min(100, Number(current?.result?.effectiveCritRate ?? current?.result?.critRate ?? 0))) / 100;
  const critDamage = Number(current?.result?.critDamage || 200);
  const before = (1 - critRate) + critRate * (critDamage / 100);
  const after = ((1 - critRate) + critRate * ((critDamage + bonusCritDamage) / 100)) * 0.98;
  if (!before || !Number.isFinite(before) || !Number.isFinite(after)) return 0;
  return ((after / before) - 1) * 100;
}
function renderKeenEfficiency(current) {
  const el = $('keenEfficiency');
  if (!el) return;
  const rows = [
    { name: '전설 예둔', bonus: 44 },
    { name: '유물 예둔', bonus: 52 }
  ].map(row => {
    const eff = keenEfficiency(current, row.bonus);
    const recommend = eff >= 16;
    return `<div class="keenCard ${recommend ? 'recommend' : 'normal'}">
      <div><b>${row.name}</b><span>치명타 피해 +${row.bonus}% / 평균 페널티 0.98 적용</span></div>
      <strong>${eff.toFixed(2)}%</strong>
      <em>${recommend ? '추천' : '비추천'}</em>
    </div>`;
  }).join('');
  const crit = Math.max(0, Math.min(100, Number(current?.result?.effectiveCritRate ?? current?.result?.critRate ?? 0)));
  el.innerHTML = `<div class="keenNote">계산 기준: 실제 치적 ${crit.toFixed(2)}% / 치피 ${Number(current?.result?.critDamage || 0).toFixed(2)}%</div>${rows}`;
}
function shortNodeName(name) {
  const map = {
    '끝없는 마나': '끝마',
    '금단의 주문': '금주',
    '무한한 마력': '무마',
    '예리한 감각': '예감',
    '한계 돌파': '한돌',
    '최적화 훈련': '최훈'
  };
  return map[name] || name;
}
function shortNodeLabel(name, level) {
  return `${shortNodeName(name)} Lv.${level}`;
}
function tier4PairLabel(names) {
  return (names || []).filter(Boolean).join(' + ') || '-';
}
function sameNameSet(a, b) {
  const aa = [...(a || [])].sort().join('|');
  const bb = [...(b || [])].sort().join('|');
  return aa === bb;
}

function tier5NameFromSelection(selection) {
  return selectedEntries(selection || {}).find(row => Number(row.tier) === 5)?.name || '';
}

function practicalRecommendationFor(fiveName, calc, selection) {
  return calculatePracticalRecommendationScore({
    expectedValue: calc?.result?.value,
    rawCritRate: calc?.result?.critRate,
    fiveName,
    selection,
    singleHitMainSkill: Boolean($('singleHitMainSkill')?.checked),
    manaShortageClass: Boolean($('manaShortageClass')?.checked),
    noManaMainSkill: Boolean($('noManaMainSkill')?.checked)
  });
}

function practicalAdjustmentParts(adjustment) {
  const parts = [];
  if (adjustment?.critLowPenalty > 0) parts.push(`치적 95% 미만 -${fmt(adjustment.critLowPenalty)}%`);
  if (adjustment?.critOverPenalty > 0) parts.push(`유효 치적 상한 초과 -${fmt(adjustment.critOverPenalty)}%`);
  if (adjustment?.singleHitPenalty > 0) parts.push(`단타 뭉가 -${fmt(adjustment.singleHitPenalty)}%`);
  if (adjustment?.manaStabilityBonus > 0) parts.push(`마나 안정성 +${fmt(adjustment.manaStabilityBonus)}%`);
  return parts;
}

function manaConditionNoteText(calc) {
  const notes = calc?.stats?.manaConditionNotes || [];
  const text = [...new Set(notes.map(x => x.note).filter(Boolean))].join(' · ');
  return text;
}
function candidateMemo(tier2Entries, fourNames, fiveName, calc) {
  const bits = [];
  if (hasSameTier245(state.selected, tier2Entries, fourNames, fiveName)) bits.push('현재 조합');
  else bits.push(`${tier4PairLabel(fourNames)} / ${fiveName}`);
  if (calc?.result?.convertedEvolutionDamage > 0) bits.push(`뭉가 전환 ${fmt(calc.result.convertedEvolutionDamage)}%(기본 포함 총 ${fmt(calc.result.convertedEvolutionDamage + 15)}%)`);
  if (Boolean($('excludeCooldown')?.checked) && (calc?.result?.cooldownReduction || 0) === 0) bits.push('쿨감 제외');
  const manaNote = manaConditionNoteText(calc);
  if (manaNote) bits.push(manaNote);
  if (calc?.result?.sonicBreakEvolutionDamage > 0) bits.push(`음속 진피 ${fmt(calc.result.sonicBreakEvolutionDamage)}%`);
  if (fiveName === '입식 타격가') bits.push('6중첩 최대 기준');
  if (fiveName === '마나 용광로') bits.push('마나 계수 최대 기준');
  return bits.join(' / ');
}
function tier2ChipHtml(entries) {
  return (entries || []).map(x => `<b class="miniChip">${escapeHtml(shortNodeLabel(x.name, x.level))}</b>`).join('');
}
function tier2Allocations(options) {
  const out = [];
  function walk(i, remain, picked) {
    if (i >= options.length) {
      if (remain === 0 && picked.length) out.push(picked.map(x => ({ ...x })));
      return;
    }
    const name = options[i];
    const node = getNode(name);
    const max = Math.min(Number(node?.maxLevel || 0), remain);
    for (let lv = 0; lv <= max; lv++) {
      if (lv > 0) picked.push({ name, level: lv });
      walk(i + 1, remain - lv, picked);
      if (lv > 0) picked.pop();
    }
  }
  walk(0, 3, []); // 2티어 30P = 10P × 3레벨
  return out;
}
function hasSameTier245(selection, tier2Entries, fourNames, fiveName) {
  const selected2 = selectedEntries(selection).filter(row => Number(row.tier) === 2).map(row => ({ name: row.name, level: Number(row.level) }));
  const selected4 = selectedEntries(selection).filter(row => Number(row.tier) === 4).map(row => row.name);
  const selected5 = selectedEntries(selection).filter(row => Number(row.tier) === 5).map(row => row.name);
  const a = [...selected2].sort((x,y) => x.name.localeCompare(y.name));
  const b = [...tier2Entries].sort((x,y) => x.name.localeCompare(y.name));
  const same2 = a.length === b.length && a.every((x,i) => x.name === b[i].name && x.level === b[i].level);
  return same2 && sameNameSet(fourNames, selected4) && selected5.includes(fiveName);
}
function candidateTag(c) {
  const tags = [];
  if (hasSameTier245(state.apiSelected, c.tier2Entries, c.fourNames, c.fiveName)) tags.push('<em class="apiTag">API</em>');
  if (hasSameTier245(state.selected, c.tier2Entries, c.fourNames, c.fiveName)) tags.push('<em class="currentTag">현재</em>');
  return tags.join('');
}
function practicalNoteHtml(candidate) {
  const parts = practicalAdjustmentParts(candidate);
  return parts.length ? `<div class="practicalNote">${escapeHtml(parts.join(' · '))}</div>` : '';
}
function calculateAndRender() {
  const current = statsWithSelection(state.selected);
  const apiSelection = Object.keys(state.apiSelected || {}).length ? state.apiSelected : state.selected;
  const apiBase = statsWithSelection(apiSelection);
  renderCombatStats(current);
  renderKeenEfficiency(current);
  const apiBaseValue = Number(apiBase.result.value || 0);
  const currentValue = Number(current.result.value || 0);
  const noManaMainSkill = Boolean($('noManaMainSkill')?.checked);
  const manaShortageClass = Boolean($('manaShortageClass')?.checked) && !noManaMainSkill;
  const apiAdjustment = practicalRecommendationFor(tier5NameFromSelection(apiSelection), apiBase, apiSelection);
  const currentAdjustment = practicalRecommendationFor(tier5NameFromSelection(state.selected), current, state.selected);
  const apiPracticalValue = Number(apiAdjustment.value);
  const currentPracticalValue = Number(currentAdjustment.value);
  const baseValue = apiPracticalValue > 0 ? apiPracticalValue : (apiBaseValue || currentPracticalValue || currentValue || 1);
  const currentDiff = ((currentPracticalValue / baseValue) - 1) * 100;
  const candidates = [];
  const excludeCooldown = isCooldownExcluded();
  const shareInput = $('mainSkillDamageShare');
  const shareControl = document.querySelector('.shareControl');
  if (shareInput) {
    shareInput.disabled = excludeCooldown;
    shareInput.dataset.effectiveValue = excludeCooldown ? '0' : String(Math.max(0, Math.min(Number(shareInput.value || 60), 100)));
  }
  if (shareControl) shareControl.classList.toggle('disabled', excludeCooldown);
  // 효과 데이터가 없는 서포터 노드는 딜러 추천에서 제외합니다.
  const tier2Options = allOptions(2).filter(name => {
    if (!getNode(name) || name === '축복의 여신') return false;
    if (excludeCooldown && hasCooldownEffect(name)) return false;
    if (noManaMainSkill && MANA_SKILL_NODE_NAMES.includes(name)) return false;
    return true;
  });
  const tier2Candidates = tier2Allocations(tier2Options);
  const hasDealerEffect = name => Object.keys(getNode(name)?.levels || {}).length > 0;
  const tier4Options = allOptions(4).filter(hasDealerEffect);
  const tier5Options = allOptions(5).filter(name => hasDealerEffect(name) && !((noManaMainSkill || manaShortageClass) && name === '마나 용광로'));

  const tier4Pairs = [];
  for (let i = 0; i < tier4Options.length; i++) {
    for (let j = i + 1; j < tier4Options.length; j++) tier4Pairs.push([tier4Options[i], tier4Options[j]]);
  }

  for (const tier2Entries of tier2Candidates) {
    for (const fourNames of tier4Pairs) {
      const fourLevel = 1;
      for (const fiveName of tier5Options) {
        if (excludeCooldown && hasCooldownCandidate(tier2Entries, fourNames, fiveName)) continue;
        const fiveNode = getNode(fiveName);
        const fiveLevel = fiveNode?.maxLevel || 2;
        // 추천 계산에서 현재 2/4/5티어만 제거하고 후보 조합을 삽입. 1/3티어와 입력값은 유지.
        const next = selectionWithoutTiers(state.selected, [2, 4, 5]);
        for (const e of tier2Entries) next[e.name] = { level: e.level, source: 'candidate' };
        for (const fourName of fourNames) next[fourName] = { level: fourLevel, source: 'candidate' };
        next[fiveName] = { level: fiveLevel, source: 'candidate' };
        const calc = statsWithSelection(next);
        const adjustment = practicalRecommendationFor(fiveName, calc, next);
        const adjustedValue = Number(adjustment.value);
        const recValue = Number.isFinite(adjustedValue) ? adjustedValue : Number(calc.result.value || 0);
        candidates.push({
          tier2Entries, fourNames, fourLevel, fiveName, fiveLevel, calc, recValue,
          expectedValue: Number(calc.result.value || 0),
          singleHitPenalty: adjustment.singleHitPenalty,
          critOverPenalty: adjustment.critOverPenalty,
          critLowPenalty: adjustment.critLowPenalty,
          manaStabilityBonus: adjustment.manaStabilityBonus,
          diff: ((recValue / baseValue) - 1) * 100
        });
      }
    }
  }
  candidates.sort((a, b) => b.recValue - a.recValue);
  const top = candidates.slice(0, 5);
  const currentDiffText = `${currentDiff >= 0 ? '+' : ''}${currentDiff.toFixed(2)}%`;
  const apiManaConditionNote = manaConditionNoteText(apiBase);
  const currentManaConditionNote = manaConditionNoteText(current);
  const apiPracticalParts = [...practicalAdjustmentParts(apiAdjustment), ...(apiManaConditionNote ? [apiManaConditionNote] : [])];
  const currentPracticalParts = [...practicalAdjustmentParts(currentAdjustment), ...(currentManaConditionNote ? [currentManaConditionNote] : [])];
  const apiPracticalLabel = `<small>실전 ${apiAdjustment.value.toFixed(4)}${apiPracticalParts.length ? ` · ${escapeHtml(apiPracticalParts.join(' · '))}` : ''}</small>`;
  const currentPracticalLabel = `<small>실전 ${currentAdjustment.value.toFixed(4)}${currentPracticalParts.length ? ` · ${escapeHtml(currentPracticalParts.join(' · '))}` : ''}</small>`;
  $('currentScore').innerHTML = `<div class="apiBaselineRow">
    <div><span>API 기대값</span><b>${apiBaseValue.toFixed(4)}</b>${apiPracticalLabel}</div>
    <div><span>현재 기대값</span><b>${currentValue.toFixed(4)}</b>${currentPracticalLabel}</div>
    <div><span>실전값 API 대비</span><b class="${currentDiff >= 0 ? 'up' : 'down'}">${currentDiffText}</b></div>
    <p>기대값은 피해 공식만 계산하고, 실전 추천값은 치적 안정성·단타 주력기·마나 부족 설정을 별도 반영합니다.</p>
  </div>`;
  const apiManaDetail = apiManaConditionNote ? ` · ${escapeHtml(apiManaConditionNote)}` : '';
  $('baseInfo').innerHTML = `<b>API 기준 상세</b><span>치명 ${Math.round(apiBase.stats.critStat || 0)} · 최종치적 ${fmt(apiBase.result.critRate)}% · 치피 ${fmt(apiBase.result.critDamage)}% · 치적주피 ${fmt(apiBase.result.critHitDamage)}% · 진피 ${fmt(apiBase.result.evo)}% · 추피 ${fmt(apiBase.result.additionalDamage)}% · 적주피 ${fmt(apiBase.result.enemyDamage)}% · 공증 ${fmt(apiBase.result.attackPower)}%${apiManaDetail}</span>`;
  $('recommendList').innerHTML = top.length ? `<div class="comboRows">${top.map((c, i) => {
    const cls = c.diff >= 0 ? 'up' : 'down';
    const memo = candidateMemo(c.tier2Entries, c.fourNames, c.fiveName, c.calc);
    return `<article class="comboRow ${i === 0 ? 'best' : ''}">
      <div class="rankBadge">${i + 1}</div>
      <div class="rowBuild">
        <div class="buildMain">
          <div class="tierLine tier2Line"><span>2T</span><strong class="chipWrap">${tier2ChipHtml(c.tier2Entries)}</strong></div>
          <div class="tierLine"><span>4T</span><strong>${escapeHtml(tier4PairLabel(c.fourNames))}</strong></div>
          <div class="tierLine"><span>5T</span><strong class="nodePill">${escapeHtml(c.fiveName)} Lv.${c.fiveLevel}</strong>${candidateTag(c)}</div>
        </div>
        <div class="comboMemo">${escapeHtml(memo)}</div>
        ${practicalNoteHtml(c)}
      </div>
      <div class="rowMetrics">
        <div class="rowMetric"><span>실전 추천값</span><b>${c.recValue.toFixed(4)}</b><small>기대값 ${c.expectedValue.toFixed(4)}</small></div>
        <div class="rowMetric"><span>실전 API 대비</span><b class="${cls}">${pct(c.diff)}</b></div>
        <div class="rowMetric"><span>치적</span><b>${fmt(c.calc.result.critRate)}%</b></div>
      </div>
    </article>`;
  }).join('')}</div>` : `<div class="emptyNotice">추천 가능한 2/4/5티어 조합이 없습니다. 쿨감 효과 제외 상태에서는 끝없는 마나/최적화 훈련 등 쿨감 노드가 추천 후보에서 제거됩니다.</div>`;
}

async function loadDb() {
  state.evolution = await fetch('/data/evolution.json').then(r => r.json());
  state.index = buildIndex(state.evolution);
  state.selected = defaultSelection();
  state.apiSelected = JSON.parse(JSON.stringify(state.selected));
  renderEvolutionTiers();
  calculateAndRender();
}

function syncAdrenalineControlsFromEngraving() {
  const adr = state.engraving?.adrenaline || { adopted: false, critRate: 0, attackPower: 0 };
  if ($('adrenalineEnabled')) $('adrenalineEnabled').checked = !!adr.adopted;
  if ($('adrenalineBookLevel')) $('adrenalineBookLevel').value = String(clampRelicBookLevel(adr.bookLevel ?? adr.level ?? 0));
  populateAdrenalineReplacementOptions(true);
  updateAdrenalineReplacementVisibility();
}

function updateAdrenalineReplacementVisibility() {
  const wrap = $('adrenalineReplacementWrap');
  if (!wrap) return;
  const originalHasAdrenaline = !!state.engraving?.adrenaline?.adopted;
  const showReplacement = !$('adrenalineEnabled')?.checked || !originalHasAdrenaline;
  wrap.classList.toggle('hidden', !showReplacement);
  updateEngravingControlPreviews();
}

async function requestCharacterData(name, maxAttempts = 2) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetch(`/api/character?name=${encodeURIComponent(name)}&_=${Date.now()}`, { cache: 'no-store' });
      const body = await res.text();
      let data = null;
      try { data = body ? JSON.parse(body) : null; } catch {}
      if (res.ok && data?.ok) return data;

      const error = new Error(data?.error || data?.message || `캐릭터 검색 서버 오류 (${res.status})`);
      error.retryable = !data || res.status === 429 || res.status >= 500;
      throw error;
    } catch (error) {
      lastError = error;
      const retryable = error?.retryable || error instanceof TypeError;
      if (!retryable || attempt >= maxAttempts) throw error;
      await new Promise(resolve => setTimeout(resolve, 800 * attempt));
    }
  }
  throw lastError || new Error('검색 실패');
}

async function searchCharacter(name) {
  const button = $('searchButton');
  button.disabled = true; button.textContent = '검색...'; setMessage('');
  // 이전 검색 결과가 남아 보이지 않도록 검색 시작 시 화면을 먼저 비웁니다.
  document.body.classList.remove('calculatorReady');
  $('characterCard').classList.add('hidden');
  $('characterCard').innerHTML = '';
  $('powerSnapshotPanel')?.classList.add('hidden');
  if ($('powerSnapshotView')) $('powerSnapshotView').innerHTML = '';
  $('summaryPanel').classList.add('hidden');
  state.selected = {};
  state.apiSelected = {};
  state.powerSnapshot = null;
  state.powerCostEstimates = [];
  state.abilityStone = { attackPower: 0, effects: { critRate: 0, critDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0, conditionalDamage: 0 }, engravings: [], items: [] };
  state.engraving = emptyEngravingState();
  state.arkGrid = { critRate: 0, critDamage: 0, attackSpeed: 0, moveSpeed: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
  state.enlightenment = { critRate: 0, critDamage: 0, critHitDamage: 0, evolutionDamage: 0, enemyDamage: 0, additionalDamage: 0, attackSpeed: 0, moveSpeed: 0, items: [] };
  simulatorRendered = false;
  document.body.classList.remove('simulatorMode');
  try {
    const data = await requestCharacterData(name);
    if (!data.profile?.CharacterName) throw new Error('캐릭터 프로필을 가져오지 못했습니다.');
    state.accessory = data.accessoryEffects || { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
    state.bracelet = data.braceletEffects || { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
    state.abilityStone = data.abilityStoneEffects || { attackPower: 0, effects: { critRate: 0, critDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0, conditionalDamage: 0 }, engravings: [], items: [] };
    state.engraving = data.engravingEffects || emptyEngravingState();
    state.arkGrid = data.arkGridEffects || { critRate: 0, critDamage: 0, attackSpeed: 0, moveSpeed: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
    state.powerSnapshot = data.powerSnapshot || null;
    if (state.powerSnapshot?.profile && !state.powerSnapshot.profile.secondClass) {
      state.powerSnapshot.profile.secondClass = data.arkPassive?.Title || '';
    }
    syncAdrenalineControlsFromEngraving();
    renderCharacter(data.profile, data.arkPassive);
    state.foundEffects = readEffects(data.arkPassive);
    state.enlightenment = extractEnlightenmentEffects(state.foundEffects);
    state.selected = classifyEvolution(state.foundEffects);
    state.apiSelected = JSON.parse(JSON.stringify(state.selected));
    applyProfileDefaults(data.profile, state.selected);
    renderPowerSnapshot(state.powerSnapshot);
    renderEvolutionTiers();
    renderSummary(data.profile, data.arkPassive);
    calculateAndRender();
    if (!Object.keys(state.selected).length) setMessage('캐릭터 정보는 갱신됐지만 API에서 진화 노드를 읽지 못했습니다. 노드는 직접 선택해 주세요.');
  } catch (error) { setMessage(error.message); }
  finally { button.disabled = false; button.textContent = '검색'; }
}

$('searchForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('characterName').value.trim();
  if (!name) return setMessage('캐릭터명을 입력하세요.');
  searchCharacter(name);
});
$('simulatorBackButton')?.addEventListener('click', closeSimulatorPage);
['extraCritRate','extraCritDamage','extraEvolutionDamage','extraAdditionalDamage','extraEnemyDamage','extraAttackSpeed','extraMoveSpeed'].forEach(id => $(id).addEventListener('input', calculateAndRender));
$('adrenalineEnabled').addEventListener('change', () => { updateAdrenalineReplacementVisibility(); calculateAndRender(); });
$('adrenalineBookLevel')?.addEventListener('change', () => { updateEngravingControlPreviews(); calculateAndRender(); });
$('adrenalineReplacementName')?.addEventListener('change', () => {
  const item = engravingItemByName($('adrenalineReplacementName').value);
  $('adrenalineReplacementBookLevel').value = String(clampRelicBookLevel(item?.bookLevel ?? 0));
  updateEngravingControlPreviews();
  calculateAndRender();
});
$('adrenalineReplacementBookLevel')?.addEventListener('change', () => { updateEngravingControlPreviews(); calculateAndRender(); });
$('critSynergyEnabled').addEventListener('change', calculateAndRender);
$('backAttackEnabled').addEventListener('change', calculateAndRender);
$('excludeCooldown')?.addEventListener('change', calculateAndRender);
$('noManaMainSkill')?.addEventListener('change', calculateAndRender);
$('singleHitMainSkill')?.addEventListener('change', calculateAndRender);
$('manaShortageClass')?.addEventListener('change', calculateAndRender);
$('mainSkillDamageShare')?.addEventListener('input', calculateAndRender);


const LOSTARK_JOBS = [
  '버서커','디스트로이어','워로드','홀리나이트','슬레이어','발키리',
  '배틀마스터','인파이터','기공사','창술사','스트라이커','브레이커',
  '데빌헌터','블래스터','호크아이','스카우터','건슬링어',
  '바드','서머너','아르카나','소서리스',
  '블레이드','데모닉','리퍼','소울이터',
  '도화가','기상술사','환수사','차원술사',
  '가디언나이트'
];

const LOSTARK_JOB_GROUPS = [
  { group: '전사', jobs: ['디스트로이어','발키리','버서커','슬레이어','워로드','홀리나이트'] },
  { group: '무도가', jobs: ['배틀마스터','인파이터','기공사','창술사','스트라이커','브레이커'] },
  { group: '헌터', jobs: ['데빌헌터','블래스터','호크아이','스카우터','건슬링어'] },
  { group: '마법사', jobs: ['바드','서머너','아르카나','소서리스'] },
  { group: '암살자', jobs: ['블레이드','데모닉','리퍼','소울이터'] },
  { group: '스페셜리스트', jobs: ['도화가','기상술사','환수사','차원술사'] },
  { group: '오리지널', jobs: ['가디언나이트'] }
];


function formatGold(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return '-';
  const digits = n < 1 ? 4 : n < 10 ? 2 : 0;
  return `${n.toLocaleString('ko-KR', { maximumFractionDigits: digits })}G`;
}

let selectedMarketTab = 'accessory';
let lostarkNoticeLoaded = false;
const marketListLoadState = { gem: 'idle', engraving: 'idle', material: 'idle' };

function setActiveTab(tabName) {
  document.querySelectorAll('.tabButton').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
  const isMarket = tabName === 'market';
  const isAvatar = isMarket && selectedMarketTab === 'avatar';
  document.body.classList.remove('simulatorMode');
  $('powerSnapshotPanel')?.classList.add('hidden');
  document.body.classList.toggle('marketMode', isMarket);
  document.body.classList.toggle('avatarMode', isAvatar);
  document.querySelectorAll('.calcTabPanel').forEach(el => {
    el.classList.toggle('hiddenByTab', isMarket);
    el.style.display = isMarket ? 'none' : '';
  });
  const marketPanel = $('marketPanel');
  if (marketPanel) {
    marketPanel.classList.toggle('hidden', !isMarket);
    marketPanel.classList.toggle('hiddenByTab', !isMarket);
    marketPanel.style.display = isMarket ? '' : 'none';
  }
  const avatarPanel = $('legendAvatarPanel');
  if (avatarPanel) {
    avatarPanel.classList.toggle('hidden', !isAvatar);
    avatarPanel.classList.toggle('hiddenByTab', !isAvatar);
    avatarPanel.style.display = isAvatar ? '' : 'none';
  }
  if (isMarket) {
    loadLostarkNoticeCard();
    renderMarketSubTab();
    preloadMarketPriceLists();
  }
  if (isAvatar) prepareLegendAvatarTab();
}

function renderMarketSubTab() {
  document.querySelectorAll('.marketSubButton').forEach(btn => btn.classList.toggle('active', btn.dataset.marketTab === selectedMarketTab));
  const panels = {
    accessory: $('marketAccessoryPanel'),
    engraving: $('marketEngravingPanel'),
    gem: $('marketGemPanel'),
    material: $('marketMaterialPanel'),
  };
  Object.entries(panels).forEach(([key, el]) => {
    if (!el) return;
    el.classList.toggle('hidden', selectedMarketTab !== key);
    el.style.display = selectedMarketTab === key ? '' : 'none';
  });
  const avatarPanel = $('legendAvatarPanel');
  const isAvatar = selectedMarketTab === 'avatar' && document.body.classList.contains('marketMode');
  document.body.classList.toggle('avatarMode', isAvatar);
  if (avatarPanel) {
    avatarPanel.classList.toggle('hidden', !isAvatar);
    avatarPanel.style.display = isAvatar ? '' : 'none';
  }
  if (isAvatar) prepareLegendAvatarTab();
  autoLoadMarketSubTab();
}

function autoLoadMarketSubTab() {
  if (!document.body.classList.contains('marketMode')) return;
  if (selectedMarketTab === 'gem') loadMarketGemList();
  if (selectedMarketTab === 'engraving') loadMarketEngravingList();
  if (selectedMarketTab === 'material') loadMarketMaterialList();
}

function preloadMarketPriceLists() {
  loadMarketEngravingList();
  loadMarketGemList();
  loadMarketMaterialList();
}

function initMarketTabs() {
  document.querySelectorAll('.marketSubButton').forEach(btn => btn.addEventListener('click', () => {
    selectedMarketTab = btn.dataset.marketTab || 'accessory';
    renderMarketSubTab();
  }));
}

let legendAvatarCache = new Map();
let selectedAvatarJob = null;
let legendAvatarLoading = false;

function initLegendAvatarTab() {
  renderAvatarJobPicker();
  initMarketTabs();
  document.querySelectorAll('.tabButton').forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));
  $('avatarSearchAllButton')?.addEventListener('click', () => prepareLegendAvatarTab());
  $('avatarRefreshButton')?.addEventListener('click', () => { if (selectedAvatarJob) loadLegendAvatarSet(selectedAvatarJob, true); });
}

function renderAvatarJobPicker() {
  const wrap = $('avatarJobPicker');
  if (!wrap) return;
  wrap.innerHTML = LOSTARK_JOB_GROUPS.map(group => `
    <div class="avatarJobRow">
      <div class="avatarJobGroupName">${escapeHtml(group.group)}</div>
      <div class="avatarJobButtonList">
        ${group.jobs.map(job => `<button type="button" class="avatarJobButton ${job === selectedAvatarJob ? 'active' : ''}" data-avatar-job="${escapeHtml(job)}">${escapeHtml(job)}</button>`).join('')}
      </div>
    </div>
  `).join('');
  wrap.querySelectorAll('[data-avatar-job]').forEach(btn => btn.addEventListener('click', () => selectAvatarJob(btn.dataset.avatarJob)));
}

function selectAvatarJob(job) {
  selectedAvatarJob = job || null;
  renderAvatarJobPicker();
  if (!selectedAvatarJob) return;
  loadLegendAvatarSet(selectedAvatarJob, false);
}

function setAvatarMessage(text, isError = false) {
  const el = $('avatarMessage');
  if (!el) return;
  if (!text) { el.classList.add('hidden'); el.textContent = ''; return; }
  el.classList.remove('hidden');
  el.classList.toggle('error', !!isError);
  el.textContent = text;
}

function prepareLegendAvatarTab() {
  setAvatarMessage('직업을 선택하면 해당 직업의 머리/상의/하의/무기 최저가를 조회합니다. 계산기 화면은 숨긴 상태로 분리 표시됩니다.');
  if ($('avatarResult')) $('avatarResult').innerHTML = `<div class="avatarEmptyBox">직업 버튼을 선택하세요.</div>`;
}

async function readJsonSafely(res) {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch {
    const preview = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
    throw new Error(preview || `서버 응답이 JSON 형식이 아닙니다. HTTP ${res.status}`);
  }
}

function avatarPartCard(part, item) {
  if (!item) {
    return `<article class="avatarPart missing"><div class="avatarThumb empty">?</div><div><b>${escapeHtml(part)}</b><span>매물 없음</span><small>현재 조회 범위에서 ${escapeHtml(part)} 부위를 찾지 못했습니다.</small></div></article>`;
  }
  const icon = item.icon ? `<img src="${escapeHtml(item.icon)}" alt="" loading="lazy" />` : `<span>${escapeHtml(part.slice(0, 1))}</span>`;
  const pheonText = Number(item.pheonCost || 0) > 0 ? ` · ${Number(item.pheonCost).toLocaleString('ko-KR')}페온` : '';
  const tradeText = item.tradeRemainCount != null ? `거래 ${Number(item.tradeRemainCount || 0).toLocaleString('ko-KR')}회` : '';
  return `<article class="avatarPart">
    <div class="avatarThumb">${icon}</div>
    <div class="avatarPartInfo">
      <b>${escapeHtml(part)}</b>
      <span>${formatGold(item.price)}</span>
      <small>${escapeHtml(`${item.name || '-'}${tradeText ? ` · ${tradeText}` : ''}${pheonText}`)}</small>
    </div>
  </article>`;
}

function renderLegendAvatarResult(data) {
  const parts = data.parts || {};
  const order = ['머리', '상의', '하의', '무기'];
  const missing = order.filter(part => !parts[part]);
  $('avatarResult').innerHTML = `<div class="avatarTotalBox">
    <div>
      <span>${escapeHtml(data.job)} 전설 아바타 한 벌 최저가</span>
      <strong>${formatGold(data.totalPrice)}</strong>
      <small>${data.complete ? '머리/상의/하의/무기 모두 확인됨' : `미확인 부위: ${escapeHtml(missing.join(', '))}`}</small>
    </div>
    <div class="avatarScanInfo">조회 매물 ${Number(data.scanned || 0).toLocaleString('ko-KR')}개 · 상세 확인 ${Number(data.detailScanned || 0).toLocaleString('ko-KR')}개${data.cached ? ' · 캐시' : ''}</div>
  </div>
  <div class="avatarPartGrid">${order.map(part => avatarPartCard(part, parts[part])).join('')}</div>
  <p class="avatarNotice">현재 거래소 등록 매물의 최저가 기준입니다. 세트명은 섞일 수 있고, 각 부위별 최저가만 합산합니다.</p>`;
}

async function loadLegendAvatarSet(job, force = false) {
  if (!job) return prepareLegendAvatarTab();
  if (!force && legendAvatarCache.has(job)) {
    renderLegendAvatarResult(legendAvatarCache.get(job));
    setAvatarMessage(`${job} 전설 아바타 시세를 캐시에서 표시했습니다.`);
    return;
  }
  if (legendAvatarLoading) return;
  const mainButton = $('avatarSearchAllButton');
  const refreshButton = $('avatarRefreshButton');
  if (mainButton) mainButton.disabled = true;
  if (refreshButton) refreshButton.disabled = true;
  legendAvatarLoading = true;
  setAvatarMessage(`${job} 전설 아바타 시세를 부위별로 조회하는 중입니다.`);

  const order = ['머리', '상의', '하의', '무기'];
  const partial = {
    ok: true,
    apiVersion: VERSION,
    source: 'markets/items',
    mode: 'part-split',
    job,
    parts: { 머리: null, 상의: null, 하의: null, 무기: null },
    totalPrice: 0,
    complete: false,
    scanned: 0,
    detailScanned: 0,
    matchedCount: 0,
    matched: []
  };
  renderLegendAvatarResult(partial);

  try {
    const settled = await Promise.allSettled(order.map(async (part) => {
      const url = `/api/legend-avatars?job=${encodeURIComponent(job)}&part=${encodeURIComponent(part)}${force ? '&force=1' : ''}&_=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await readJsonSafely(res);
      if (!res.ok || !data?.ok) throw new Error(data?.error || data?.message || `${part} 조회 실패`);
      return { part, data };
    }));

    for (const row of settled) {
      if (row.status !== 'fulfilled') continue;
      const { part, data } = row.value;
      partial.parts[part] = data.item || data.parts?.[part] || null;
      partial.scanned += Number(data.scanned || 0);
      partial.detailScanned += Number(data.detailScanned || 0);
    }
    partial.totalPrice = Object.values(partial.parts).reduce((sum, item) => sum + Number(item?.price || 0), 0);
    partial.complete = order.every(part => !!partial.parts[part]);
    partial.matched = Object.values(partial.parts).filter(Boolean);
    partial.matchedCount = partial.matched.length;
    legendAvatarCache.set(job, partial);
    renderLegendAvatarResult(partial);

    const failed = settled.filter(x => x.status === 'rejected').length;
    setAvatarMessage(`${job} 조회 완료${partial.complete ? '' : ' · 일부 부위는 조회 범위에서 찾지 못했습니다.'}${failed ? ` · ${failed}개 부위 조회 실패` : ''}`, failed > 0);
  } catch (error) {
    setAvatarMessage(error.message, true);
  } finally {
    legendAvatarLoading = false;
    if (mainButton) mainButton.disabled = false;
    if (refreshButton) refreshButton.disabled = false;
  }
}

async function loadAllLegendAvatarSets(force = false, showJob = selectedAvatarJob) {
  return loadLegendAvatarSet(showJob, force);
}

async function searchLegendAvatarSet(job) {
  selectedAvatarJob = job || selectedAvatarJob;
  return loadLegendAvatarSet(selectedAvatarJob, false);
}





const MARKET_ACCESSORY_RULES = {
  necklace: { label: '목걸이', range: '17322~17857', primary: '적주피', secondary: '추피', combos: { highHigh: '적주피 상 + 추피 상', highMid: '적주피 상 + 추피 중', reverseHighMid: '적주피 중 + 추피 상' } },
  earring: { label: '귀걸이', range: '13450~13889', primary: '공격력', secondary: '무공', combos: { highHigh: '공격력 상 + 무공 상', highMid: '공격력 상 + 무공 중', reverseHighMid: '공격력 중 + 무공 상' } },
  ring: { label: '반지', range: '12450~12897', primary: '치피', secondary: '치적', combos: { highHigh: '치피 상 + 치적 상', highMid: '치피 상 + 치적 중', reverseHighMid: '치피 중 + 치적 상' } }
};

function initMarketPriceTab() {
  $('accSearchButton')?.addEventListener('click', searchMarketAccessory);
  $('gemListButton')?.addEventListener('click', () => loadMarketGemList(true));
  $('engravingListButton')?.addEventListener('click', () => loadMarketEngravingList(true));
  $('materialListButton')?.addEventListener('click', () => loadMarketMaterialList(true));
  $('accPartSelect')?.addEventListener('change', renderAccessoryRuleHint);
  $('accComboSelect')?.addEventListener('change', renderAccessoryRuleHint);
  renderAccessoryRuleHint();
}

async function loadLostarkNoticeCard(force = false) {
  const cards = document.querySelectorAll('.lostarkNoticeCard');
  if (!cards.length || (lostarkNoticeLoaded && !force)) return;
  lostarkNoticeLoaded = true;
  try {
    const data = await fetchMarketJson(`/api/lostark-news?_=${Date.now()}`);
    renderLostarkNoticeCard(data);
  } catch (error) {
    const html = `<a class="lostarkNoticeLink warning" href="https://lostark.game.onstove.com/News/Notice/List" target="_blank" rel="noopener">
      <span class="lostarkNoticeBadge">공지</span>
      <strong>로아 공홈 공지사항</strong>
      <small>${escapeHtml(error.message || '공식 공지 목록으로 이동')}</small>
    </a>`;
    cards.forEach(card => { card.innerHTML = html; });
  }
}

function renderLostarkNoticeCard(data) {
  const cards = document.querySelectorAll('.lostarkNoticeCard');
  if (!cards.length) return;
  const item = data?.featured || {};
  const title = item.title || '로아 공홈 공지사항';
  const url = item.url || data?.sourceUrl || 'https://lostark.game.onstove.com/News/Notice/List';
  const category = item.category || '공지';
  const meta = [item.views ? `조회 ${item.views}` : '', item.date || '', data?.cached ? '캐시' : '공식'].filter(Boolean).join(' · ');
  const html = `<a class="lostarkNoticeLink" href="${escapeHtml(url)}" target="_blank" rel="noopener">
    <span class="lostarkNoticeBadge">${escapeHtml(category)}</span>
    <strong>${escapeHtml(title)}</strong>
    <small>${escapeHtml(meta || '공식 홈페이지')}</small>
  </a>`;
  cards.forEach(card => { card.innerHTML = html; });
}

function renderAccessoryRuleHint() {
  const part = $('accPartSelect')?.value || 'necklace';
  const combo = $('accComboSelect')?.value || 'highHigh';
  const rule = MARKET_ACCESSORY_RULES[part] || MARKET_ACCESSORY_RULES.necklace;
  const hint = $('accRuleHint');
  if (!hint) return;
  hint.textContent = `${rule.label} · ${rule.combos[combo] || rule.combos.highHigh}`;
}

async function searchMarketAccessory() {
  const button = $('accSearchButton');
  const resultEl = $('accMarketResult');
  const part = $('accPartSelect')?.value || 'necklace';
  const combo = $('accComboSelect')?.value || 'highHigh';
  if (button) { button.disabled = true; button.textContent = '검색 중'; }
  if (resultEl) resultEl.innerHTML = '악세 후보 인덱스를 갱신하고 선택 옵션 최저가를 확인하는 중입니다.';
  try {
    const url = `/api/market-prices?mode=accessory&part=${encodeURIComponent(part)}&combo=${encodeURIComponent(combo)}&_=${Date.now()}`;
    const data = await fetchMarketJson(url);
    renderMarketResults(resultEl, data, `${data.partLabel || '악세'} · ${data.comboLabel || ''}`, data.targetOptions?.map(o => `${o.label} ${Number(o.value).toFixed(2)}%`).join(' / '));
  } catch (error) {
    renderMarketError(resultEl, error.message);
  } finally {
    if (button) { button.disabled = false; button.textContent = '악세 검색'; }
  }
}

async function loadMarketGemList(force = false) {
  if (!force && marketListLoadState.gem === 'loaded') return;
  if (!force && marketListLoadState.gem === 'loading') return;
  marketListLoadState.gem = 'loading';
  const button = $('gemListButton');
  const resultEl = $('gemMarketResult');
  if (button) { button.disabled = true; button.textContent = '조회 중'; }
  if (resultEl) resultEl.innerHTML = '경매장에서 5~10레벨 겁화/작열 최저가를 조회하는 중입니다.';
  try {
    const data = await fetchMarketJson(`/api/market-prices?mode=gemList${force ? '&force=1' : ''}&_=${Date.now()}`);
    renderGemPriceGrid(resultEl, data);
    marketListLoadState.gem = 'loaded';
  } catch (error) {
    marketListLoadState.gem = 'idle';
    renderMarketError(resultEl, error.message);
  } finally {
    if (button) { button.disabled = false; button.textContent = '새로고침'; }
  }
}

async function loadMarketEngravingList(force = false) {
  if (!force && marketListLoadState.engraving === 'loaded') return;
  if (!force && marketListLoadState.engraving === 'loading') return;
  marketListLoadState.engraving = 'loading';
  const button = $('engravingListButton');
  const resultEl = $('engravingMarketResult');
  if (button) { button.disabled = true; button.textContent = '조회 중'; }
  if (resultEl) resultEl.innerHTML = '거래소에서 전체 유물 각인서 최저가를 조회하는 중입니다.';
  try {
    const data = await fetchMarketJson(`/api/market-prices?mode=engravingList${force ? '&force=1' : ''}&_=${Date.now()}`);
    renderEngravingPriceGrid(resultEl, data);
    marketListLoadState.engraving = 'loaded';
  } catch (error) {
    marketListLoadState.engraving = 'idle';
    renderMarketError(resultEl, error.message);
  } finally {
    if (button) { button.disabled = false; button.textContent = '새로고침'; }
  }
}

async function loadMarketMaterialList(force = false) {
  if (!force && marketListLoadState.material === 'loaded') return;
  if (!force && marketListLoadState.material === 'loading') return;
  marketListLoadState.material = 'loading';
  const button = $('materialListButton');
  const resultEl = $('materialMarketResult');
  if (button) { button.disabled = true; button.textContent = '조회 중'; }
  if (resultEl) resultEl.innerHTML = '거래소에서 4티어 재료와 아크그리드 젬 최저가를 조회하는 중입니다.';
  try {
    let data = await fetchMarketJson(`/api/market-prices?mode=t4Materials${force ? '&force=1' : ''}&_=${Date.now()}`);
    if (!force && shouldForceRefreshMaterialPrices(data)) {
      if (resultEl) resultEl.innerHTML = '캐시된 재료 시세에 매물 없음이 많아 최신 시세로 다시 조회하는 중입니다.';
      data = await fetchMarketJson(`/api/market-prices?mode=t4Materials&force=1&_=${Date.now()}`);
    }
    renderMaterialPriceGrid(resultEl, data);
    marketListLoadState.material = 'loaded';
  } catch (error) {
    marketListLoadState.material = 'idle';
    renderMarketError(resultEl, error.message);
  } finally {
    if (button) { button.disabled = false; button.textContent = '새로고침'; }
  }
}

function shouldForceRefreshMaterialPrices(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  if (!items.length) return true;
  const missingCount = items.filter(item => item?.missing || !Number(item?.price || 0)).length;
  const importantNames = ['아비도스 융화제', '상급 아비도스 융화제', '빙하의 숨결', '용암의 숨결'];
  const importantMissing = items.some(item => importantNames.includes(item?.requestedName || item?.name || '') && (item?.missing || !Number(item?.price || 0)));
  return importantMissing || missingCount >= Math.max(3, Math.ceil(items.length * 0.25));
}

function marketRequestKey(url) {
  const parsed = new URL(url, window.location.origin);
  parsed.searchParams.delete('_');
  parsed.searchParams.sort();
  return `${parsed.pathname}?${parsed.searchParams.toString()}`;
}

async function fetchMarketJson(url) {
  const key = marketRequestKey(url);
  const force = new URL(url, window.location.origin).searchParams.get('force') === '1';
  const cached = marketResponseCache.get(key);
  if (!force && cached?.expiresAt > Date.now()) return cached.data;
  if (marketRequestInflight.has(key)) return marketRequestInflight.get(key);

  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 75000);
    try {
      const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
      const data = await readJsonSafely(res);
      if (!res.ok || !data?.ok) throw new Error(data?.error || data?.message || '시세 조회 실패');
      if (!force) marketResponseCache.set(key, { data, expiresAt: Date.now() + MARKET_CLIENT_CACHE_TTL_MS });
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('조회 시간이 초과되었습니다. 잠시 뒤 다시 누르면 서버 캐시 또는 다음 조회에서 더 빨리 응답할 수 있습니다.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  })();

  marketRequestInflight.set(key, request);
  try {
    return await request;
  } finally {
    if (marketRequestInflight.get(key) === request) marketRequestInflight.delete(key);
  }
}


function renderGemPriceGrid(container, data) {
  if (!container) return;
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  if (!rows.length) return renderMarketError(container, '보석 시세를 찾지 못했습니다.');
  container.innerHTML = `<div class="marketResultList">
    <div class="marketRuleHint"><b>보석 전체 시세</b> · 경매장 최저가 · ${escapeHtml(formatMarketUpdatedAt(data.updatedAt))}${marketDebugText(data)}</div>
    <div class="gemPriceGrid">
      <div class="gemPriceHead">레벨</div><div class="gemPriceHead">겁화</div><div class="gemPriceHead">작열</div>
      ${rows.map(row => `
        <div class="gemLevelCell">Lv.${Number(row.level || 0)}</div>
        ${gemPriceCell(row.damage, '겁화')}
        ${gemPriceCell(row.cooldown, '작열')}
      `).join('')}
    </div>
  </div>`;
}

function gemPriceCell(item, label) {
  if (!item) return `<div class="gemPriceCell empty"><b>${escapeHtml(label)}</b><span>매물 없음</span></div>`;
  const icon = item.icon ? `<img src="${escapeHtml(item.icon)}" alt="">` : '';
  return `<div class="gemPriceCell">${icon}<div><b>${escapeHtml(label)}</b><span>${formatGold(item.price)}</span><small>${escapeHtml(item.name || '')}</small></div></div>`;
}

function renderEngravingPriceGrid(container, data) {
  if (!container) return;
  const items = Array.isArray(data?.items) ? data.items : [];
  if (!items.length) return renderMarketError(container, '유물 각인서 시세를 찾지 못했습니다.');
  container.innerHTML = `<div class="marketResultList">
    <div class="marketRuleHint"><b>전체 유각 시세</b> · 최저가 비싼 순 · ${escapeHtml(formatMarketUpdatedAt(data.updatedAt))}</div>
    <div class="engravingPriceGrid">
      ${items.map(item => engravingPriceCard(item)).join('')}
    </div>
  </div>`;
}

function engravingPriceCard(item) {
  const icon = item.icon ? `<img src="${escapeHtml(item.icon)}" alt="">` : '';
  return `<article class="engravingPriceCard">
    ${icon}
    <div><b>${escapeHtml(cleanEngravingName(item.name || '유물 각인서'))}</b><small>${escapeHtml(item.grade || '유물')}</small></div>
    <strong>${formatGold(item.price)}</strong>
  </article>`;
}

function cleanEngravingName(name) {
  return String(name || '').replace(/\s*각인서\s*/g, '').replace(/유물\s*/g, '').trim() || name;
}

function formatMarketUpdatedAt(value) {
  if (!value) return '방금 갱신';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '방금 갱신';
  return `마지막 갱신 ${d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

function renderMarketResults(container, data, title, subtitle) {
  if (!container) return;
  const items = Array.isArray(data?.items) ? data.items : [];
  const triedText = Array.isArray(data?.tried) ? ` · 조회시도 ${data.tried.length}회` : '';
  const debugText = marketDebugText(data);
  if (!items.length) {
    container.innerHTML = `<div class="marketEmptyBox">검색 조건에 맞는 매물을 찾지 못했습니다.${triedText}<br><small>공식 API 응답 ${escapeHtml(debugText || '')} · 카테고리/검색어/필터 조건을 확인하세요.</small></div>${accessoryDebugHtml(data)}`;
    return;
  }
  container.innerHTML = `
    <div class="marketResultList">
      <div class="marketRuleHint"><b>${escapeHtml(title)}</b>${subtitle ? ` · ${escapeHtml(subtitle)}` : ''}${triedText}${debugText}</div>
      ${items.map(item => marketResultItemHtml(item)).join('')}
    </div>
  `;
}

function accessoryDebugHtml(data) {
  const dbg = data?.accessoryDebug;
  if (!dbg) return '';
  const payloads = Array.isArray(dbg.requestPayloads) ? dbg.requestPayloads : [];
  const samples = Array.isArray(dbg.samples) ? dbg.samples : [];
  const stats = dbg.filterStats || {};
  const statRows = Object.entries(stats).sort((a, b) => Number(b[1]) - Number(a[1])).map(([k, v]) => `<li>${escapeHtml(k)}: ${Number(v).toLocaleString('ko-KR')}건</li>`).join('') || '<li>필터 제외 사유 없음</li>';
  return `<div class="marketDebugPanel">
    <details open>
      <summary>악세 디버그 보기 · v${escapeHtml(VERSION)}</summary>
      <div class="marketDebugSection"><b>필터 제외 사유</b><ul>${statRows}</ul></div>
      <div class="marketDebugSection"><b>REQUEST payload</b><pre>${escapeHtml(JSON.stringify(payloads, null, 2))}</pre></div>
      <div class="marketDebugSection"><b>RESPONSE 샘플 5개</b><pre>${escapeHtml(JSON.stringify(samples, null, 2))}</pre></div>
    </details>
  </div>`;
}

function marketResultItemHtml(item) {
  const icon = item.icon ? `<img src="${escapeHtml(item.icon)}" alt="">` : `<div class="marketIconFallback">?</div>`;
  const pheonMeta = Number(item.pheonCost || 0) > 0 ? `${Number(item.pheonCost).toLocaleString('ko-KR')}페온` : '';
  const meta = [item.grade, item.part, item.combo, item.refineCount ? `${item.refineCount}연마` : '', item.gem ? `${item.gem} ${item.level}레벨` : '', item.quality ? `품질 ${item.quality}` : '', pheonMeta].filter(Boolean).join(' · ');
  return `<article class="marketResultItem">
    ${icon}
    <div><b>${escapeHtml(item.name || '이름 없음')}</b><small>${escapeHtml(meta || '현재 매물')}</small></div>
    <div class="marketPrice">${formatGold(item.price)}</div>
  </article>`;
}

function marketDebugText(data) {
  const debug = data?.debug;
  if (!debug) return '';
  const err = Array.isArray(debug.errors) && debug.errors.length ? ` · 오류 ${debug.errors.length}건` : '';
  const cache = data?.cached ? ' · 캐시' : '';
  const index = data?.index?.matchedCount !== undefined ? ` · 인덱스 매칭 ${Number(data.index.matchedCount || 0).toLocaleString('ko-KR')}개` : '';
  return ` · 응답 ${Number(debug.responseItems || 0).toLocaleString('ko-KR')}개 / 총 ${Number(debug.responseTotalCount || 0).toLocaleString('ko-KR')}개${index}${err}${cache}`;
}

function renderMarketError(container, message) {
  if (!container) return;
  container.innerHTML = `<div class="marketEmptyBox marketError">${escapeHtml(message || '시세 조회 중 오류가 발생했습니다.')}</div>`;
}


// v5.0.4 boot fix: 5.0.2에서 전설 아바타 코드가 뒤에 붙으면서 초기화 호출이 빠져
// 진화 DB가 로드되지 않고, 탭 버튼 이벤트도 연결되지 않았습니다.
// DOM 요소와 모든 함수가 정의된 뒤 한 번만 초기화합니다.
if (!window.__lostarkCalculatorBootedV506) {
  window.__lostarkCalculatorBootedV506 = true;
  populateAdrenalineReplacementOptions(true);
  updateEngravingControlPreviews();
  window.addEventListener('scroll', hideNodeTooltip, { passive: true });
  window.addEventListener('resize', hideNodeTooltip);
  initLegendAvatarTab();
  initMarketPriceTab();
  setActiveTab('calculator');
  loadLostarkNoticeCard();
  loadDb().catch((error) => setMessage(error.message || '진화 노드 데이터를 불러오지 못했습니다.'));
}

function renderMaterialPriceGrid(container, data) {
  if (!container) return;
  const items = Array.isArray(data?.items) ? data.items : [];
  if (!items.length) return renderMarketError(container, '4티어 재료 시세를 찾지 못했습니다.');
  const grouped = new Map();
  for (const item of items) {
    const group = item.group || '기타';
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(item);
  }
  container.innerHTML = `<div class="marketResultList">
    <div class="marketRuleHint"><b>4티어 재료/아크그리드 젬</b> · 거래소 최저가 · ${escapeHtml(formatMarketUpdatedAt(data.updatedAt))}${data.cached ? ' · 캐시' : ''}</div>
    ${[...grouped.entries()].map(([group, rows]) => `
      <section class="materialPriceGroup">
        <h3>${escapeHtml(group)}</h3>
        <div class="materialPriceGrid">${rows.map(materialPriceCard).join('')}</div>
      </section>
    `).join('')}
  </div>`;
}

function materialPriceCard(item) {
  const icon = item.icon ? `<img src="${escapeHtml(item.icon)}" alt="">` : `<div class="marketIconFallback">재</div>`;
  const missing = item.missing || !Number(item.price || 0);
  const price = missing ? '매물 없음' : formatGold(item.price);
  const bundle = Number(item.bundleCount || 1) || 1;
  const unit = !missing && bundle > 1 ? `주머니 개당 ${formatGold(item.unitPrice)}` : '';
  const shardUnit = !missing && Number(item.shardCount || 0) && Number(item.shardUnitPrice || 0)
    ? `파편 1개당 ${formatGold(item.shardUnitPrice)}`
    : '';
  const shardCount = !missing && Number(item.shardCount || 0)
    ? `주머니당 ${Number(item.shardCount).toLocaleString('ko-KR')}개`
    : '';
  const source = item.source === 'auctions/items' ? '경매장' : '거래소';
  const pheon = !missing && Number(item.pheonCost || 0) > 0 ? `${Number(item.pheonCost).toLocaleString('ko-KR')}페온` : '';
  return `<article class="materialPriceCard ${missing ? 'missing' : ''}">
    ${icon}
    <div>
      <b>${escapeHtml(item.requestedName || item.name || '-')}</b>
      <small>${escapeHtml([source, item.grade, item.name && item.name !== item.requestedName ? item.name : '', bundle > 1 ? `${bundle.toLocaleString('ko-KR')}개 묶음` : '', unit, shardCount, shardUnit, pheon].filter(Boolean).join(' · ') || '최저가')}</small>
    </div>
    <strong>${escapeHtml(price)}</strong>
  </article>`;
}
