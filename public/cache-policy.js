export const SHARED_PRICE_CACHE_TTL_MS = 30 * 60 * 1000;
export const MARKET_REFRESH_COOLDOWN_MS = 10 * 60 * 1000;
export const CHARACTER_REFRESH_COOLDOWN_MS = 60 * 1000;

export function remainingCooldownMs(lastUpdatedAt, cooldownMs, now = Date.now()) {
  const last = Number(lastUpdatedAt || 0);
  const cooldown = Math.max(0, Number(cooldownMs || 0));
  if (!last || !cooldown) return 0;
  return Math.max(0, last + cooldown - Number(now || 0));
}

export function formatCooldownClock(remainingMs) {
  const totalSeconds = Math.max(0, Math.ceil(Number(remainingMs || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function canonicalMarketRequestKey(url, baseUrl = 'http://localhost') {
  const parsed = new URL(url, baseUrl);
  parsed.searchParams.delete('_');
  parsed.searchParams.delete('force');
  parsed.searchParams.sort();
  const query = parsed.searchParams.toString();
  return `${parsed.pathname}${query ? `?${query}` : ''}`;
}

export function isCompatibleCharacterCacheData(data, apiVersion) {
  return Boolean(
    data?.ok
    && data?.profile?.CharacterName
    && String(data?.apiVersion || '') === String(apiVersion || '')
  );
}
