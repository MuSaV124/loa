export const SUPPORT_MANA_VERIFIED_AT = '2026-11-19';
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

export function supportManaSummary(profile) {
  if (!profile.skill) return '';
  const scope = [profile.skill, profile.tripod, profile.level && `Lv.${profile.level}`].filter(Boolean).join(' · ');
  const effect = profile.kind === 'instant' ? `즉시 ${profile.percent}%` : `${profile.duration}초간 회복 속도 +${profile.percent}%`;
  return `${scope} · ${effect} · 기본 쿨 ${profile.baseCooldown}초 · 파티 ${profile.range}m`;
}

export function resolveManaEnvironment({
  support = 'none', duration, maxMana, naturalMana, uptime, receivedTimes = [], manualRestore,
  food = false, foodTick, patch = SUPPORT_MANA_VERIFIED_AT, inclusiveEnd = false
}) {
  const profile = Object.hasOwn(SUPPORT_MANA, support) ? SUPPORT_MANA[support] : null;
  if (!profile) return { reason: '서포터 종류 미확인' };
  if (!Number.isFinite(naturalMana) || naturalMana < 0) return { reason: '기본 마나 회복량 미확인' };
  if (food && (!Number.isFinite(foodTick) || foodTick < naturalMana)) return { reason: '음식 사용 상태의 회복 1회량 미확인' };
  const baseline = food ? foodTick : naturalMana;
  const result = { profile, baseline, quality: 'input', windows: [], instant: [] };
  if (!profile.skill || uptime === 0) return result;
  if (patch > SUPPORT_MANA_VERIFIED_AT) return { reason: '현재 패치에서 서포터 회복 툴팁 재확인 필요' };
  if (Number.isFinite(uptime) && (uptime < 0 || uptime > 100)) return { reason: '서포터 가동률을 0~100%로 입력해 주세요.' };
  if (receivedTimes.some(time => !Number.isFinite(time) || time < 0 || (inclusiveEnd ? time > duration : time >= duration))) {
    return { reason: '서포터 효과를 받은 시각을 전투 구간 안으로 입력해 주세요.' };
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
    if (!manual) {
      result.quality = 'estimate';
      result.assumption = '해우물 회복을 받는 캐릭터의 최대 마나 비례로 가정';
    }
    return result;
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
  if (!manual || !receivedTimes.length) {
    result.quality = 'estimate';
    result.assumption = [!receivedTimes.length && '입력 가동률을 균등한 버프 구간으로 가정',
      !manual && '회복 속도 효과를 동일한 틱 간격의 회복량 증가로 가정'].filter(Boolean).join(' · ');
  }
  return result;
}
