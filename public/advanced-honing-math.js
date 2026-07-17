export const ADVANCED_HONING_OUTCOMES = {
  none: [
    { experience: 10, probability: 0.8 },
    { experience: 20, probability: 0.15 },
    { experience: 40, probability: 0.05 }
  ],
  breath: [
    { experience: 10, probability: 0.5 },
    { experience: 20, probability: 0.3 },
    { experience: 40, probability: 0.2 }
  ],
  book: [
    { experience: 10, probability: 0.3 },
    { experience: 20, probability: 0.45 },
    { experience: 40, probability: 0.25 }
  ],
  both: [
    { experience: 20, probability: 0.6 },
    { experience: 40, probability: 0.4 }
  ]
};

const REGULAR_ANCESTOR_EFFECTS = {
  early: [
    { kind: 'multiply', amount: 5, probability: 0.15 },
    { kind: 'multiply', amount: 3, probability: 0.35 },
    { kind: 'recharge', amount: 30, probability: 0.15 },
    { kind: 'free', amount: 10, probability: 0.35 }
  ],
  late: [
    { kind: 'multiply', amount: 5, probability: 0.125 },
    { kind: 'multiply', amount: 3, probability: 0.25 },
    { kind: 'recharge', amount: 30, probability: 0.125 },
    { kind: 'free', amount: 10, probability: 0.25 },
    { kind: 'enhance', amount: 0, probability: 0.125 },
    { kind: 'level', amount: 1, probability: 0.125 }
  ],
  enhanced: [
    { kind: 'multiply', amount: 7, probability: 0.2 },
    { kind: 'multiply', amount: 5, probability: 0.2 },
    { kind: 'recharge', amount: 80, probability: 0.2 },
    { kind: 'free', amount: 30, probability: 0.2 },
    { kind: 'level', amount: 2, probability: 0.2 }
  ]
};

const ACTIONS = [
  { key: 'none', breath: false, book: false },
  { key: 'breath', breath: true, book: false },
  { key: 'book', breath: false, book: true },
  { key: 'both', breath: true, book: true }
];

export function advancedHoningStageForLevel(level) {
  const current = Math.max(0, Math.min(39, Math.floor(Number(level || 0))));
  return Math.floor(current / 10) + 1;
}

function emptyResult() {
  return { gold: 0, attempts: 0, usage: {} };
}

function addUsage(target, source, weight = 1) {
  for (const [key, value] of Object.entries(source || {})) {
    target[key] = Number(target[key] || 0) + Number(value || 0) * weight;
  }
}

function ancestorEffects(stage, mode) {
  if (mode === 'enhanced') return REGULAR_ANCESTOR_EFFECTS.enhanced;
  if (mode === 'ancestor') return stage >= 3 ? REGULAR_ANCESTOR_EFFECTS.late : REGULAR_ANCESTOR_EFFECTS.early;
  return [{ kind: 'normal', amount: 0, probability: 1 }];
}

function applyExperience(levels, experience, gain) {
  let nextLevels = levels;
  let nextExperience = experience + gain;
  while (nextLevels > 0 && nextExperience >= 100) {
    nextLevels -= 1;
    nextExperience -= 100;
  }
  return nextLevels > 0
    ? { levels: nextLevels, experience: nextExperience }
    : { levels: 0, experience: 0 };
}

function transition(state, stage, baseExperience, effect, mode) {
  let levels = state.levels;
  let experience = state.experience;
  let orbs = mode === 'normal' ? Math.min(6, state.orbs + 2) : 2;
  let enhanced = false;
  let free = false;

  if (effect.kind === 'level') {
    levels = Math.max(0, levels - effect.amount);
    experience = 0;
  } else {
    let gain = baseExperience;
    if (effect.kind === 'multiply') gain *= effect.amount;
    if (effect.kind === 'recharge' || effect.kind === 'free') gain += effect.amount;
    ({ levels, experience } = applyExperience(levels, experience, gain));
  }

  if (effect.kind === 'recharge') orbs = 6;
  if (effect.kind === 'free') free = true;
  if (effect.kind === 'enhance') {
    enhanced = true;
    orbs = 6;
  }

  if (levels <= 0) return { levels: 0, experience: 0, orbs: 0, enhanced: false, free: false };
  return { levels, experience, orbs, enhanced, free };
}

function allowedActions(options) {
  return ACTIONS.filter(action => (!action.breath || options.allowBreath) && (!action.book || options.allowBook));
}

function actionGold(action, options, free) {
  const optional = (action.breath ? options.breathGold : 0) + (action.book ? options.bookGold : 0);
  return optional + (free ? 0 : options.baseGold);
}

function stateKey(state) {
  return [state.levels, state.experience, state.orbs, state.enhanced ? 1 : 0, state.free ? 1 : 0].join(':');
}

export function optimizeAdvancedHoning(input = {}) {
  const stage = Math.max(1, Math.min(4, Math.floor(Number(input.stage || 1))));
  const levels = Math.max(1, Math.min(10, Math.floor(Number(input.levels || 1))));
  const options = {
    baseGold: Math.max(0, Number(input.baseGold || 0)),
    breathGold: Math.max(0, Number(input.breathGold || 0)),
    bookGold: Math.max(0, Number(input.bookGold || 0)),
    allowBreath: input.allowBreath !== false,
    allowBook: input.allowBook !== false
  };
  const initial = {
    levels,
    experience: Math.max(0, Math.min(90, Math.floor(Number(input.startExperience || 0) / 10) * 10)),
    orbs: Math.max(0, Math.min(6, Math.floor(Number(input.startOrbs || 0) / 2) * 2)),
    enhanced: Boolean(input.startEnhanced),
    free: Boolean(input.startFree)
  };
  const memo = new Map();

  const solve = state => {
    if (state.levels <= 0) return emptyResult();
    const key = stateKey(state);
    if (memo.has(key)) return memo.get(key);

    const mode = state.enhanced ? 'enhanced' : state.orbs >= 6 ? 'ancestor' : 'normal';
    const effects = ancestorEffects(stage, mode);
    let best = null;

    for (const action of allowedActions(options)) {
      const candidate = {
        gold: actionGold(action, options, state.free),
        attempts: 1,
        usage: { [`${mode}:${action.key}`]: 1 }
      };
      for (const outcome of ADVANCED_HONING_OUTCOMES[action.key]) {
        for (const effect of effects) {
          const probability = outcome.probability * effect.probability;
          const next = transition(state, stage, outcome.experience, effect, mode);
          const child = solve(next);
          candidate.gold += child.gold * probability;
          candidate.attempts += child.attempts * probability;
          addUsage(candidate.usage, child.usage, probability);
        }
      }
      if (!best || candidate.gold < best.gold - 0.000001 || (Math.abs(candidate.gold - best.gold) <= 0.000001 && candidate.attempts < best.attempts)) {
        best = candidate;
      }
    }

    memo.set(key, best || emptyResult());
    return memo.get(key);
  };

  const total = solve(initial);
  const divisor = levels;
  const usagePerLevel = {};
  for (const [key, value] of Object.entries(total.usage || {})) usagePerLevel[key] = value / divisor;
  return {
    stage,
    levels,
    expectedTotalGold: total.gold,
    expectedGoldPerLevel: total.gold / divisor,
    expectedTotalAttempts: total.attempts,
    expectedAttemptsPerLevel: total.attempts / divisor,
    usage: total.usage,
    usagePerLevel,
    june2026Relaxation: true,
    ancestorOrbGain: 2
  };
}

export function summarizeAdvancedHoningStrategy(usage = {}) {
  const actionLabels = { none: '보조 없음', breath: '풀숨', book: '책', both: '풀숨+책' };
  const modeLabels = { normal: '일반', ancestor: '선조의 가호', enhanced: '강화 선조의 가호' };
  const parts = [];
  for (const mode of ['normal', 'ancestor', 'enhanced']) {
    const candidates = Object.entries(usage)
      .filter(([key]) => key.startsWith(`${mode}:`))
      .map(([key, value]) => ({ action: key.split(':')[1], value: Number(value || 0) }))
      .filter(row => row.value > 0.0001)
      .sort((a, b) => b.value - a.value);
    if (candidates.length) parts.push(`${modeLabels[mode]} ${actionLabels[candidates[0].action]}`);
  }
  return parts.length ? parts.join(' · ') : '보조 없음';
}
