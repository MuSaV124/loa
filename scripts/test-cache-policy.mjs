import assert from 'node:assert/strict';
import {
  CHARACTER_REFRESH_COOLDOWN_MS,
  MARKET_REFRESH_COOLDOWN_MS,
  SHARED_PRICE_CACHE_TTL_MS,
  canonicalMarketRequestKey,
  formatCooldownClock,
  remainingCooldownMs
} from '../public/cache-policy.js';

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

console.log('cache policy tests passed');
