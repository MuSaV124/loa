import assert from 'node:assert/strict';
import {
  createNextMarketSnapshot,
  isUsableMarketSnapshot,
  isUsableMaterialSection
} from '../server/market-cache.js';
import { T4_MATERIAL_GROUPS } from '../api/market-prices.js';

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

assert.throws(() => createNextMarketSnapshot(null, {
  ...freshResults,
  material: { status: 'rejected', reason: new Error('재료 조회 실패') }
}, { now, apiVersion: 'test' }), /새 응답과 이전 캐시가 모두 유효하지 않습니다/);

console.log('market cache tests passed');
