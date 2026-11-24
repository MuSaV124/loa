import assert from 'node:assert/strict';
import {
  CHARACTER_REFRESH_COOLDOWN_MS,
  MARKET_REFRESH_COOLDOWN_MS,
  SHARED_PRICE_CACHE_TTL_MS,
  canonicalMarketRequestKey,
  formatCooldownClock,
  isCompatibleCharacterCacheData,
  remainingCooldownMs
} from '../public/cache-policy.js';
import { marketFreshness } from '../public/market-freshness.js';

assert.equal(SHARED_PRICE_CACHE_TTL_MS, 30 * 60 * 1000);
assert.equal(MARKET_REFRESH_COOLDOWN_MS, 10 * 60 * 1000);
assert.equal(CHARACTER_REFRESH_COOLDOWN_MS, 60 * 1000);

assert.equal(remainingCooldownMs(1_000, 60_000, 31_000), 30_000);
assert.equal(remainingCooldownMs(1_000, 60_000, 61_000), 0);
assert.equal(remainingCooldownMs(0, 60_000, 10_000), 0);
assert.equal(formatCooldownClock(60_001), '1:01');
assert.equal(formatCooldownClock(59_001), '1:00');

assert.equal(
  canonicalMarketRequestKey('/api/market-prices?force=1&mode=gemList&_=123'),
  '/api/market-prices?mode=gemList'
);
assert.equal(
  canonicalMarketRequestKey('/api/market-prices?combo=highHigh&part=necklace&mode=accessory'),
  '/api/market-prices?combo=highHigh&mode=accessory&part=necklace'
);

const currentCharacter = { ok: true, apiVersion: '5.9.3', profile: { CharacterName: '무사브' } };
assert.equal(isCompatibleCharacterCacheData(currentCharacter, '5.9.3'), true);
assert.equal(isCompatibleCharacterCacheData(currentCharacter, '5.9.2'), false);
assert.equal(isCompatibleCharacterCacheData({ ...currentCharacter, apiVersion: undefined }, '5.9.3'), false);

const collectedAt = '2026-11-24T00:00:00.000Z';
const collected = Date.parse(collectedAt);
const hour = 60 * 60 * 1000;
assert.equal(marketFreshness(collectedAt, collected + hour).state, 'current');
assert.equal(marketFreshness(collectedAt, collected + hour + 1).state, 'delayed');
assert.equal(marketFreshness(collectedAt, collected + 24 * hour).state, 'delayed');
const stale = marketFreshness(collectedAt, collected + 25 * hour);
assert.equal(stale.state, 'stale');
assert.equal(stale.elapsed, '1일 1시간');
assert.match(stale.stamp, /9:00.*KST/);
for (const invalid of [null, 'invalid', '2026-11-25T00:00:00Z']) {
  assert.equal(marketFreshness(invalid, collected).state, 'unknown');
}

console.log('cache policy tests passed');
