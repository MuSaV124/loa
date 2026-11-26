import { skillCooldownSeconds } from './skill-cycle.js';

export const SUPPORT_MANA_VERIFIED_AT = '2026-11-19';
const foodSource = id => `https://lostark.inven.co.kr/dataninfo/item/?code=${id}`;
export const MANA_FOODS = Object.freeze({
  roastSkewer: { label: '장인의 노릇한 꼬치구이', rate: 8, source: foodSource(6854001) },
  garlicSteak: { label: '장인의 마늘 스테이크 정식', rate: 8, source: foodSource(6854004) },
  crispySkewer: { label: '달인의 바삭한 꼬치구이', rate: 16, source: foodSource(6854005) },
  butterSteak: { label: '달인의 버터 스테이크 정식', rate: 16, source: foodSource(6854008) },
  chewySkewer: { label: '명인의 쫄깃한 꼬치구이', rate: 24, source: foodSource(6854009) },
  herbSteak: { label: '명인의 허브 스테이크 정식', rate: 24, source: foodSource(6854012) },
  seasonedSkewer: { label: '대가의 양념 꼬치구이', rate: 24, source: foodSource(6854013) },
  tenderloinSteak: { label: '대가의 안심 스테이크 정식', rate: 24, source: foodSource(6854016) },
  handmadeSkewer: { label: '거장의 수제 꼬치구이', rate: 24, source: foodSource(6854017) },
  stripSteak: { label: '거장의 채끝 스테이크 정식', rate: 24, source: foodSource(6854020) }
});
export const SUPPORT_MANA = Object.freeze({
  none: { label: '서포터 없음' },
  bard: {
    label: '바드', skill: '천상의 연주', level: 14, kind: 'window', percent: 40, duration: 8, baseCooldown: 30, range: 24,
    source: 'https://lostark.game.onstove.com/Profile/Character/%EC%98%AC%ED%95%B4%EC%95%84%EC%B9%A8%EC%8A%A4%EB%B2%A4%EB%8D%B0'
  },
  artist: {
    label: '도화가', skill: '묵법 : 해우물', level: 14, kind: 'instant', percent: 25, baseCooldown: 30, range: 24,
    source: 'https://lostark.game.onstove.com/Profile/Character/%EC%9E%94%EB%8F%84%ED%95%98'
  },
  paladin: {
    label: '홀리나이트', skill: '천상의 축복', tripod: '완전한 축복', kind: 'window', percent: 50, duration: 8, baseCooldown: 30, range: 24,
    source: 'https://lostark.game.onstove.com/Profile/Character/Cryptarithm'
  },
  valkyrie: {
    label: '발키리', skill: '숭고한 도약', tripod: '마나의 축복', kind: 'window', percent: 50, duration: 8, baseCooldown: 30, range: 24,
    source: 'https://lostark.game.onstove.com/Profile/Character/%EB%B0%9C%ED%82%A4%EB%A6%AC001'
  }
});

// Current-level Korean Armory tooltips captured on 2026-11-25, with the selected tripod when specified.
const ARTIST_VARIANTS = Object.freeze({
  'level-7': { level: 7, percent: 22 },
  'level-14-tripod': { level: 14, percent: 37, tripod: '마나 회복 (+12% 즉시)' }
});

export function supportManaProfile(support, variant = '') {
  if (!Object.hasOwn(SUPPORT_MANA, support)) return null;
  if (!variant) return SUPPORT_MANA[support];
  if (support !== 'artist' || !Object.hasOwn(ARTIST_VARIANTS, variant)) return null;
  return { ...SUPPORT_MANA.artist, ...ARTIST_VARIANTS[variant] };
}

export function supportManaSummary(profile) {
  if (!profile.skill) return '';
  const scope = [profile.skill, profile.tripod, profile.level && `Lv.${profile.level}`].filter(Boolean).join(' · ');
  const effect = profile.kind === 'instant' ? `즉시 ${profile.percent}%` : `${profile.duration}초간 회복 속도 +${profile.percent}%`;
  return `${scope} · ${effect} · 기본 쿨 ${profile.baseCooldown}초 · 파티 ${profile.range}m`;
}

// Same cooldown groups as the character skill model. Estimated stats are explicit user inputs.
export function supportManaCycle(profile, { swift, swiftReduction, gem, tripodSeconds, tripodPercent, interval } = {}) {
  if (!profile?.skill) return null;
  const inRange = (value, max) => value == null || (Number.isFinite(value) && value >= 0 && value <= max);
  if (!inRange(swift, 4000) || !inRange(swiftReduction, 80) || !inRange(gem, 95) ||
      !inRange(tripodSeconds, profile.baseCooldown - 0.1) || !inRange(tripodPercent, 95) ||
      (interval != null && (!Number.isFinite(interval) || interval < 0.1 || interval > 600))) {
    return { reason: '서포터 스킬의 신속·보석·트라이포드·사용 간격을 확인해 주세요.' };
  }
  const cooldown = skillCooldownSeconds({ baseCooldownSeconds: profile.baseCooldown,
    swiftCooldownReduction: swiftReduction ?? ((swift ?? 0) * 0.0214739),
    gemCooldownReduction: gem ?? 0, cooldown: { flatSeconds: tripodSeconds ?? 0, percentReduction: tripodPercent ?? 0 } });
  const period = interval ?? cooldown;
  return { cooldown, period, coverage: profile.kind === 'window' ? 100 * Math.min(1, profile.duration / period) : null,
    activationsPerMinute: 60 / period };
}

export function resolveManaEnvironment({
  support = 'none', duration, maxMana, naturalMana, uptime, receivedTimes = [], manualRestore,
  food = false, foodTick, foodPreset, cooldownPlan, patch = SUPPORT_MANA_VERIFIED_AT, inclusiveEnd = false, variant = ''
}) {
  const profile = supportManaProfile(support, variant);
  if (!profile) return { reason: '서포터 종류 미확인' };
  if (!Number.isFinite(naturalMana) || naturalMana < 0) return { reason: '기본 마나 회복량 미확인' };
  const foodData = food && Object.hasOwn(MANA_FOODS, foodPreset) ? MANA_FOODS[foodPreset] : null;
  const assumedFood = foodData && !Number.isFinite(foodTick);
  if (food && !assumedFood && (!Number.isFinite(foodTick) || foodTick < naturalMana)) return { reason: '음식 사용 상태의 회복 1회량 미확인' };
  const baseline = food ? (assumedFood ? naturalMana * (1 + foodData.rate / 100) : foodTick) : naturalMana;
  const assumptions = [];
  if (assumedFood) assumptions.push(`${foodData.label}의 회복량 배율을 입력한 틱에 적용하고 전투 중 음식 유지 가정`);
  const result = { profile, baseline, quality: assumedFood ? 'estimate' : 'input', windows: [], instant: [] };
  const finish = () => {
    if (assumptions.length) Object.assign(result, { quality: 'estimate', assumption: assumptions.join(' · ') });
    return result;
  };
  if (!profile.skill) return finish();
  if (patch > SUPPORT_MANA_VERIFIED_AT) return { reason: '현재 패치에서 서포터 회복 툴팁 재확인 필요' };
  if (Number.isFinite(uptime) && (uptime < 0 || uptime > 100)) return { reason: '서포터 가동률을 0~100%로 입력해 주세요.' };
  if (receivedTimes.some(time => !Number.isFinite(time) || time < 0 || (inclusiveEnd ? time > duration : time >= duration))) {
    return { reason: '서포터 효과를 받은 시각을 전투 구간 안으로 입력해 주세요.' };
  }
  if (uptime === 0) return receivedTimes.length ? { reason: '서포터 가동률 0%와 수신 시각이 동시에 입력됐습니다.' } : finish();
  const useCooldown = !receivedTimes.length && (!Number.isFinite(uptime) || profile.kind === 'instant') && cooldownPlan != null;
  if (useCooldown) {
    const theory = supportManaCycle(profile, cooldownPlan);
    if (theory.reason) return theory;
    if (!Number.isFinite(duration) || duration <= 0 || duration > 600) return { reason: '서포터 회복을 표시할 전투 시간을 확인해 주세요.' };
    receivedTimes = Array.from({ length: Math.ceil(duration / theory.period) }, (_, index) => index * theory.period);
    result.theory = theory;
    assumptions.push('조우부터 계산 간격마다 수신한다고 가정');
  }
  if (!receivedTimes.length && (!Number.isFinite(uptime) || profile.kind === 'instant')) {
    return { reason: profile.kind === 'instant'
      ? '도화가 즉시 회복은 실제 적용 시각이 필요합니다.'
      : '서포터 회복의 적용 시각 또는 가동률이 필요합니다.' };
  }
  const manual = Number.isFinite(manualRestore);
  if (profile.kind === 'instant') {
    if (manual && (manualRestore < 0 || manualRestore > maxMana)) return { reason: '서포터 즉시 회복량을 확인해 주세요.' };
    const amount = manual ? manualRestore : maxMana * (profile.percent / 100);
    result.instant = [...new Set(receivedTimes)].map(time => ({ time, amount }));
    if (!manual) assumptions.push('해우물 회복을 받는 캐릭터의 최대 마나 비례로 가정');
    return finish();
  }
  if (manual && manualRestore < baseline) return { reason: '서포터 효과 중 회복량은 기본 회복량 이상이어야 합니다.' };
  const buffed = manual ? manualRestore : baseline * (1 + profile.percent / 100);
  let times = [...new Set(receivedTimes)];
  if (!times.length) {
    times = [];
    const period = profile.duration / (uptime / 100);
    for (let time = 0; time < duration; time += period) times.push(time);
  }
  result.windows = times.map(start => ({ start, end: inclusiveEnd ? start + profile.duration : Math.min(duration, start + profile.duration), amount: buffed }));
  if (!receivedTimes.length) assumptions.push('입력 가동률을 균등한 버프 구간으로 가정');
  if (!manual) assumptions.push('회복 속도 효과를 동일한 틱 간격의 회복량 증가로 가정');
  return finish();
}
