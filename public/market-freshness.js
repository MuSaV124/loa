// .github/workflows/refresh-market-cache.yml runs at :07 and :37 UTC.
export const MARKET_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const LONG_STALE_MS = 24 * 60 * 60 * 1000;
const kst = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short'
});

export function marketFreshness(updatedAt, now = Date.now()) {
  const time = Date.parse(updatedAt || '');
  if (!Number.isFinite(time) || time > now) return { state: 'unknown', label: '갱신 시각 미확인' };
  const age = now - time;
  const minutes = Math.floor(age / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const elapsed = days ? `${days}일 ${hours % 24}시간` : hours ? `${hours}시간 ${minutes % 60}분` : `${minutes}분`;
  const state = age > LONG_STALE_MS ? 'stale' : age > 2 * MARKET_REFRESH_INTERVAL_MS ? 'delayed' : 'current';
  const label = { current: '정상', delayed: '갱신 지연', stale: '장기 미갱신' }[state];
  return { time, state, label, stamp: `${kst.format(time)} KST`, elapsed };
}

export function preservesPricedItems(section, previous, candidate) {
  if (section === 'crystal') return !(Number(previous?.crystalGoldPer100) > 0) || Number(candidate?.crystalGoldPer100) > 0;
  const previousKeys = pricedItemKeys(section, previous);
  const nextKeys = pricedItemKeys(section, candidate);
  return [...previousKeys].every(key => nextKeys.has(key));
}

function pricedItemKeys(section, data) {
  const positive = item => !item?.missing && !item?.error && Number.isFinite(Number(item?.price)) && Number(item.price) > 0;
  if (section === 'gem') {
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    return new Set(rows.flatMap(row => ['damage', 'cooldown']
      .filter(type => positive(row?.[type])).map(type => `${row.level}/${type}`)));
  }
  const items = Array.isArray(data?.items) ? data.items : [];
  return new Set(items.filter(positive).map(item =>
    section === 'material' ? item.requestedName || item.name : item.name));
}
