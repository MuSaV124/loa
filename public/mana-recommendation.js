import { normalizeSkillCycleName } from './skill-cycle.js';

export function manaFurnaceDamage(effect, skill) {
  if (!effect) return { damage: 0, known: true };
  if (skill?.manaUsageKnown !== true) return { damage: 0, known: false };
  if (skill.usesMana === false) return { damage: 0, known: true };
  const cost = Number(skill.manaCost);
  if (skill.usesMana !== true || !Number.isFinite(cost) || cost <= 0) return { damage: 0, known: false };
  return { damage: Math.min(effect.maxEvolutionDamage, effect.damagePerTenMana * cost / 10), known: true };
}

function validNumber(value, min, max = Infinity) {
  return Number.isFinite(value) && value >= min && value <= max;
}

export function prepareManaScenario(input, damageSkills, cycleSkills = []) {
  const { duration, maxMana, startMana, recoveryInterval, recoveryMana, firstRecovery, reductions, skills, extraRecovery } = input;
  if (!validNumber(duration, 1, 600) || !validNumber(maxMana, 1) || !validNumber(startMana, 0, maxMana)
      || !validNumber(recoveryMana, 0) || (recoveryMana > 0
        && (!validNumber(recoveryInterval, 0.1) || !validNumber(firstRecovery, 0)))) {
    return { reason: '전투 시간, 시작·최대 마나, 회복량과 회복 시각을 확인해 주세요.' };
  }
  if (!skills.length || !damageSkills.length) return { reason: '장착 스킬 정보와 측정한 스킬별 사용 조건이 필요합니다.' };
  const knownSkills = new Map(cycleSkills.map(skill => [normalizeSkillCycleName(skill.name), skill]));
  const byName = new Map();
  for (const skill of skills) {
    const key = normalizeSkillCycleName(skill.name);
    const known = knownSkills.get(key);
    if (!key || !known || byName.has(key) || !validNumber(skill.first, 0, duration) || !validNumber(skill.interval, 0.1)
        || !validNumber(skill.cost, 0) || (known.manaUsageKnown === true && known.usesMana === false && skill.cost > 0)) {
      return { reason: '스킬 이름, 첫 사용 시각, 재사용 간격과 마나 소모량을 확인해 주세요.' };
    }
    // Zero recorded cost can also be a mana skill made free by another effect.
    const usesMana = known.manaUsageKnown === true ? known.usesMana : skill.cost > 0 ? true : null;
    byName.set(key, { ...skill, key, usesMana, cooldownEligible: known.cooldownEligible !== false });
  }
  const damageKeys = damageSkills.map(name => normalizeSkillCycleName(name));
  const missing = [...new Set(damageKeys)].filter(key => !byName.has(key));
  if (missing.length) return { reason: `피해 지분에 있는 스킬의 사용 조건 누락: ${missing.join(', ')}` };
  if (!extraRecovery.every(event => validNumber(event.time, 0, duration) && validNumber(event.amount, 0))) {
    return { reason: '추가 회복의 시각과 회복량을 확인해 주세요.' };
  }
  const environment = input.environment;
  const baseline = environment?.baseline ?? recoveryMana;
  const windows = environment?.windows ?? [];
  const recovery = [...extraRecovery, ...(environment?.instant || [])];
  if (baseline > 0 || windows.some(window => window.amount > 0)) {
    if (!validNumber(recoveryInterval, 0.1) || !validNumber(firstRecovery, 0)) {
      return { reason: '회복 효과를 적용할 기본 회복 틱의 시각과 간격이 필요합니다.' };
    }
    for (let tick = 0, time = firstRecovery; time < duration; time = firstRecovery + ++tick * recoveryInterval) {
      const amount = Math.max(baseline, ...windows.filter(window => window.start <= time + EPSILON && time < window.end - EPSILON).map(window => window.amount));
      recovery.push({ time, amount });
    }
  }
  recovery.sort((a, b) => a.time - b.time);
  return { scenario: { duration, maxMana, startMana, recovery, reductions, skills: [...byName.values()], castResults: new Map(), environment } };
}

const EPSILON = 1e-8;

function castCount(skill, duration) {
  return Math.max(0, Math.ceil((duration - skill.first - EPSILON) / skill.interval));
}

function castCycle(skills, scenario) {
  let mana = scenario.startMana;
  let time = 0;
  let recoveryIndex = 0;
  let firstShortage = null;
  const recovery = scenario.recovery;
  const actors = skills.map(skill => ({ ...skill, ready: skill.first, casts: skill.cost > 0 ? 0 : castCount(skill, scenario.duration), wait: 0 }));
  const scheduled = actors.filter(actor => actor.cost > 0)
    .flatMap(actor => Array.from({ length: castCount(actor, scenario.duration) }, (_, index) => ({
      actor, planned: actor.first + index * actor.interval
    })))
    .sort((a, b) => a.planned - b.planned);
  // A mana-blocked cast holds its place in the entered rotation so extra recovery cannot redirect mana to another cast.
  for (const { actor, planned } of scheduled) {
    time = Math.max(time, actor.ready, planned);
    while (recovery[recoveryIndex]?.time <= time + EPSILON) {
      mana = Math.min(scenario.maxMana, mana + recovery[recoveryIndex++].amount);
    }
    if (time >= scenario.duration - EPSILON) {
      actor.wait += Math.max(0, scenario.duration - planned);
      continue;
    }
    if (mana + EPSILON < actor.cost) {
      firstShortage ??= time;
      while (mana + EPSILON < actor.cost && recovery[recoveryIndex]?.time < scenario.duration - EPSILON) {
        const event = recovery[recoveryIndex++];
        time = Math.max(time, event.time);
        mana = Math.min(scenario.maxMana, mana + event.amount);
      }
    }
    if (mana + EPSILON < actor.cost) {
      time = scenario.duration;
      actor.wait += Math.max(0, time - planned);
      continue;
    }
    mana = Math.max(0, mana - actor.cost);
    actor.casts += 1;
    actor.ready = time + actor.interval;
    actor.wait += time - planned;
  }
  return {
    firstShortage,
    actors: actors.map(({ key, name, casts, wait }) => ({ key, name, casts, wait }))
  };
}

function manaCastResults(scenario, stats, reductions) {
  const generalCooldown = stats.cooldownReduction || 0;
  const manaCooldown = stats.manaSkillCooldownReduction || 0;
  const furnaceCost = (stats.manaFurnace?.maxManaCostPercent ?? 0) / 100;
  const key = JSON.stringify([generalCooldown, manaCooldown, furnaceCost, reductions]);
  if (scenario.castResults.has(key)) return scenario.castResults.get(key);
  const factor = scenario.reductions === 'product'
    ? reductions.reduce((value, reduction) => value * (1 - reduction / 100), 1)
    : Math.max(0, 1 - reductions.reduce((sum, reduction) => sum + reduction, 0) / 100);
  const skills = scenario.skills.map(skill => ({
    ...skill,
    interval: skill.cooldownEligible ? Math.max(0.1, skill.interval *
      (1 - Math.min(95, generalCooldown + (skill.usesMana ? manaCooldown : 0)) / 100)) : skill.interval,
    cost: skill.usesMana ? skill.cost * factor + scenario.maxMana * furnaceCost : skill.cost
  }));
  const { firstShortage, actors } = castCycle(skills, scenario);
  const byName = new Map(actors.map(actor => [actor.key, actor]));
  const reference = new Map(skills.map(skill => [skill.key, castCount(skill, scenario.duration)]));
  const delayedSkills = actors.filter(actor => actor.wait > EPSILON).map(actor => ({
    ...actor, lostCasts: Math.max(0, reference.get(actor.key) - actor.casts)
  })).sort((a, b) => b.lostCasts - a.lostCasts || b.wait - a.wait);
  const result = { byName, reference, firstShortage, delayedSkills };
  scenario.castResults.set(key, result);
  return result;
}

export function evaluateManaCandidate(scenario, stats, damage) {
  if (!scenario) return { reason: '마나 실전 조건 미입력' };
  if (damage.manaDamageUnverified) return { reason: '일부 스킬의 마나 사용 여부 또는 기본 소모량 미확인' };
  if (damage.arcanaCardExpectation) return { reason: '아르카나 카드 수급과 자원 회복의 연동 미검증' };
  const rows = damage.skillExperiment?.items?.filter(row => row.share > 0) || [];
  if (!rows.length || Math.abs(rows.reduce((sum, row) => sum + row.share, 0) - 1) > 1e-6) {
    return { reason: '전체 피해 지분을 스킬별로 연결하지 못함' };
  }
  if (damage.critHitStackingUnverified || rows.some(row => row.critInteractionUnverified || row.partialCritRuleUnmodeled)) {
    return { reason: '일부 피해 효과의 치명 규칙 적용 순서 미검증' };
  }
  const reductions = stats.manaCostReductions || [];
  const manaDependent = reductions.length || stats.manaFurnace || stats.manaSkillCooldownReduction;
  if (manaDependent && scenario.skills.some(skill => skill.usesMana == null)) return { reason: '일부 스킬의 마나 사용 여부 미확인' };
  if (scenario.skills.some(skill => skill.cost > 0) && reductions.length > 1
      && !['sum', 'product'].includes(scenario.reductions)) return { reason: '마나 소모 감소 중첩 방식 미확인' };
  const { byName, reference, firstShortage, delayedSkills } = manaCastResults(scenario, stats, reductions);
  if (rows.some(row => !reference.get(normalizeSkillCycleName(row.name)))) return { reason: '전투 구간에 사용 기회가 없는 피해 스킬 포함' };
  let value = damage.value;
  for (const row of rows) {
    const name = normalizeSkillCycleName(row.name);
    value -= row.share * row.value * (1 - byName.get(name).casts / reference.get(name));
  }
  return { value: Math.max(0, value), firstShortage, delayedSkills, quality: scenario.environment?.quality || 'input' };
}

export function rankManaCandidates(candidates, compareMana) {
  const theoretical = candidates.filter(candidate => !candidate.calc.result.manaDamageUnverified)
    .sort((a, b) => b.recValue - a.recValue);
  theoretical.forEach((candidate, i) => { candidate.theoryRank = i + 1; });
  const evaluated = compareMana ? theoretical.filter(candidate => Number.isFinite(candidate.mana?.value))
    .sort((a, b) => Number(a.mana.firstShortage != null) - Number(b.mana.firstShortage != null)
      || b.mana.value - a.mana.value || a.theoryRank - b.theoryRank) : [];
  evaluated.forEach((candidate, i) => { candidate.scenarioRank = i + 1; });
  const practical = evaluated.filter(candidate => candidate.mana.quality !== 'estimate');
  practical.forEach((candidate, i) => { candidate.manaRank = i + 1; });
  const unverified = candidates.filter(candidate => candidate.calc.result.manaDamageUnverified
    || (compareMana && (!Number.isFinite(candidate.mana?.value) || candidate.mana?.quality === 'estimate')));
  return { theoretical, practical, evaluated, unverified };
}
