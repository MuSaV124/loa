import { buildSkillCycleModel, findSkillCycleItem, skillCooldownSeconds } from './skill-cycle.js';

const SUPPORT_SPECS = new Set(['절실한 구원', '만개', '축복의 오라', '해방자', '빛의 수호자']);
const DEALER_SPECS = new Set(['진실된 용맹', '회귀', '심판자', '빛의 기사']);
const SUPPORT_CLASSES = new Set(['바드', '도화가', '홀리나이트', '발키리']);

const DAMAGE_GEM_PERCENT = [0, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44];
const COOLDOWN_GEM_PERCENT = [0, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
const LEGACY_COOLDOWN_GEM_PERCENT = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20];

const SUPPORT_SKILLS = {
  바드: {
    attackA: ['천상의 연주'],
    attackB: ['음파 진동'],
    identity: ['세레나데 스킬'],
    care: ['수호의 연주', '빛의 광시곡'],
    cooldownA: 30,
    cooldownB: 24,
    durationA: 8,
    durationB: 5
  },
  홀리나이트: {
    attackA: ['신의 분노'],
    attackB: ['천상의 축복'],
    identity: ['신앙 스킬'],
    care: ['신성한 보호', '빛의 광시곡'],
    cooldownA: 27,
    cooldownB: 35,
    durationA: 8,
    durationB: 8
  },
  도화가: {
    attackA: ['묵법 : 해그리기', '묵법: 해그리기'],
    attackB: ['묵법 : 해우물', '묵법: 해우물'],
    identity: ['음양 스킬'],
    care: ['구원의 은총', '구원의 터'],
    cooldownA: 27,
    cooldownB: 30,
    durationA: 8,
    durationB: 6
  },
  발키리: {
    attackA: ['숭고한 맹세'],
    attackB: ['숭고한 도약'],
    identity: ['신앙 스킬'],
    care: ['구원의 은총', '구원의 터'],
    cooldownA: 27,
    cooldownB: 36,
    durationA: 8,
    durationB: 8
  }
};

const OFFICIAL_ACCESSORY_WEIGHTS = {
  allyAttackBuff: 0.0075,
  allyDamageBuff: 0.005,
  brandPower: 0.006,
  identityGain: 0.005
};

export const SUPPORT_RECOMMENDATION_WEIGHTS = Object.freeze({ official: 0.30, party: 0.60, care: 0.10 });

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, number(value)));
}

function normalized(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function statValue(snapshot, name) {
  return number((snapshot?.profile?.stats || []).find(row => normalized(row?.type) === name)?.value);
}

function sumAccessoryEffect(snapshot, key) {
  return (snapshot?.effects?.accessory?.items || []).reduce((sum, item) => sum + number(item?.effects?.[key]), 0);
}

function sumBraceletEffect(snapshot, key) {
  return (snapshot?.effects?.bracelet?.items || []).reduce((sum, item) => sum + number(item?.effects?.[key]), 0);
}

function sumSupportEffect(snapshot, key) {
  return sumAccessoryEffect(snapshot, key) + sumBraceletEffect(snapshot, key);
}

function selectionLevel(selection, name) {
  return number(selection?.[name]?.level ?? selection?.[name]);
}

function selectedTripodText(skillEffects) {
  return (skillEffects?.items || []).flatMap(item => [
    item?.name,
    ...(item?.selectedTripods || []).flatMap(tripod => [tripod?.name, tripod?.description, tripod?.text])
  ]).filter(Boolean).join(' ');
}

function arkGridText(snapshot) {
  return (snapshot?.arkGrid?.slots || []).flatMap(slot => [
    slot?.name,
    ...(slot?.activeTexts || []),
    ...(slot?.gemSummary || []).flatMap(row => [row?.name, row?.description, row?.text])
  ]).filter(Boolean).join(' ');
}

function extractPercent(text, patterns) {
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (match) return number(match[1]);
  }
  return 0;
}

function gemPercent(gem) {
  const level = clamp(Math.trunc(number(gem?.level)), 0, 10);
  const kind = `${gem?.kind || ''} ${gem?.name || ''}`;
  const tier4 = typeof gem?.attackBonus === 'boolean' ? gem.attackBonus : /겁화|작열/.test(`${gem?.name || ''} ${gem?.effectText || ''}`);
  return kind.includes('cooldown') || kind.includes('작열') || kind.includes('홍염')
    ? (tier4 ? COOLDOWN_GEM_PERCENT : LEGACY_COOLDOWN_GEM_PERCENT)[level]
    : DAMAGE_GEM_PERCENT[level];
}

function gemKind(gem) {
  const text = `${gem?.kind || ''} ${gem?.name || ''}`;
  return text.includes('cooldown') || text.includes('작열') || text.includes('홍염') ? 'cooldown' : 'damage';
}

function skillMatches(gem, names) {
  const skill = normalized(gem?.skillName);
  return names.some(name => skill === normalized(name));
}

function cooldownGemFor(gems, names) {
  return Math.max(0, ...(gems || []).filter(gem => gem?.valid !== false && gemKind(gem) === 'cooldown' && skillMatches(gem, names)).map(gemPercent));
}

function damageGemFor(gems, names) {
  return Math.max(0, ...(gems || []).filter(gem => gem?.valid !== false && gemKind(gem) === 'damage' && skillMatches(gem, names)).map(gem => number(gem?.level)));
}

function averageSupportCooldown(gems, excludedNames) {
  const rows = (gems || []).filter(gem => gem?.valid !== false && gemKind(gem) === 'cooldown' && !skillMatches(gem, excludedNames));
  if (!rows.length) return 0;
  return rows.reduce((sum, gem) => sum + gemPercent(gem), 0) / rows.length;
}

export function isSupportSnapshot(snapshot) {
  const className = normalized(snapshot?.profile?.className);
  const secondClass = normalized(snapshot?.profile?.secondClass);
  if (SUPPORT_SPECS.has(secondClass)) return true;
  if (DEALER_SPECS.has(secondClass)) return false;
  if (!SUPPORT_CLASSES.has(className)) return false;
  return ['brandPower', 'allyAttackBuff', 'allyDamageBuff'].some(key => sumAccessoryEffect(snapshot, key) > 0);
}

function evolutionBonuses(selection) {
  const bonuses = { attackBuff: 0, brand: 0, cooldown: 0, partyDamage: 0, identityGain: 0 };
  if (selectionLevel(selection, '선각자') > 0) {
    bonuses.attackBuff += 22;
    bonuses.cooldown += 5;
  }
  if (selectionLevel(selection, '진군') > 0) bonuses.attackBuff += 24;
  if (selectionLevel(selection, '기원') > 0) {
    bonuses.attackBuff += 22;
    bonuses.brand += 4;
  }
  const danceLevel = selectionLevel(selection, '정열의 춤사위');
  bonuses.partyDamage += 7 * danceLevel;
  bonuses.identityGain += 10 * danceLevel;
  for (const name of ['입식 타격가', '마나 용광로', '안정된 관리자']) bonuses.brand += 10 * selectionLevel(selection, name);
  bonuses.identityGain -= 3 * selectionLevel(selection, '안정된 관리자');
  return bonuses;
}

function coreBonuses(snapshot) {
  const text = arkGridText(snapshot);
  return {
    attackBuff: extractPercent(text, [/아군.*공격력.*?(\d+(?:\.\d+)?)%/]),
    brand: extractPercent(text, [/(?:낙인력|낙인 효과).*?(\d+(?:\.\d+)?)%/]),
    allyDamage: extractPercent(text, [/아군.*피해량.*?(\d+(?:\.\d+)?)%/]),
    identityGain: extractPercent(text, [/(?:아이덴티티|세레나데|신앙|조화).*획득.*?(\d+(?:\.\d+)?)%/]),
    cooldown: extractPercent(text, [/(?:재사용 대기시간|쿨타임).*?(\d+(?:\.\d+)?)%/])
  };
}

function levelNearText(text, name, fallback = 1) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(text || '').match(new RegExp(`${escaped}[^0-9]{0,24}(?:Lv\\.?|레벨)?\\s*(\\d+)`, 'i'));
  return Math.max(1, number(match?.[1], fallback));
}

function enlightenmentBonuses(items = []) {
  const text = (items || []).flatMap(item => [item?.name, item?.rawText]).filter(Boolean).join(' ');
  let identityMultiplier = 1;
  for (const name of ['신성 해방', '세레나데 코드', '묵법 : 접무', '해방의 날개']) {
    if (!text.includes(name)) continue;
    const level = Math.min(3, levelNearText(text, name));
    identityMultiplier = Math.max(identityMultiplier, [1, 1.1, 1.1, 1.2][level] || 1);
  }
  let brand = 0;
  for (const name of ['빠른 구원', '빛의 흔적', '포용의 세레나데', '낙인의 세레나데', '오누이', '낙인 강화', '해방자의 흔적', '빛의 검기']) {
    if (text.includes(name)) brand += Math.max(0, levelNearText(text, name) - 1);
  }
  return { identityMultiplier, brand };
}

export function supportContributionModel(snapshot, context = {}) {
  if (!isSupportSnapshot(snapshot)) return null;
  const className = normalized(snapshot?.profile?.className);
  const config = SUPPORT_SKILLS[className] || SUPPORT_SKILLS.바드;
  const gems = snapshot?.gems?.items || [];
  const evolution = evolutionBonuses(context.selection || {});
  const core = coreBonuses(snapshot);
  const enlightenment = enlightenmentBonuses(context.enlightenmentItems || []);
  const tripodText = selectedTripodText(context.skillEffects || {});

  const rawSwift = statValue(snapshot, '신속');
  const rawSpec = statValue(snapshot, '특화');
  const effectiveSwift = rawSwift;
  const effectiveSpec = rawSpec;
  const swiftCooldownFactor = clamp(1 - 0.0214739 * effectiveSwift / 100, 0.2, 1);

  let cooldownA = config.cooldownA;
  let cooldownB = config.cooldownB;
  if (className === '바드' && tripodText.includes('빠른 준비')) cooldownA = 24;
  if (className === '도화가' && tripodText.includes('빠른 준비')) cooldownB = 24;

  const cooldownGemA = cooldownGemFor(gems, config.attackA);
  const cooldownGemB = cooldownGemFor(gems, config.attackB);
  const passiveCooldownFactor = 1 - clamp(evolution.cooldown + core.cooldown, 0, 50) / 100;
  const supportCycleShares = Object.fromEntries(
    (context.skillEffects?.cycleItems || context.skillEffects?.items || [])
      .filter(item => item?.currentTree !== false && number(item?.baseCooldownSeconds) > 0)
      .map(item => [item.name, 1])
  );
  const skillCycle = buildSkillCycleModel({ skillEffects: context.skillEffects || {}, snapshot, shares: supportCycleShares });
  const cycleA = findSkillCycleItem(skillCycle, config.attackA);
  const cycleB = findSkillCycleItem(skillCycle, config.attackB);
  const actualCooldownA = cycleA
    ? Math.max(1, skillCooldownSeconds(cycleA, evolution.cooldown))
    : Math.max(1, cooldownA * swiftCooldownFactor * passiveCooldownFactor * (1 - cooldownGemA / 100));
  const actualCooldownB = cycleB
    ? Math.max(1, skillCooldownSeconds(cycleB, evolution.cooldown))
    : Math.max(1, cooldownB * swiftCooldownFactor * passiveCooldownFactor * (1 - cooldownGemB / 100));
  const uptimeA = clamp(config.durationA / actualCooldownA, 0, 1);
  const uptimeB = clamp(config.durationB / actualCooldownB, 0, 1);
  const overallAttackUptime = clamp((config.durationA + config.durationB) / Math.max(config.durationA + config.durationB, actualCooldownA, actualCooldownB), 0, 1);

  const attackPower = statValue(snapshot, '공격력') || 170000;
  const attackGemA = damageGemFor(gems, config.attackA);
  const attackGemB = damageGemFor(gems, config.attackB);
  const accessoryAttack = sumSupportEffect(snapshot, 'allyAttackBuff');
  const allyAttackA = accessoryAttack + evolution.attackBuff + core.attackBuff + attackGemA;
  const allyAttackB = accessoryAttack + evolution.attackBuff + core.attackBuff + attackGemB;
  const supportAttackAmount = Math.floor(
    0.22 * attackPower * uptimeA * (1 + allyAttackA / 100) +
    0.22 * attackPower * (1 - uptimeA) * (1 + allyAttackB / 100)
  );
  const attackFactor = (170000 + supportAttackAmount * overallAttackUptime) / 170000;

  const brandBonus = sumSupportEffect(snapshot, 'brandPower') + evolution.brand + core.brand + enlightenment.brand;
  const brandFactor = 1 + (10 * (1 + brandBonus / 100)) / 100;
  const partyDamageFactor = 1 + evolution.partyDamage / 145;
  const allTimeBuffPower = attackFactor * brandFactor * partyDamageFactor;

  const identityGemLevel = damageGemFor(gems, config.identity);
  const allyDamageBonus = sumSupportEffect(snapshot, 'allyDamageBuff') + core.allyDamage + identityGemLevel;
  const identityFactor = 1 + 0.13 * enlightenment.identityMultiplier * (1 + allyDamageBonus / 100) * (1 + effectiveSpec / 20.791 / 100);
  const awakeningFactor = 1 + 0.10 * (1 + allyDamageBonus / 100);
  const fullBuffPower = allTimeBuffPower * identityFactor * awakeningFactor;

  const averageCooldown = averageSupportCooldown(gems, config.care);
  const modeledCooldownFactor = skillCycle.items.length
    ? skillCycle.items.reduce((sum, item) => sum + (item.normalizedShare || 0) * skillCooldownSeconds(item, evolution.cooldown) / Math.max(0.1, item.tripodCooldownSeconds || item.baseCooldownSeconds), 0)
    : 0;
  const effectiveCooldownReduction = skillCycle.items.length && skillCycle.mappedShare > 0
    ? clamp(1 - modeledCooldownFactor / skillCycle.mappedShare, 0, 0.8)
    : clamp(1 - swiftCooldownFactor * passiveCooldownFactor * (1 - averageCooldown / 100), 0, 0.8);
  const identityGain = sumSupportEffect(snapshot, 'identityGain') + evolution.identityGain + core.identityGain;
  const awakeningCooldownReduction = clamp(1 - swiftCooldownFactor * passiveCooldownFactor, 0, 0.8);
  const awakeningCycleBonus = (1 / Math.max(0.2, 1 - awakeningCooldownReduction) - 1) * 0.15 + 1;
  const identityUptime = clamp(20.05 * (1 + identityGain / 100) * (1 + effectiveSpec / 30.2 / 100) * awakeningCycleBonus / Math.max(0.2, 1 - effectiveCooldownReduction) / 100, 0, 1);
  const awakeningUptime = clamp(24.45 / Math.max(0.2, 1 - awakeningCooldownReduction) / 100, 0, 1);
  const identityWeighted = 1 + (identityFactor - 1) * identityUptime;
  const awakeningWeighted = 1 + (awakeningFactor - 1) * awakeningUptime;
  const totalBuffPower = allTimeBuffPower * identityWeighted * awakeningWeighted;

  const heal = sumSupportEffect(snapshot, 'partyHeal');
  const shield = sumSupportEffect(snapshot, 'partyShield');
  const carePower = 1 + (heal + shield) / 200;

  return {
    allTimeBuffPower,
    fullBuffPower,
    totalBuffPower,
    carePower,
    allTimePercent: (allTimeBuffPower - 1) * 100,
    fullPercent: (fullBuffPower - 1) * 100,
    totalPercent: (totalBuffPower - 1) * 100,
    carePercent: (carePower - 1) * 100,
    detail: {
      className,
      attackPower,
      effectiveSwift,
      effectiveSpec,
      uptimeA,
      uptimeB,
      overallAttackUptime,
      identityUptime,
      awakeningUptime,
      effectiveCooldownReduction,
      allyAttackA,
      allyAttackB,
      allyDamageBonus,
      brandBonus,
      identityGain,
      skillCycleApplied: Boolean(cycleA || cycleB),
      actualCooldownA,
      actualCooldownB
    }
  };
}

function officialAccessoryFactor(effects = {}) {
  return Object.entries(OFFICIAL_ACCESSORY_WEIGHTS).reduce(
    (factor, [key, weight]) => factor * (1 + number(effects?.[key]) * weight),
    1
  );
}

export function supportOfficialAccessoryTransition(candidate) {
  const current = candidate?.equippedItem?.effects || {};
  const target = { ...current, ...(candidate?.effects || {}) };
  const before = officialAccessoryFactor(current);
  const after = officialAccessoryFactor(target);
  return before > 0 ? Math.max(0, (after / before - 1) * 100) : 0;
}

export function supportUpgradeImpact({ before, after, officialPercent = 0, weights = SUPPORT_RECOMMENDATION_WEIGHTS } = {}) {
  const partyPercent = before?.totalBuffPower > 0 && after?.totalBuffPower > 0
    ? (after.totalBuffPower / before.totalBuffPower - 1) * 100
    : 0;
  const carePercent = before?.carePower > 0 && after?.carePower > 0
    ? (after.carePower / before.carePower - 1) * 100
    : 0;
  const safeOfficial = Math.max(-99.9, number(officialPercent));
  const combinedFactor =
    Math.pow(1 + safeOfficial / 100, number(weights?.official, 0.30)) *
    Math.pow(1 + Math.max(-99.9, partyPercent) / 100, number(weights?.party, 0.60)) *
    Math.pow(1 + Math.max(-99.9, carePercent) / 100, number(weights?.care, 0.10));
  return {
    officialPercent: safeOfficial,
    partyPercent,
    carePercent,
    combinedPercent: (combinedFactor - 1) * 100,
    weights
  };
}

export function snapshotWithAccessoryCandidate(snapshot, candidate) {
  const sourceItems = snapshot?.effects?.accessory?.items || [];
  const items = sourceItems.map(item => item === candidate?.equippedItem
    ? { ...item, effects: { ...(item?.effects || {}), ...(candidate?.effects || {}) } }
    : item);
  return {
    ...snapshot,
    effects: {
      ...(snapshot?.effects || {}),
      accessory: { ...(snapshot?.effects?.accessory || {}), items }
    }
  };
}

export function snapshotWithGemLevel(snapshot, gem, nextLevel) {
  const sourceItems = snapshot?.gems?.items || [];
  const items = sourceItems.map(item => item === gem ? { ...item, level: number(nextLevel) } : item);
  return { ...snapshot, gems: { ...(snapshot?.gems || {}), items } };
}
