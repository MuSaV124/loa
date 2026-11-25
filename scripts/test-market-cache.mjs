import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  MARKET_CACHE_PATH,
  createNextMarketSnapshot,
  isUsableMarketSnapshot,
  isUsableMaterialSection
} from '../server/market-cache.js';
import { T4_MATERIAL_GROUPS } from '../api/market-prices.js';
import refreshMarketCache from '../api/refresh-market-cache.js';

const now = new Date('2026-07-26T03:00:00.000Z');

const officialAugustMaterials = T4_MATERIAL_GROUPS.flatMap(group => group.items);
assert.ok(officialAugustMaterials.includes('재봉술 : 전율 [12-15]'));
assert.ok(officialAugustMaterials.includes('재봉술 : 전율 [16-19]'));
assert.ok(officialAugustMaterials.includes('야금술 : 전율 [12-15]'));
assert.ok(officialAugustMaterials.includes('야금술 : 전율 [16-19]'));
assert.ok(!officialAugustMaterials.includes('사령의 잔영'));
assert.ok(!officialAugustMaterials.includes('죽음의 손'));

function gemSection(price = 100) {
  return {
    ok: true,
    mode: 'gemList',
    updatedAt: now.toISOString(),
    rows: [10, 9, 8, 7, 6, 5].map(level => ({
      level,
      damage: { name: `${level}레벨 겁화`, price: price + level },
      cooldown: { name: `${level}레벨 작열`, price: price + level + 1 }
    }))
  };
}

function engravingSection(price = 100) {
  return {
    ok: true,
    mode: 'engravingList',
    updatedAt: now.toISOString(),
    items: Array.from({ length: 5 }, (_, index) => ({ name: `각인서 ${index}`, grade: '유물', price: price + index }))
  };
}

function materialSection(price = 100) {
  const names = ['아비도스 융화제', '상급 아비도스 융화제', '빙하의 숨결', '용암의 숨결', '운명의 파괴석'];
  return {
    ok: true,
    mode: 't4Materials',
    updatedAt: now.toISOString(),
    groups: ['재료'],
    items: names.map((name, index) => ({ requestedName: name, name, group: '재료', price: price + index }))
  };
}

function crystalSection(price = 3900) {
  return { ok: true, crystalGoldPer100: price, updatedAt: now.toISOString() };
}

const freshResults = {
  gem: { status: 'fulfilled', value: gemSection() },
  engraving: { status: 'fulfilled', value: engravingSection() },
  material: { status: 'fulfilled', value: materialSection() },
  crystal: { status: 'fulfilled', value: crystalSection() }
};

const initial = createNextMarketSnapshot(null, freshResults, { now, apiVersion: 'test' });
assert.equal(isUsableMarketSnapshot(initial), true);
assert.deepEqual(initial.refresh.freshSections, ['gem', 'engraving', 'material', 'crystal']);
assert.equal(initial.sections.gem.rows[0].damage.price, 110);
assert.equal('tried' in initial.sections.gem, false);

const partial = createNextMarketSnapshot(initial, {
  ...freshResults,
  gem: { status: 'rejected', reason: new Error('공식 API 제한') },
  material: { status: 'fulfilled', value: { ...materialSection(), items: [] } },
  crystal: { status: 'fulfilled', value: crystalSection(4100) }
}, { now: new Date('2026-07-26T03:30:00.000Z'), apiVersion: 'test' });
assert.deepEqual(partial.refresh.preservedSections, ['gem', 'material']);
assert.equal(partial.sections.gem.rows[0].damage.price, initial.sections.gem.rows[0].damage.price);
assert.equal(partial.sections.crystal.crystalGoldPer100, 4100);
assert.equal(partial.sectionUpdatedAt.gem, initial.sectionUpdatedAt.gem);

const brokenMaterials = materialSection();
brokenMaterials.items.find(item => item.requestedName === '아비도스 융화제').price = 0;
assert.equal(isUsableMaterialSection(brokenMaterials), false);

const partialMaterials = materialSection();
partialMaterials.items.find(item => item.name === '운명의 파괴석').price = 0;
const partialGems = gemSection();
partialGems.rows[0].damage = null;
const partialEngravings = engravingSection();
partialEngravings.items[0] = { name: '새 각인서', grade: '유물', price: 1000 };
const missingQuotes = createNextMarketSnapshot(initial, {
  gem: partialGems, material: partialMaterials, engraving: partialEngravings,
  crystal: { ...crystalSection(), updatedAt: null }
}, { now: new Date('2026-07-26T04:00:00.000Z') });
assert.deepEqual(missingQuotes.refresh.freshSections, []);
assert.deepEqual(missingQuotes.sections, initial.sections);
assert.deepEqual(missingQuotes.sectionUpdatedAt, initial.sectionUpdatedAt);

assert.throws(() => createNextMarketSnapshot(null, {
  ...freshResults,
  material: { status: 'rejected', reason: new Error('재료 조회 실패') }
}, { now, apiVersion: 'test' }), /새 응답과 이전 캐시가 모두 유효하지 않습니다/);

const require = createRequire(import.meta.url);
const blobRequire = createRequire(require.resolve('@vercel/blob'));
const { MockAgent, getGlobalDispatcher, setGlobalDispatcher } = blobRequire('undici');
// Initialize Node's lazy fetch globals before replacing Undici's shared dispatcher.
const { fetch: originalFetch, Response: FetchResponse } = globalThis;
const originalDispatcher = getGlobalDispatcher();
const mockBlob = new MockAgent();
mockBlob.disableNetConnect();
setGlobalDispatcher(mockBlob);
const env = {
  VERCEL_ENV: 'preview', VERCEL_BLOB_API_URL: 'https://market-cache-test.invalid',
  BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_mock_TEST_ONLY', MARKET_CACHE_REFRESH_SECRET: 'test-only-secret',
  LOSTARK_API_KEY: 'test-only-key'
};
const originalEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
Object.assign(process.env, env);

async function callRefresh(method, token) {
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await refreshMarketCache({ method, headers: token ? { authorization: `Bearer ${token}` } : {} }, response);
  return response;
}

try {
  let upstreamCalls = 0;
  let crystalAvailable = true;
  globalThis.fetch = async url => {
    upstreamCalls++;
    const endpoint = new URL(url);
    if (endpoint.hostname === 'loatool.taeu.kr' && crystalAvailable) {
      return FetchResponse.json([{ dt: now.toISOString(), close: 4250 }]);
    }
    if (endpoint.hostname === 'loatool.taeu.kr') return FetchResponse.json({}, { status: 403 });
    assert.equal(endpoint.hostname, 'developer-lostark.game.onstove.com');
    return FetchResponse.json({}, { status: 400 });
  };

  assert.equal((await callRefresh('GET')).statusCode, 405);
  for (const target of ['preview', 'development', undefined]) {
    if (target) process.env.VERCEL_ENV = target;
    else delete process.env.VERCEL_ENV;
    assert.equal((await callRefresh('POST', env.MARKET_CACHE_REFRESH_SECRET)).statusCode, 403);
  }
  process.env.VERCEL_ENV = 'production';
  assert.equal((await callRefresh('POST')).statusCode, 401);
  assert.equal((await callRefresh('POST', 'wrong-secret')).statusCode, 401);
  assert.equal(upstreamCalls, 0);

  const blobHost = 'https://mock.public.blob.vercel-storage.com';
  const blobUrl = `${blobHost}/${MARKET_CACHE_PATH}`;
  const blobApi = mockBlob.get(env.VERCEL_BLOB_API_URL);
  const blobData = mockBlob.get(blobHost);
  const updatedByAnotherWriter = createNextMarketSnapshot(initial, {
    ...freshResults, gem: { status: 'fulfilled', value: gemSection(200) }
  }, { now });
  for (const [etag, snapshot] of [['old-etag', initial], ['new-etag', updatedByAnotherWriter]]) {
    blobApi.intercept({ path: `/?${new URLSearchParams({ url: MARKET_CACHE_PATH })}`, method: 'GET' })
      .reply(200, { url: blobUrl, pathname: MARKET_CACHE_PATH, etag });
    blobData.intercept({ path: `/${MARKET_CACHE_PATH}?etag=${etag}`, method: 'GET' })
      .reply(200, snapshot);
  }

  const writePath = `/?${new URLSearchParams({ pathname: MARKET_CACHE_PATH })}`;
  blobApi.intercept({ path: writePath, method: 'PUT', headers: { 'x-if-match': 'old-etag' } })
    .reply(412, { error: { code: 'precondition_failed' } });
  let saved;
  blobApi.intercept({ path: writePath, method: 'PUT', headers: { 'x-if-match': 'new-etag' } })
    .reply(200, ({ body }) => {
      saved = JSON.parse(body);
      return { url: blobUrl, pathname: MARKET_CACHE_PATH, etag: 'saved-etag' };
    });

  const response = await callRefresh('POST', env.MARKET_CACHE_REFRESH_SECRET);
  assert.equal(response.statusCode, 200, JSON.stringify(response.body));
  assert.equal(response.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(response.body.blob.etag, 'saved-etag');
  assert.deepEqual(response.body.freshSections, ['crystal']);
  assert.deepEqual(response.body.preservedSections, ['gem', 'engraving', 'material']);
  assert.equal(saved.sections.gem.rows[0].damage.price, 210);
  assert.equal(saved.sections.crystal.crystalGoldPer100, 4250);
  assert.equal(isUsableMarketSnapshot(saved), true);

  crystalAvailable = false;
  blobApi.intercept({ path: `/?${new URLSearchParams({ url: MARKET_CACHE_PATH })}`, method: 'GET' })
    .reply(200, { url: blobUrl, pathname: MARKET_CACHE_PATH, etag: 'saved-etag' });
  blobData.intercept({ path: `/${MARKET_CACHE_PATH}?etag=saved-etag`, method: 'GET' }).reply(200, saved);
  const failed = await callRefresh('POST', env.MARKET_CACHE_REFRESH_SECRET);
  assert.equal(failed.statusCode, 500);
  assert.match(failed.body.message, /기존 캐시를 유지/);
  mockBlob.assertNoPendingInterceptors();
} finally {
  globalThis.fetch = originalFetch;
  setGlobalDispatcher(originalDispatcher);
  await mockBlob.close();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

console.log('market cache tests passed');
