import { normalizeSkillCycleName, skillCooldownSeconds } from './skill-cycle.js';

export const MANA_RECOMMENDATION_SECONDS = 300;

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
  const { duration, maxMana, startMana, recoveryInterval, recoveryMana, firstRecovery, reductions, skills = [], extraRecovery = [] } = input;
  const strict = input.strict === true;
  const recoveryOrder = input.recoveryOrder ?? 'before-cast';
  if (strict && duration !== MANA_RECOMMENDATION_SECONDS) return { reason: '300초 시전 조건이 필요합니다.' };
  if (!validNumber(duration, 1, 600) || !validNumber(maxMana, 1) || !validNumber(startMana, 0, maxMana)
      || !validNumber(recoveryMana, 0) || (recoveryMana > 0
        && (!validNumber(recoveryInterval, 0.1) || !validNumber(firstRecovery, 0)))) {
    return { reason: '전투 시간, 시작·최대 마나, 회복량과 회복 시각을 확인해 주세요.' };
  }
  if (!skills.length || !damageSkills.length) return { reason: '장착 스킬 정보와 측정한 스킬별 사용 조건이 필요합니다.' };
  const knownSkills = new Map(cycleSkills.map(skill => [normalizeSkillCycleName(skill.name), skill]));
  const byName = new Map();
  const replay = strict && skills.some(skill => skill.castStarts != null);
  for (const skill of skills) {
    const key = normalizeSkillCycleName(skill.name);
    const known = knownSkills.get(key);
    if (!key || !known || byName.has(key) || !validNumber(skill.first, 0, duration) || !validNumber(skill.interval, 0.1)
        || !validNumber(skill.cost, 0) || (skill.castTime != null && !validNumber(skill.castTime, 0, duration))
        || (skill.aftercast != null && !validNumber(skill.aftercast, 0, duration))
        || (skill.activeWindows != null && (!Array.isArray(skill.activeWindows) || !skill.activeWindows.every(window =>
          window && validNumber(window.start, 0, duration) && validNumber(window.end, window.start) && window.end > window.start)))
        || (replay && (!Array.isArray(skill.castStarts) || !skill.castStarts.every((time, i, times) =>
          validNumber(time, 0, duration) && (i === 0 || time > times[i - 1]))))
        || (known.manaUsageKnown === true && known.usesMana === false && skill.cost > 0)) {
      return { reason: '스킬 이름, 첫 사용 시각, 재사용 간격과 마나 소모량을 확인해 주세요.' };
    }
    // Zero recorded cost can also be a mana skill made free by another effect.
    const usesMana = known.manaUsageKnown === true ? known.usesMana : skill.cost > 0 ? true : null;
    byName.set(key, { ...skill, key, usesMana, cooldownEligible: known.cooldownEligible !== false,
      ...(strict && { castOnCompletion: /^(?:캐스팅|지점|casting|target)(?:\s*스킬)?$/i.test(known.type || '') }) });
  }
  const damageKeys = damageSkills.map(name => normalizeSkillCycleName(name));
  const missing = [...new Set(damageKeys)].filter(key => !byName.has(key));
  if (missing.length) return { reason: `피해 지분에 있는 스킬의 사용 조건 누락: ${missing.join(', ')}` };
  if (strict) {
    const unscheduled = cycleSkills.filter(skill => skill.currentTree === true && !byName.has(normalizeSkillCycleName(skill.name)));
    if (unscheduled.length) return { reason: `장착 스킬의 사용 조건 누락: ${unscheduled.map(skill => skill.name).join(', ')}` };
    if ([...byName.values()].some(skill => skill.usesMana == null)) return { reason: '일부 스킬의 마나 사용 여부 미확인' };
  }
  if (!extraRecovery.every(event => validNumber(event.time, 0, duration) && validNumber(event.amount, 0))) {
    return { reason: '추가 회복의 시각과 회복량을 확인해 주세요.' };
  }
  if (!['before-cast', 'after-cast'].includes(recoveryOrder)) return { reason: '같은 시각의 회복 처리 순서를 확인해 주세요.' };
  const environment = input.environment;
  const baseline = environment?.baseline ?? recoveryMana;
  const windows = environment?.windows ?? [];
  const recovery = [...extraRecovery, ...(environment?.instant || [])];
  if (baseline > 0 || windows.some(window => window.amount > 0)) {
    if (!validNumber(recoveryInterval, 0.1) || !validNumber(firstRecovery, 0)) {
      return { reason: '회복 효과를 적용할 기본 회복 틱의 시각과 간격이 필요합니다.' };
    }
    for (let tick = 0, time = firstRecovery; strict ? time <= duration + EPSILON : time < duration; time = firstRecovery + ++tick * recoveryInterval) {
      const amount = Math.max(baseline, ...windows.filter(window => window.start <= time + EPSILON && time < window.end - EPSILON).map(window => window.amount));
      recovery.push(strict ? { time, amount, natural: recoveryMana } : { time, amount });
    }
  }
  recovery.sort((a, b) => a.time - b.time);
  const scenario = { duration, maxMana, startMana, recovery, reductions, skills: [...byName.values()], castResults: new Map(), environment };
  if (strict) Object.assign(scenario, { strict, replay, recoveryOrder, schedules: new Map(),
    observation: replay && input.recoveryOrder && environment?.quality !== 'estimate' ? input.observation : null });
  return { scenario };
}

const EPSILON = 1e-8;

function castCount(skill, duration) {
  return Math.max(0, Math.ceil((duration - skill.first - EPSILON) / skill.interval));
}

function manaCastSchedule(skills, duration) {
  return skills.filter(skill => skill.cost > 0 || skill.maxManaCost > 0)
    .flatMap(actor => Array.from({ length: castCount(actor, duration) }, (_, index) => ({
      actor, planned: actor.first + index * actor.interval
    })))
    .sort((a, b) => a.planned - b.planned);
}

function castCycle(skills, scenario) {
  let mana = scenario.startMana;
  let time = 0;
  let recoveryIndex = 0;
  let firstShortage = null;
  const recovery = scenario.recovery;
  const actors = skills.map(skill => ({ ...skill, ready: skill.first, casts: skill.cost > 0 ? 0 : castCount(skill, scenario.duration), wait: 0 }));
  const scheduled = manaCastSchedule(actors, scenario.duration);
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
  while (recovery[recoveryIndex]?.time < scenario.duration - EPSILON) {
    mana = Math.min(scenario.maxMana, mana + recovery[recoveryIndex++].amount);
  }
  const consumedMana = actors.reduce((total, actor) => total + actor.cost * actor.casts, 0);
  return {
    firstShortage,
    consumedMana,
    recoveredMana: Math.max(0, mana + consumedMana - scenario.startMana),
    actors: actors.map(({ key, name, casts, wait, interval, cost }) => ({ key, name, casts, wait, interval, cost }))
  };
}

function manaCastParameters(stats, reductions) {
  const generalCooldown = stats.cooldownReduction || 0;
  const manaCooldown = stats.manaSkillCooldownReduction || 0;
  const furnaceCost = (stats.manaFurnace?.maxManaCostPercent ?? 0) / 100;
  const key = JSON.stringify([generalCooldown, manaCooldown, furnaceCost, reductions]);
  return { generalCooldown, manaCooldown, furnaceCost, key };
}

function manaCastSkills(scenario, reductions, { generalCooldown, manaCooldown, furnaceCost }) {
  const factor = scenario.reductions === 'product'
    ? reductions.reduce((value, reduction) => value * (1 - reduction / 100), 1)
    : Math.max(0, 1 - reductions.reduce((sum, reduction) => sum + reduction, 0) / 100);
  return scenario.skills.map(skill => {
    const cooldown = Math.min(95, generalCooldown + (skill.usesMana ? manaCooldown : 0));
    return {
      ...skill,
      interval: skill.cooldownItem ? skillCooldownSeconds(skill.cooldownItem, cooldown)
        : skill.cooldownEligible ? Math.max(0.1, skill.interval * (1 - cooldown / 100)) : skill.interval,
      cost: skill.usesMana ? skill.cost * factor : skill.cost,
      maxManaCost: skill.usesMana ? furnaceCost : 0
    };
  });
}

function plannedRotation(scenario, skills, cache = true) {
  const key = skills.map(skill => skill.interval).join('|');
  if (cache && scenario.schedules.has(key)) return scenario.schedules.get(key);
  const ready = skills.map(skill => skill.first);
  const planned = [];
  const unavailable = [];
  const counts = Array(skills.length).fill(0);
  let unlocked = 0;
  function nextAvailable(skill, time) {
    if (!skill.activeWindows) return time;
    let next = Infinity;
    for (const { start, end } of skill.activeWindows) {
      const candidate = Math.max(time, start);
      if (candidate < end - EPSILON) next = Math.min(next, candidate);
    }
    return next;
  }
  function planCast(index, time) {
    const skill = skills[index];
    const end = time + (skill.castTime || 0);
    const activation = skill.castOnCompletion ? end : time;
    unlocked = end + (skill.aftercast || 0);
    if (activation <= scenario.duration + EPSILON) {
      planned.push({ index, time: Math.min(activation, scenario.duration) });
      counts[index]++;
    } else if (scenario.replay) {
      unavailable.push({ time, skill: skill.name, reason: '300초 이내 발동 기록 없음' });
    }
    ready[index] = activation + skill.interval;
  }
  if (scenario.replay) {
    const starts = skills.flatMap((skill, index) => skill.castStarts.map(time => ({ index, time })))
      .sort((a, b) => a.time - b.time);
    for (const { index, time } of starts) {
      const skill = skills[index];
      if (time + EPSILON < Math.max(ready[index], unlocked) || nextAvailable(skill, time) > time + EPSILON) {
        unavailable.push({ time, skill: skill.name, reason: '재사용 대기·시전 잠금 또는 사용 가능 조건 불충족' });
        continue;
      }
      planCast(index, time);
    }
  } else {
    while (true) {
      const available = skills.map((skill, index) => nextAvailable(skill, Math.max(unlocked, ready[index])));
      const time = Math.min(...available);
      if (time > scenario.duration + EPSILON) break;
      // Input order is the priority among skills ready when the cast lock ends.
      planCast(available.findIndex(at => at <= time + EPSILON), time);
    }
  }
  const rotation = { planned, counts, unavailable };
  if (cache) scenario.schedules.set(key, rotation);
  return rotation;
}

// Preserve the intended rotation even after a failed cast. Later recovery cannot erase a miss.
export function evaluateManaRotation(scenario, stats = {}, { cache = true } = {}) {
  if (!scenario?.strict) return null;
  const reductions = stats.manaCostReductions || [];
  if (reductions.length > 1 && !['sum', 'product'].includes(scenario.reductions) && scenario.skills.some(skill => skill.cost > 0)) return null;
  const parameters = manaCastParameters(stats, reductions);
  if (cache && scenario.castResults.has(parameters.key)) return scenario.castResults.get(parameters.key);
  const skills = manaCastSkills(scenario, reductions, parameters);
  const { planned, counts, unavailable } = plannedRotation(scenario, skills, cache);
  const actors = skills.map((skill, index) => ({
    key: skill.key, name: skill.name, cost: skill.cost + scenario.maxMana * skill.maxManaCost,
    interval: skill.interval, castTime: skill.castTime, aftercast: skill.aftercast, plannedCasts: counts[index], casts: 0, wait: 0
  }));
  let mana = scenario.startMana;
  let minMana = mana;
  let recoveryIndex = 0;
  let naturalRecovered = 0;
  let extraRecovered = 0;
  let consumedMana = 0;
  let discardedRecovery = 0;
  const shortages = [];
  const observation = scenario.observation;
  // Tolerate floating-point arithmetic only. An in-game MP rounding rule requires evidence.
  const manaTolerance = Number.EPSILON * scenario.maxMana * 32;
  const matchesMana = (actual, measured) => Number.isFinite(measured) && Math.abs(actual - measured) <= manaTolerance;
  let matchesObservation = Boolean(observation?.source && observation.duration === scenario.duration
    && observation.shortageCount === 0 && observation.manaDelay === 0 && observation.lostCasts === 0
    && Array.isArray(observation.events) && observation.events.length === planned.length
    && matchesMana(scenario.startMana, observation.startMana));
  function recoverThrough(time, inclusive) {
    const boundary = inclusive ? time + EPSILON : time - EPSILON;
    while (scenario.recovery[recoveryIndex] && (inclusive
      ? scenario.recovery[recoveryIndex].time <= boundary : scenario.recovery[recoveryIndex].time < boundary)) {
      const event = scenario.recovery[recoveryIndex++];
      const gained = Math.min(scenario.maxMana - mana, event.amount);
      const natural = Math.min(gained, event.natural || 0);
      naturalRecovered += natural;
      extraRecovered += gained - natural;
      discardedRecovery += event.amount - gained;
      mana += gained;
    }
  }
  for (const [eventIndex, { index, time }] of planned.entries()) {
    recoverThrough(time, scenario.recoveryOrder === 'before-cast');
    const skill = actors[index];
    const before = mana;
    if (mana + manaTolerance < skill.cost) {
      shortages.push({ time, skill: skill.name, deficit: skill.cost - mana });
      continue;
    }
    mana = Math.max(0, mana - skill.cost);
    consumedMana += skill.cost;
    minMana = Math.min(minMana, mana);
    skill.casts++;
    if (matchesObservation) {
      const observed = observation.events[eventIndex];
      matchesObservation = observed && normalizeSkillCycleName(observed.skill) === skill.key
        && validNumber(observed.time, 0, scenario.duration) && Math.abs(observed.time - time) <= EPSILON
        && matchesMana(before, observed.before) && matchesMana(mana, observed.after);
    }
  }
  recoverThrough(scenario.duration, true);
  const sustainable = planned.length > 0 && shortages.length === 0 && unavailable.length === 0;
  const result = {
    duration: scenario.duration, completed: true, sustainable, unavailable,
    validation: sustainable && matchesObservation && matchesMana(mana, observation.endMana) ? 'measured' : 'estimate',
    firstShortage: shortages[0]?.time ?? null, shortageCount: shortages.length, shortages,
    manaDelay: 0, lostCasts: shortages.length, minMana, endMana: mana, consumedMana,
    recoveredMana: naturalRecovered + extraRecovered, naturalRecovered, extraRecovered, discardedRecovery,
    skillCasts: actors, delayedSkills: []
  };
  if (cache) scenario.castResults.set(parameters.key, result);
  return result;
}

function manaCastResults(scenario, stats, reductions) {
  const parameters = manaCastParameters(stats, reductions);
  if (scenario.castResults.has(parameters.key)) return scenario.castResults.get(parameters.key);
  const skills = manaCastSkills(scenario, reductions, parameters).map(skill => ({
    ...skill, cost: skill.cost + scenario.maxMana * skill.maxManaCost
  }));
  const { firstShortage, actors, consumedMana, recoveredMana } = castCycle(skills, scenario);
  const byName = new Map(actors.map(actor => [actor.key, actor]));
  const reference = new Map(skills.map(skill => [skill.key, castCount(skill, scenario.duration)]));
  const delayedSkills = actors.filter(actor => actor.wait > EPSILON).map(({ key, name, casts, wait }) => ({
    key, name, casts, wait, lostCasts: Math.max(0, reference.get(key) - casts)
  })).sort((a, b) => b.lostCasts - a.lostCasts || b.wait - a.wait);
  const skillCasts = actors.map(actor => ({ ...actor, plannedCasts: reference.get(actor.key) }));
  const result = { byName, reference, firstShortage, delayedSkills, skillCasts, consumedMana, recoveredMana };
  scenario.castResults.set(parameters.key, result);
  return result;
}

// In a full-start scenario whose recovery scales with max mana, every cast segment must fit one capacity plus its intervening recovery.
export function minimumSustainableMana(scenario, stats = {}) {
  if (!scenario?.normalizedCapacity) return null;
  const reductions = stats.manaCostReductions || [];
  const parameters = manaCastParameters(stats, reductions);
  const key = `capacity:${parameters.key}`;
  if (scenario.castResults.has(key)) return scenario.castResults.get(key);
  const skills = manaCastSkills(scenario, reductions, parameters);
  let recoveryRatio = 0;
  let recoveryIndex = 0;
  const schedule = scenario.strict
    ? plannedRotation(scenario, skills).planned.filter(cast => skills[cast.index].usesMana)
      .map(({ index, time }) => ({ actor: skills[index], planned: time }))
    : manaCastSchedule(skills, scenario.duration);
  const casts = schedule.map(cast => {
    while (scenario.recovery[recoveryIndex] && (scenario.recoveryOrder === 'after-cast'
      ? scenario.recovery[recoveryIndex].time < cast.planned - EPSILON
      : scenario.recovery[recoveryIndex].time <= cast.planned + EPSILON)) recoveryRatio += scenario.recovery[recoveryIndex++].amount;
    return { ...cast, recoveryRatio };
  });
  let required = 0;
  for (let end = 0; end < casts.length; end += 1) {
    let fixedCost = 0;
    let percentCost = 0;
    for (let start = end; start >= 0; start -= 1) {
      fixedCost += casts[start].actor.cost;
      percentCost += casts[start].actor.maxManaCost;
      const available = 1 + casts[end].recoveryRatio - casts[start].recoveryRatio - percentCost;
      if (available > EPSILON) required = Math.max(required, fixedCost / available);
      else if (available < -EPSILON || fixedCost > EPSILON) {
        required = Infinity;
        break;
      }
    }
    if (!Number.isFinite(required)) break;
  }
  scenario.castResults.set(key, required);
  return required;
}

export function evaluateManaCandidate(scenario, stats, damage) {
  if (!scenario) return { reason: '마나 실전 조건 미입력' };
  const rotation = scenario.strict ? evaluateManaRotation(scenario, stats) : null;
  const missing = reason => rotation ? { ...rotation, reason, eligible: false } : { reason };
  if (scenario.strict && !rotation) return missing('마나 소모 감소 중첩 방식 미확인');
  if (damage.manaDamageUnverified) return missing('일부 스킬의 마나 사용 여부 또는 기본 소모량 미확인');
  if (damage.arcanaCardExpectation) return missing('아르카나 카드 수급과 자원 회복의 연동 미검증');
  const rows = damage.skillExperiment?.items?.filter(row => row.share > 0) || [];
  if (!rows.length || Math.abs(rows.reduce((sum, row) => sum + row.share, 0) - 1) > 1e-6) {
    return missing('전체 피해 지분을 스킬별로 연결하지 못함');
  }
  const assumptions = [
    damage.unverifiedClassEffects && '일부 직업 효과 발동·적용 범위 미확인',
    damage.critHitStackingUnverified && '회심 범위 A/B 가정',
    rows.some(row => row.critInteractionUnverified) && '확정 치명과 뭉가 중첩 시 뭉가 규칙으로 추정',
    rows.some(row => row.partialCritRuleUnmodeled) && '별도 치명 규칙이 있는 일부 타격 효과 미반영',
    rows.some(row => row.directionalCritUnverified) && '방향 미확인 스킬의 일격 치피 미반영',
    rows.some(row => row.braceletDirectionUnverified) && '방향 미확인 스킬의 팔찌 방향성 주피 미반영'
  ].filter(Boolean);
  if (rotation) {
    scenario.referenceCounts ??= new Map(plannedRotation(scenario, manaCastSkills(scenario, [], manaCastParameters({}, []))).counts
      .map((count, index) => [scenario.skills[index].key, count]));
    const castsByName = new Map(rotation.skillCasts.map(skill => [skill.key, skill.casts]));
    let value = 0;
    let alternateValue = 0;
    for (const row of rows) {
      const key = normalizeSkillCycleName(row.name);
      const baseline = scenario.referenceCounts.get(key);
      if (!baseline || !castsByName.has(key)) return missing('기준 300초 사이클에 피해 스킬의 시전 기회 없음');
      const weight = row.share * castsByName.get(key) / (baseline * (row.cooldownMultiplier || 1));
      value += weight * row.value;
      alternateValue += weight * (row.alternateValue ?? row.value);
    }
    const quality = assumptions.length ? 'estimate' : scenario.environment?.quality || 'input';
    return { ...rotation, value, alternateValue, totalDamage: value * scenario.duration, assumptions, quality,
      eligible: rotation.sustainable };
  }
  const reductions = stats.manaCostReductions || [];
  const manaDependent = reductions.length || stats.manaFurnace || stats.manaSkillCooldownReduction;
  if (manaDependent && scenario.skills.some(skill => skill.usesMana == null)) return { reason: '일부 스킬의 마나 사용 여부 미확인' };
  if (scenario.skills.some(skill => skill.cost > 0) && reductions.length > 1
      && !['sum', 'product'].includes(scenario.reductions)) return { reason: '마나 소모 감소 중첩 방식 미확인' };
  const { byName, reference, firstShortage, delayedSkills, skillCasts, consumedMana, recoveredMana } = manaCastResults(scenario, stats, reductions);
  if (rows.some(row => !reference.get(normalizeSkillCycleName(row.name)))) return { reason: '전투 구간에 사용 기회가 없는 피해 스킬 포함' };
  let value = damage.value;
  let alternateValue = damage.alternateValue ?? value;
  for (const row of rows) {
    const name = normalizeSkillCycleName(row.name);
    const lostShare = row.share * (1 - byName.get(name).casts / reference.get(name));
    value -= lostShare * row.value;
    alternateValue -= lostShare * (row.alternateValue ?? row.value);
  }
  return {
    value: Math.max(0, value), alternateValue: Math.max(0, alternateValue), firstShortage, delayedSkills, assumptions,
    skillCasts, consumedMana, recoveredMana, duration: scenario.duration,
    quality: assumptions.length ? 'estimate' : scenario.environment?.quality || 'input'
  };
}

export function rankManaCandidates(candidates, compareMana) {
  const theoretical = candidates.filter(candidate => !candidate.calc.result.manaDamageUnverified)
    .sort((a, b) => b.recValue - a.recValue);
  theoretical.forEach((candidate, i) => { candidate.theoryRank = i + 1; });
  const compareAvailability = (a, b) => Number(a.mana.firstShortage != null) - Number(b.mana.firstShortage != null);
  const evaluated = compareMana ? theoretical.filter(candidate => Number.isFinite(candidate.mana?.value))
    .sort((a, b) => b.mana.value - a.mana.value || compareAvailability(a, b) || a.theoryRank - b.theoryRank) : [];
  evaluated.forEach((candidate, i) => { candidate.scenarioRank = i + 1; });
  const practical = evaluated.filter(candidate => candidate.mana.quality !== 'estimate');
  practical.forEach((candidate, i) => { candidate.manaRank = i + 1; });
  const unverified = candidates.filter(candidate => candidate.calc.result.manaDamageUnverified
    || (compareMana && (!Number.isFinite(candidate.mana?.value) || candidate.mana?.quality === 'estimate')));
  const theoryValueB = candidate => candidate.supportModel
    ? candidate.recValue : candidate.calc.result.alternateValue ?? candidate.recValue;
  const theoreticalAlternate = [...theoretical].sort((a, b) => theoryValueB(b) - theoryValueB(a));
  const theoryRankB = new Map(theoreticalAlternate.map((candidate, i) => [candidate, i]));
  const manaValueB = candidate => candidate.mana.alternateValue ?? candidate.mana.value;
  const evaluatedAlternate = [...evaluated].sort((a, b) => manaValueB(b) - manaValueB(a)
    || compareAvailability(a, b) || theoryRankB.get(a) - theoryRankB.get(b));
  return { theoretical, practical, evaluated, unverified, theoreticalAlternate, evaluatedAlternate };
}

export function createManaRanking(compareMana) {
  const theoretical = [];
  const theoreticalAlternate = [];
  const evaluated = [];
  const evaluatedAlternate = [];
  const estimates = [];
  const estimatesAlternate = [];
  const estimatesSupport = [];
  const fallback = [];
  const fallbackEstimates = [];
  const unverified = [];
  const support = [];
  const sustainable = [];
  const sustainableAlternate = [];
  const sustainableSupport = [];
  const measured = [];
  const measuredAlternate = [];
  const measuredSupport = [];
  const shortage = [];
  const counts = { candidates: 0, theoretical: 0, evaluated: 0, estimates: 0, unverified: 0, passed: 0, shortage: 0, measured: 0 };
  const byTheory = (a, b) => b.recValue - a.recValue;
  const alternate = c => c.supportModel ? c.recValue : c.calc.result.alternateValue ?? c.recValue;
  const byTheoryB = (a, b) => alternate(b) - alternate(a) || byTheory(a, b);
  const byMana = (a, b) => b.mana.value - a.mana.value || availability(a.mana, b.mana) || byTheory(a, b);
  const byManaB = (a, b) => (b.mana.alternateValue ?? b.mana.value) - (a.mana.alternateValue ?? a.mana.value)
    || availability(a.mana, b.mana) || byTheoryB(a, b);
  const byFallback = (a, b) => b.fallbackMana.value - a.fallbackMana.value
    || availability(a.fallbackMana, b.fallbackMana) || byTheory(a, b) || byMana(a, b);
  function availability(a, b) {
    return Number(a.firstShortage != null) - Number(b.firstShortage != null);
  }
  // Keep the first five in stable traversal order when the score and tiebreakers match.
  function keep(list, candidate, compare) {
    if (list.length === 5 && compare(candidate, list[4]) >= 0) return;
    const index = list.findIndex(other => compare(candidate, other) < 0);
    list.splice(index < 0 ? list.length : index, 0, candidate);
    if (list.length > 5) list.pop();
  }
  function add(candidate) {
    counts.candidates++;
    if (candidate.supportModel) keep(support, candidate, byTheory);
    if (candidate.mana?.shortageCount > 0 && candidate.mana.duration === MANA_RECOMMENDATION_SECONDS) {
      counts.shortage++;
      if (!candidate.calc.result.manaDamageUnverified) keep(shortage, candidate, byTheory);
    }
    const theory = !candidate.calc.result.manaDamageUnverified;
    const hasMana = compareMana && theory && Number.isFinite(candidate.mana?.value);
    const strict = candidate.mana?.duration === MANA_RECOMMENDATION_SECONDS;
    const estimate = hasMana && (strict ? candidate.mana.validation !== 'measured' : candidate.mana.quality === 'estimate');
    if (!theory || (compareMana && (!hasMana || (!strict && estimate)))) {
      counts.unverified++;
      if (unverified.length < 5) unverified.push(candidate);
    }
    if (!theory) return;
    counts.theoretical++;
    keep(theoretical, candidate, byTheory);
    keep(theoreticalAlternate, candidate, byTheoryB);
    if (!hasMana) return;
    counts.evaluated++;
    keep(evaluated, candidate, byMana);
    keep(evaluatedAlternate, candidate, byManaB);
    const passed = candidate.mana.eligible === true && candidate.mana.completed && strict
      && candidate.mana.shortageCount === 0 && candidate.mana.manaDelay === 0 && candidate.mana.lostCasts === 0;
    if (passed) {
      counts.passed++;
      keep(sustainable, candidate, byMana);
      keep(sustainableAlternate, candidate, byManaB);
      if (candidate.supportModel) keep(sustainableSupport, candidate, byTheory);
      if (!estimate) {
        counts.measured++;
        keep(measured, candidate, byMana);
        keep(measuredAlternate, candidate, byManaB);
        if (candidate.supportModel) keep(measuredSupport, candidate, byTheory);
      }
    }
    if (estimate && (!strict || passed)) {
      counts.estimates++;
      keep(estimates, candidate, byMana);
      keep(estimatesAlternate, candidate, byManaB);
      if (strict && candidate.supportModel) keep(estimatesSupport, candidate, byTheory);
    }
    if (Number.isFinite(candidate.fallbackMana?.value) && (!strict || candidate.fallbackMana.eligible)) {
      keep(fallback, candidate, byFallback);
      if (estimate) keep(fallbackEstimates, candidate, byFallback);
    }
  }
  return { add, counts, theoretical, theoreticalAlternate, evaluated, evaluatedAlternate, estimates, estimatesAlternate, estimatesSupport, unverified, support,
    sustainable, sustainableAlternate, sustainableSupport, measured, measuredAlternate, measuredSupport, shortage, fallback, fallbackEstimates };
}
