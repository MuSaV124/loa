import { calculateBluntSpike, calculatePracticalRecommendationScore, calculateSonicBreakEvolutionDamage, shiftClickTargetLevel } from './evolution-math.js?v=5.15.8';
import { emptyCardEffects } from './card-effects.js?v=5.15.8';
import { advancedHoningStageForLevel, optimizeAdvancedHoning, summarizeAdvancedHoningStrategy } from './advanced-honing-math.js?v=5.15.8';
import { gemFusionPurchaseCount, isBoundGem } from './gem-math.js?v=5.15.8';
import { emptySkillEffectState, formatSkillEffectSummary, skillExperimentItems } from './skill-effects.js?v=5.15.8';
import { emptyPassiveSkillEffectState, extractArkGridSkillEffects, extractArkPassiveSkillEffects, mergeSkillEffects, passiveEffectsForSkill } from './passive-skill-effects.js?v=5.15.8';
import { calibrationScopeMatches, confidenceTier, findClassHoningSample } from './combat-power-calibration.js?v=5.15.8';
import { combatAnalyzerSkillShares, findCombatAnalyzerProfile, gemUpgradeEfficiency } from './combat-analyzer.js?v=5.15.8';
import { buildSkillCycleModel, evaluateEvolutionCooldown, evaluateSkillCastFrequency } from './skill-cycle.js?v=5.15.8';
import { isSupportSnapshot, snapshotWithAccessoryCandidate, snapshotWithGemLevel, supportContributionModel, supportOfficialAccessoryTransition, supportUpgradeImpact } from './support-power.js?v=5.15.8';
import { ADRENALINE_ENGRAVING_NAME, RELIC_ENGRAVING_RULES, adjustedEngravingEffects, clampRelicBookLevel, describeEngravingEffect, relicEngravingEffect } from './engraving-math.js?v=5.15.8';
import { formatBenchmarkRange, sortedBenchmarkCores } from './class-benchmark.js?v=5.15.8';
import { allocateOwnedMaterials, buildHoningScenarioMaterials, buildUpgradePlan, decodeSpecScenario, encodeSpecScenario, mergeMaterials, normalizeOwnedMaterials, scaleMaterials, specEstimateKey } from './spec-planner.js?v=5.15.8';
import { ARMGUARD_BREATH_ESTIMATE, NORMAL_HONING_PITY_RULES, armguardBreathMaxCombined, armguardBreathMixesForMode, armguardHoningRowForCurrentStage, armguardHoningRowsBetween, armguardPityProbability } from './armguard-honing.js?v=5.15.8';
import { estimateArmguardCombatPower } from './armguard-power.js?v=5.15.8';
import { ARCANA_CHANCELLOR_EFFECT, ARCANA_CULL_EFFECT, arcanaChancellorExpectationWeight, arcanaCombatExpectation, arcanaCullExpectationWeight, arcanaSovereignExpectationWeight, findArcanaCardExpectation, findArcanaStreamEffect, formatArcanaCardExpectation, scaleArcanaCardDraw, weightedArcanaCardValue, weightedEmperorNormalSkillCardValue } from './arcana-card-expectation.js?v=5.15.8';
import {
  CHARACTER_REFRESH_COOLDOWN_MS,
  MARKET_REFRESH_COOLDOWN_MS,
  SHARED_PRICE_CACHE_TTL_MS,
  canonicalMarketRequestKey,
  formatCooldownClock,
  isCompatibleCharacterCacheData,
  remainingCooldownMs
} from './cache-policy.js?v=5.15.8';

const VERSION = '5.15.8';
const COOLDOWN_NODE_NAMES = ['최적화 훈련', '끝없는 마나', '무한한 마력', '선각자'];
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
const SPEC_OWNED_STORAGE_KEY = 'loa.specOwnedMaterials.v1';
const SPEC_SCENARIO_STORAGE_KEY = 'loa.specScenario.v1';
const initialOwnedMaterials = normalizeOwnedMaterials(readStoredObject(SPEC_OWNED_STORAGE_KEY));
const state = {
  evolution: null,
  index: new Map(),
  selected: {},
  apiSelected: {},
  foundEffects: [],
  profileStats: { crit: 0, swift: 0, spec: 0 },
  accessory: { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] },
  bracelet: { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] },
  abilityStone: { attackPower: 0, effects: { critRate: 0, critDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0, conditionalDamage: 0 }, engravings: [], items: [] },
  engraving: emptyEngravingState(),
  arkGrid: { critRate: 0, critDamage: 0, attackSpeed: 0, moveSpeed: 0, enemyDamage: 0, additionalDamage: 0, items: [] },
  enlightenment: { critRate: 0, critDamage: 0, critHitDamage: 0, evolutionDamage: 0, enemyDamage: 0, additionalDamage: 0, attackSpeed: 0, moveSpeed: 0, items: [] },
  card: emptyCardEffects(),
  skillEffects: emptySkillEffectState(),
  passiveSkillEffects: emptyPassiveSkillEffectState(),
  arkGridSkillEffects: emptyPassiveSkillEffectState(),
  skillCycle: null,
  powerSnapshot: null,
  powerCostEstimates: [],
  combatPowerModel: null,
  combatAnalyzer: null,
  classBenchmarks: null,
  specEfficiencyFilter: 'all',
  ownedMaterials: initialOwnedMaterials,
  specPlannerMode: 'target',
  specPlannerTarget: 0,
  specPlannerBudget: 1000000,
  armguardRange: { from: 0, to: 25 },
  armguardBreathMode: 'optimal',
  specScenarioSelectedKeys: new Set(),
  pendingSharedScenario: null
};
let simulatorRendered = false;

function isGuaranteedCritSkill(item) {
  return Boolean(item?.guaranteedCrit) || Number(item?.effects?.critRate || 0) >= 99.99;
}

function isConditionalSkill(item) {
  return Boolean(item?.conditional) || (item?.selectedTripods || []).some(tripod => tripod?.conditional);
}

function currentArcanaCardExpectation(cooldownReduction = null) {
  const model = findArcanaCardExpectation(state.powerSnapshot?.profile);
  if (!model || model.key !== 'emperor' || cooldownReduction == null || !Number.isFinite(Number(cooldownReduction))) return model;
  const castFrequency = evaluateSkillCastFrequency(state.skillCycle, Number(cooldownReduction), {
    referenceReduction: Number(model.referenceCooldownReduction || 0)
  });
  return scaleArcanaCardDraw(model, castFrequency.multiplier);
}

function currentArcanaStreamEffect() {
  return findArcanaStreamEffect(state.powerSnapshot?.profile, state.skillEffects);
}

function renderArcanaIdentityNote() {
  const note = $('arcanaIdentityNote');
  if (!note) return;
  const model = currentArcanaCardExpectation();
  note.classList.toggle('hidden', !model);
  if (!model) {
    note.innerHTML = '';
    return;
  }
  const combat = arcanaCombatExpectation(model);
  const stream = currentArcanaStreamEffect();
  const combatText = combat?.cardsPerMinute > 0
    ? model.key === 'emperor'
      ? `표준 ${Math.round(combat.combatSeconds / 60)}분 딜타임 약 ${combat.cards.toFixed(1)}장·도태 ${combat.cullCards.toFixed(1)}장·재상 ${combat.chancellorCards.toFixed(1)}장·제후 ${combat.sovereignCards.toFixed(1)}장으로 환산합니다.`
      : `표준 ${Math.round(combat.combatSeconds / 60)}분 딜타임 약 ${combat.cards.toFixed(1)}장·도태 ${combat.cullCards.toFixed(1)}장으로 환산합니다.`
    : '분당 드로우 실측값이 없는 세팅은 카드 1회 확률만 반영합니다.';
  const streamText = stream
    ? ` 장착한 ${stream.sourceSkill}의 ${stream.sourceTripod} 최대 중첩 치적 +${stream.critRate.toFixed(1)}%를 황제 주력기에 적용합니다.`
    : '';
  const emperorText = model.key === 'emperor'
    ? ' 재상 치적 +20%·제후 일반 스킬 피해 +50%는 일반 스킬에만 적용하며, 도태와 겹치는 상태까지 기대값으로 계산합니다.'
    : '';
  note.innerHTML = `<b>아르카나 카드·스킬 기대값 적용</b><span>${escapeHtml(formatArcanaCardExpectation(model))}. ${escapeHtml(combatText)}${escapeHtml(streamText)} 도태의 치적 +100%·치피 +50%를 기대 가동률로 계산합니다.${escapeHtml(emperorText)} 카드 직접 피해는 전투분석 딜 지분을 유지합니다.</span><small>확률/가동률은 슬래시 앞뒤 순서입니다. 카드 보유·사용 타이밍과 보스 기믹에 따라 실제 DPS는 달라질 수 있습니다.</small>`;
}

function renderSkillEffectControl() {
  const preview = $('skillEffectPreview');
  if (!preview) return;
  renderArcanaIdentityNote();
  const items = skillExperimentItems(state.skillEffects);
  const passiveRules = state.passiveSkillEffects?.rules || [];
  const arkGridRules = state.arkGridSkillEffects?.rules || [];
  const scopedRules = [...passiveRules, ...arkGridRules];
  const loadedCount = Number(state.skillEffects?.items?.length || 0);
  const conditionalCount = Number(state.skillEffects?.conditionalTripodCount || items.filter(isConditionalSkill).length);
  const cooldownTripodCount = Number(state.skillEffects?.cooldownTripodCount || 0);
  const stochasticCooldownCount = Number(state.skillEffects?.stochasticCooldownCount || 0);
  const cycle = state.skillCycle;
  const modeledSharePercent = Number(cycle?.modeledSharePercent ?? cycle?.mappedSharePercent ?? 0);
  if (!loadedCount) {
    preview.innerHTML = '<b>사용 스킬 자동 반영</b><span>캐릭터 검색 후 표시</span>';
    preview.classList.add('muted');
    return;
  }
  const status = [
    cycle?.usedSkillCount ? `현재 트리 ${cycle.usedSkillCount}개` : '',
    modeledSharePercent > 0 ? `계산 지분 ${modeledSharePercent.toFixed(1)}%` : '',
    cycle?.weightedCooldownSeconds > 0 ? `평균 ${cycle.weightedCooldownSeconds.toFixed(2)}초` : '',
    `트라이포드 효과 ${items.length}개`,
    passiveRules.length ? `깨달음·도약 ${passiveRules.length}개` : '',
    arkGridRules.length ? `아크그리드 ${arkGridRules.length}개` : '',
    conditionalCount ? `조건 충족 ${conditionalCount}개` : '',
    cooldownTripodCount ? `쿨 트포 ${cooldownTripodCount}개` : '',
    stochasticCooldownCount ? `확률 쿨감 ${stochasticCooldownCount}개 별도` : ''
  ].filter(Boolean).join(' · ');
  const rows = items.map(item => {
    const effectSummary = formatSkillEffectSummary(item.effects) || '수치 효과 없음';
    const flags = [isGuaranteedCritSkill(item) ? '확정 치명' : '', isConditionalSkill(item) ? '조건 충족' : ''].filter(Boolean).join(' · ');
    const cycleItem = cycle?.items?.find(row => String(row.name || '').replace(/\s+/g, '') === String(item.name || '').replace(/\s+/g, ''));
    const seconds = cycleItem ? `기본 ${Number(cycleItem.baseCooldownSeconds).toFixed(1)}초 → 장착효과 ${Number(cycleItem.effectiveCooldownSeconds).toFixed(2)}초` : '';
    const detail = [flags, seconds, effectSummary].filter(Boolean).join(' · ');
    return `<div class="skillEffectRow"><b>${escapeHtml(item.name || '이름 없는 스킬')}${Number(item.level || 0) ? ` Lv.${Number(item.level)}` : ''}</b><span>${escapeHtml(detail)}</span></div>`;
  }).join('');
  const passiveRows = scopedRules.map(rule => {
    const target = rule.scope === 'skill'
      ? rule.targets.join(', ')
      : rule.scope === 'category' ? `${rule.selector} 스킬` : '상태 조건 주력기';
    const detail = `${rule.category} · ${target} · ${formatSkillEffectSummary(rule.effects) || '수치 효과 없음'}`;
    return `<div class="skillEffectRow"><b>${escapeHtml(rule.nodeName || rule.category)}</b><span>${escapeHtml(detail)}</span></div>`;
  }).join('');
  const cycleNote = cycle ? `<div class="skillCycleNote">신속 ${Number(cycle.swiftCooldownReduction || 0).toFixed(2)}% · 보석 가중 ${Number(cycle.weightedGemCooldown || 0).toFixed(2)}% · ${escapeHtml(cycle.analyzerTag || '장착 스킬 추정')}${cycle.appliedCycleLinkCount ? ` · 아크그리드 연쇄 ${cycle.appliedCycleLinkCount}건` : ''}${cycle.identityDriverSharePercent ? ` · 게이지 연동 ${Number(cycle.identityDriverSharePercent).toFixed(1)}%` : ''}${cycle.stochasticRuneCount || cycle.stochasticCycleLinkCount ? ` · 확률 미공개 ${Number(cycle.stochasticRuneCount || 0) + Number(cycle.stochasticCycleLinkCount || 0)}건 제외` : ''}</div>` : '';
  preview.innerHTML = `<div class="skillEffectHeading"><b>현재 스킬트리 자동 반영</b><span>${escapeHtml(status)}</span></div>${cycleNote}<div class="skillEffectRows">${passiveRows}${rows || (!passiveRows ? '<div class="skillEffectRow muted"><span>계산할 사용 스킬이 없습니다.</span></div>' : '')}</div>`;
  preview.classList.remove('muted');
}

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
  },
  armguard: {
    label: '완갑',
    names: ['완갑'],
    materials: ['운명의 파괴석 결정', '운명의 수호석 결정'],
    leapstone: '위대한 운명의 돌파석',
    fusion: '상급 아비도스 융화제',
    growthLabel: '완갑 장비 성장',
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
const T4_NORMAL_HONING_FAIL_BONUS_RATE = NORMAL_HONING_PITY_RULES.failBonusRate;
const T4_NORMAL_HONING_MAX_RATE_MULTIPLIER = NORMAL_HONING_PITY_RULES.maxRateMultiplier;
const T4_NORMAL_HONING_ARTISAN_FACTOR = NORMAL_HONING_PITY_RULES.artisanFactor;
const T4_NORMAL_HONING_ARTISAN_LIMIT = NORMAL_HONING_PITY_RULES.artisanLimit;
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
const MARKET_CLIENT_CACHE_TTL_MS = SHARED_PRICE_CACHE_TTL_MS;
const MARKET_REFRESH_STORAGE_KEY = 'loa-market-refresh-v1';
const MARKET_SNAPSHOT_STORAGE_KEY = 'loa-market-snapshot-v1';
const CHARACTER_CACHE_STORAGE_KEY = 'loa-character-cache-v2';
const CHARACTER_CACHE_MAX_ENTRIES = 20;
const MARKET_REFRESH_BUTTON_IDS = {
  engraving: 'engravingListButton',
  gem: 'gemListButton',
  material: 'materialListButton',
  crystal: 'crystalListButton'
};
let marketRefreshTimes = readStoredObject(MARKET_REFRESH_STORAGE_KEY);
let marketSnapshotHydrated = false;
let marketSnapshotAvailable = false;
let marketSnapshotNetworkState = 'idle';
let activeCharacterName = '';
let activeCharacterSavedAt = 0;
let characterRequestPending = false;

function readStoredObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function writeStoredObject(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

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
function setMessage(text, tone = 'error') {
  const el = $('message');
  if (!text) {
    el.classList.add('hidden');
    el.classList.remove('info');
    el.textContent = '';
    return;
  }
  el.classList.remove('hidden');
  el.classList.toggle('info', tone === 'info');
  el.textContent = text;
}
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
    delete effect.manaSkillCooldownReduction;
    effect.manaConditionNote = '주력기 마나 사용 안함: 마나 스킬 쿨감 제외';
  }
  if (name === '금단의 주문') {
    delete effect.manaSkillEvolutionDamage;
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
function extractEnlightenmentEffects(effects, passiveState = state.passiveSkillEffects) {
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
    const passiveRows = (passiveState?.items || []).filter(row => Number(row?.effectIndex) === Number(effect?.index));
    const scopedRows = passiveRows.filter(row => row.scope !== 'global');
    const globalRows = passiveRows.filter(row => row.scope === 'global');
    for (const key of ['critRate','critDamage','critHitDamage','enemyDamage','additionalDamage','attackSpeed','moveSpeed']) {
      const globalValue = round2(globalRows.reduce((sum, row) => sum + Number(row?.effects?.[key] || 0), 0));
      if (scopedRows.some(row => Math.abs(Number(row?.rawEffects?.[key] || 0)) > 0.0001)) parsed[key] = globalValue;
      else if (Math.abs(globalValue) > Math.abs(Number(parsed[key] || 0))) parsed[key] = globalValue;
    }

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
    result.items.push({ name: effect.name || '깨달음 효과', level: effect.level || 0, effects: parsed, rawText: joined });
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
  const order = { '투구': 0, '머리장식': 0, '어깨': 1, '견갑': 1, '상의': 2, '하의': 3, '장갑': 4, '무기': 5, '완갑': 6 };
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
  const source = `${item?.type || ''} ${item?.name || ''} ${item?.grade || ''}`;
  if (source.includes('완갑')) return { key: 'armguard', ...T4_GEAR_COST_RULES.armguard };
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
  const advancedRow = advancedHoningAttemptRowForGear(item);
  const advancedNames = Object.keys(advancedRow?.materials || {}).filter(name => name !== '골드' && name !== '실링');
  const tempering = advancedHoningTemperingMaterial(item);
  const names = [
    ...T4_SHARED_COST_MATERIALS,
    ...(rule.materials || []),
    rule.stone?.[slot],
    rule.leapstone,
    rule.fusion,
    ...(rule.books?.[slot] || []),
    ...(isLimitBreakGrowth(item, rule) ? rule.limitBreakMaterials || [] : []),
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
  if (rule.key === 'armguard') return 'armguard';
  if (rule.key === 'standard') return T4_NORMAL_REFINE_ATTEMPT_COSTS.ancient;
  if (rule.key === 'upperAncient') return T4_NORMAL_REFINE_ATTEMPT_COSTS.upperAncient;
  return null;
}
function normalGrowthCostSetForGear(item) {
  const rule = classifyT4GearCostRule(item);
  if (rule.key === 'armguard') return 'armguard';
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
  if (normalRefineCostSetForGear(item) === 'armguard') {
    const row = armguardHoningRowForCurrentStage(item?.honingLevel);
    if (!row) return null;
    const attemptMaterials = { ...(row.attemptMaterials || {}) };
    const growthMaterials = { ...(row.growthMaterials || {}) };
    return {
      from: row.from,
      to: row.to,
      ratePercent: row.ratePercent,
      attemptMaterials,
      growthMaterials,
      materials: mergeMaterials(growthMaterials, attemptMaterials),
      hasGrowth: true,
      growthDataMissing: false,
      growthLabel: '완갑 장비 성장'
    };
  }
  const attemptRow = normalCostRowForGear(item, normalRefineCostSetForGear(item));
  if (!attemptRow) return null;
  const attemptMaterials = { ...(attemptRow.materials || {}) };
  const growthMaterials = {};
  const growthRow = normalCostRowForGear(item, normalGrowthCostSetForGear(item));
  if (growthRow) {
    addMaterialAmount(growthMaterials, '운명의 파편', growthRow.fragment);
    addMaterialAmount(growthMaterials, '실링', growthRow.silver);
  }
  const rule = classifyT4GearCostRule(item);
  const growthDataMissing = isLimitBreakGrowth(item, rule) && !growthRow;
  return {
    from: attemptRow.from,
    to: attemptRow.to,
    attemptMaterials,
    growthMaterials,
    materials: mergeMaterials(growthMaterials, attemptMaterials),
    hasGrowth: Boolean(growthRow) || growthDataMissing,
    growthDataMissing,
    growthLabel: growthDataMissing ? rule.limitBreakLabel : growthRow ? rule.growthLabel : ''
  };
}
function ownedMaterialKey(name) {
  return String(name || '').startsWith('운명의 파편 주머니') ? '운명의 파편' : name;
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
function calculateMaterialGoldCost(materials, priceMap, options = {}) {
  const ownedMaterials = normalizeOwnedMaterials(options.ownedMaterials ?? state.ownedMaterials);
  const allocation = allocateOwnedMaterials(materials, ownedMaterials);
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
    const purchased = Number(allocation.purchasedMaterials?.[name] || 0);
    const ownedUsed = Number(allocation.ownedUsed?.[name] || 0);
    const boundOnly = BOUND_ONLY_MATERIALS.has(name);
    const unitGold = boundOnly ? 0 : unitGoldForMaterial(priceMap, name);
    const gold = purchased * unitGold;
    tradeGold += gold;
    rows.push({
      name,
      required: qty,
      purchased,
      ownedUsed,
      unitGold,
      gold,
      boundOnly,
      boundShortage: boundOnly && purchased > 0,
      missingPrice: !boundOnly && purchased > 0 && !unitGold
    });
  }
  return {
    rows,
    tradeGold,
    fixedGold,
    silver,
    totalGold: tradeGold + fixedGold,
    ownedUsed: allocation.ownedUsed,
    remainingOwned: allocation.remainingOwned
  };
}
function normalHoningBaseRatePercent(next) {
  const explicitRate = Number(next?.ratePercent || 0);
  if (Number.isFinite(explicitRate) && explicitRate > 0) return explicitRate;
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
function calculateNormalHoningAttemptStats(next, strategy = {}) {
  const ratePercent = normalHoningBaseRatePercent(next);
  const supportRatePercent = normalHoningSupportRatePercent(ratePercent, strategy);
  const pityAttempts = normalHoningPityAttempts(ratePercent, supportRatePercent);
  const expectedAttempts = expectedAttemptsWithPity(ratePercent, pityAttempts, supportRatePercent);
  const rateSchedule = buildNormalHoningRateSchedule(ratePercent, Math.min(pityAttempts, 11), supportRatePercent);
  return {
    ratePercent,
    supportRatePercent,
    pityAttempts,
    expectedAttempts,
    maxRatePercent: normalHoningAttemptRatePercent(ratePercent, 11, supportRatePercent),
    rateSchedule,
    basis: ratePercent > 0 ? 'support-optimized-fail-bonus-with-artisan' : 'missing-base-rate'
  };
}
function calculateNormalHoningExpectedCost(baseMaterials, next, priceMap) {
  const optional = normalHoningOptionalNames(next.attemptMaterials || next.materials);
  const maxBreath = Math.floor(Number(optional.breathName ? next.attemptMaterials?.[optional.breathName] : 0) || 0);
  const bookOptions = optional.bookName ? [false, true] : [false];
  const rows = [];
  const breathOptions = maxBreath > 0 ? Array.from({ length: maxBreath + 1 }, (_, count) => count) : [0];
  for (const breathCount of breathOptions) {
    for (const useBook of bookOptions) {
      const strategy = { breathCount, maxBreath, useBook, bookName: optional.bookName };
      const attemptMaterials = buildNormalHoningStrategyMaterials(baseMaterials, optional, strategy);
      const attemptStats = calculateNormalHoningAttemptStats(next, strategy);
      const scenarioCost = attempts => {
        const materials = buildHoningScenarioMaterials(next.growthMaterials || {}, attemptMaterials, attempts);
        const cost = calculateMaterialGoldCost(materials, priceMap);
        return { materials, cost };
      };
      const lucky = scenarioCost(1);
      const expected = scenarioCost(attemptStats.expectedAttempts);
      const pity = scenarioCost(attemptStats.pityAttempts);
      rows.push({
        strategy,
        materials: attemptMaterials,
        cost: lucky.cost,
        expectedCost: {
          ...attemptStats,
          expectedGold: expected.cost.totalGold,
          expectedSilver: expected.cost.silver,
          expectedMaterials: expected.materials,
          expectedCostRows: expected.cost.rows,
          luckyGold: lucky.cost.totalGold,
          luckySilver: lucky.cost.silver,
          pityGold: pity.cost.totalGold,
          pitySilver: pity.cost.silver
        },
        label: describeNormalHoningStrategy(strategy)
      });
    }
  }
  rows.sort((a, b) => {
    const aMissing = (a.expectedCost?.expectedCostRows || []).some(row => row.missingPrice || row.boundShortage);
    const bMissing = (b.expectedCost?.expectedCostRows || []).some(row => row.missingPrice || row.boundShortage);
    if (aMissing !== bMissing) return aMissing ? 1 : -1;
    const av = Number(a.expectedCost?.expectedGold || 0) || Infinity;
    const bv = Number(b.expectedCost?.expectedGold || 0) || Infinity;
    return av - bv;
  });
  return rows[0] || null;
}

function calculateArmguardRangeExpectedCost(fromStage, toStage, priceMap, breathMode = 'optimal') {
  const rows = armguardHoningRowsBetween(fromStage, toStage);
  const lavaUnitGold = unitGoldForMaterial(priceMap, '용암의 숨결');
  const glacierUnitGold = unitGoldForMaterial(priceMap, '빙하의 숨결');
  const hasBreathPrices = lavaUnitGold > 0 && glacierUnitGold > 0;
  let expectedMaterials = {};
  let expectedGrowthMaterials = {};
  let expectedRefineMaterials = {};
  let expectedAttempts = 0;
  let pityAttempts = 0;
  let expectedPityCount = 0;
  const stages = rows.map(row => {
    const maxBreath = armguardBreathMaxCombined(row.to);
    const breathOptions = armguardBreathMixesForMode(row.to, breathMode, hasBreathPrices);
    const candidates = breathOptions.map(mix => {
      const breathCount = mix.total;
      const strategy = { breathCount, maxBreath };
      const stats = calculateNormalHoningAttemptStats(row, strategy);
      const attemptMaterials = { ...(row.attemptMaterials || {}) };
      if (mix.lava > 0) addMaterialAmount(attemptMaterials, '용암의 숨결', mix.lava);
      if (mix.glacier > 0) addMaterialAmount(attemptMaterials, '빙하의 숨결', mix.glacier);
      const materials = buildHoningScenarioMaterials(row.growthMaterials, attemptMaterials, stats.expectedAttempts);
      const cost = calculateMaterialGoldCost(materials, priceMap, { ownedMaterials: {} });
      return { mix, breathCount, strategy, stats, attemptMaterials, materials, cost };
    }).sort((a, b) => Number(a.cost.totalGold || 0) - Number(b.cost.totalGold || 0) || a.breathCount - b.breathCount);
    const selected = candidates[0];
    const baseline = candidates.find(candidate => candidate.breathCount === 0) || selected;
    const stats = selected.stats;
    const pityProbability = armguardPityProbability(row.ratePercent, stats.supportRatePercent);
    expectedAttempts += stats.expectedAttempts;
    pityAttempts += stats.pityAttempts;
    expectedPityCount += pityProbability;
    expectedGrowthMaterials = mergeMaterials(expectedGrowthMaterials, row.growthMaterials);
    expectedRefineMaterials = mergeMaterials(expectedRefineMaterials, scaleMaterials(selected.attemptMaterials, stats.expectedAttempts));
    expectedMaterials = mergeMaterials(
      expectedMaterials,
      selected.materials
    );
    return {
      ...row,
      ...stats,
      pityProbability,
      breathCount: selected.breathCount,
      maxBreath,
      lavaCount: selected.mix.lava,
      glacierCount: selected.mix.glacier,
      expectedGold: selected.cost.totalGold,
      noBreathExpectedGold: baseline.cost.totalGold,
      expectedSavings: Math.max(0, Number(baseline.cost.totalGold || 0) - Number(selected.cost.totalGold || 0))
    };
  });
  const growthCost = calculateMaterialGoldCost(expectedGrowthMaterials, priceMap);
  const refineCost = calculateMaterialGoldCost(expectedRefineMaterials, priceMap, { ownedMaterials: growthCost.remainingOwned });
  const cost = calculateMaterialGoldCost(expectedMaterials, priceMap);
  return {
    from: rows[0]?.from ?? Number(fromStage || 0),
    to: rows.at(-1)?.to ?? Number(toStage || 0),
    stages,
    expectedAttempts,
    pityAttempts,
    expectedPityCount,
    breathMode,
    hasBreathPrices,
    lavaUnitGold,
    glacierUnitGold,
    breathEstimate: ARMGUARD_BREATH_ESTIMATE,
    expectedGrowthMaterials,
    expectedRefineMaterials,
    growthCost,
    refineCost,
    expectedMaterials,
    cost
  };
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
let combatAnalyzerPromise = null;
function refreshSkillCycleModel() {
  if (!state.powerSnapshot) {
    state.skillCycle = null;
    return null;
  }
  const support = isSupportPowerSnapshot(state.powerSnapshot);
  const profile = state.combatAnalyzer
    ? findCombatAnalyzerProfile(state.combatAnalyzer, state.powerSnapshot, state.skillEffects, { support })
    : null;
  const supportShares = Object.fromEntries((state.skillEffects?.cycleItems || [])
    .filter(item => item?.currentTree !== false && Number(item?.baseCooldownSeconds || 0) > 0)
    .map(item => [item.name, 1]));
  state.skillCycle = buildSkillCycleModel({
    skillEffects: state.skillEffects,
    snapshot: state.powerSnapshot,
    shares: support ? supportShares : combatAnalyzerSkillShares(profile?.value),
    identitySkills: state.combatAnalyzer?.identitySkills || [],
    analyzerTag: profile?.tag || '',
    analyzerMatch: profile?.match || ''
  });
  return state.skillCycle;
}
function refreshPassiveSkillEffects() {
  const options = {
    skillItems: state.skillEffects?.items || [],
    shareNames: (state.skillCycle?.shareRows || []).map(row => row?.name).filter(Boolean),
    identitySkills: state.combatAnalyzer?.identitySkills || []
  };
  state.passiveSkillEffects = extractArkPassiveSkillEffects(state.foundEffects, options);
  state.arkGridSkillEffects = extractArkGridSkillEffects(state.arkGrid?.items || [], options);
  for (const key of ['critRate', 'critDamage', 'attackSpeed', 'moveSpeed', 'enemyDamage', 'additionalDamage']) {
    state.arkGrid[key] = Number(state.arkGridSkillEffects.globalEffects?.[key] || 0);
  }
  return state.passiveSkillEffects;
}
async function loadCombatAnalyzer() {
  if (state.combatAnalyzer) return state.combatAnalyzer;
  if (!combatAnalyzerPromise) {
    combatAnalyzerPromise = fetch('/combat-analyzer.json', { cache: 'no-store' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        state.combatAnalyzer = data || null;
        refreshSkillCycleModel();
        refreshPassiveSkillEffects();
        if (state.foundEffects?.length) state.enlightenment = extractEnlightenmentEffects(state.foundEffects, state.passiveSkillEffects);
        renderSkillEffectControl();
        const summary = $('gemAnalyzerSummary');
        if (state.powerSnapshot && simulatorRendered) renderPowerSnapshot(state.powerSnapshot);
        else if (summary && state.powerSnapshot) summary.innerHTML = gemAnalyzerSummaryHtml(state.powerSnapshot);
        return state.combatAnalyzer;
      })
      .catch(() => {
        state.combatAnalyzer = null;
        return null;
      });
  }
  return combatAnalyzerPromise;
}
function isPowerWeaponItem(item) {
  return powerGearSlot(item) === 'weapon';
}
function powerGearSlot(item) {
  const text = `${item?.type || ''} ${item?.name || ''}`;
  if (text.includes('완갑')) return 'armguard';
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
      confidence: scopedSample?.confidence || 'class-sampled',
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
      confidence: legacyClassSample?.confidence || 'class-sampled',
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
  if (powerGearSlot(item) === 'armguard') {
    const estimate = estimateArmguardCombatPower(
      snapshot,
      Number(next?.from ?? item?.honingLevel ?? 0),
      Number(next?.to ?? Number(item?.honingLevel || 0) + 1)
    );
    if (estimate.available && Number(estimate.powerGain || 0) > 0) {
      return {
        value: round2(estimate.powerGain),
        percent: round2(estimate.gainPercent),
        confidence: 'estimated',
        basis: estimate.basis
      };
    }
  }
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
    const optional = normalHoningOptionalNames(next.attemptMaterials);
    const baseMaterials = cloneMaterialsWithoutOptional(next.attemptMaterials, optional);
    const optimized = calculateNormalHoningExpectedCost(baseMaterials, next, priceMap);
    const cost = optimized?.cost || calculateMaterialGoldCost(mergeMaterials(next.growthMaterials, baseMaterials), priceMap);
    const powerEstimate = estimateNormalHoningPowerDelta(item, snapshot, next);
    const expectedCost = optimized?.expectedCost || { expectedGold: cost.totalGold, expectedSilver: cost.silver, expectedMaterials: next.materials, expectedCostRows: cost.rows };
    const powerVerified = Number(powerEstimate.value || 0) > 0;
    const missingPrice = (expectedCost.expectedCostRows || []).some(row => row.missingPrice);
    const available = powerVerified && !next.growthDataMissing && !missingPrice && Number(expectedCost.expectedGold || 0) > 0;
    const reason = next.growthDataMissing
      ? '한계돌파 고통의 가시·실링 수량표 미입력'
      : !powerVerified
      ? '현재 직업·부위·강화 구간 전투력 미검증'
      : missingPrice
      ? '필수 재료 시세 없음'
      : '';
    return { category: 'normalHoning', item, available, reason, ...next, cost, expectedCost, supportStrategy: optimized?.strategy || null, supportLabel: optimized?.label || '보조재료 없음', powerDelta: powerEstimate.value, powerEstimate };
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
  const breathCost = optional.breathName ? calculateMaterialGoldCost({ [optional.breathName]: breathAmount }, priceMap, { ownedMaterials: {} }) : { totalGold: 0, rows: [] };
  const bookCost = optional.bookName ? calculateMaterialGoldCost({ [optional.bookName]: bookAmount }, priceMap, { ownedMaterials: {} }) : { totalGold: 0, rows: [] };
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
    const baseCost = calculateMaterialGoldCost(baseMaterials, priceMap, { ownedMaterials: {} });
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
    const powerEstimate = estimateAdvancedHoningPowerDelta(item, snapshot, remainingLevels);
    const tempering = current % 10 === 0 ? advancedHoningTemperingMaterial(item) : null;
    const usage = optimized.resourceUsage || {};
    const expectedMaterials = scaleMaterials(baseMaterials, Number(usage.base || optimized.expectedTotalAttempts || 0));
    if (optionalCosts.optional.breathName) addMaterialAmount(expectedMaterials, optionalCosts.optional.breathName, optionalCosts.breathAmount * Number(usage.breath || 0));
    if (optionalCosts.optional.bookName) addMaterialAmount(expectedMaterials, optionalCosts.optional.bookName, optionalCosts.bookAmount * Number(usage.book || 0));
    if (tempering?.name) addMaterialAmount(expectedMaterials, tempering.name, tempering.amount);
    const expectedMaterialCost = calculateMaterialGoldCost(expectedMaterials, priceMap);
    const expectedGold = Number(expectedMaterialCost.totalGold || 0);
    const missingPrice = expectedMaterialCost.rows.some(row => row.missingPrice);
    const boundShortage = expectedMaterialCost.rows.filter(row => row.boundShortage).map(row => row.name);
    const supportLabel = summarizeAdvancedHoningStrategy(optimized.usage);
    return {
      category: 'advancedHoning',
      item,
      available: expectedGold > 0 && powerEstimate.value > 0 && !missingPrice && !boundShortage.length,
      from: current,
      to: target,
      cost: expectedMaterialCost,
      expectedCost: {
        expectedGold,
        expectedSilver: expectedMaterialCost.silver,
        expectedMaterials,
        expectedCostRows: expectedMaterialCost.rows,
        expectedAttempts: Number(optimized.expectedTotalAttempts || 0),
        expectedTotalGold: expectedGold,
        expectedTotalAttempts: Number(optimized.expectedTotalAttempts || 0),
        expectedGoldPerLevel: remainingLevels > 0 ? expectedGold / remainingLevels : 0,
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
      reason: boundShortage.length
        ? `귀속 재료 부족: ${boundShortage.join(', ')}`
        : missingPrice
        ? '필수 재료 시세 없음'
        : '2026년 6월 완화 · 경험치/구슬 0 기준'
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
const SUPPORT_ACCESSORY_CANDIDATES = [
  { part: 'necklace', label: '목걸이', combo: 'supportHighHigh', comboLabel: '상상', gradePair: ['상', '상'], gradeKeys: ['brandPower', 'identityGain'], effects: { brandPower: 8.0, identityGain: 6.0 } },
  { part: 'necklace', label: '목걸이', combo: 'supportHighMid', comboLabel: '상중', gradePair: ['상', '중'], gradeKeys: ['brandPower', 'identityGain'], effects: { brandPower: 8.0, identityGain: 3.6 } },
  { part: 'necklace', label: '목걸이', combo: 'supportReverseHighMid', comboLabel: '중상', gradePair: ['중', '상'], gradeKeys: ['brandPower', 'identityGain'], effects: { brandPower: 4.8, identityGain: 6.0 } },
  { part: 'earring', label: '귀걸이', combo: 'supportHighHigh', comboLabel: '상상', gradePair: ['상', '상'], gradeKeys: ['partyHeal', 'partyShield'], effects: { partyHeal: 3.5, partyShield: 3.5 } },
  { part: 'earring', label: '귀걸이', combo: 'supportHighMid', comboLabel: '상중', gradePair: ['상', '중'], gradeKeys: ['partyHeal', 'partyShield'], effects: { partyHeal: 3.5, partyShield: 2.1 } },
  { part: 'earring', label: '귀걸이', combo: 'supportReverseHighMid', comboLabel: '중상', gradePair: ['중', '상'], gradeKeys: ['partyHeal', 'partyShield'], effects: { partyHeal: 2.1, partyShield: 3.5 } },
  { part: 'ring', label: '반지', combo: 'supportHighHigh', comboLabel: '상상', gradePair: ['상', '상'], gradeKeys: ['allyAttackBuff', 'allyDamageBuff'], effects: { allyAttackBuff: 5.0, allyDamageBuff: 7.5 } },
  { part: 'ring', label: '반지', combo: 'supportHighMid', comboLabel: '상중', gradePair: ['상', '중'], gradeKeys: ['allyAttackBuff', 'allyDamageBuff'], effects: { allyAttackBuff: 5.0, allyDamageBuff: 4.5 } },
  { part: 'ring', label: '반지', combo: 'supportReverseHighMid', comboLabel: '중상', gradePair: ['중', '상'], gradeKeys: ['allyAttackBuff', 'allyDamageBuff'], effects: { allyAttackBuff: 3.0, allyDamageBuff: 7.5 } }
];
const ACCESSORY_GRADE_SCORE = { 하: 1, 중: 2, 상: 3 };
function accessoryUpgradeCandidates(equipped, support = false) {
  const rows = [];
  for (const candidate of support ? SUPPORT_ACCESSORY_CANDIDATES : SPEC_ACCESSORY_CANDIDATES) {
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
function supportModelContext() {
  return { selection: state.selected, skillEffects: state.skillEffects, enlightenmentItems: state.enlightenment?.items || [] };
}
function supportCombinedPowerEstimate(snapshot, upgradedSnapshot, officialPercent, basis) {
  const before = supportContributionModel(snapshot, supportModelContext());
  const after = supportContributionModel(upgradedSnapshot, supportModelContext());
  const impact = supportUpgradeImpact({ before, after, officialPercent });
  const official = snapshotOfficialCombatPower(snapshot);
  return {
    value: round2(official * Math.max(0, Number(impact.combinedPercent || 0)) / 100),
    officialValue: round2(official * Math.max(0, Number(impact.officialPercent || 0)) / 100),
    percent: round2(Math.max(0, Number(impact.combinedPercent || 0))),
    officialPercent: round2(impact.officialPercent),
    partyPercent: round2(impact.partyPercent),
    carePercent: round2(impact.carePercent),
    confidence: 'support-modeled',
    basis,
    metric: 'support-combined',
    before,
    after,
    weights: impact.weights
  };
}
function supportAccessoryPowerEstimate(candidate, snapshot = state.powerSnapshot) {
  return supportCombinedPowerEstimate(
    snapshot,
    snapshotWithAccessoryCandidate(snapshot, candidate),
    supportOfficialAccessoryTransition(candidate),
    '공식 전투력 악세 계수 + 파티 버프/케어 기여 모델 (30/60/10)'
  );
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
  const support = isSupportPowerSnapshot(state.powerSnapshot);
  const candidates = accessoryUpgradeCandidates(equipped, support);
  if (!candidates.length) {
    return [{ category: 'accessory', item: { type: '악세', name: '다음 옵션 후보' }, available: false, reason: '현재 악세에서 상상·상중·중상으로 올릴 후보 없음', powerDelta: 0, cost: {}, expectedCost: {} }];
  }
  const rows = await Promise.all(candidates.map(async candidate => {
    try {
      const data = await fetchMarketJson(`/api/market-prices?mode=accessory&role=${support ? 'support' : 'dealer'}&part=${encodeURIComponent(candidate.part)}&combo=${encodeURIComponent(candidate.combo)}`);
      const item = data.lowest || data.items?.[0] || null;
      const price = Number(item?.price || 0);
      const powerEstimate = support ? supportAccessoryPowerEstimate(candidate, state.powerSnapshot) : accessoryPowerEstimate(candidate, state.powerSnapshot);
      const powerDelta = round2(powerEstimate.value);
      const cost = specMarketCost(price, item?.pheonCost || 0);
      return {
        category: 'accessory',
        item: { type: candidate.instanceLabel, name: candidate.equippedItem?.name || `${candidate.label} ${candidate.comboLabel}`, icon: item?.icon || '', quality: item?.quality },
        available: price > 0 && Number(powerEstimate.percent || 0) > 0,
        from: '',
        to: candidate.comboLabel,
        cost,
        expectedCost: { expectedGold: cost.totalGold, expectedSilver: 0 },
        powerDelta,
        powerEstimate,
        comparisonEffects: accessoryEffectDelta(candidate),
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
  return isSupportSnapshot(snapshot);
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
function gemAnalyzerPowerEstimate(snapshot, gem, nextLevel) {
  const analysis = gemUpgradeEfficiency({
    data: state.combatAnalyzer,
    snapshot,
    skillEffects: state.skillEffects,
    gem,
    nextLevel,
    support: isSupportPowerSnapshot(snapshot)
  });
  if (!analysis) return null;
  const official = snapshotOfficialCombatPower(snapshot);
  const percent = Math.max(0, Number(analysis.gainPercent || 0));
  return {
    value: round2(official * percent / 100),
    percent: round2(percent),
    confidence: analysis.match === 'ark-grid' ? 'build-analyzed' : 'build-estimated',
    basis: analysis.match === 'ark-grid'
      ? `Ark Grid combat analyzer ${analysis.analyzerTag}`
      : `class engraving combat analyzer fallback ${analysis.analyzerTag}`,
    metric: 'damage',
    analysis
  };
}
function supportGemPowerEstimate(snapshot, gem, nextLevel) {
  const officialEstimate = gemPowerEstimate(snapshot, Number(gem?.level || 0), nextLevel, 1);
  return supportCombinedPowerEstimate(
    snapshot,
    snapshotWithGemLevel(snapshot, gem, nextLevel),
    Number(officialEstimate?.percent || 0),
    `${officialEstimate?.basis || '공식 전투력 보석 보정 표본'} + 파티 버프/케어 기여 모델 (30/60/10)`
  );
}
async function calculateGemSpecEstimates(snapshot) {
  const gems = Array.isArray(snapshot?.gems?.items) ? snapshot.gems.items : [];
  const candidates = gems.filter(gem => Number(gem.level || 0) > 0 && Number(gem.level || 0) < 10);
  if (!candidates.length) return [{ category: 'gem', item: { type: '보석', name: '다음 보석 후보' }, available: false, reason: '장착 보석이 모두 최고 레벨이거나 파싱되지 않음', powerDelta: 0, cost: {}, expectedCost: {} }];
  let data = null;
  try { data = await fetchMarketJson('/api/market-prices?mode=gemList'); } catch (error) {
    return [{ category: 'gem', item: { type: '보석', name: '보석 시세' }, available: false, reason: error.message || '보석 시세 조회 실패', powerDelta: 0, cost: {}, expectedCost: {} }];
  }
  return candidates.map(gem => {
    const support = isSupportPowerSnapshot(snapshot);
    const kind = gemKindLabel(gem);
    const currentLevel = Number(gem.level || 0);
    const nextLevel = currentLevel + 1;
    const row = (data.rows || []).find(item => Number(item.level || 0) === currentLevel);
    const market = kind === '작열' ? row?.cooldown : row?.damage;
    const bound = isBoundGem(gem);
    const buyCount = gemFusionPurchaseCount(gem);
    const price = Number(market?.price || 0) * buyCount;
    const analyzedEstimate = support ? null : gemAnalyzerPowerEstimate(snapshot, gem, nextLevel);
    const calibration = support ? supportGemPowerEstimate(snapshot, gem, nextLevel) : analyzedEstimate || gemPowerEstimate(snapshot, currentLevel, nextLevel, 1);
    const perGemDelta = combatPowerFeaturePerUnit('gemAverage') / Math.max(1, gems.length || 11);
    const powerDelta = calibration ? Number(calibration.value || 0) : round2(perGemDelta);
    const powerEstimate = calibration
      ? calibration
      : { confidence: 'estimated', basis: 'gem average combat-power coefficient model' };
    const skillName = String(gem.skillName || '').trim();
    const slotLabel = skillName || `보석 슬롯 ${Number(gem.slot || 0) + 1}`;
    return {
      category: 'gem',
      item: { type: '보석', name: `${slotLabel} ${kind} ${currentLevel}→${nextLevel}레벨`, icon: gem.icon || market?.icon || '' },
      available: price > 0 && Number(powerEstimate.percent || 0) > 0,
      from: currentLevel,
      to: nextLevel,
      cost: specMarketCost(price, 0),
      expectedCost: { expectedGold: price, expectedSilver: 0 },
      powerDelta,
      powerEstimate,
      supportLabel: `${kind} ${currentLevel}레벨 최저가 × ${buyCount}개${bound ? ' · 장착 보석 귀속' : ''}`,
      stepLabel: `${slotLabel} ${kind}`,
      stepDetail: support
        ? `Lv.${currentLevel} → Lv.${nextLevel} · 공식 전투력+파티 기여 복합 계산`
        : analyzedEstimate
        ? `Lv.${currentLevel} → Lv.${nextLevel} · ${analyzedEstimate.analysis.analyzerTag}${kind === '겁화' ? ` · 딜 지분 ${round2(analyzedEstimate.analysis.skillShare * 100)}%` : ' · 전체 작열 지수가중 평균'}`
        : `Lv.${currentLevel} → Lv.${nextLevel}`,
      reason: price > 0
        ? `${bound ? '장착 보석 귀속 · 같은 레벨 3개 구매 후 합성 기준' : '보유 1개 + 구매 2개 합성 기준'}${analyzedEstimate ? analyzedEstimate.analysis.match === 'ark-grid' ? ' · 아크그리드 전투분석 일치' : ' · 직업각인 전투분석 추정' : ''}`
        : '보석 시세 없음'
    };
  });
}
async function calculateEngravingSpecEstimates(snapshot) {
  const books = Array.isArray(snapshot?.effects?.engraving?.items) ? snapshot.effects.engraving.items : [];
  const candidates = books.filter(item => item?.grade === '유물' && Number(item.bookLevel || 0) < 4 && item?.deltaEffects && Object.keys(item.deltaEffects).length);
  if (!candidates.length) return [{ category: 'engraving', item: { type: '각인서', name: '다음 각인서 후보' }, available: false, reason: '유물 각인서 Lv.0~3 업그레이드 후보 없음', powerDelta: 0, cost: {}, expectedCost: {} }];
  const rows = await Promise.all(candidates.map(async book => {
    try {
      const data = await fetchMarketJson(`/api/market-prices?mode=engraving&name=${encodeURIComponent(book.name)}`);
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
        expectedCost: { expectedGold: price, expectedSilver: 0 },
        powerDelta,
        powerEstimate,
        comparisonEffects: { ...(book.deltaEffects || {}) },
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
function withSupportRecommendation(row, snapshot = state.powerSnapshot) {
  if (!isSupportPowerSnapshot(snapshot) || row?.powerEstimate?.metric === 'support-combined') return row;
  const directPercent = Number(row?.powerEstimate?.percent || 0);
  const official = snapshotOfficialCombatPower(snapshot);
  const fallbackPercent = official > 0 ? Number(row?.powerDelta || 0) / official * 100 : 0;
  const officialPercent = directPercent > 0 ? directPercent : fallbackPercent;
  if (!(officialPercent > 0)) return row;
  const powerEstimate = supportCombinedPowerEstimate(
    snapshot,
    snapshot,
    officialPercent,
    `${row?.powerEstimate?.basis || '공식 전투력 변화'} + 파티 기여 복합 추천 (공식 30/파티 60/케어 10)`
  );
  return {
    ...row,
    powerDelta: powerEstimate.value,
    powerEstimate
  };
}
async function storePowerCostEstimates(priceMap) {
  const honingRows = calculateNextNormalRefineEstimates(state.powerSnapshot, priceMap);
  const advancedHoningRows = calculateNextAdvancedHoningEstimates(state.powerSnapshot, priceMap);
  const gearRows = [...honingRows, ...advancedHoningRows].map(row => withSupportRecommendation(row));
  state.powerCostEstimates = gearRows;
  renderSpecEfficiencyTable();
  try {
    const marketRows = await calculateMarketSpecEstimates(state.powerSnapshot);
    state.powerCostEstimates = [...gearRows, ...marketRows.map(row => withSupportRecommendation(row))];
  } catch {
    state.powerCostEstimates = gearRows;
  }
  renderSpecEfficiencyTable();
  return state.powerCostEstimates;
}
function specRowCostForInventory(row, ownedMaterials = state.ownedMaterials) {
  const expectedMaterials = row?.expectedCost?.expectedMaterials;
  if (expectedMaterials && t4MaterialPriceCache) {
    const cost = calculateMaterialGoldCost(expectedMaterials, t4MaterialPriceCache, { ownedMaterials });
    return {
      gold: Number(cost.totalGold || 0),
      silver: Number(cost.silver || 0),
      remainingOwned: cost.remainingOwned,
      ownedUsed: cost.ownedUsed,
      rows: cost.rows
    };
  }
  return {
    gold: Number(row?.expectedCost?.expectedGold || 0),
    silver: Number(row?.expectedCost?.expectedSilver || row?.cost?.silver || 0),
    remainingOwned: normalizeOwnedMaterials(ownedMaterials),
    ownedUsed: {}
  };
}
function currentSpecPlannerPlan() {
  const currentPower = snapshotOfficialCombatPower(state.powerSnapshot);
  const targetPower = Number(state.specPlannerTarget || 0) || Math.ceil(currentPower + 100);
  return buildUpgradePlan({
    rows: state.powerCostEstimates,
    currentPower,
    mode: state.specPlannerMode,
    targetPower,
    budget: state.specPlannerBudget,
    ownedMaterials: state.ownedMaterials,
    costForRow: specRowCostForInventory
  });
}
function hasModeledRecommendationMetrics(rows = state.powerCostEstimates) {
  return (rows || []).some(row => ['damage', 'support-combined'].includes(row?.powerEstimate?.metric));
}
function plannerUnavailableSummary() {
  const rows = (state.powerCostEstimates || []).filter(row => !row?.available && row?.reason);
  const reasons = [...new Set(rows.map(row => `${row?.item?.type || '후보'}: ${row.reason}`))];
  if (!reasons.length) return '';
  return `<details class="specPlannerUnavailable"><summary>제외된 후보 ${reasons.length}개</summary><div>${reasons.map(reason => `<span>${escapeHtml(reason)}</span>`).join('')}</div></details>`;
}
function renderSpecPlannerOutput() {
  const output = $('specPlannerOutput');
  if (!output) return;
  const plan = currentSpecPlannerPlan();
  const mode = state.specPlannerMode;
  const modeled = hasModeledRecommendationMetrics(plan.steps.map(step => step.row));
  const indexLabel = isSupportPowerSnapshot(state.powerSnapshot) ? '복합 기여 지수' : modeled ? '환산 전투력' : '예상 전투력';
  const summaryLabel = mode === 'target'
    ? plan.reached ? '목표 달성 경로' : '현재 후보로 도달 가능한 경로'
    : '예산 안의 추천 경로';
  const statusText = mode === 'target'
    ? plan.reached
      ? `목표 ${formatNumber(plan.targetPower)} 달성`
      : `목표까지 ${formatNumber(plan.remainingTarget)} 부족`
    : `남은 예산 ${formatGold(plan.remainingBudget)}`;
  const steps = plan.steps.map((step, index) => {
    const row = step.row || {};
    const item = row.item || {};
    return `<div class="specPlannerStep">
      <span>${index + 1}</span>
      <div><b>${escapeHtml(row.stepLabel || item.type || item.name || '-')}</b><small>${escapeHtml(row.stepDetail || item.name || '-')}</small></div>
      <div><b>${formatGold(step.gold)}</b><small>개별 비용</small></div>
      <div><b>${formatGold(step.cumulativeGold)}</b><small>누적 사용 골드</small></div>
      <div><b>${formatNumber(step.projectedPower)}</b><small>${escapeHtml(indexLabel)}</small></div>
    </div>`;
  }).join('');
  output.innerHTML = `<div class="specPlannerResultHead">
      <div><b>${escapeHtml(summaryLabel)}</b><span>${escapeHtml(statusText)}</span></div>
      <div><strong>${formatGold(plan.cumulativeGold)}</strong><small>총 누적 골드</small></div>
      <div><strong>${formatNumber(plan.cumulativeSilver)}</strong><small>총 실링</small></div>
      <div><strong>+${formatNumber(plan.powerGain)}</strong><small>${escapeHtml(indexLabel)} 증가</small></div>
    </div>
    <div class="specPlannerSteps">${steps || '<p class="powerCostHint">현재 검증값과 시세가 모두 있는 추천 후보가 없습니다.</p>'}</div>
    ${plannerUnavailableSummary()}
    <p class="powerCostHint">현재 장비에서 바로 가능한 다음 단계 후보를 귀속 재료 부족분과 실시간 시세로 다시 계산합니다. ${modeled ? '보석의 환산 전투력은 딜 상승률을 현재 공식 전투력 크기에 맞춘 비교값이며 게임 내 공식 전투력 증가는 아닙니다. ' : ''}여러 강화 단계를 건너뛴 장기 경로는 포함하지 않습니다.</p>`;
}
function bindSpecPlannerControls() {
  document.querySelectorAll('[data-planner-mode]').forEach(button => {
    button.classList.toggle('active', button.dataset.plannerMode === state.specPlannerMode);
    button.onclick = () => {
      state.specPlannerMode = button.dataset.plannerMode === 'budget' ? 'budget' : 'target';
      bindSpecPlannerControls();
      renderSpecPlannerOutput();
    };
  });
  const targetWrap = $('specPlannerTargetWrap');
  const budgetWrap = $('specPlannerBudgetWrap');
  targetWrap?.classList.toggle('hidden', state.specPlannerMode !== 'target');
  budgetWrap?.classList.toggle('hidden', state.specPlannerMode !== 'budget');
  const targetInput = $('specPlannerTargetInput');
  const budgetInput = $('specPlannerBudgetInput');
  const currentPower = snapshotOfficialCombatPower(state.powerSnapshot);
  if (targetInput) {
    const targetLabel = $('specPlannerTargetWrap')?.querySelector('span');
    if (targetLabel) targetLabel.textContent = isSupportPowerSnapshot(state.powerSnapshot) ? '목표 복합 기여 지수' : hasModeledRecommendationMetrics() ? '목표 환산 전투력' : '목표 전투력';
    if (!(state.specPlannerTarget > 0)) state.specPlannerTarget = Math.ceil(currentPower + 100);
    targetInput.value = String(Math.round(state.specPlannerTarget));
    targetInput.onchange = () => {
      state.specPlannerTarget = Math.max(currentPower, Number(targetInput.value || currentPower));
      renderSpecPlannerOutput();
    };
  }
  if (budgetInput) {
    budgetInput.value = String(Math.round(state.specPlannerBudget));
    budgetInput.onchange = () => {
      state.specPlannerBudget = Math.max(0, Number(budgetInput.value || 0));
      renderSpecPlannerOutput();
    };
  }
}
function selectedScenarioRows() {
  const selected = state.specScenarioSelectedKeys;
  return (state.powerCostEstimates || []).filter(row => row?.available && selected.has(specEstimateKey(row)));
}
function specComparisonEffectTotals(rows) {
  const total = { critRate: 0, critDamage: 0, attackSpeed: 0, moveSpeed: 0 };
  for (const row of rows || []) {
    const effects = row?.comparisonEffects || {};
    for (const key of Object.keys(total)) total[key] += Number(effects[key] || 0);
  }
  return total;
}
function currentSpecScenarioPayload() {
  return {
    version: 1,
    characterName: state.powerSnapshot?.profile?.name || $('characterName')?.value || '',
    selectedKeys: [...state.specScenarioSelectedKeys],
    selectedNodes: cloneSelection(state.selected),
    ownedMaterials: normalizeOwnedMaterials(state.ownedMaterials),
    plannerMode: state.specPlannerMode,
    plannerTarget: state.specPlannerTarget,
    plannerBudget: state.specPlannerBudget
  };
}
function applySpecScenarioPayload(payload, options = {}) {
  if (!payload || typeof payload !== 'object') return false;
  state.specScenarioSelectedKeys = new Set(Array.isArray(payload.selectedKeys) ? payload.selectedKeys : []);
  if (payload.selectedNodes && typeof payload.selectedNodes === 'object') state.selected = cloneSelection(payload.selectedNodes);
  if (payload.ownedMaterials && typeof payload.ownedMaterials === 'object') {
    state.ownedMaterials = normalizeOwnedMaterials(payload.ownedMaterials);
    writeStoredObject(SPEC_OWNED_STORAGE_KEY, state.ownedMaterials);
  }
  state.specPlannerMode = payload.plannerMode === 'budget' ? 'budget' : 'target';
  state.specPlannerTarget = Math.max(0, Number(payload.plannerTarget || 0));
  state.specPlannerBudget = Math.max(0, Number(payload.plannerBudget || state.specPlannerBudget));
  if (!options.deferRender) {
    renderEvolutionTiers();
    calculateAndRender();
    renderSpecEfficiencyTable();
  }
  return true;
}
function renderSpecScenarioComparison() {
  const output = $('specScenarioOutput');
  if (!output || !state.powerSnapshot) return;
  const rows = selectedScenarioRows();
  const plan = buildUpgradePlan({
    rows,
    currentPower: snapshotOfficialCombatPower(state.powerSnapshot),
    mode: 'all',
    ownedMaterials: state.ownedMaterials,
    costForRow: specRowCostForInventory
  });
  const apiSelection = Object.keys(state.apiSelected || {}).length ? state.apiSelected : state.selected;
  const baseCalc = statsWithSelection(apiSelection);
  const changedCalc = statsWithSelection(state.selected);
  const effects = specComparisonEffectTotals(rows);
  const basePower = snapshotOfficialCombatPower(state.powerSnapshot);
  const support = isSupportPowerSnapshot(state.powerSnapshot);
  const officialPowerGain = rows.reduce((sum, row) => {
    if (row?.powerEstimate?.metric === 'support-combined') return sum + Number(row.powerEstimate.officialValue || 0);
    if (row?.powerEstimate?.metric === 'damage') return sum;
    return sum + Number(row?.powerDelta || 0);
  }, 0);
  const changedPower = basePower + officialPowerGain;
  const nodeRatio = Number(baseCalc.result.value || 0) > 0 ? Number(changedCalc.result.value || 0) / Number(baseCalc.result.value || 1) : 1;
  const powerRatio = basePower > 0 ? changedPower / basePower : 1;
  const modeledRatio = rows.reduce((factor, row) => {
    if (!['damage', 'support-combined'].includes(row?.powerEstimate?.metric)) return factor;
    return factor * (1 + Math.max(0, Number(row?.powerEstimate?.percent || 0)) / 100);
  }, 1);
  const damageChange = (nodeRatio * modeledRatio * (support ? 1 : powerRatio) - 1) * 100;
  const selectedNames = rows.map(row => row.stepLabel || row.item?.name || row.item?.type).filter(Boolean);
  output.innerHTML = `<div class="specScenarioMetrics">
      <div><span>공식 전투력</span><b>${formatNumber(basePower)}</b><i>→</i><strong>${formatNumber(changedPower)}</strong></div>
      <div><span>${support ? '복합 파티 기여' : '전투력+분석 기대 화력'}</span><b>기준</b><i>→</i><strong>${damageChange >= 0 ? '+' : ''}${damageChange.toFixed(2)}%</strong></div>
      <div><span>치명타 확률</span><b>${Number(baseCalc.result.critRate || 0).toFixed(2)}%</b><i>→</i><strong>${(Number(changedCalc.result.critRate || 0) + effects.critRate).toFixed(2)}%</strong></div>
      <div><span>치명타 피해</span><b>${Number(baseCalc.result.critDamage || 0).toFixed(2)}%</b><i>→</i><strong>${(Number(changedCalc.result.critDamage || 0) + effects.critDamage).toFixed(2)}%</strong></div>
      <div><span>공격/이동 속도</span><b>${Number(baseCalc.result.attackSpeed || 0).toFixed(2)} / ${Number(baseCalc.result.moveSpeed || 0).toFixed(2)}</b><i>→</i><strong>${(Number(changedCalc.result.attackSpeed || 0) + effects.attackSpeed).toFixed(2)} / ${(Number(changedCalc.result.moveSpeed || 0) + effects.moveSpeed).toFixed(2)}</strong></div>
      <div><span>예상 비용</span><b>0G</b><i>→</i><strong>${formatGold(plan.cumulativeGold)} · ${formatNumber(plan.cumulativeSilver)} 실링</strong></div>
    </div>
    <p class="specScenarioSelection">${selectedNames.length ? `B 적용: ${escapeHtml(selectedNames.join(' · '))}` : '효율표 왼쪽의 B 체크박스로 비교할 변경 사항을 선택하세요.'}</p>`;
  const saveButton = $('specScenarioSaveButton');
  const restoreButton = $('specScenarioRestoreButton');
  const shareButton = $('specScenarioShareButton');
  const clearButton = $('specScenarioClearButton');
  if (saveButton) saveButton.onclick = () => {
    writeStoredObject(SPEC_SCENARIO_STORAGE_KEY, currentSpecScenarioPayload());
    saveButton.textContent = '저장됨';
  };
  if (restoreButton) restoreButton.onclick = () => {
    const payload = readStoredObject(SPEC_SCENARIO_STORAGE_KEY);
    if (!payload.characterName) return;
    const currentName = state.powerSnapshot?.profile?.name || '';
    if (payload.characterName !== currentName) {
      state.pendingSharedScenario = payload;
      $('characterName').value = payload.characterName;
      searchCharacter(payload.characterName).then(() => {
        if (state.powerSnapshot) openSimulatorPage();
      });
      return;
    }
    applySpecScenarioPayload(payload);
  };
  if (shareButton) shareButton.onclick = async () => {
    const encoded = encodeSpecScenario(currentSpecScenarioPayload());
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('scenario', encoded);
    try {
      await navigator.clipboard.writeText(url.toString());
      shareButton.textContent = '링크 복사됨';
    } catch {
      window.prompt('공유 링크', url.toString());
    }
  };
  if (clearButton) clearButton.onclick = () => {
    state.specScenarioSelectedKeys.clear();
    renderSpecEfficiencyTable();
  };
}
function renderSpecEfficiencyShell() {
  const support = isSupportPowerSnapshot(state.powerSnapshot);
  return `<details class="powerSnapshotBlock powerEfficiencyPanel simulatorFold" open>
    <summary class="powerCostHead simulatorFoldSummary">
      <div><h3>스펙업 효율 순위</h3><p>${support ? '공식 전투력 30% · 파티 기여 60% · 케어 10%의 복합 상승률로 비교합니다.' : '전투력 상승률과 기대 골드를 한 줄에서 비교합니다.'}</p></div>
      <strong>낮을수록 효율적</strong>
    </summary>
    <div class="simulatorFoldBody">
    <section class="specPlannerPanel">
      <div class="specWorkspaceHead"><div><h4>목표 스펙업 경로</h4><p>효율이 좋은 다음 단계부터 순서대로 계산합니다.</p></div>
        <div class="specPlannerMode"><button type="button" data-planner-mode="target">목표 전투력</button><button type="button" data-planner-mode="budget">예산</button></div>
      </div>
      <div class="specPlannerInputs">
        <label id="specPlannerTargetWrap"><span>목표 전투력</span><input id="specPlannerTargetInput" type="number" min="0" step="1" /></label>
        <label id="specPlannerBudgetWrap"><span>사용 가능 골드</span><input id="specPlannerBudgetInput" type="number" min="0" step="1000" /></label>
      </div>
      <div id="specPlannerOutput" class="specPlannerOutput"><p class="powerCostHint">후보 비용을 계산하는 중입니다.</p></div>
    </section>
    <details class="specScenarioPanel">
      <summary class="specScenarioSummary"><span><b>A/B 비교</b><small>A는 검색한 현재 세팅, B는 노드 변경과 선택한 스펙업 후보입니다.</small></span></summary>
      <div class="specScenarioActions"><button id="specScenarioSaveButton" type="button">B 저장</button><button id="specScenarioRestoreButton" type="button">불러오기</button><button id="specScenarioShareButton" type="button">공유 링크</button><button id="specScenarioClearButton" type="button">선택 해제</button></div>
      <div id="specScenarioOutput" class="specScenarioOutput"></div>
    </details>
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
    </div>
  </details>`;
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
  if (row?.powerEstimate?.metric === 'support-combined') {
    const reason = row.reason || '공식 전투력·파티 기여 계산';
    return `${reason} · 공식 30/파티 60/케어 10`;
  }
  if (row?.category === 'accessory' || row?.category === 'gem' || row?.category === 'engraving') {
    const reason = row.reason || '시세 기준';
    const confidence = row.powerEstimate?.confidence;
    if (confidence === 'verified') return `${reason} · 검증 전투력`;
    if (confidence === 'build-analyzed') return `${reason} · 현재 아크그리드 전투분석`;
    if (confidence === 'build-estimated') return `${reason} · 직업각인 전투분석 추정`;
    if (confidence === 'build-sampled') return `${reason} · 동일 아크그리드 표본`;
    if (confidence === 'spec-sampled') return `${reason} · 동일 직업각인 표본`;
    if (confidence === 'class-sampled') return `${reason} · 동일 직업 표본`;
    if (confidence === 'class-estimated') return `${reason} · 직업별 추정 전투력`;
    return `${reason} · 추정 전투력`;
  }
  if (row?.category === 'advancedHoning') {
    if (!row?.available) return row.reason || '상급 재련 비용 또는 전투력 변화량 미확인';
    const missing = (row.expectedCost?.expectedCostRows || row.cost?.rows || []).filter(item => item.missingPrice).map(item => item.name);
    if (missing.length) return `시세 없음: ${missing.slice(0, 2).join(', ')}${missing.length > 2 ? ' 외' : ''}`;
    return `${row.reason || '2026년 6월 완화'} · 추정 전투력`;
  }
  if (row?.available && !Number(row.expectedCost?.ratePercent || 0)) return '강화 확률 미확인';
  if (!row?.available) return row.reason || '비용표 없음';
  const missing = (row.expectedCost?.expectedCostRows || row.cost?.rows || []).filter(item => item.missingPrice).map(item => item.name);
  if (missing.length) return `시세 없음: ${missing.slice(0, 2).join(', ')}${missing.length > 2 ? ' 외' : ''}`;
  const confidence = row.powerEstimate?.confidence;
  if (confidence === 'verified' || confidence === 'reference-verified') return row.hasGrowth ? '검증 전투력 · 장비 성장 포함' : '검증 전투력';
  if (confidence === 'build-sampled') return row.hasGrowth ? '동일 아크그리드 표본 · 장비 성장 포함' : '동일 아크그리드 표본';
  if (confidence === 'spec-sampled') return row.hasGrowth ? '동일 직업각인 표본 · 장비 성장 포함' : '동일 직업각인 표본';
  if (confidence === 'class-sampled') return row.hasGrowth ? '동일 직업 표본 · 장비 성장 포함' : '동일 직업 표본';
  if (confidence === 'class-estimated') return row.hasGrowth ? '직업별 추정 · 장비 성장 포함' : '직업별 추정';
  if (confidence === 'estimated') return row.hasGrowth ? '추정 전투력 · 장비 성장 포함' : '추정 전투력';
  if (row.hasGrowth) return '전투력 미검증 · 장비 성장 포함';
  return '전투력 미검증';
}
function combatPowerAccuracyHint() {
  if (isSupportPowerSnapshot(state.powerSnapshot)) return '서포터는 공식 전투력 변화와 상시·풀·종합 버프, 공증 가동률, 낙인, 아이덴티티, 케어 옵션을 함께 계산합니다.';
  const validation = state.combatPowerModel?.validation || {};
  const classSamples = Number(validation.honing?.scopedTransitionSamples || validation.honing?.classSpecSamples || 0);
  const analyzerProfiles = Number(state.combatAnalyzer?.presets?.length || 0);
  return `재련은 로펙 전후값 ${classSamples}개 중 현재 아크그리드·직업각인·직업 순으로 가까운 표본을 적용합니다. 보석은 ${analyzerProfiles}개 전투분석 프로필의 스킬별 딜 지분과 겁화/작열 공식을 우선 적용합니다.`;
}
function specPowerDeltaText(row, powerDelta) {
  const confidence = row?.powerEstimate?.confidence;
  if (row?.powerEstimate?.metric === 'support-combined') return `복합 기여 +${Number(row.powerEstimate.percent || 0).toFixed(3)}%`;
  if (!(powerDelta > 0)) return '전투력 -';
  if (row?.powerEstimate?.metric === 'damage') return `환산 전투력 +${powerDelta.toFixed(2)}`;
  if (confidence === 'verified' || confidence === 'reference-verified') return `전투력 +${powerDelta.toFixed(2)}`;
  if (confidence === 'build-sampled') return `빌드 표본 +${powerDelta.toFixed(2)}`;
  if (confidence === 'spec-sampled') return `각인 표본 +${powerDelta.toFixed(2)}`;
  if (confidence === 'class-sampled') return `표본 +${powerDelta.toFixed(2)}`;
  return `전투력 약 +${powerDelta.toFixed(2)}`;
}
function specEfficiencyFilterMatches(row, filter) {
  if (!filter || filter === 'all') return true;
  return row?.category === filter;
}
function specConfidenceMeta(row) {
  const confidence = row?.powerEstimate?.confidence || 'unverified';
  if (confidence === 'support-modeled') return { className: 'verified', label: '서폿 복합' };
  if (confidence === 'verified' || confidence === 'reference-verified') return { className: 'verified', label: '검증' };
  if (confidence === 'build-analyzed') return { className: 'verified', label: '빌드 분석' };
  if (confidence === 'build-sampled') return { className: 'sampled', label: '빌드 표본' };
  if (confidence === 'spec-sampled') return { className: 'sampled', label: '각인 표본' };
  if (confidence === 'class-sampled') return { className: 'sampled', label: '직업 표본' };
  if (confidence === 'estimated' || confidence === 'class-estimated' || confidence === 'build-estimated') return { className: 'estimated', label: '추정' };
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
  const supportModeled = confidenceValues.filter(value => value === 'support-modeled').length;
  const verified = confidenceValues.filter(value => confidenceTier(value) === 0).length;
  const analyzed = confidenceValues.filter(value => value === 'build-analyzed').length;
  const sampled = confidenceValues.filter(value => ['build-sampled', 'spec-sampled', 'class-sampled'].includes(value)).length;
  const status = supportModeled > 0 || verified > 0 || analyzed > 0 ? 'verified' : sampled > 0 ? 'sampled' : 'estimated';
  const label = supportModeled > 0 ? '공식 전투력+파티 기여 복합 모델' : analyzed > 0 ? '현재 아크그리드 전투분석 일치' : verified > 0 ? '현재 빌드 검증값 있음' : sampled > 0 ? '근접 빌드 표본 있음' : '현재 구간은 미검증';
  el.className = `combatPowerCoverage ${status}`;
  el.innerHTML = `<div><span>${escapeHtml(profile.className || '-')} · ${escapeHtml(profile.secondClass || '세팅 미확인')}</span><b>${escapeHtml(label)}</b></div><p>${supportModeled ? `서폿 복합 ${supportModeled} · ` : ''}검증 ${verified} · 전투분석 ${analyzed} · 표본 ${sampled} · 추정/미검증 ${Math.max(0, estimates.length - supportModeled - verified - analyzed - sampled)}</p>`;
}
function supportEstimateDetail(row) {
  const estimate = row?.powerEstimate;
  if (estimate?.metric !== 'support-combined') return '';
  return `공식 +${Number(estimate.officialPercent || 0).toFixed(3)}% · 파티 +${Number(estimate.partyPercent || 0).toFixed(3)}% · 케어 +${Number(estimate.carePercent || 0).toFixed(3)}%`;
}
function damageEstimateDetail(row) {
  const estimate = row?.powerEstimate;
  if (estimate?.metric !== 'damage') return '';
  const prefix = estimate.confidence === 'build-analyzed' ? '실질 딜' : '실질 딜 추정';
  return `${prefix} +${Number(estimate.percent || 0).toFixed(3)}%`;
}
function renderSpecEfficiencyTable() {
  const el = $('specEfficiencyTable');
  if (!el) return;
  const allEstimates = Array.isArray(state.powerCostEstimates) ? state.powerCostEstimates.slice() : [];
  updateCombatPowerCoverage(allEstimates);
  bindSpecEfficiencyFilters();
  const filteredEstimates = allEstimates.filter(row => specEfficiencyFilterMatches(row, state.specEfficiencyFilter));
  const estimates = filteredEstimates.filter(row => row?.available);
  if (!estimates.length) {
    const message = !allEstimates.length
      ? '재료 시세를 불러오는 중입니다.'
      : !filteredEstimates.length
      ? '선택한 종류의 스펙업 후보가 없습니다.'
      : '현재 계산 가능한 후보가 없습니다. 제외 사유는 위의 ‘제외된 후보’에서 확인할 수 있습니다.';
    el.innerHTML = `<p class="powerCostHint compactEmptyState">${message}</p>`;
    bindSpecPlannerControls();
    renderSpecPlannerOutput();
    renderSpecScenarioComparison();
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
    .map((row, index) => {
      const item = row.item || {};
      const cost = row.cost || {};
      const totalGold = row.available ? Number(cost.totalGold || 0) : 0;
      const tradeGold = Number(cost.tradeGold || 0);
      const fixedGold = Number(cost.fixedGold || 0);
      const expected = row.expectedCost || {};
      const silver = Number(expected.expectedSilver || cost.silver || 0);
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
        ? `최저가: ${supportLabel} · 총 기대 ${expectedAttempts.toFixed(2)}회${temperingText} · 실링 ${formatNumber(silver)}`
        : expectedGold > 0 && marketCostText
        ? `최저가: ${supportLabel} · 거래 ${formatGold(tradeGold)}${fixedGold > 0 ? ` · 페온 ${formatGold(fixedGold)}` : ''}`
        : expectedGold > 0
        ? `최저가: ${supportLabel} · 1회 성공 ${formatGold(expected.luckyGold || totalGold)} · 평균 ${formatGold(expectedGold)} · 장기백 ${formatGold(expected.pityGold)} · 실링 ${formatNumber(silver)}`
        : `1회 ${formatGold(totalGold)} · 거래 ${formatGold(tradeGold)} · 고정 ${formatGold(fixedGold)} · 실링 ${formatNumber(silver)}`;
      const powerText = specPowerDeltaText(row, powerDelta);
      const stepMainText = row.stepLabel || `+${Number(row.from || item.honingLevel || 0)} → +${Number(row.to || 0)}`;
      const upgradeDetailText = row.stepDetail || stepMainText;
      const supportDetailText = supportEstimateDetail(row);
      const damageDetailText = damageEstimateDetail(row);
      const modeledDetailText = [supportDetailText, damageDetailText].filter(Boolean).join(' · ');
      const powerDeltaText = powerText;
      const score = specEfficiencyScore(row);
      const rankText = Number.isFinite(score) ? String(++rankedIndex) : '-';
      const meterWidth = bestScore > 0 && Number.isFinite(score) ? Math.max(8, Math.min(100, (bestScore / score) * 100)) : 0;
      const confidenceMeta = specConfidenceMeta(row);
      const estimateKey = specEstimateKey(row);
      const scenarioChecked = state.specScenarioSelectedKeys.has(estimateKey) ? ' checked' : '';
      const scenarioLabel = `${item.name || item.type || '스펙업'} ${stepMainText} B 비교에 적용`;
      const scenarioControl = row.available
        ? `<label class="specScenarioPick" title="${escapeHtml(scenarioLabel)}"><input type="checkbox" aria-label="${escapeHtml(scenarioLabel)}" data-spec-scenario-key="${escapeHtml(estimateKey)}"${scenarioChecked}><span>B</span></label>`
        : '<span class="specScenarioPick disabled" aria-hidden="true">-</span>';
      const secondaryClass = state.specEfficiencyFilter === 'all' && index >= 5 ? ' specSecondaryCandidate hidden' : '';
      return `<div class="specEfficiencyRow confidence-${confidenceMeta.className}${secondaryClass}" data-category="${escapeHtml(row.category || '')}">
        <div class="specEfficiencyTarget">
          ${scenarioControl}
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
        <div class="specEfficiencyDetail">${escapeHtml(upgradeDetailText)}${modeledDetailText ? ` · ${escapeHtml(modeledDetailText)}` : ''} · ${escapeHtml(expectedDetailText)} · ${escapeHtml(specEfficiencyReason(row))}</div>
      </div>`;
    }).join('');
  const moreCount = state.specEfficiencyFilter === 'all' ? Math.max(0, sortedEstimates.length - 5) : 0;
  const moreButton = moreCount
    ? `<button id="specCandidateMoreButton" class="specCandidateMoreButton" type="button" aria-expanded="false">다른 추천 후보 ${moreCount}개 보기</button>`
    : '';
  el.innerHTML = `<div class="specEfficiencyHeader">
    <span>스펙업 목표</span><span>효율</span><span>비용</span><span>비용/효율</span>
  </div>${rows}${moreButton}
  <p class="powerCostHint">1% 상승당 기대 골드가 낮은 순서로 정렬하고, 효율이 같으면 검증 범위가 높은 후보를 먼저 표시합니다. ${isSupportPowerSnapshot(state.powerSnapshot) ? '서포터의 1%는 복합 기여 1%입니다.' : ''} 상급 재련은 현재 단계에서 다음 10단위 완료 지점까지의 총 기대비용을 사용합니다. ${escapeHtml(combatPowerAccuracyHint())}</p>`;
  el.querySelectorAll('[data-spec-scenario-key]').forEach(input => {
    input.onchange = () => {
      const key = input.dataset.specScenarioKey || '';
      if (input.checked) state.specScenarioSelectedKeys.add(key);
      else state.specScenarioSelectedKeys.delete(key);
      renderSpecScenarioComparison();
    };
  });
  const candidateMoreButton = $('specCandidateMoreButton');
  if (candidateMoreButton) candidateMoreButton.onclick = () => {
    const expanded = candidateMoreButton.getAttribute('aria-expanded') === 'true';
    el.querySelectorAll('.specSecondaryCandidate').forEach(row => row.classList.toggle('hidden', expanded));
    candidateMoreButton.setAttribute('aria-expanded', String(!expanded));
    candidateMoreButton.textContent = expanded ? `다른 추천 후보 ${moreCount}개 보기` : '추천 후보 접기';
  };
  bindSpecPlannerControls();
  renderSpecPlannerOutput();
  renderSpecScenarioComparison();
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
    <p class="powerCostHint">장비 성장은 최초 1회만 반영하고, 재련 재료는 기대 시도 횟수만큼 반영해 총 비용을 계산합니다.</p>
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
    <p class="powerCostHint">에기르·세르카 방어구와 무기 구간을 분리해 적용하며, 성장 재료는 시도 횟수와 별도로 최초 1회만 더합니다.</p>
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
  const materialRows = prep.materialNames.map(name => {
    const ownedKey = ownedMaterialKey(name);
    const displayName = ownedKey === '운명의 파편' ? '운명의 파편' : name;
    return `<label class="powerCostMaterial" data-material-name="${escapeHtml(name)}" data-owned-material="${escapeHtml(ownedKey)}">
    <span class="powerCostMaterialInfo"><b>${escapeHtml(displayName)}</b><small>단가 확인 중</small></span>
    <span class="ownedMaterialControl"><small>보유 귀속</small><input class="ownedMaterialInput" type="number" min="0" step="1" inputmode="numeric" value="${Math.floor(Number(state.ownedMaterials?.[ownedKey] || 0))}" aria-label="${escapeHtml(displayName)} 보유 귀속 수량" /></span>
  </label>`;
  }).join('');
  const boundRows = prep.boundMaterialNames.map(name => `<label class="powerCostMaterial boundOnly" data-owned-material="${escapeHtml(name)}">
    <span class="powerCostMaterialInfo"><b>${escapeHtml(name)}</b><small>${name === '고통의 가시' ? '그림자 레이드 세르카' : '상급 재련 담금질'} 귀속 전용 · 골드 비용 0</small></span>
    <span class="ownedMaterialControl"><small>보유 수량</small><input class="ownedMaterialInput" type="number" min="0" step="1" inputmode="numeric" value="${Math.floor(Number(state.ownedMaterials?.[name] || 0))}" aria-label="${escapeHtml(name)} 보유 수량" /></span>
  </label>`).join('');
  const armguardFromOptions = Array.from({ length: 25 }, (_, stage) => `<option value="${stage}"${stage === state.armguardRange.from ? ' selected' : ''}>${stage}강</option>`).join('');
  const armguardToOptions = Array.from({ length: 25 }, (_, index) => index + 1).map(stage => `<option value="${stage}"${stage === state.armguardRange.to ? ' selected' : ''}>${stage}강</option>`).join('');
  const armguardBreathModes = [
    { value: 'none', label: '노숨' },
    { value: 'optimal', label: '최적' },
    { value: 'full', label: '풀숨' }
  ].map(mode => `<label><input type="radio" name="armguardBreathMode" value="${mode.value}"${state.armguardBreathMode === mode.value ? ' checked' : ''} /><span>${mode.label}</span></label>`).join('');
  return `<details class="powerSnapshotBlock powerCostPrep simulatorFold">
    <summary class="powerCostHead simulatorFoldSummary">
      <div><h3>T4 비용 계산</h3><p>일반 재련과 상급 재련의 거래 재료·귀속 재료·고정 골드를 나눠 기대 비용을 계산합니다.</p></div>
      <strong>시세 계산 연결</strong>
    </summary>
    <div class="simulatorFoldBody powerCostFoldBody">
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
    <section class="armguardCostPanel" aria-labelledby="armguardCostTitle">
      <div class="armguardCostHeader">
        <div><h4 id="armguardCostTitle">완갑 재련 기대비용</h4><p>장비 성장과 장인의 기운 천장을 포함한 구간별 평균 비용입니다.</p></div>
        <div class="armguardRangeControls">
          <label><span>현재 단계</span><select id="armguardFromStage">${armguardFromOptions}</select></label>
          <i aria-hidden="true">→</i>
          <label><span>목표 단계</span><select id="armguardToStage">${armguardToOptions}</select></label>
        </div>
      </div>
      <div class="armguardBreathMode" role="radiogroup" aria-label="완갑 숨결 적용 방식">${armguardBreathModes}</div>
      <div id="armguardCostResult" class="armguardCostResult" aria-live="polite">
        <p class="armguardCostLoading">재료 시세를 불러오는 중입니다.</p>
      </div>
      <p class="powerCostHint armguardEstimateNote">예상 규칙: 목표 1~19강은 용암 10개+빙하 10개, 20~23강은 15개+15개, 24~25강은 25개+25개를 고정으로 함께 사용합니다. 공식 수량 공개 전 임시 배분이며 확인 즉시 교체합니다. 최적 모드는 노숨과 해당 단계 풀숨의 거래소 시세·기대 성공률만 비교하고, 보유 재료는 최종 구매 비용에서 차감합니다.</p>
    </section>
    <div class="powerCostGrid">
      <div>
        <h4>현재 장비 규칙</h4>
        <div class="powerCostGearList">${gearRows || '<p>전투 장비를 찾지 못했습니다.</p>'}</div>
      </div>
      <div>
        <h4>재료 비용 적용</h4>
        <div id="powerCostMaterialList" class="powerCostMaterialList">${[materialRows, boundRows].filter(Boolean).join('') || '<p>적용할 재료가 없습니다.</p>'}</div>
        <p class="powerCostHint">보유 귀속 수량을 먼저 차감한 뒤 부족한 수량만 거래소 시세로 계산합니다. 입력값은 이 브라우저에 저장됩니다.</p>
      </div>
    </div>
    </div>
  </details>`;
}

function formatExpectedAmount(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '-';
  return amount.toLocaleString('ko-KR', { maximumFractionDigits: amount < 100 ? 1 : 0 });
}

function renderArmguardMaterialRows(cost) {
  return (cost?.rows || []).map(row => {
    let detail = '';
    if (row.fixed) detail = '고정 골드 소모';
    else if (row.silver) detail = '실링 소모';
    else if (row.boundOnly) detail = row.boundShortage ? '귀속 재료 부족' : '귀속 전용';
    else if (row.missingPrice) detail = '시세 확인 필요';
    else detail = `구매 ${formatExpectedAmount(row.purchased)} · ${formatGold(row.gold)}`;
    return `<div class="armguardMaterialRow${row.missingPrice || row.boundShortage ? ' missing' : ''}">
      <span>${escapeHtml(row.name)}</span><b>${formatExpectedAmount(row.required)}</b><small>${escapeHtml(detail)}</small>
    </div>`;
  }).join('');
}

function renderArmguardExpectedCost(priceMap) {
  const result = $('armguardCostResult');
  if (!result) return;
  const plan = calculateArmguardRangeExpectedCost(state.armguardRange.from, state.armguardRange.to, priceMap, state.armguardBreathMode);
  const powerEstimate = estimateArmguardCombatPower(state.powerSnapshot, plan.from, plan.to);
  const cost = plan.cost || { rows: [], totalGold: 0, tradeGold: 0, fixedGold: 0, silver: 0 };
  const growthMaterialRows = renderArmguardMaterialRows(plan.growthCost);
  const refineMaterialRows = renderArmguardMaterialRows(plan.refineCost);
  const hasMissingPrice = (cost.rows || []).some(row => row.missingPrice);
  const breathStages = plan.stages.filter(stage => Number(stage.breathCount || 0) > 0);
  const firstBreathStage = breathStages[0] || null;
  const modeLabel = plan.breathMode === 'none' ? '노숨' : plan.breathMode === 'full' ? '풀숨' : '최적';
  const breathStartText = plan.breathMode === 'none'
    ? '노숨 적용'
    : plan.breathMode === 'full'
      ? '풀숨 적용'
      : !plan.hasBreathPrices
        ? '시세 확인 필요'
        : firstBreathStage
          ? `${firstBreathStage.from}→${firstBreathStage.to}강`
          : '선택 구간 미사용';
  const breathStartDetail = plan.breathMode === 'none'
    ? '모든 단계에서 숨결 재료 제외'
    : plan.breathMode === 'full'
      ? '모든 단계에서 예상 최대 배분 사용'
      : firstBreathStage
        ? `용암 ${formatExpectedAmount(firstBreathStage.lavaCount)} + 빙하 ${formatExpectedAmount(firstBreathStage.glacierCount)} · 합산 ${firstBreathStage.breathCount}/${firstBreathStage.maxBreath}`
        : plan.hasBreathPrices
          ? '현재 시세에서는 숨결 미사용이 최저 비용'
          : '용암·빙하 시세를 불러오면 자동 계산';
  const breathRows = plan.stages.map(stage => {
    const recommendation = stage.breathCount > 0
      ? `용암 ${formatExpectedAmount(stage.lavaCount)} + 빙하 ${formatExpectedAmount(stage.glacierCount)}`
      : '미사용';
    const combined = stage.breathCount > 0 ? `합산 ${stage.breathCount}/${stage.maxBreath}` : `합산 최대 ${stage.maxBreath}`;
    const saving = stage.expectedSavings > 0 ? `${formatGold(stage.expectedSavings)} 절약` : '숨결 이득 없음';
    return `<div class="armguardBreathRow">
      <b>${stage.from}→${stage.to}강</b><span>${escapeHtml(recommendation)}</span><small>${escapeHtml(combined)} · 기대 ${formatExpectedAmount(stage.expectedAttempts)}회 · ${escapeHtml(saving)}</small>
    </div>`;
  }).join('');
  const powerSummary = powerEstimate.available
    ? `<div class="armguardPowerSummary"><span>${plan.from}→${plan.to}강 예상 전투력</span><strong>+${formatNumber(Number(powerEstimate.powerGain || 0).toFixed(2))}</strong><small>${escapeHtml(powerEstimate.className || '검색 캐릭터')} 기준 · ${formatNumber(Number(powerEstimate.fromPower || 0).toFixed(2))} → ${formatNumber(Number(powerEstimate.toPower || 0).toFixed(2))} · +${Number(powerEstimate.gainPercent || 0).toFixed(2)}%</small></div>`
    : `<div class="armguardPowerSummary unavailable"><span>${plan.from}→${plan.to}강 예상 전투력</span><strong>계산 대기</strong><small>${escapeHtml(powerEstimate.reason || '캐릭터 기준값 확인 필요')}</small></div>`;
  result.innerHTML = `
    <div class="armguardCostSummary">
      ${powerSummary}
      <div><span>${plan.from}→${plan.to}강 기대 골드</span><strong>${formatGold(cost.totalGold)}</strong><small>거래 ${formatGold(cost.tradeGold)} · 재련 ${formatGold(cost.fixedGold)}</small></div>
      <div><span>기대 실링</span><strong>${formatNumber(Math.round(cost.silver || 0))}</strong><small>성장과 재련 시도 합계</small></div>
      <div><span>기대 재련 횟수</span><strong>${formatExpectedAmount(plan.expectedAttempts)}회</strong><small>${plan.stages.length}개 단계 합산</small></div>
      <div><span>장기백 기준 횟수</span><strong>${formatNumber(plan.pityAttempts)}회</strong><small>단계별 천장 합산</small></div>
      <div><span>예상 장기백</span><strong>약 ${Number(plan.expectedPityCount || 0).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}회</strong><small>선택 구간 단계별 기대값 합산</small></div>
      <div><span>숨결 방식 · ${escapeHtml(modeLabel)}</span><strong>${escapeHtml(breathStartText)}</strong><small>${escapeHtml(breathStartDetail)}</small></div>
    </div>
    <div class="armguardMaterialSections">
      <section>
        <div class="armguardMaterialHead"><span><b>장비 성장 재료</b><small>선택 구간마다 1회 소모</small></span><strong>${formatGold(plan.growthCost?.totalGold || 0)} · ${formatNumber(Math.round(plan.growthCost?.silver || 0))} 실링</strong></div>
        <div class="armguardMaterialList">${growthMaterialRows || '<p>성장 재료가 없습니다.</p>'}</div>
      </section>
      <section>
        <div class="armguardMaterialHead"><span><b>재련 시도 재료</b><small>기대 시도 횟수와 숨결 방식 반영</small></span><strong>${formatGold(plan.refineCost?.totalGold || 0)} · ${formatNumber(Math.round(plan.refineCost?.silver || 0))} 실링</strong></div>
        <div class="armguardMaterialList">${refineMaterialRows || '<p>재련 재료가 없습니다.</p>'}</div>
      </section>
    </div>
    <details class="armguardBreathDetails">
      <summary><span><b>단계별 숨결 최적 수량</b><small>${plan.hasBreathPrices ? `용암 ${formatGold(plan.lavaUnitGold)} · 빙하 ${formatGold(plan.glacierUnitGold)}` : '두 숨결 시세 확인 필요'}</small></span></summary>
      <div class="armguardBreathList">${breathRows}</div>
    </details>
    <p class="powerCostHint armguardPowerEstimateNote">완갑 전투력은 공개된 +10/+15/+20/+25 효과와 역산한 +0 효과를 검색 캐릭터의 기본 공격력·무기 공격력·공식 전투력에 적용한 출시 전 예상치입니다. 10→11, 15→16, 20→21강은 등급 돌파 증가를 크게 반영했으며 실제 출시 데이터 확인 후 교체합니다.</p>
    ${hasMissingPrice ? '<p class="armguardCostWarning">시세가 없는 재료는 기대 골드 합계에서 제외되었습니다.</p>' : ''}`;
}

function bindArmguardCostControls(priceMap) {
  const fromSelect = $('armguardFromStage');
  const toSelect = $('armguardToStage');
  const modeInputs = [...document.querySelectorAll('input[name="armguardBreathMode"]')];
  if (!fromSelect || !toSelect) return;
  const update = changed => {
    let from = Math.max(0, Math.min(24, Number(fromSelect.value || 0)));
    let to = Math.max(1, Math.min(25, Number(toSelect.value || 25)));
    if (to <= from) {
      if (changed === 'from') to = Math.min(25, from + 1);
      else from = Math.max(0, to - 1);
    }
    state.armguardRange = { from, to };
    fromSelect.value = String(from);
    toSelect.value = String(to);
    renderArmguardExpectedCost(priceMap);
  };
  fromSelect.addEventListener('change', () => update('from'));
  toSelect.addEventListener('change', () => update('to'));
  modeInputs.forEach(input => input.addEventListener('change', () => {
    if (!input.checked) return;
    state.armguardBreathMode = ['none', 'full'].includes(input.value) ? input.value : 'optimal';
    renderArmguardExpectedCost(priceMap);
  }));
  update();
}
async function loadT4MaterialPriceMap() {
  if (t4MaterialPriceCache) return t4MaterialPriceCache;
  if (t4MaterialPriceInflight) return t4MaterialPriceInflight;
  t4MaterialPriceInflight = fetchMarketJson('/api/market-prices?mode=t4Materials')
    .then(data => {
      t4MaterialPriceCache = buildT4MaterialPriceMap(data);
      return t4MaterialPriceCache;
    })
    .finally(() => { t4MaterialPriceInflight = null; });
  return t4MaterialPriceInflight;
}
function buildT4MaterialPriceMap(data) {
  const map = new Map();
  for (const item of data?.items || []) map.set(item.requestedName || item.name, item);
  return map;
}
async function loadCrystalPrice(force = false) {
  if (!force && crystalPriceCache) return crystalPriceCache;
  if (crystalPriceInflight) return crystalPriceInflight;
  crystalPriceInflight = fetchMarketJson(`/api/crystal-price${force ? '?force=1' : ''}`)
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
    bindArmguardCostControls(priceMap);
    list.querySelectorAll('.powerCostMaterial').forEach(row => {
      const name = row.dataset.materialName || '';
      if (!name || BOUND_ONLY_MATERIALS.has(name)) return;
      const item = priceMap.get(name);
      const small = row.querySelector('small');
      if (!small) return;
      if (!item || item.missing || !Number(item.price || 0)) {
        small.textContent = '시세 없음 · 부족 수량은 비용 계산에서 제외됨';
        row.classList.add('missing');
        return;
      }
      if (Number(item.shardCount || 0) && Number(item.shardUnitPrice || 0)) {
        small.textContent = `가장 싼 주머니 기준 파편 1개당 ${formatGold(item.shardUnitPrice)} · ${Number(item.shardCount).toLocaleString('ko-KR')}개 묶음`;
        return;
      }
      const unit = Number(item.effectiveUnitPrice || item.unitPrice || item.price || 0);
      small.textContent = `거래소 단가 ${formatGold(unit)} · 부족분만 구매 비용 반영`;
    });
    list.querySelectorAll('.ownedMaterialInput').forEach(input => {
      input.addEventListener('change', () => {
        const row = input.closest('[data-owned-material]');
        const name = row?.dataset?.ownedMaterial || '';
        if (!name) return;
        state.ownedMaterials[name] = Math.max(0, Math.floor(Number(input.value || 0)));
        if (!state.ownedMaterials[name]) delete state.ownedMaterials[name];
        writeStoredObject(SPEC_OWNED_STORAGE_KEY, state.ownedMaterials);
        renderArmguardExpectedCost(priceMap);
        storePowerCostEstimates(priceMap);
      });
    });
    await Promise.all([loadCombatPowerModel(), loadCombatAnalyzer()]);
    await storePowerCostEstimates(priceMap);
  } catch {
    state.powerCostEstimates = [];
    renderSpecEfficiencyTable();
    list.querySelectorAll('.powerCostMaterial small').forEach(small => {
      small.textContent = '시세 확인 실패 · 시세탭 재료에서 다시 확인 가능';
    });
    bindArmguardCostControls(new Map());
  }
}
function gemAnalyzerSummaryHtml(snapshot) {
  if (isSupportPowerSnapshot(snapshot)) return '<b>서포트 보석 효율</b><span>공식 전투력과 공증·낙인·아이덴티티·케어 기여를 함께 계산합니다.</span>';
  if (!state.combatAnalyzer) return '<b>전투분석 로딩 중</b><span>아크그리드와 보석 스킬을 대조하고 있습니다.</span>';
  const profile = findCombatAnalyzerProfile(state.combatAnalyzer, snapshot, state.skillEffects);
  const exact = profile.match === 'ark-grid';
  return `<b>${exact ? '아크그리드 전투분석 일치' : '직업각인 전투분석 추정'}</b><span>${escapeHtml(profile.tag || '-')} · ${exact ? '코어·조건 보석 일치' : '동일 직업각인 또는 장착 보석 기반'}</span>`;
}
function renderSupportContributionPanel(snapshot) {
  const model = supportContributionModel(snapshot, supportModelContext());
  if (!model) return '';
  const metric = (label, value, detail) => `<div class="supportPowerMetric"><span>${escapeHtml(label)}</span><b>${Number(value || 0).toFixed(2)}%</b><small>${escapeHtml(detail)}</small></div>`;
  return `<details class="powerSnapshotBlock supportPowerPanel simulatorFold">
    <summary class="simulatorFoldSummary"><span><h3>서포터 파티 기여</h3><small>종합 ${model.totalPercent.toFixed(2)}% · 상시 ${model.allTimePercent.toFixed(2)}% · 풀 ${model.fullPercent.toFixed(2)}%</small></span><strong>복합 추천</strong></summary>
    <div class="simulatorFoldBody"><div class="powerBuildHeader"><b>상세 기여 지표</b><span>실전 가동률 반영 · 공식 30 / 파티 60 / 케어 10</span></div>
    <div class="supportPowerGrid">
      ${metric('상시 버프', model.allTimePercent, '공증·낙인·진화')}
      ${metric('풀 버프', model.fullPercent, '상시+아이덴티티+각성')}
      ${metric('종합 버프', model.totalPercent, '실전 가동률 가중')}
      ${metric('공증 가동률', model.detail.overallAttackUptime * 100, 'A/B 공증 교대')}
      ${metric('아이덴티티 가동률', model.detail.identityUptime * 100, '특화·쿨감·획득량')}
      ${metric('케어 보정', model.carePercent, '회복·보호막 옵션')}
    </div>
    <p>공격력 ${Math.round(model.detail.attackPower).toLocaleString('ko-KR')} · 낙인 보너스 ${model.detail.brandBonus.toFixed(2)}% · 아군 공격 강화 ${model.detail.allyAttackA.toFixed(2)}% · 아군 피해 강화 ${model.detail.allyDamageBonus.toFixed(2)}%${model.detail.skillCycleApplied ? ` · 공증 주기 ${model.detail.actualCooldownA.toFixed(2)}초 / ${model.detail.actualCooldownB.toFixed(2)}초` : ''}</p></div>
  </details>`;
}
function renderSkillCyclePanel() {
  const cycle = state.skillCycle;
  if (!cycle?.items?.length) return '';
  const rows = cycle.items
    .slice()
    .sort((left, right) => Number(right.normalizedShare || 0) - Number(left.normalizedShare || 0) || Number(right.level || 0) - Number(left.level || 0))
    .map(item => {
      const tripod = Number(item.cooldown?.flatSeconds || 0)
        ? `트포 ${Number(item.cooldown.flatSeconds) > 0 ? '-' : '+'}${Math.abs(Number(item.cooldown.flatSeconds)).toFixed(1)}초`
        : Number(item.cooldown?.percentReduction || 0)
          ? `트포 ${Number(item.cooldown.percentReduction).toFixed(1)}%`
          : '';
      const factors = [
        tripod,
        Number(item.gemCooldownReduction || 0) ? `보석 ${Number(item.gemCooldownReduction).toFixed(0)}%` : '',
        item.rune?.name ? `${item.rune.name}${item.rune.stochastic ? '(확률)' : ''}` : ''
      ].filter(Boolean).join(' · ') || '신속만 적용';
      return `<div class="skillCycleRow"><b>${escapeHtml(item.name)} <small>Lv.${Number(item.level || 0)}</small></b><span>${item.normalizedShare > 0 ? `${(item.normalizedShare * 100).toFixed(1)}%` : '-'}</span><span>${Number(item.baseCooldownSeconds).toFixed(1)}초</span><strong>${Number(item.effectiveCooldownSeconds).toFixed(2)}초</strong><small>${escapeHtml(factors)}</small></div>`;
    }).join('');
  const warnings = [
    cycle.appliedCycleLinkCount ? `아크그리드 쿨 연쇄 ${cycle.appliedCycleLinkCount}건을 스택·초기화 순서대로 반영` : '',
    cycle.identityDriverSharePercent ? `변신·아이덴티티 ${Number(cycle.identityDriverSharePercent).toFixed(1)}%는 현재 스킬의 게이지 수급 주기에 연동` : '',
    cycle.unmodeledSharePercent ? `초각성·미장착 ${Number(cycle.unmodeledSharePercent).toFixed(1)}%는 일반 쿨감에서 제외` : '',
    cycle.unresolvedCycleLinkCount ? `현재 트리와 연결되지 않은 아크그리드 연쇄 ${cycle.unresolvedCycleLinkCount}건은 제외` : '',
    cycle.stochasticCycleLinkCount ? `발동률 미공개 아크그리드 ${cycle.stochasticCycleLinkCount}건은 기대값 환산 제외` : '',
    cycle.stochasticRuneCount ? `속행 ${cycle.stochasticRuneCount}개는 발동 확률 미공개로 직접 초 환산 제외` : ''
  ].filter(Boolean).join(' · ');
  return `<details class="powerSnapshotBlock skillCyclePanel simulatorFold">
    <summary class="simulatorFoldSummary"><span><h3>현재 스킬 사이클</h3><small>${cycle.usedSkillCount}개 · 계산 지분 ${Number(cycle.modeledSharePercent ?? cycle.mappedSharePercent).toFixed(1)}% · 가중 평균 ${cycle.weightedCooldownSeconds.toFixed(2)}초</small></span><strong>초단위</strong></summary>
    <div class="simulatorFoldBody"><div class="skillCycleTable"><div class="skillCycleRow skillCycleHeader"><b>스킬</b><span>딜 지분</span><span>기본</span><strong>장착효과</strong><small>적용 요소</small></div>${rows}</div>${warnings ? `<p>${escapeHtml(warnings)}</p>` : ''}</div>
  </details>`;
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
      <details class="powerSnapshotBlock simulatorFold">
        <summary class="simulatorFoldSummary"><span><h3>장착 보석</h3><small>장착 중인 보석 11개와 귀속 여부</small></span></summary>
        <div class="simulatorFoldBody"><div id="gemAnalyzerSummary" class="powerBuildHeader">${gemAnalyzerSummaryHtml(snapshot)}</div><div class="powerGemList">${equippedGems || '<span>보석 정보를 찾지 못했습니다.</span>'}</div></div>
      </details>
      ${renderSkillCyclePanel()}
      ${renderSupportContributionPanel(snapshot)}
      <details class="powerSnapshotBlock powerBuildPanel simulatorFold">
        <summary class="simulatorFoldSummary"><span><h3>장비 파싱</h3><small>장비 · 악세사리 · 아크그리드 원자료</small></span></summary>
        <div class="simulatorFoldBody">
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
      </details>
      ${renderPowerCostPrep(snapshot)}
    </div>
    <details class="powerSnapshotNote simulatorMethodNote"><summary>계산 기준 및 주의사항</summary><p>일반/상급 재련 단계는 공식 API Tooltip에서 읽습니다. 딜러 보석은 현재 아크그리드 전투분석의 스킬별 지분과 겁화/작열 공식을 적용하며, 환산 전투력은 게임 내 공식 수치가 아닌 비교값입니다. 서포터는 공식 전투력과 실전 파티 기여 모델을 30/60/10으로 결합하며, 파티 조합·보스 패턴에 따라 실제 효율은 달라질 수 있습니다.</p></details>
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
  add('attackSpeedBonus', '공격 속도');
  if (effect.critCap != null) parts.push(`치명타 적중률 상한 ${fmt(effect.critCap)}%`);
  if (effect.overCritToEvolutionDamageRate) parts.push(`초과 치적 1%당 진피 +${fmt(effect.overCritToEvolutionDamageRate)}%`);
  if (effect.overCritEvolutionDamageCap != null) parts.push(`초과 치적 진피 최대 +${fmt(effect.overCritEvolutionDamageCap)}%`);
  if (effect.sonicBreak) parts.push(`공이속 비례 진피 최대 +${fmt(effect.sonicBreak.maxEvolutionDamage || 0)}%`);
  return parts.join(' · ') || '딜 계산에 직접 반영되는 효과 없음';
}

function nodeTooltipHtml(node, selectedLevel) {
  const levels = [...new Set([
    ...Object.keys(node.levels || {}),
    ...Object.keys(node.displayLevels || {})
  ].map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  let shownLevels = levels;
  if (levels.length > 4) shownLevels = [...new Set([selectedLevel > 0 ? selectedLevel : levels[0], levels.at(-1)])];
  const levelRows = shownLevels.map(level => {
    const current = level === selectedLevel ? ' current' : '';
    const label = level === selectedLevel ? `현재 Lv.${level}` : `Lv.${level}`;
    const detail = node.displayLevels?.[String(level)] || nodeEffectText(node, node.levels?.[String(level)] || {});
    return `<div class="nodeTooltipLevel${current}"><b>${label}</b><span>${escapeHtml(detail)}</span></div>`;
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
  top = Math.min(Math.max(8, window.innerHeight - tooltipRect.height - 8), Math.max(8, top));
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function refreshFocusedNodeTooltip() {
  const focusedCard = document.activeElement?.closest?.('.nodeCard');
  if (focusedCard) showNodeTooltip(focusedCard);
  else hideNodeTooltip();
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
    card.addEventListener('contextmenu', onNodeCardContextMenu);
    card.addEventListener('mouseenter', () => showNodeTooltip(card));
    card.addEventListener('mouseleave', hideNodeTooltip);
    card.addEventListener('focus', () => showNodeTooltip(card));
    card.addEventListener('blur', hideNodeTooltip);
  });
}
function onNodeCardClick(event) {
  const card = event.currentTarget;
  const name = card.dataset.name;
  const node = getNode(name);
  const action = event.target?.dataset?.action || 'select';
  const cur = Number(state.selected[name]?.level || 0);
  let nextLevel = cur;
  if (event.shiftKey) nextLevel = shiftClickTargetLevel(cur, node, 1);
  else if (action === 'minus') nextLevel = cur - 1;
  else nextLevel = cur + 1;
  setNodeLevel(name, nextLevel);
}
function onNodeCardContextMenu(event) {
  const card = event.currentTarget;
  const name = card.dataset.name;
  const node = getNode(name);
  event.preventDefault();
  const cur = Number(state.selected[name]?.level || 0);
  const nextLevel = event.shiftKey ? shiftClickTargetLevel(cur, node, -1) : cur - 1;
  setNodeLevel(name, nextLevel);
}
function setNodeLevel(name, desiredLevel) {
  let nextLevel = desiredLevel;
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
  const extraEvolutionDamage = num($('extraEvolutionDamage').value);
  const extraAdditionalDamage = num($('extraAdditionalDamage').value);
  const extraEnemyDamage = num($('extraEnemyDamage').value);
  const extraAttackSpeed = num($('extraAttackSpeed').value);
  const extraMoveSpeed = num($('extraMoveSpeed').value);
  const critSynergy = $('critSynergyEnabled').checked ? num($('critSynergyValue').value) : 0;
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
  const replacementEffects = { ...(engravingSimulation.replacementEffect || {}) };
  if (!engravingSimulation.adrenalineEnabled && engravingSimulation.replacementName === '돌격대장') {
    const moveSpeedRatio = Math.max(0, Math.min((moveSpeed - 100) / 40, 1));
    replacementEffects.conditionalDamage = Math.round(num(replacementEffects.conditionalDamage) * moveSpeedRatio * 100) / 100;
  }
  const engravingDamageMultiplier = !engravingSimulation.adrenalineEnabled && engravingSimulation.replacementName === '예리한 둔기' ? 0.98 : 1;
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
  if (!engravingSimulation.adrenalineEnabled) pushDamageSource(enemyDamageSources, `${engravingSimulation.replacementName} · 조건 충족`, replacementEffects.conditionalDamage);
  pushDamageSource(enemyDamageSources, '어빌리티 스톤 각인 보너스', state.abilityStone?.effects?.enemyDamage);
  pushDamageSource(enemyDamageSources, '추가 입력', extraEnemyDamage);
  pushDamageSource(enemyDamageSources, '백어택', backAttackEnemyDamage);
  pushDamageSource(enemyDamageSources, '카드 세트', num(state.card?.buckets?.enemyDamage));
  // 세 우마르가 오리라처럼 백어택 조건이 붙은 카드 효과는 백어택을 켰을 때만 넣는다.
  if ($('backAttackEnabled').checked) {
    pushDamageSource(enemyDamageSources, '카드 세트 · 백어택', num(state.card?.conditional?.backAttackEnemyDamage));
  }
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
    critRate: statCritRate + num(state.accessory.critRate) + num(state.bracelet.critRate) + num(state.enlightenment.critRate) + num(state.arkGrid.critRate) + num(engravingEffects.critRate) + num(state.abilityStone?.effects?.critRate) + dynamicEnlightenmentCritRate + extraCritRate + critSynergy + backAttackCritRate + num(state.card?.buckets?.critRate),
    critDamage: 200 + num(state.accessory.critDamage) + num(state.bracelet.critDamage) + num(state.enlightenment.critDamage) + num(state.arkGrid.critDamage) + num(engravingEffects.critDamage) + num(state.abilityStone?.effects?.critDamage) + dynamicEnlightenmentCritDamage + extraCritDamage + num(state.card?.buckets?.critDamage),
    critHitDamage: num(state.accessory.critHitDamage) + num(state.bracelet.critHitDamage) + num(state.enlightenment.critHitDamage) + num(engravingEffects.critHitDamage) + num(state.abilityStone?.effects?.critHitDamage),
    critHitDamageSources,
    evolutionDamage: num(state.enlightenment.evolutionDamage) + extraEvolutionDamage,
    manaSkillEvolutionDamage: 0,
    manaSkillCooldownReduction: 0,
    additionalDamage: num(state.accessory.additionalDamage) + num(state.bracelet.additionalDamage) + num(state.enlightenment.additionalDamage) + num(state.arkGrid.additionalDamage) + num(engravingEffects.additionalDamage) + num(state.abilityStone?.effects?.additionalDamage) + extraAdditionalDamage + num(state.card?.buckets?.additionalDamage),
    enemyDamage: effectivePercentFromSources(enemyDamageSources),
    enemyDamageSources,
    // 공격 속성이 변환된 카드 세트의 속성 피해. 다른 버킷과 독립이라 따로 곱한다.
    attributeDamage: num(state.card?.buckets?.attributeDamage),
    skillCritBonus: 0,
    skillDamage: 0,
    critSynergy,
    backAttackCritRate,
    backAttackEnemyDamage,
    adrenalineCritRate: num(adrenalineEffect.critRate),
    adrenalineAttackPower: num(adrenalineEffect.attackPower),
    attackPower: num(adrenalineEffect.attackPower) + num(state.abilityStone?.attackPower) + num(state.abilityStone?.effects?.attackPower) + num(engravingEffects.attackPower),
    engravingDamageMultiplier,
    engravingEffects,
    replacementEngraving: engravingSimulation.adrenalineEnabled ? null : { name: engravingSimulation.replacementName, level: engravingSimulation.replacementBookLevel, effects: replacementEffects },
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
  if (effect.manaSkillEvolutionDamage) out.manaSkillEvolutionDamage = num(out.manaSkillEvolutionDamage) + effect.manaSkillEvolutionDamage;
  if (effect.manaSkillCooldownReduction && !isCooldownExcluded()) out.manaSkillCooldownReduction = num(out.manaSkillCooldownReduction) + effect.manaSkillCooldownReduction;
  if (effect.cooldownReduction && !isCooldownExcluded()) out.cooldownReduction = (out.cooldownReduction || 0) + effect.cooldownReduction;
  if (effect.sonicBreak) {
    const sonicDamage = calculateSonicBreakEvolutionDamage(
      out.attackSpeed || out.moveAttackSpeed || 100,
      out.moveSpeed || out.moveAttackSpeed || 100,
      effect.sonicBreak
    );
    out.evolutionDamage += sonicDamage;
    out.sonicBreakEvolutionDamage = (out.sonicBreakEvolutionDamage || 0) + sonicDamage;
    out.sonicBreakEffect = effect.sonicBreak;
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
  if (effect.attackSpeedBonus) { out.attackSpeed = (out.attackSpeed || out.moveAttackSpeed || 0) + effect.attackSpeedBonus; out.moveAttackSpeed = Math.min(out.attackSpeed, out.moveSpeed || out.moveAttackSpeed || 0); }
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
function scoreCore(stats) {
  // Lost Ark damage buckets: same bucket effects are additive first, then each bucket is multiplied.
  // Expected value = crit EV × 진화형피해 × 추가피해 × 적에게주는피해 × 속성피해 × 공격력증가.
  // 속성 피해는 카드 세트가 공격 속성을 변환했을 때만 붙으며 다른 버킷과 독립이다.
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
  const attributeMultiplier = 1 + (stats.attributeDamage || 0) / 100;
  const attackMultiplier = 1 + (stats.attackPower || 0) / 100;
  const skillDamageMultiplier = 1 + (stats.skillDamage || 0) / 100;
  const engravingDamageMultiplier = Number(stats.engravingDamageMultiplier || 1);
  // v4.8.8: 쿨감의 이론 DPS 증가분을 사용자가 입력한 '주력기 딜 지분'만큼 반영.
  // 쿨감 효과 제외 체크 시 끝마/무마/최적화 훈련 등 모든 cooldownReduction은 점수에서 0으로 처리.
  const cooldownExcluded = isCooldownExcluded();
  const generalCooldownReduction = cooldownExcluded ? 0 : Math.max(0, Math.min(Number(stats.cooldownReduction || 0), 95));
  const manaSkillCooldownReduction = cooldownExcluded ? 0 : Math.max(0, Math.min(Number(stats.manaSkillCooldownReduction || 0), 95));
  const cooldownReduction = Math.max(0, Math.min(generalCooldownReduction + manaSkillCooldownReduction, 95));
  const mainSkillDamageSharePct = cooldownExcluded ? 0 : Math.max(0, Math.min(Number($('mainSkillDamageShare')?.value ?? 60), 100));
  const cooldownEvaluation = cooldownExcluded
    ? { multiplier: 1, affectedSharePercent: 0, modeled: Boolean(state.skillCycle?.items?.length) }
    : evaluateEvolutionCooldown(state.skillCycle, generalCooldownReduction, {
      fallbackSharePercent: mainSkillDamageSharePct,
      manaSkillReduction: manaSkillCooldownReduction
    });
  const cooldownRatio = cooldownEvaluation.affectedSharePercent / 100;
  const cooldownMultiplier = cooldownEvaluation.multiplier;
  const value = critMultiplier * evoMultiplier * addMultiplier * enemyMultiplier * attributeMultiplier * attackMultiplier * skillDamageMultiplier * engravingDamageMultiplier * cooldownMultiplier;
  return { value, attributeDamage: stats.attributeDamage || 0, cooldownReduction, cooldownRatio: cooldownRatio * 100, cooldownMultiplier, cooldownModeled: cooldownEvaluation.modeled, skillDamageMultiplier, engravingDamageMultiplier, rawCritRate, critRate: rawCritRate, effectiveCritRate, critDamage: stats.critDamage, critHitDamage: effectiveCritHitDamage, displayCritHitDamage, evo, baseEvo: stats.evolutionDamage, convertedEvolutionDamage, overCrit, additionalDamage: stats.additionalDamage, enemyDamage: effectiveEnemyDamage, displayEnemyDamage, attackPower: stats.attackPower || 0, skillDamage: stats.skillDamage || 0, sonicBreakEvolutionDamage: stats.sonicBreakEvolutionDamage || 0, moveAttackSpeed: stats.moveAttackSpeed || 0, attackSpeed: stats.attackSpeed || stats.moveAttackSpeed || 0, moveSpeed: stats.moveSpeed || stats.moveAttackSpeed || 0 };
}

function scoreCoreWithArcanaExpectation(stats, { emperorNormalSkill = false } = {}) {
  const normal = scoreCore(stats);
  const model = currentArcanaCardExpectation(normal.cooldownReduction);
  if (!model || !normal.value) return normal;

  const cullStats = cloneBaseStats(stats);
  cullStats.skillCritBonus = num(cullStats.skillCritBonus) + ARCANA_CULL_EFFECT.critRate;
  cullStats.critDamage = num(cullStats.critDamage) + ARCANA_CULL_EFFECT.critDamage;
  const cull = scoreCore(cullStats);
  let chancellor = null;
  let cullChancellor = null;
  let value = weightedArcanaCardValue(normal.value, cull.value, model);
  if (model.key === 'emperor' && emperorNormalSkill) {
    const chancellorStats = cloneBaseStats(stats);
    chancellorStats.skillCritBonus = num(chancellorStats.skillCritBonus) + ARCANA_CHANCELLOR_EFFECT.critRate;
    chancellor = scoreCore(chancellorStats);
    const cullChancellorStats = cloneBaseStats(cullStats);
    cullChancellorStats.skillCritBonus = num(cullChancellorStats.skillCritBonus) + ARCANA_CHANCELLOR_EFFECT.critRate;
    cullChancellor = scoreCore(cullChancellorStats);
    value = weightedEmperorNormalSkillCardValue(normal.value, cull.value, chancellor.value, cullChancellor.value, model);
  }
  const combat = arcanaCombatExpectation(model);
  const expectationWeight = arcanaCullExpectationWeight(model);
  return {
    ...normal,
    value,
    arcanaCardExpectation: {
      key: model.key,
      engraving: model.engraving,
      probability: model.cullProbability,
      expectationWeight,
      chancellorProbability: Number(model.chancellorProbability || 0),
      chancellorExpectationWeight: arcanaChancellorExpectationWeight(model),
      sovereignProbability: Number(model.sovereignProbability || 0),
      sovereignExpectationWeight: arcanaSovereignExpectationWeight(model),
      emperorCombinedTriggerProbability: Number(model.emperorCombinedTriggerProbability || 0),
      emperorNormalSkill,
      cardsPerMinute: Number(model.cardsPerMinute || 0),
      baseCardsPerMinute: Number(model.baseCardsPerMinute || model.cardsPerMinute || 0),
      cardDrawMultiplier: Number(model.cardDrawMultiplier || 1),
      referenceCooldownReduction: Number(model.referenceCooldownReduction || 0),
      combatSeconds: Number(combat?.combatSeconds || 0),
      expectedCards: Number(combat?.cards || 0),
      expectedCullCards: Number(combat?.cullCards || 0),
      expectedChancellorCards: Number(combat?.chancellorCards || 0),
      expectedSovereignCards: Number(combat?.sovereignCards || 0),
      normalValue: normal.value,
      cullValue: cull.value,
      chancellorValue: Number(chancellor?.value || 0),
      cullChancellorValue: Number(cullChancellor?.value || 0),
      multiplier: normal.value ? value / normal.value : 1,
      evidenceLabel: model.evidenceLabel,
      sourceUrl: model.sourceUrl
    }
  };
}

function applyExperimentalSkillEffects(stats, item) {
  const out = cloneBaseStats(stats);
  const effects = item?.effects || {};
  if (item?.usesMana && num(out.manaSkillEvolutionDamage) > 0) {
    out.evolutionDamage += num(out.manaSkillEvolutionDamage);
  }
  // 확정 치명 트라이포드의 +100%도 원시 치적에 포함해 뭉툭한 가시 초과 치적 전환에 사용한다.
  out.skillCritBonus = num(out.skillCritBonus) + num(effects.critRate);
  out.critDamage += num(effects.critDamage);
  if (effects.critHitDamage) {
    out.critHitDamage += num(effects.critHitDamage);
    out.critHitDamageSources.push({ label: `스킬 · ${item.name}`, value: num(effects.critHitDamage) });
  }
  out.additionalDamage += num(effects.additionalDamage);
  if (effects.enemyDamage) {
    out.enemyDamageSources.push({ label: `스킬 · ${item.name}`, value: num(effects.enemyDamage) });
    out.enemyDamage = effectivePercentFromSources(out.enemyDamageSources);
  }
  out.attackPower += num(effects.attackPower);
  out.skillDamage = num(out.skillDamage) + num(effects.skillDamage);
  out.attackSpeed += num(effects.attackSpeed);
  out.moveSpeed += num(effects.moveSpeed);
  out.moveAttackSpeed = Math.min(out.attackSpeed, out.moveSpeed);
  if (out.sonicBreakEffect && (effects.attackSpeed || effects.moveSpeed)) {
    const previousSonicDamage = num(out.sonicBreakEvolutionDamage);
    const nextSonicDamage = calculateSonicBreakEvolutionDamage(out.attackSpeed, out.moveSpeed, out.sonicBreakEffect);
    out.evolutionDamage += nextSonicDamage - previousSonicDamage;
    out.sonicBreakEvolutionDamage = nextSonicDamage;
  }
  return out;
}

function normalizedSkillName(value) {
  return String(value || '').replace(/\s+/g, '').replace(/[·:]/g, '').trim().toLowerCase();
}

function matchedSkillItem(name, targetNames = []) {
  const candidates = [name, ...targetNames].map(normalizedSkillName).filter(Boolean);
  const items = state.skillEffects?.items || [];
  return items.find(item => candidates.some(candidate => {
    const itemName = normalizedSkillName(item?.name);
    return itemName && (itemName === candidate || itemName.includes(candidate) || candidate.includes(itemName));
  })) || null;
}

function weightedSkillUnits() {
  const shareRows = state.skillCycle?.shareRows || [];
  if (shareRows.length) {
    const explicitPassiveTargets = [...new Set([...(state.passiveSkillEffects?.rules || []), ...(state.arkGridSkillEffects?.rules || [])]
      .filter(rule => rule.scope === 'skill')
      .flatMap(rule => rule.targets || [])
      .filter(Boolean))];
    const units = shareRows.flatMap(row => {
      let targetNames = Array.isArray(row?.targetNames) && row.targetNames.length ? row.targetNames : [row?.name];
      const groupName = normalizedSkillName(row?.name);
      const groupedPassiveTargets = explicitPassiveTargets.filter(target => {
        const key = normalizedSkillName(target);
        return groupName && key && key !== groupName && key.includes(groupName);
      });
      if (groupedPassiveTargets.length && !matchedSkillItem(row?.name)) targetNames = groupedPassiveTargets;
      const weight = Number(row?.normalizedShare || 0) / Math.max(1, targetNames.length);
      return targetNames.map(name => {
        const item = matchedSkillItem(name, [row?.name]);
        return {
          name: item?.name || name || row?.name || '이름 없는 스킬',
          shareName: row?.name || name,
          targetNames: [name],
          category: item?.category || '',
          item,
          weight
        };
      });
    }).filter(row => row.weight > 0);
    for (const target of explicitPassiveTargets) {
      if (units.some(unit => normalizedSkillName(unit.name) === normalizedSkillName(target))) continue;
      const item = matchedSkillItem(target);
      units.push({ name: item?.name || target, shareName: target, targetNames: [target], category: item?.category || '', item, weight: 0 });
    }
    return units;
  }

  const items = skillExperimentItems(state.skillEffects);
  const weight = items.length ? 1 / items.length : 0;
  return items.map(item => ({
    name: item.name || '이름 없는 스킬',
    shareName: item.name || '',
    targetNames: [item.name].filter(Boolean),
    category: item.category || '',
    item,
    weight
  }));
}

function score(stats) {
  const units = weightedSkillUnits();
  const fallbackStats = !units.length && !isNoManaMainSkillEnabled() && num(stats.manaSkillEvolutionDamage) > 0
    ? applyExperimentalSkillEffects(stats, { usesMana: true, effects: {} })
    : stats;
  const baseResult = scoreCoreWithArcanaExpectation(fallbackStats);
  if (!units.length || !baseResult.value) {
    return {
      ...baseResult,
      skillExperimentMultiplier: 1,
      skillExperiment: { applied: false, count: 0, conditionalAssumed: true, items: [], commonCritRate: baseResult.rawCritRate }
    };
  }

  const identitySkills = state.combatAnalyzer?.identitySkills || [];
  const arcanaStream = currentArcanaStreamEffect();
  const arcanaModel = currentArcanaCardExpectation();
  const rows = units.map(unit => {
    const passive = passiveEffectsForSkill(state.passiveSkillEffects, unit, { identitySkills });
    const arkGrid = passiveEffectsForSkill(state.arkGridSkillEffects, unit, { identitySkills });
    const streamApplies = Boolean(arcanaStream) && normalizedSkillName(unit.name) !== normalizedSkillName(arcanaStream.skillName);
    const arcanaEffects = streamApplies ? { critRate: arcanaStream.critRate } : {};
    const effects = mergeSkillEffects(unit.item?.effects || {}, passive.effects, arkGrid.effects, arcanaEffects);
    const emperorNormalSkill = arcanaModel?.key === 'emperor' && normalizedSkillName(unit.category) === normalizedSkillName('일반 스킬');
    const usesMana = !isNoManaMainSkillEnabled() && unit.item?.usesMana === true;
    const skillStats = applyExperimentalSkillEffects(stats, { name: unit.name, effects, usesMana });
    const resultWithoutArcana = scoreCore(skillStats);
    const result = scoreCoreWithArcanaExpectation(skillStats, { emperorNormalSkill });
    return {
      name: unit.name,
      shareName: unit.shareName,
      level: Number(unit.item?.level || 0),
      share: unit.weight,
      conditional: isConditionalSkill(unit.item) || [...passive.rules, ...arkGrid.rules].some(rule => rule.scope === 'state') || streamApplies || emperorNormalSkill,
      guaranteedCrit: isGuaranteedCritSkill(unit.item) || Number(effects.critRate || 0) >= 99.99,
      summary: formatSkillEffectSummary(effects) || '수치 효과 없음',
      effects,
      passiveRules: [...passive.rules, ...arkGrid.rules],
      arcanaRules: streamApplies ? [{ category: '스킬 자버프', nodeName: `${arcanaStream.sourceSkill} · ${arcanaStream.sourceTripod}`, effects: arcanaEffects }] : [],
      valueWithoutArcana: resultWithoutArcana.value,
      value: result.value,
      gain: ((result.value / baseResult.value) - 1) * 100,
      rawCritRate: result.rawCritRate,
      effectiveCritRate: result.effectiveCritRate,
      critDamage: result.critDamage,
      convertedEvolutionDamage: result.convertedEvolutionDamage,
      result
    };
  });
  const modeledWeight = Math.min(1, rows.reduce((sum, row) => sum + Number(row.share || 0), 0));
  const weightedMultiplier = (1 - modeledWeight) + rows.reduce((sum, row) => sum + Number(row.share || 0) * (row.value / baseResult.value), 0);
  const appliedRows = rows.filter(row => hasNumericSkillEffects(row.effects) || row.result?.arcanaCardExpectation?.emperorNormalSkill);
  if (!appliedRows.length) {
    return {
      ...baseResult,
      skillExperimentMultiplier: 1,
      skillExperiment: { applied: false, count: rows.length, conditionalAssumed: true, items: rows, commonCritRate: baseResult.rawCritRate }
    };
  }
  const anchor = [...rows].sort((a, b) => Number(b.rawCritRate || 0) - Number(a.rawCritRate || 0) || Number(b.share || 0) - Number(a.share || 0))[0];
  const weightedConvertedEvolutionDamage = rows.reduce((sum, row) => sum + Number(row.share || 0) * Number(row.convertedEvolutionDamage || 0), 0)
    + (1 - modeledWeight) * Number(baseResult.convertedEvolutionDamage || 0);
  const baseWithoutArcana = scoreCore(stats);
  const weightedValue = baseResult.value * weightedMultiplier;
  const weightedValueWithoutArcana = (1 - modeledWeight) * baseWithoutArcana.value
    + rows.reduce((sum, row) => sum + Number(row.share || 0) * Number(row.valueWithoutArcana || 0), 0);
  const arcanaCardExpectation = baseResult.arcanaCardExpectation ? {
    ...baseResult.arcanaCardExpectation,
    multiplier: weightedValueWithoutArcana > 0 ? weightedValue / weightedValueWithoutArcana : baseResult.arcanaCardExpectation.multiplier
  } : null;
  return {
    ...baseResult,
    value: weightedValue,
    rawCritRate: Number(anchor?.rawCritRate ?? baseResult.rawCritRate),
    critRate: Number(anchor?.rawCritRate ?? baseResult.critRate),
    effectiveCritRate: Number(anchor?.effectiveCritRate ?? baseResult.effectiveCritRate),
    critDamage: Number(anchor?.critDamage ?? baseResult.critDamage),
    convertedEvolutionDamage: weightedConvertedEvolutionDamage,
    skillExperimentMultiplier: weightedMultiplier,
    arcanaCardExpectation,
    skillExperiment: {
      applied: true,
      count: appliedRows.length,
      conditionalAssumed: true,
      averageGain: (weightedMultiplier - 1) * 100,
      appliedEffects: anchor?.effects || {},
      commonCritRate: baseResult.rawCritRate,
      anchorSkill: anchor ? { name: anchor.name, critRate: anchor.rawCritRate, share: anchor.share } : null,
      modeledSharePercent: modeledWeight * 100,
      items: rows.map(({ result, valueWithoutArcana, ...row }) => row)
    }
  };
}

function hasNumericSkillEffects(effects) {
  return Object.values(effects || {}).some(value => Math.abs(Number(value || 0)) > 0.0001);
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
  return `<details class="enlightenmentDetails"><summary>깨달음 전역 적용 내역 / 중복 확인</summary><div class="enlightenmentDetailBody">${rows.join('')}${totalLine}<p>같은 효과 안에서 RAW·Tooltip·Description 반복 문장은 가장 큰 유효값 1개만 반영합니다. 개별 스킬·스킬 계열·상태 조건 효과는 이 전역 합계에서 분리하고, 깨달음과 도약 모두 해당 스킬의 딜 지분 계산에만 적용합니다.</p></div></details>`;
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

function skillCritScopeHtml(current) {
  const experiment = current?.result?.skillExperiment;
  const rows = (experiment?.items || [])
    .filter(row => Number(row?.share || 0) > 0 || hasNumericSkillEffects(row?.effects))
    .sort((a, b) => Number(b?.rawCritRate || 0) - Number(a?.rawCritRate || 0) || Number(b?.share || 0) - Number(a?.share || 0));
  if (!experiment?.applied || !rows.length) return '';
  const anchorName = experiment.anchorSkill?.name || rows[0]?.name || '-';
  const skillRows = rows.map(row => {
    const passiveNames = [...new Set([...(row.passiveRules || []), ...(row.arcanaRules || [])].map(rule => `${rule.category} ${rule.nodeName}`).filter(Boolean))];
    const detail = [
      Number(row.share || 0) > 0 ? `딜 지분 ${(Number(row.share) * 100).toFixed(1)}%` : '딜 지분 미확인',
      passiveNames.join(', '),
      row.summary || ''
    ].filter(Boolean).join(' · ');
    const anchor = normalizedSkillName(row.name) === normalizedSkillName(anchorName);
    return `<div class="skillCritScopeRow${anchor ? ' anchor' : ''}"><div><b>${escapeHtml(row.name)}</b><span>${escapeHtml(detail)}</span></div><strong>${Number(row.rawCritRate || 0).toFixed(2)}%</strong></div>`;
  }).join('');
  return `<section class="skillCritScope"><div class="skillCritScopeHead"><div><span>치적 기준 스킬</span><b>${escapeHtml(anchorName)}</b></div><div><span>캐릭터 공통 치적</span><b>${Number(experiment.commonCritRate || 0).toFixed(2)}%</b></div><div><span>기준 스킬 최종 치적</span><b>${Number(experiment.anchorSkill?.critRate || rows[0]?.rawCritRate || 0).toFixed(2)}%</b></div></div><div class="skillCritScopeRows">${skillRows}</div></section>`;
}

function buildSourceSummary(current) {
  const base = getBaseStats();
  const appliedSkillEffects = current.result?.skillExperiment?.appliedEffects || {};
  const skillExperimentRows = current.result?.skillExperiment?.items || [];
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
      const sonicDamage = Number(current.result.sonicBreakEvolutionDamage || 0) || calculateSonicBreakEvolutionDamage(
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
  if (appliedSkillEffects.critRate) critLines.push(sourceLine(`기준 스킬 · ${current.result?.skillExperiment?.anchorSkill?.name || '스킬별'}`, appliedSkillEffects.critRate));
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
  let weightedSkillCritDamage = 0;
  for (const row of skillExperimentRows) {
    const value = Number(row?.effects?.critDamage || 0);
    const share = Math.max(0, Number(row?.share || 0));
    if (!(Math.abs(value) > 0.0001) || !(share > 0)) continue;
    const contribution = value * share;
    weightedSkillCritDamage += contribution;
    critDamageLines.push(sourceLine(
      `스킬 · ${row.name || '이름 미확인'}`,
      contribution,
      `원효과 ${pct(value)} · 딜 지분 ${(share * 100).toFixed(1)}%`
    ));
  }
  const arcanaCullUptime = Number(current.result?.arcanaCardExpectation?.expectationWeight || 0);
  const arcanaCullCritDamage = arcanaCullUptime * ARCANA_CULL_EFFECT.critDamage;
  if (arcanaCullCritDamage > 0) {
    critDamageLines.push(sourceLine(
      '아르카나 · 도태 카드',
      arcanaCullCritDamage,
      `발동 중 치피 +${ARCANA_CULL_EFFECT.critDamage}% · 기대 가동률 ${(arcanaCullUptime * 100).toFixed(2)}% · 실제 계산은 상태별 가중`
    ));
  }
  critDamageLines.push(...critDamageEvolution);
  const displayedCritDamage = Number(current.stats?.critDamage || 200) + weightedSkillCritDamage + arcanaCullCritDamage;

  const critHitLines = [];
  for (const src of current.stats.critHitDamageSources || []) critHitLines.push(sourceLine(src.label || '치명타 적중 주피', Number(src.value || 0)));
  if (appliedSkillEffects.critHitDamage) critHitLines.push(sourceLine('기준 스킬 효과', appliedSkillEffects.critHitDamage));
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
  if (appliedSkillEffects.additionalDamage) addLines.push(sourceLine('기준 스킬 효과', appliedSkillEffects.additionalDamage));
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
  if (appliedSkillEffects.attackSpeed) attackSpeedLines.push(sourceLine('기준 스킬 효과', appliedSkillEffects.attackSpeed));
  if (appliedSkillEffects.moveSpeed) moveSpeedLines.push(sourceLine('기준 스킬 효과', appliedSkillEffects.moveSpeed));

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
  if (appliedSkillEffects.enemyDamage) enemyLines.push(sourceLine('기준 스킬 효과', appliedSkillEffects.enemyDamage));
  enemyLines.push(...enemyEvolution);

  const attackPowerLines = [];
  if (base.adrenalineAttackPower) attackPowerLines.push(sourceLine('아드레날린', base.adrenalineAttackPower));
  if (state.abilityStone?.attackPower) attackPowerLines.push(sourceLine('어빌리티 스톤', state.abilityStone.attackPower, '기본 공격력 보너스'));
  if (state.abilityStone?.effects?.attackPower) attackPowerLines.push(sourceLine('어빌리티 스톤 각인 보너스', state.abilityStone.effects.attackPower));
  if (base.engravingEffects?.attackPower) attackPowerLines.push(sourceLine('각인서/시뮬레이션', base.engravingEffects.attackPower));
  if (appliedSkillEffects.attackPower) attackPowerLines.push(sourceLine('기준 스킬 효과', appliedSkillEffects.attackPower));
  const skillExperiment = current.result.skillExperiment || { items: [] };
  const skillExperimentLines = [];
  if (skillExperiment.applied) {
    skillExperimentLines.push(sourceLine('스킬별 지분 합산', skillExperiment.averageGain, `계산 지분 ${Number(skillExperiment.modeledSharePercent || 0).toFixed(1)}% · 기준 ${skillExperiment.anchorSkill?.name || '-'}`));
  }
  skillExperimentLines.push(...(skillExperiment.items || []).map(row => {
    const flags = [
      row.guaranteedCrit ? '확정 치명' : '',
      row.conditional ? '조건 충족' : '',
      row.convertedEvolutionDamage > 0 ? `뭉가 전환 +${fmt(row.convertedEvolutionDamage)}%` : ''
    ].filter(Boolean);
    const detail = [...flags, row.summary || '수치 효과 없음'].join(' · ');
    return sourceLine(`${row.name}${row.level ? ` Lv.${row.level}` : ''}`, row.gain, `${Number(row.share || 0) > 0 ? `딜 지분 ${(Number(row.share) * 100).toFixed(1)}% · ` : ''}${detail}`);
  }));

  const engravingExpectedLines = [];
  if (base.engravingDamageMultiplier !== 1) {
    engravingExpectedLines.push(sourceLine('예리한 둔기 평균 페널티', (base.engravingDamageMultiplier - 1) * 100, `피해 배율 ×${fmt(base.engravingDamageMultiplier)}`));
  }
  const arcanaExpectation = current.result.arcanaCardExpectation;
  const arcanaExpectationLines = arcanaExpectation ? [
    sourceLine(
      `${arcanaExpectation.engraving} · 카드 기대값`,
      (Number(arcanaExpectation.multiplier || 1) - 1) * 100,
      `${arcanaExpectation.emperorCombinedTriggerProbability > 0 ? `황제+또황 ${(Number(arcanaExpectation.emperorCombinedTriggerProbability) * 100).toFixed(1)}% · ` : ''}도태 ${(Number(arcanaExpectation.probability || 0) * 100).toFixed(2)}%/${(Number(arcanaExpectation.expectationWeight || 0) * 100).toFixed(2)}%${arcanaExpectation.chancellorProbability > 0 ? ` · 재상 ${(Number(arcanaExpectation.chancellorProbability) * 100).toFixed(2)}%/${(Number(arcanaExpectation.chancellorExpectationWeight) * 100).toFixed(2)}%` : ''}${arcanaExpectation.sovereignProbability > 0 ? ` · 제후 ${(Number(arcanaExpectation.sovereignProbability) * 100).toFixed(2)}%/${(Number(arcanaExpectation.sovereignExpectationWeight) * 100).toFixed(2)}%` : ''}${arcanaExpectation.cardsPerMinute > 0 ? ` · 드로우 ${Number(arcanaExpectation.cardsPerMinute).toFixed(1)}장/분${Math.abs(Number(arcanaExpectation.cardDrawMultiplier || 1) - 1) > 0.001 ? ` (기준 ×${Number(arcanaExpectation.cardDrawMultiplier).toFixed(3)})` : ''}` : ''}${arcanaExpectation.expectedCards > 0 ? ` · ${Math.round(Number(arcanaExpectation.combatSeconds || 0) / 60)}분 약 ${Number(arcanaExpectation.expectedCards).toFixed(1)}장/도태 ${Number(arcanaExpectation.expectedCullCards).toFixed(1)}장${arcanaExpectation.expectedChancellorCards > 0 ? `/재상 ${Number(arcanaExpectation.expectedChancellorCards).toFixed(1)}장` : ''}${arcanaExpectation.expectedSovereignCards > 0 ? `/제후 ${Number(arcanaExpectation.expectedSovereignCards).toFixed(1)}장` : ''}` : ''} · ${arcanaExpectation.evidenceLabel}`
    )
  ] : [];

  $('sourceSummary').innerHTML = `
    <div class="sourceTitle"><div><h3>계산 요약</h3><p>표시는 출처별 합산값, 기대값은 로아식 합연산/곱연산으로 계산합니다.</p></div><button id="resetViewButton" type="button">초기화</button></div>
    ${skillCritScopeHtml(current)}
    ${sourceGroup('치명타 확률', 'blue', critLines, current.result.critRate)}
    ${sourceGroup('치명타 피해', 'purple', critDamageLines, displayedCritDamage)}
    ${sourceGroup('치명타 적중 주피', 'pink', critHitLines, current.result.critHitDamage)}
    ${sourceGroup('진피', 'orange', evoLines, current.result.evo)}
    ${sourceGroup('추피', 'green', addLines, current.result.additionalDamage)}
    ${sourceGroup('적주피', 'pink', enemyLines, current.result.enemyDamage)}
    ${skillExperimentLines.length ? sourceGroup('스킬 효과 실험값', 'orange', skillExperimentLines, skillExperiment.averageGain) : ''}
    ${arcanaExpectationLines.length ? sourceGroup('아르카나 카드 기대값', 'purple', arcanaExpectationLines, (Number(arcanaExpectation.multiplier || 1) - 1) * 100) : ''}
    ${sourceGroup('공격력 증가', 'green', attackPowerLines, current.result.attackPower)}
    ${engravingExpectedLines.length ? sourceGroup('각인 기대값 보정', 'orange', engravingExpectedLines, (current.result.engravingDamageMultiplier - 1) * 100) : ''}
    ${sourceGroup('공격 속도', 'cyan', attackSpeedLines, current.result.attackSpeed)}
    ${sourceGroup('이동 속도', 'cyan', moveSpeedLines, current.result.moveSpeed)}
    ${enlightenmentAppliedDetailHtml(base)}
    ${engravingAppliedDetailHtml()}
    <div class="sourceFoot">UI의 치피·진피·추피는 합산 표시이며, 적주피·치명타 적중 주피는 내부 기대값에서 출처별 곱연산으로 적용됩니다. 트라이포드·깨달음·도약 효과는 <b>개별 스킬마다 계산한 뒤 전투 분석 딜 지분으로 합산</b>합니다. 상태 조건은 충족 기준이며, 보유 자원 1당처럼 현재 수량을 알 수 없는 가변 효과는 임의 합산하지 않습니다. 공이속은 N초 동안/간 지속 문구가 있는 효과만 적용하고, 확정 치명의 치적 +100%는 해당 스킬의 뭉가 초과 치적 전환에만 사용합니다. 뭉가 Lv.2는 <b>기본 진피 15% + 초과 치적 전환 최대 60% = 총 75%</b> 기준입니다.</div>
  `;
  const reset = $('resetViewButton');
  if (reset) reset.addEventListener('click', () => { state.selected = JSON.parse(JSON.stringify(state.apiSelected || {})); renderEvolutionTiers(); calculateAndRender(); });
}

function renderCombatStats(current = statsWithSelection(state.selected)) {
  buildSourceSummary(current);
}

function keenEfficiency(current, bonusCritDamage) {
  const before = Number(current?.result?.value || 0);
  const afterStats = cloneBaseStats(current?.stats || {});
  afterStats.critDamage = Number(afterStats.critDamage || 200) + Number(bonusCritDamage || 0);
  const after = Number(score(afterStats)?.value || 0) * 0.98;
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
  const experimentItems = current?.result?.skillExperiment?.items || [];
  const critDamageValues = experimentItems.map(row => Number(row?.critDamage || 0)).filter(value => value > 0);
  const critDamageRange = critDamageValues.length
    ? `${Math.min(...critDamageValues).toFixed(2)}~${Math.max(...critDamageValues).toFixed(2)}%`
    : `${Number(current?.result?.critDamage || 0).toFixed(2)}%`;
  const arcanaNote = current?.result?.arcanaCardExpectation ? ' · 도태/재상 기대 가동률 포함' : '';
  el.innerHTML = `<div class="keenNote">계산 기준: 스킬별 치적·치피 재계산 · 치피 ${critDamageRange}${arcanaNote}</div>${rows}`;
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
function candidateMemo(tier2Entries, fourNames, fiveName, calc, supportMode = false) {
  const bits = [];
  if (hasSameTier245(state.selected, tier2Entries, fourNames, fiveName)) bits.push('현재 조합');
  else bits.push(`${tier4PairLabel(fourNames)} / ${fiveName}`);
  if (calc?.result?.convertedEvolutionDamage > 0) bits.push(`뭉가 전환 ${fmt(calc.result.convertedEvolutionDamage)}%(기본 포함 총 ${fmt(calc.result.convertedEvolutionDamage + 15)}%)`);
  if (Boolean($('excludeCooldown')?.checked) && (calc?.result?.cooldownReduction || 0) === 0) bits.push('쿨감 제외');
  const manaNote = manaConditionNoteText(calc);
  if (manaNote) bits.push(manaNote);
  if (calc?.result?.sonicBreakEvolutionDamage > 0) bits.push(`음속 진피 ${fmt(calc.result.sonicBreakEvolutionDamage)}%`);
  if (supportMode) bits.push('현재 스킬 주기·파티 기여 기준');
  else if (fiveName === '입식 타격가') bits.push('6중첩 최대 기준');
  else if (fiveName === '마나 용광로') bits.push('마나 계수 최대 기준');
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
  const supportMode = isSupportPowerSnapshot(state.powerSnapshot);
  const recommendDescription = $('recommendDescription');
  if (recommendDescription) recommendDescription.textContent = supportMode
    ? '현재 공증 스킬 주기와 낙인·아이덴티티·파티 버프를 반영해 서포터 진화 노드를 비교합니다.'
    : '공식 기대값과 치적 안정성·단타·마나 조건을 반영한 실전 추천값을 함께 비교합니다.';
  for (const id of ['singleHitMainSkill', 'noManaMainSkill', 'manaShortageClass']) {
    const label = $(id)?.closest('label');
    if (label) label.classList.toggle('hidden', supportMode);
  }
  renderCombatStats(current);
  renderKeenEfficiency(current);
  const apiBaseValue = Number(apiBase.result.value || 0);
  const currentValue = Number(current.result.value || 0);
  const noManaMainSkill = Boolean($('noManaMainSkill')?.checked);
  const manaShortageClass = Boolean($('manaShortageClass')?.checked) && !noManaMainSkill;
  const apiSupportModel = supportMode ? supportContributionModel(state.powerSnapshot, { ...supportModelContext(), selection: apiSelection }) : null;
  const currentSupportModel = supportMode ? supportContributionModel(state.powerSnapshot, { ...supportModelContext(), selection: state.selected }) : null;
  const apiAdjustment = supportMode
    ? { value: Number(apiSupportModel?.totalBuffPower || 1), singleHitPenalty: 0, critOverPenalty: 0, critLowPenalty: 0, manaStabilityBonus: 0 }
    : practicalRecommendationFor(tier5NameFromSelection(apiSelection), apiBase, apiSelection);
  const currentAdjustment = supportMode
    ? { value: Number(currentSupportModel?.totalBuffPower || 1), singleHitPenalty: 0, critOverPenalty: 0, critLowPenalty: 0, manaStabilityBonus: 0 }
    : practicalRecommendationFor(tier5NameFromSelection(state.selected), current, state.selected);
  const apiPracticalValue = Number(apiAdjustment.value);
  const currentPracticalValue = Number(currentAdjustment.value);
  const baseValue = apiPracticalValue > 0 ? apiPracticalValue : (apiBaseValue || currentPracticalValue || currentValue || 1);
  const currentDiff = ((currentPracticalValue / baseValue) - 1) * 100;
  const candidates = [];
  const excludeCooldown = isCooldownExcluded();
  const modeledCycleShare = Number(state.skillCycle?.modeledSharePercent ?? state.skillCycle?.mappedSharePercent ?? 0);
  const shareInput = $('mainSkillDamageShare');
  const shareControl = document.querySelector('.shareControl');
  if (shareInput) {
    shareInput.disabled = excludeCooldown || modeledCycleShare > 0;
    shareInput.dataset.effectiveValue = excludeCooldown ? '0' : String(Math.max(0, Math.min(Number(shareInput.value || 60), 100)));
  }
  if (shareControl) {
    shareControl.classList.toggle('disabled', excludeCooldown);
    shareControl.classList.toggle('hidden', modeledCycleShare > 0);
  }
  const cycleHint = $('skillCycleRecommendationHint');
  if (cycleHint) {
    cycleHint.textContent = modeledCycleShare > 0
      ? `현재 스킬트리 ${state.skillCycle.usedSkillCount}개 · 계산 지분 ${modeledCycleShare.toFixed(1)}% · ${state.skillCycle.analyzerTag || '장착 스킬 추정'} 기준으로 쿨감 노드를 자동 계산합니다.`
      : '스킬 주기나 전투분석 지분이 없을 때만 아래 수동 지분을 사용합니다.';
  }
  // 효과 데이터가 없는 서포터 노드는 딜러 추천에서 제외합니다.
  const tier2Options = (supportMode ? ['축복의 여신'] : allOptions(2)).filter(name => {
    if (!getNode(name) || (!supportMode && name === '축복의 여신')) return false;
    if (excludeCooldown && hasCooldownEffect(name)) return false;
    if (!supportMode && noManaMainSkill && MANA_SKILL_NODE_NAMES.includes(name)) return false;
    return true;
  });
  const tier2Candidates = tier2Allocations(tier2Options);
  const hasDealerEffect = name => Object.keys(getNode(name)?.levels || {}).length > 0;
  const tier4Options = supportMode ? ['선각자', '진군', '기원'] : allOptions(4).filter(hasDealerEffect);
  const tier5Options = supportMode
    ? ['입식 타격가', '마나 용광로', '안정된 관리자']
    : allOptions(5).filter(name => hasDealerEffect(name) && !((noManaMainSkill || manaShortageClass) && name === '마나 용광로'));

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
        const supportModel = supportMode ? supportContributionModel(state.powerSnapshot, { ...supportModelContext(), selection: next }) : null;
        const adjustment = supportMode
          ? { value: Number(supportModel?.totalBuffPower || 1), singleHitPenalty: 0, critOverPenalty: 0, critLowPenalty: 0, manaStabilityBonus: 0 }
          : practicalRecommendationFor(fiveName, calc, next);
        const adjustedValue = Number(adjustment.value);
        const recValue = Number.isFinite(adjustedValue) ? adjustedValue : Number(calc.result.value || 0);
        candidates.push({
          tier2Entries, fourNames, fourLevel, fiveName, fiveLevel, calc, recValue,
          expectedValue: supportMode ? Number(supportModel?.totalBuffPower || 1) : Number(calc.result.value || 0),
          supportModel,
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
  const apiPracticalLabel = supportMode
    ? `<small>공증 가동률 ${(Number(apiSupportModel?.detail?.overallAttackUptime || 0) * 100).toFixed(1)}%</small>`
    : `<small>실전 ${apiAdjustment.value.toFixed(4)}${apiPracticalParts.length ? ` · ${escapeHtml(apiPracticalParts.join(' · '))}` : ''}</small>`;
  const currentPracticalLabel = supportMode
    ? `<small>공증 가동률 ${(Number(currentSupportModel?.detail?.overallAttackUptime || 0) * 100).toFixed(1)}%</small>`
    : `<small>실전 ${currentAdjustment.value.toFixed(4)}${currentPracticalParts.length ? ` · ${escapeHtml(currentPracticalParts.join(' · '))}` : ''}</small>`;
  const apiScoreLabel = supportMode ? 'API 종합 기여' : 'API 기대값';
  const currentScoreLabel = supportMode ? '현재 종합 기여' : '현재 기대값';
  const apiScoreValue = supportMode ? `${((apiAdjustment.value - 1) * 100).toFixed(2)}%` : apiBaseValue.toFixed(4);
  const currentScoreValue = supportMode ? `${((currentAdjustment.value - 1) * 100).toFixed(2)}%` : currentValue.toFixed(4);
  $('currentScore').innerHTML = `<div class="apiBaselineRow">
    <div><span>${apiScoreLabel}</span><b>${apiScoreValue}</b>${apiPracticalLabel}</div>
    <div><span>${currentScoreLabel}</span><b>${currentScoreValue}</b>${currentPracticalLabel}</div>
    <div><span>${supportMode ? '파티 기여 API 대비' : '실전값 API 대비'}</span><b class="${currentDiff >= 0 ? 'up' : 'down'}">${currentDiffText}</b></div>
    <p>${supportMode ? '서포터는 현재 공증 스킬 주기·낙인·아이덴티티·진화 노드로 종합 파티 기여를 계산합니다.' : '기대값은 피해 공식만 계산하고, 실전 추천값은 치적 안정성·단타 주력기·마나 부족 설정을 별도 반영합니다.'}</p>
  </div>`;
  const apiManaDetail = apiManaConditionNote ? ` · ${escapeHtml(apiManaConditionNote)}` : '';
  $('baseInfo').innerHTML = supportMode
    ? `<b>API 기준 상세</b><span>상시 버프 ${Number(apiSupportModel?.allTimePercent || 0).toFixed(2)}% · 풀 버프 ${Number(apiSupportModel?.fullPercent || 0).toFixed(2)}% · 공증 가동률 ${(Number(apiSupportModel?.detail?.overallAttackUptime || 0) * 100).toFixed(1)}% · 아이덴티티 가동률 ${(Number(apiSupportModel?.detail?.identityUptime || 0) * 100).toFixed(1)}%</span>`
    : `<b>API 기준 상세</b><span>치명 ${Math.round(apiBase.stats.critStat || 0)} · 최종치적 ${fmt(apiBase.result.critRate)}% · 치피 ${fmt(apiBase.result.critDamage)}% · 치적주피 ${fmt(apiBase.result.critHitDamage)}% · 진피 ${fmt(apiBase.result.evo)}% · 추피 ${fmt(apiBase.result.additionalDamage)}% · 적주피 ${fmt(apiBase.result.enemyDamage)}% · 공증 ${fmt(apiBase.result.attackPower)}%${apiManaDetail}</span>`;
  $('recommendList').innerHTML = top.length ? `<div class="comboRows">${top.map((c, i) => {
    const cls = c.diff >= 0 ? 'up' : 'down';
    const memo = candidateMemo(c.tier2Entries, c.fourNames, c.fiveName, c.calc, supportMode);
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
        <div class="rowMetric"><span>${supportMode ? '종합 파티 기여' : '실전 추천값'}</span><b>${supportMode ? `${((c.recValue - 1) * 100).toFixed(2)}%` : c.recValue.toFixed(4)}</b><small>${supportMode ? `상시 ${Number(c.supportModel?.allTimePercent || 0).toFixed(2)}%` : `기대값 ${c.expectedValue.toFixed(4)}`}</small></div>
        <div class="rowMetric"><span>${supportMode ? '파티 기여 API 대비' : '실전 API 대비'}</span><b class="${cls}">${pct(c.diff)}</b></div>
        <div class="rowMetric"><span>${supportMode ? '공증 가동률' : '치적'}</span><b>${supportMode ? `${(Number(c.supportModel?.detail?.overallAttackUptime || 0) * 100).toFixed(1)}%` : `${fmt(c.calc.result.critRate)}%`}</b></div>
      </div>
    </article>`;
  }).join('')}</div>` : `<div class="emptyNotice">추천 가능한 2/4/5티어 조합이 없습니다. 쿨감 효과 제외 상태에서는 끝없는 마나/최적화 훈련 등 쿨감 노드가 추천 후보에서 제거됩니다.</div>`;
  renderSpecScenarioComparison();
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

function normalizeCharacterCacheKey(name) {
  return String(name || '').trim().toLocaleLowerCase('ko-KR');
}

function getStoredCharacter(name) {
  const key = normalizeCharacterCacheKey(name);
  const entry = readStoredObject(CHARACTER_CACHE_STORAGE_KEY)[key];
  if (!isCompatibleCharacterCacheData(entry?.data, VERSION)) return null;
  return { data: entry.data, savedAt: Number(entry.savedAt || 0) };
}

function saveStoredCharacter(name, data) {
  const key = normalizeCharacterCacheKey(name);
  const entries = readStoredObject(CHARACTER_CACHE_STORAGE_KEY);
  const cacheableData = { ...data };
  delete cacheableData.raw;
  delete cacheableData.equipment;
  delete cacheableData.gems;
  delete cacheableData.skills;
  const savedAt = Date.now();
  entries[key] = { data: cacheableData, savedAt };

  const oldestFirst = () => Object.entries(entries)
    .sort((left, right) => Number(left[1]?.savedAt || 0) - Number(right[1]?.savedAt || 0));
  while (Object.keys(entries).length > CHARACTER_CACHE_MAX_ENTRIES) {
    delete entries[oldestFirst()[0]?.[0]];
  }
  while (!writeStoredObject(CHARACTER_CACHE_STORAGE_KEY, entries)) {
    const oldest = oldestFirst()[0]?.[0];
    if (!oldest || oldest === key) break;
    delete entries[oldest];
  }
  return savedAt;
}

async function requestCharacterData(name, { force = false, maxAttempts = 2 } = {}) {
  if (!force) {
    const stored = getStoredCharacter(name);
    if (stored) return { ...stored, fromCache: true };
  }

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const url = `/api/character?name=${encodeURIComponent(name)}&appVersion=${encodeURIComponent(VERSION)}${force ? '&force=1' : ''}`;
      const res = await fetch(url, { cache: 'default' });
      const body = await res.text();
      let data = null;
      try { data = body ? JSON.parse(body) : null; } catch {}
      if (res.ok && data?.ok) {
        const savedAt = saveStoredCharacter(data.profile?.CharacterName || name, data);
        return { data, savedAt, fromCache: false };
      }

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

const EXTRA_EFFECT_INPUT_IDS = [
  'extraCritRate',
  'extraCritDamage',
  'extraEvolutionDamage',
  'extraAdditionalDamage',
  'extraEnemyDamage',
  'extraAttackSpeed',
  'extraMoveSpeed'
];

function resetAdditionalEffects() {
  for (const id of EXTRA_EFFECT_INPUT_IDS) {
    const input = $(id);
    if (input) input.value = '0';
  }
  if ($('critSynergyEnabled')) $('critSynergyEnabled').checked = false;
  if ($('critSynergyValue')) $('critSynergyValue').value = '10';
  if ($('backAttackEnabled')) $('backAttackEnabled').checked = false;
}

function resetCharacterResultState() {
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
  state.specPlannerTarget = 0;
  state.specScenarioSelectedKeys = new Set();
  state.abilityStone = { attackPower: 0, effects: { critRate: 0, critDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0, conditionalDamage: 0 }, engravings: [], items: [] };
  state.engraving = emptyEngravingState();
  state.arkGrid = { critRate: 0, critDamage: 0, attackSpeed: 0, moveSpeed: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
  state.enlightenment = { critRate: 0, critDamage: 0, critHitDamage: 0, evolutionDamage: 0, enemyDamage: 0, additionalDamage: 0, attackSpeed: 0, moveSpeed: 0, items: [] };
  state.card = emptyCardEffects();
  state.skillEffects = emptySkillEffectState();
  state.passiveSkillEffects = emptyPassiveSkillEffectState();
  state.arkGridSkillEffects = emptyPassiveSkillEffectState();
  state.skillCycle = null;
  renderSkillEffectControl();
  simulatorRendered = false;
  document.body.classList.remove('simulatorMode');
}

function applyCharacterData(data) {
  state.accessory = data.accessoryEffects || { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
  state.bracelet = data.braceletEffects || { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
  state.abilityStone = data.abilityStoneEffects || { attackPower: 0, effects: { critRate: 0, critDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0, conditionalDamage: 0 }, engravings: [], items: [] };
  state.engraving = data.engravingEffects || emptyEngravingState();
  state.arkGrid = data.arkGridEffects || { critRate: 0, critDamage: 0, attackSpeed: 0, moveSpeed: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
  state.arkGridSkillEffects = data.arkGridSkillEffects || emptyPassiveSkillEffectState();
  state.card = data.cardEffects || emptyCardEffects();
  state.skillEffects = data.skillEffects || emptySkillEffectState();
  state.powerSnapshot = data.powerSnapshot || null;
  if (state.powerSnapshot?.profile && !state.powerSnapshot.profile.secondClass) {
    state.powerSnapshot.profile.secondClass = data.arkPassive?.Title || '';
  }
  syncAdrenalineControlsFromEngraving();
  renderCharacter(data.profile, data.arkPassive);
  state.foundEffects = readEffects(data.arkPassive);
  state.selected = classifyEvolution(state.foundEffects);
  state.apiSelected = JSON.parse(JSON.stringify(state.selected));
  refreshSkillCycleModel();
  refreshPassiveSkillEffects();
  state.enlightenment = extractEnlightenmentEffects(state.foundEffects, state.passiveSkillEffects);
  renderSkillEffectControl();
  const sharedScenario = state.pendingSharedScenario;
  if (sharedScenario && (!sharedScenario.characterName || sharedScenario.characterName === data.profile.CharacterName)) {
    applySpecScenarioPayload(sharedScenario, { deferRender: true });
    state.pendingSharedScenario = null;
  }
  applyProfileDefaults(data.profile, state.apiSelected);
  renderPowerSnapshot(state.powerSnapshot);
  renderEvolutionTiers();
  renderSummary(data.profile, data.arkPassive);
  calculateAndRender();
}

function updateCharacterRefreshButton() {
  const button = $('characterRefreshButton');
  if (!button) return;
  const inputName = normalizeCharacterCacheKey($('characterName')?.value);
  const matchesActive = activeCharacterName && inputName === normalizeCharacterCacheKey(activeCharacterName);
  button.classList.toggle('hidden', !matchesActive);
  if (!matchesActive) return;
  if (characterRequestPending) {
    button.disabled = true;
    button.textContent = '갱신 중';
    return;
  }
  const remaining = remainingCooldownMs(activeCharacterSavedAt, CHARACTER_REFRESH_COOLDOWN_MS);
  button.disabled = remaining > 0;
  button.textContent = remaining > 0 ? `캐릭터 갱신 ${formatCooldownClock(remaining)}` : '캐릭터 갱신';
}

async function searchCharacter(name, { force = false } = {}) {
  if (characterRequestPending) return;
  const button = $('searchButton');
  characterRequestPending = true;
  button.disabled = true;
  button.textContent = force ? '갱신...' : '검색...';
  updateCharacterRefreshButton();
  setMessage('');
  try {
    const result = await requestCharacterData(name, { force });
    const data = result.data;
    if (!data.profile?.CharacterName) throw new Error('캐릭터 프로필을 가져오지 못했습니다.');
    resetCharacterResultState();
    resetAdditionalEffects();
    applyCharacterData(data);
    activeCharacterName = data.profile.CharacterName;
    activeCharacterSavedAt = result.savedAt;
    if ($('characterName')) $('characterName').value = activeCharacterName;
    if (!Object.keys(state.selected).length) {
      setMessage('캐릭터 정보는 갱신됐지만 API에서 진화 노드를 읽지 못했습니다. 노드는 직접 선택해 주세요.');
    } else if (result.fromCache) {
      setMessage('저장된 캐릭터 정보를 불러왔습니다. 캐릭터 갱신을 눌러야 공식 API를 다시 조회합니다.', 'info');
    }
  } catch (error) { setMessage(error.message); }
  finally {
    characterRequestPending = false;
    button.disabled = false;
    button.textContent = '검색';
    updateCharacterRefreshButton();
  }
}

$('searchForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('characterName').value.trim();
  if (!name) return setMessage('캐릭터명을 입력하세요.');
  searchCharacter(name);
});
$('characterRefreshButton')?.addEventListener('click', () => {
  if (!activeCharacterName || characterRequestPending) return;
  if (remainingCooldownMs(activeCharacterSavedAt, CHARACTER_REFRESH_COOLDOWN_MS) > 0) return updateCharacterRefreshButton();
  searchCharacter(activeCharacterName, { force: true });
});
$('characterName')?.addEventListener('input', updateCharacterRefreshButton);
$('simulatorBackButton')?.addEventListener('click', closeSimulatorPage);
EXTRA_EFFECT_INPUT_IDS.forEach(id => $(id).addEventListener('input', calculateAndRender));
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
$('critSynergyValue').addEventListener('change', calculateAndRender);
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
const marketListLoadState = { gem: 'idle', engraving: 'idle', material: 'idle', crystal: 'idle' };

function setActiveTab(tabName) {
  document.querySelectorAll('.tabButton').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
  const isMarket = tabName === 'market';
  const isRatio = tabName === 'ratio';
  const isAvatar = isMarket && selectedMarketTab === 'avatar';
  document.body.classList.remove('simulatorMode');
  $('powerSnapshotPanel')?.classList.add('hidden');
  document.body.classList.toggle('marketMode', isMarket);
  document.body.classList.toggle('ratioMode', isRatio);
  document.body.classList.toggle('avatarMode', isAvatar);
  document.querySelectorAll('.calcTabPanel').forEach(el => {
    el.classList.toggle('hiddenByTab', isMarket || isRatio);
    el.style.display = isMarket || isRatio ? 'none' : '';
  });
  const marketPanel = $('marketPanel');
  if (marketPanel) {
    marketPanel.classList.toggle('hidden', !isMarket);
    marketPanel.classList.toggle('hiddenByTab', !isMarket);
    marketPanel.style.display = isMarket ? '' : 'none';
  }
  const ratioPanel = $('ratioPanel');
  if (ratioPanel) {
    ratioPanel.classList.toggle('hidden', !isRatio);
    ratioPanel.classList.toggle('hiddenByTab', !isRatio);
    ratioPanel.style.display = isRatio ? '' : 'none';
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
  if (isRatio) {
    loadClassBenchmarks();
    renderRatioPanel();
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
    crystal: $('marketCrystalPanel'),
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
  if (selectedMarketTab === 'crystal') loadMarketCrystalPrice();
}

function preloadMarketPriceLists() {
  hydrateStoredMarketSnapshot();
  if (marketSnapshotNetworkState === 'loading' || marketSnapshotNetworkState === 'loaded') return;
  marketSnapshotNetworkState = 'loading';
  fetchMarketJson('/api/market-snapshot')
    .then(snapshot => {
      if (applyMarketSnapshot(snapshot)) {
        marketSnapshotNetworkState = 'loaded';
        return;
      }
      marketSnapshotNetworkState = 'failed';
      if (!marketSnapshotAvailable) preloadLegacyMarketPriceLists();
    })
    .catch(() => {
      marketSnapshotNetworkState = 'failed';
      if (!marketSnapshotAvailable) preloadLegacyMarketPriceLists();
    });
}

function hydrateStoredMarketSnapshot() {
  if (marketSnapshotHydrated) return;
  marketSnapshotHydrated = true;
  const snapshot = readStoredObject(MARKET_SNAPSHOT_STORAGE_KEY);
  if (isUsableClientMarketSnapshot(snapshot)) applyMarketSnapshot(snapshot, { persist: false });
}

function preloadLegacyMarketPriceLists() {
  loadMarketEngravingList();
  loadMarketGemList();
  loadMarketMaterialList();
  loadMarketCrystalPrice();
}

function isUsableClientMarketSnapshot(snapshot) {
  const sections = snapshot?.sections;
  return snapshot?.ok === true
    && Array.isArray(sections?.gem?.rows) && sections.gem.rows.length > 0
    && Array.isArray(sections?.engraving?.items) && sections.engraving.items.length > 0
    && Array.isArray(sections?.material?.items) && sections.material.items.length > 0
    && Number(sections?.crystal?.crystalGoldPer100 || 0) > 0;
}

function applyMarketSnapshot(snapshot, { persist = true } = {}) {
  if (!isUsableClientMarketSnapshot(snapshot)) return false;
  marketSnapshotAvailable = true;
  const sections = snapshot.sections;
  applyMarketSnapshotSection('gem', sections.gem);
  applyMarketSnapshotSection('engraving', sections.engraving);
  applyMarketSnapshotSection('material', sections.material);
  applyMarketSnapshotSection('crystal', sections.crystal);
  if (persist) writeStoredObject(MARKET_SNAPSHOT_STORAGE_KEY, compactClientMarketSnapshot(snapshot));
  updateMarketRefreshButtons();
  return true;
}

function applyMarketSnapshotSection(section, rawData) {
  const data = { ...rawData, cached: true, cacheSource: 'automatic-snapshot' };
  const routes = {
    gem: '/api/market-prices?mode=gemList',
    engraving: '/api/market-prices?mode=engravingList',
    material: '/api/market-prices?mode=t4Materials',
    crystal: '/api/crystal-price'
  };
  const route = routes[section];
  if (route) {
    marketResponseCache.set(canonicalMarketRequestKey(route, window.location.origin), {
      data,
      expiresAt: Date.now() + MARKET_CLIENT_CACHE_TTL_MS
    });
  }

  if (section === 'gem') renderGemPriceGrid($('gemMarketResult'), data);
  if (section === 'engraving') renderEngravingPriceGrid($('engravingMarketResult'), data);
  if (section === 'material') {
    renderMaterialPriceGrid($('materialMarketResult'), data);
    t4MaterialPriceCache = buildT4MaterialPriceMap(data);
    refreshPowerCostEstimatesFromMarketCache();
  }
  if (section === 'crystal') {
    crystalPriceCache = data;
    renderCrystalMarketPrice($('crystalMarketResult'), data);
  }
  marketListLoadState[section] = 'loaded';
  rememberMarketRefresh(section, false);
}

function updateStoredMarketSnapshotSection(section, data) {
  const snapshot = readStoredObject(MARKET_SNAPSHOT_STORAGE_KEY);
  if (!isUsableClientMarketSnapshot(snapshot)) return;
  const updatedAt = data?.updatedAt || new Date().toISOString();
  snapshot.sections[section] = compactClientMarketSection(section, data);
  snapshot.sectionUpdatedAt = { ...(snapshot.sectionUpdatedAt || {}), [section]: updatedAt };
  snapshot.updatedAt = new Date().toISOString();
  writeStoredObject(MARKET_SNAPSHOT_STORAGE_KEY, snapshot);
}

function compactClientMarketSnapshot(snapshot) {
  return {
    ok: true,
    schemaVersion: Number(snapshot.schemaVersion || 1),
    apiVersion: snapshot.apiVersion || VERSION,
    source: snapshot.source || 'market-cache',
    updatedAt: snapshot.updatedAt || new Date().toISOString(),
    sectionUpdatedAt: { ...(snapshot.sectionUpdatedAt || {}) },
    sections: {
      gem: compactClientMarketSection('gem', snapshot.sections.gem),
      engraving: compactClientMarketSection('engraving', snapshot.sections.engraving),
      material: compactClientMarketSection('material', snapshot.sections.material),
      crystal: { ...snapshot.sections.crystal }
    }
  };
}

function compactClientMarketSection(section, data) {
  if (section === 'gem') {
    return {
      ok: true,
      mode: 'gemList',
      source: data.source || '',
      updatedAt: data.updatedAt || new Date().toISOString(),
      rows: (data.rows || []).map(row => ({
        level: Number(row.level || 0),
        damage: compactClientMarketItem(row.damage),
        cooldown: compactClientMarketItem(row.cooldown)
      }))
    };
  }
  if (section === 'engraving') {
    return {
      ok: true,
      mode: 'engravingList',
      source: data.source || '',
      updatedAt: data.updatedAt || new Date().toISOString(),
      items: (data.items || []).map(compactClientMarketItem).filter(Boolean)
    };
  }
  if (section === 'material') {
    return {
      ok: true,
      mode: 't4Materials',
      source: data.source || '',
      updatedAt: data.updatedAt || new Date().toISOString(),
      groups: Array.isArray(data.groups) ? data.groups : [],
      items: (data.items || []).map(item => compactClientMarketItem(item, true)).filter(Boolean)
    };
  }
  return { ...data };
}

function compactClientMarketItem(item, material = false) {
  if (!item) return null;
  const compact = {
    id: item.id || null,
    name: item.name || '',
    icon: item.icon || '',
    grade: item.grade || '',
    price: Number(item.price || 0)
  };
  if (!material) return compact;
  return {
    ...compact,
    group: item.group || '',
    requestedName: item.requestedName || item.name || '',
    source: item.source || '',
    unitPrice: Number(item.unitPrice || 0),
    bundleCount: Number(item.bundleCount || 1),
    shardCount: Number(item.shardCount || 0),
    shardUnitPrice: Number(item.shardUnitPrice || 0),
    pheonCost: Number(item.pheonCost || 0),
    missing: Boolean(item.missing),
    error: item.error || ''
  };
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

function marketRefreshRemaining(key) {
  return remainingCooldownMs(marketRefreshTimes[key], MARKET_REFRESH_COOLDOWN_MS);
}

function rememberMarketRefresh(key, force) {
  if (!force && Number(marketRefreshTimes[key] || 0) > 0) return;
  marketRefreshTimes = { ...marketRefreshTimes, [key]: Date.now() };
  writeStoredObject(MARKET_REFRESH_STORAGE_KEY, marketRefreshTimes);
}

function updateMarketRefreshButtons() {
  for (const [key, id] of Object.entries(MARKET_REFRESH_BUTTON_IDS)) {
    const button = $(id);
    if (!button) continue;
    if (marketListLoadState[key] === 'loading') {
      button.disabled = true;
      button.textContent = '조회 중';
      continue;
    }
    const remaining = marketRefreshRemaining(key);
    button.disabled = remaining > 0;
    button.textContent = remaining > 0 ? `새로고침 ${formatCooldownClock(remaining)}` : '새로고침';
  }
}

function canForceMarketRefresh(key, force) {
  if (!force || marketRefreshRemaining(key) <= 0) return true;
  updateMarketRefreshButtons();
  return false;
}

function initMarketPriceTab() {
  $('accSearchButton')?.addEventListener('click', searchMarketAccessory);
  $('gemListButton')?.addEventListener('click', () => loadMarketGemList(true));
  $('engravingListButton')?.addEventListener('click', () => loadMarketEngravingList(true));
  $('materialListButton')?.addEventListener('click', () => loadMarketMaterialList(true));
  $('crystalListButton')?.addEventListener('click', () => loadMarketCrystalPrice(true));
  $('accPartSelect')?.addEventListener('change', renderAccessoryRuleHint);
  $('accComboSelect')?.addEventListener('change', renderAccessoryRuleHint);
  renderAccessoryRuleHint();
  updateMarketRefreshButtons();
  window.addEventListener('storage', event => {
    if (event.key !== MARKET_REFRESH_STORAGE_KEY) return;
    marketRefreshTimes = readStoredObject(MARKET_REFRESH_STORAGE_KEY);
    updateMarketRefreshButtons();
  });
}

async function loadLostarkNoticeCard(force = false) {
  const cards = document.querySelectorAll('.lostarkNoticeCard');
  if (!cards.length || (lostarkNoticeLoaded && !force)) return;
  lostarkNoticeLoaded = true;
  try {
    const data = await fetchMarketJson('/api/lostark-news');
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
    const url = `/api/market-prices?mode=accessory&part=${encodeURIComponent(part)}&combo=${encodeURIComponent(combo)}`;
    const data = await fetchMarketJson(url);
    renderMarketResults(resultEl, data, `${data.partLabel || '악세'} · ${data.comboLabel || ''}`, data.targetOptions?.map(o => `${o.label} ${Number(o.value).toFixed(2)}%`).join(' / '));
  } catch (error) {
    renderMarketError(resultEl, error.message);
  } finally {
    if (button) { button.disabled = false; button.textContent = '악세 검색'; }
  }
}

async function loadMarketGemList(force = false) {
  if (!canForceMarketRefresh('gem', force)) return;
  if (!force && marketListLoadState.gem === 'loaded') return;
  if (!force && marketListLoadState.gem === 'loading') return;
  marketListLoadState.gem = 'loading';
  const button = $('gemListButton');
  const resultEl = $('gemMarketResult');
  if (button) { button.disabled = true; button.textContent = '조회 중'; }
  if (resultEl) resultEl.innerHTML = '경매장에서 5~10레벨 겁화/작열 최저가를 조회하는 중입니다.';
  try {
    const data = await fetchMarketJson(`/api/market-prices?mode=gemList${force ? '&force=1' : ''}`);
    renderGemPriceGrid(resultEl, data);
    marketListLoadState.gem = 'loaded';
    updateStoredMarketSnapshotSection('gem', data);
    rememberMarketRefresh('gem', force);
  } catch (error) {
    marketListLoadState.gem = 'idle';
    renderMarketError(resultEl, error.message);
  } finally {
    updateMarketRefreshButtons();
  }
}

async function loadMarketEngravingList(force = false) {
  if (!canForceMarketRefresh('engraving', force)) return;
  if (!force && marketListLoadState.engraving === 'loaded') return;
  if (!force && marketListLoadState.engraving === 'loading') return;
  marketListLoadState.engraving = 'loading';
  const button = $('engravingListButton');
  const resultEl = $('engravingMarketResult');
  if (button) { button.disabled = true; button.textContent = '조회 중'; }
  if (resultEl) resultEl.innerHTML = '거래소에서 전체 유물 각인서 최저가를 조회하는 중입니다.';
  try {
    const data = await fetchMarketJson(`/api/market-prices?mode=engravingList${force ? '&force=1' : ''}`);
    renderEngravingPriceGrid(resultEl, data);
    marketListLoadState.engraving = 'loaded';
    updateStoredMarketSnapshotSection('engraving', data);
    rememberMarketRefresh('engraving', force);
  } catch (error) {
    marketListLoadState.engraving = 'idle';
    renderMarketError(resultEl, error.message);
  } finally {
    updateMarketRefreshButtons();
  }
}

async function loadMarketMaterialList(force = false) {
  if (!canForceMarketRefresh('material', force)) return;
  if (!force && marketListLoadState.material === 'loaded') return;
  if (!force && marketListLoadState.material === 'loading') return;
  marketListLoadState.material = 'loading';
  const button = $('materialListButton');
  const resultEl = $('materialMarketResult');
  if (button) { button.disabled = true; button.textContent = '조회 중'; }
  if (resultEl) resultEl.innerHTML = '거래소에서 4티어 재료와 아크그리드 젬 최저가를 조회하는 중입니다.';
  try {
    const data = await fetchMarketJson(`/api/market-prices?mode=t4Materials${force ? '&force=1' : ''}`);
    renderMaterialPriceGrid(resultEl, data);
    marketListLoadState.material = 'loaded';
    t4MaterialPriceCache = buildT4MaterialPriceMap(data);
    refreshPowerCostEstimatesFromMarketCache();
    updateStoredMarketSnapshotSection('material', data);
    rememberMarketRefresh('material', force);
  } catch (error) {
    marketListLoadState.material = 'idle';
    renderMarketError(resultEl, error.message);
  } finally {
    updateMarketRefreshButtons();
  }
}

async function fetchMarketJson(url) {
  const key = canonicalMarketRequestKey(url, window.location.origin);
  const force = new URL(url, window.location.origin).searchParams.get('force') === '1';
  const cached = marketResponseCache.get(key);
  if (!force && cached?.expiresAt > Date.now()) return cached.data;
  if (marketRequestInflight.has(key)) return marketRequestInflight.get(key);

  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 75000);
    try {
      const res = await fetch(url, { cache: 'default', signal: controller.signal });
      const data = await readJsonSafely(res);
      if (!res.ok || !data?.ok) throw new Error(data?.error || data?.message || '시세 조회 실패');
      marketResponseCache.set(key, { data, expiresAt: Date.now() + MARKET_CLIENT_CACHE_TTL_MS });
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

let classBenchmarksPromise = null;
async function loadClassBenchmarks() {
  if (state.classBenchmarks) return state.classBenchmarks;
  if (!classBenchmarksPromise) {
    classBenchmarksPromise = fetch('/class-benchmarks.json', { cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error(`class benchmark ${response.status}`);
        return response.json();
      })
      .then(data => {
        state.classBenchmarks = data;
        renderRatioPanel();
        return data;
      })
      .catch(() => {
        state.classBenchmarks = null;
        if ($('ratioTable')) $('ratioTable').innerHTML = '<p class="classBenchmarkEmpty">직업 지표를 불러오지 못했습니다.</p>';
        return null;
      });
  }
  return classBenchmarksPromise;
}

function benchmarkDateLabel(value) {
  const date = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return date ? `${Number(date[1])}.${Number(date[2])}.${Number(date[3])}` : '-';
}

function renderRatioPanel() {
  const view = $('ratioTable');
  if (!view) return;
  const data = state.classBenchmarks;
  if (!data) {
    view.innerHTML = '<p class="classBenchmarkEmpty">직업 지표를 불러오는 중입니다.</p>';
    return;
  }
  const query = String($('ratioSearchInput')?.value || '').trim().toLowerCase();
  const classes = (data.classes || []).map(row => ({
    ...row,
    builds: (row.builds || []).filter(build => !query || `${row.className} ${build.engraving}`.toLowerCase().includes(query))
  })).filter(row => row.builds.length);
  if (!classes.length) {
    view.innerHTML = '<p class="classBenchmarkEmpty">검색 조건에 맞는 직업각인이 없습니다.</p>';
    return;
  }
  const groups = [];
  for (const row of classes) {
    const groupName = row.group || '기타';
    let group = groups.find(item => item.name === groupName);
    if (!group) {
      group = { name: groupName, classes: [] };
      groups.push(group);
    }
    group.classes.push(row);
  }
  view.innerHTML = `
    <div class="ratioColumnHead">
      <span>직업</span><span>직업각인</span><span>조합</span><span>배율/역할</span>
      <span class="ratioCoreHead"><i>해</i><i>달</i><i>별</i></span>
    </div>
    ${groups.map(group => `
      <section class="ratioRoleGroup">
        <h3>${escapeHtml(group.name)}</h3>
        <div class="ratioBuildList">${group.classes.flatMap(row => row.builds.map(build => {
        const representative = Number(build.ratio?.representative || 0);
        const support = build.role === 'support';
        const ratioText = representative > 0 ? `${representative.toFixed(3)}배` : escapeHtml(support ? '서포트' : build.status || '자료 부족');
        const range = formatBenchmarkRange(build.ratio);
        const cores = sortedBenchmarkCores(build.cores).map(core => `
          <span class="ratioCore ratioCore${core.slot === '해' ? 'Sun' : core.slot === '달' ? 'Moon' : 'Star'}">
            <i>${escapeHtml(core.slot)}</i><b>${escapeHtml(core.name)}</b>
          </span>`).join('');
        return `<article class="ratioBuildRow">
          <div class="ratioClassName">${escapeHtml(row.className)}</div>
          <div class="ratioBuildIdentity"><strong>${escapeHtml(build.engraving)}</strong><small>${escapeHtml(build.evolution || '-')}</small></div>
          <div class="ratioCombination">${build.combination ? `<strong>${escapeHtml(build.combination)}</strong><small>해·달·별</small>` : '<span>확인 중</span>'}</div>
          <div class="ratioBuildMetric"><strong>${ratioText}</strong>${range ? `<small>표본 ${escapeHtml(range)}</small>` : support ? '<small>버프·케어 세팅</small>' : '<small>추가 표본 필요</small>'}</div>
          <div class="ratioCoreList">${cores || '<span class="ratioCorePending">대표 세팅 집계 중</span>'}</div>
        </article>`;
      })).join('')}</div>
      </section>`).join('')}`;
  const meta = $('ratioMeta');
  if (meta) {
    const buildCount = (data.classes || []).reduce((sum, row) => sum + Number(row.builds?.length || 0), 0);
    meta.innerHTML = `<span>${Number(data.classes?.length || 0)}개 직업 · ${buildCount}개 세팅 · 대표 세팅 ${benchmarkDateLabel(data.popularSettingsDate)} · 배율 ${benchmarkDateLabel(data.ratioBasisDate)}</span><span>실전 사이클, 치명 편차와 숙련도에 따라 달라질 수 있습니다.</span>`;
  }
}

async function loadMarketCrystalPrice(force = false) {
  if (!canForceMarketRefresh('crystal', force)) return;
  if (!force && marketListLoadState.crystal === 'loaded') return;
  if (!force && marketListLoadState.crystal === 'loading') return;
  const button = $('crystalListButton');
  const resultEl = $('crystalMarketResult');
  marketListLoadState.crystal = 'loading';
  if (button) button.disabled = true;
  if (resultEl) resultEl.innerHTML = '<div class="marketEmptyBox">최신 크리스탈 시세를 불러오는 중입니다.</div>';
  try {
    const data = await loadCrystalPrice(force);
    renderCrystalMarketPrice(resultEl, data);
    marketListLoadState.crystal = 'loaded';
    updateStoredMarketSnapshotSection('crystal', data);
    rememberMarketRefresh('crystal', force);
  } catch (error) {
    marketListLoadState.crystal = 'idle';
    renderMarketError(resultEl, error.message || '크리스탈 시세를 불러오지 못했습니다.');
  } finally {
    updateMarketRefreshButtons();
  }
}

function renderCrystalMarketPrice(container, data) {
  if (!container) return;
  const gold = Number(data?.crystalGoldPer100 || 0);
  if (gold <= 0) return renderMarketError(container, '현재 크리스탈 시세를 확인할 수 없습니다.');
  const latestTime = data?.latest?.dt || data?.updatedAt || '';
  container.innerHTML = `
    <div class="crystalExchangeCard">
      <div class="crystalCurrency crystalCurrencyBlue">
        <span class="loaCurrencyIcon loaCrystalIcon" role="img" aria-label="크리스탈"></span>
        <span><small>구매 수량</small><strong>100 크리스탈</strong></span>
      </div>
      <span class="crystalExchangeArrow" aria-hidden="true">→</span>
      <div class="crystalCurrency crystalCurrencyGold">
        <span class="loaCurrencyIcon loaGoldIcon" role="img" aria-label="골드"></span>
        <span><small>현재 시세</small><strong>${Math.round(gold).toLocaleString('ko-KR')} 골드</strong></span>
      </div>
    </div>
    <div class="crystalMarketMeta"><span>LOSPI 1시간 종가 기준</span><span>${escapeHtml(formatMarketUpdatedAt(latestTime))}${data?.cached ? ' · 캐시' : ''}</span></div>`;
}


// v5.0.4 boot fix: 5.0.2에서 전설 아바타 코드가 뒤에 붙으면서 초기화 호출이 빠져
// 진화 DB가 로드되지 않고, 탭 버튼 이벤트도 연결되지 않았습니다.
// DOM 요소와 모든 함수가 정의된 뒤 한 번만 초기화합니다.
if (!window.__lostarkCalculatorBootedV5110) {
  window.__lostarkCalculatorBootedV5110 = true;
  populateAdrenalineReplacementOptions(true);
  updateEngravingControlPreviews();
  window.addEventListener('scroll', refreshFocusedNodeTooltip, { passive: true });
  window.addEventListener('resize', refreshFocusedNodeTooltip);
  initLegendAvatarTab();
  initMarketPriceTab();
  setInterval(updateMarketRefreshButtons, 1000);
  setInterval(updateCharacterRefreshButton, 1000);
  $('ratioSearchInput')?.addEventListener('input', renderRatioPanel);
  setActiveTab('calculator');
  preloadMarketPriceLists();
  loadLostarkNoticeCard();
  loadClassBenchmarks();
  loadCombatAnalyzer();
  const sharedScenario = decodeSpecScenario(new URLSearchParams(window.location.search).get('scenario'));
  if (sharedScenario?.characterName) {
    state.pendingSharedScenario = sharedScenario;
    state.ownedMaterials = normalizeOwnedMaterials(sharedScenario.ownedMaterials || state.ownedMaterials);
    $('characterName').value = sharedScenario.characterName;
  }
  const boot = loadDb().catch((error) => {
    setMessage(error.message || '진화 노드 데이터를 불러오지 못했습니다.');
    return null;
  });
  if (sharedScenario?.characterName) {
    boot.then(async loaded => {
      if (!loaded && !state.evolution) return;
      await searchCharacter(sharedScenario.characterName);
      if (state.powerSnapshot) openSimulatorPage();
    });
  }
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
