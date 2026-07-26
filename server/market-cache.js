import { BlobPreconditionFailedError, get, put } from '@vercel/blob';

export const MARKET_CACHE_PATH = 'loa/market-cache.json';
export const MARKET_CACHE_SCHEMA_VERSION = 1;
export const MARKET_CACHE_SECTIONS = ['gem', 'engraving', 'material', 'crystal'];

const IMPORTANT_MATERIAL_NAMES = new Set([
  '아비도스 융화제',
  '상급 아비도스 융화제',
  '빙하의 숨결',
  '용암의 숨결'
]);

const SECTION_VALIDATORS = {
  gem: isUsableGemSection,
  engraving: isUsableEngravingSection,
  material: isUsableMaterialSection,
  crystal: isUsableCrystalSection
};

export function isMarketBlobConfigured() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN
    || (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID)
  );
}

export async function readMarketSnapshot() {
  if (!isMarketBlobConfigured()) return null;
  const result = await get(MARKET_CACHE_PATH, { access: 'public', useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const snapshot = JSON.parse(await new Response(result.stream).text());
  if (!isUsableMarketSnapshot(snapshot)) return null;
  return {
    snapshot,
    etag: result.blob.etag,
    url: result.blob.url
  };
}

export async function writeMarketSnapshot(snapshot, { ifMatch } = {}) {
  if (!isMarketBlobConfigured()) throw new Error('Vercel Blob 저장소가 연결되지 않았습니다.');
  const options = {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: 'application/json'
  };
  if (ifMatch) options.ifMatch = ifMatch;
  return put(MARKET_CACHE_PATH, JSON.stringify(snapshot), options);
}

export function createNextMarketSnapshot(previous, results, { now = new Date(), apiVersion = '' } = {}) {
  const updatedAt = new Date(now).toISOString();
  const sections = {};
  const sectionUpdatedAt = {};
  const freshSections = [];
  const preservedSections = [];
  const errors = {};

  for (const section of MARKET_CACHE_SECTIONS) {
    const result = normalizeSectionResult(results?.[section]);
    const candidate = result.value;
    if (!result.error && SECTION_VALIDATORS[section](candidate)) {
      sections[section] = compactSection(section, candidate);
      sectionUpdatedAt[section] = candidate.updatedAt || updatedAt;
      freshSections.push(section);
      continue;
    }

    const previousSection = previous?.sections?.[section];
    if (SECTION_VALIDATORS[section](previousSection)) {
      sections[section] = previousSection;
      sectionUpdatedAt[section] = previous?.sectionUpdatedAt?.[section]
        || previousSection.updatedAt
        || previous?.updatedAt
        || updatedAt;
      preservedSections.push(section);
      errors[section] = result.error || '새 응답 검증 실패';
      continue;
    }

    throw new Error(`${section} 시세의 새 응답과 이전 캐시가 모두 유효하지 않습니다: ${result.error || '응답 검증 실패'}`);
  }

  return {
    ok: true,
    schemaVersion: MARKET_CACHE_SCHEMA_VERSION,
    apiVersion,
    source: 'vercel-blob-market-cache',
    updatedAt,
    sections,
    sectionUpdatedAt,
    refresh: { freshSections, preservedSections, errors }
  };
}

export function isUsableMarketSnapshot(snapshot) {
  if (!snapshot || snapshot.ok !== true || Number(snapshot.schemaVersion) !== MARKET_CACHE_SCHEMA_VERSION) return false;
  return MARKET_CACHE_SECTIONS.every(section => SECTION_VALIDATORS[section](snapshot?.sections?.[section]));
}

export function isUsableGemSection(data) {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const levels = new Set(rows.map(row => Number(row?.level || 0)));
  const priced = rows.reduce((count, row) => count
    + (Number(row?.damage?.price || 0) > 0 ? 1 : 0)
    + (Number(row?.cooldown?.price || 0) > 0 ? 1 : 0), 0);
  return data?.ok === true && [5, 6, 7, 8, 9, 10].every(level => levels.has(level)) && priced >= 10;
}

export function isUsableEngravingSection(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  return data?.ok === true && items.filter(item => Number(item?.price || 0) > 0).length >= 5;
}

export function isUsableMaterialSection(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  if (data?.ok !== true || !items.length) return false;
  const missingCount = items.filter(item => item?.missing || Number(item?.price || 0) <= 0).length;
  const importantMissing = items.some(item => {
    const name = item?.requestedName || item?.name || '';
    return IMPORTANT_MATERIAL_NAMES.has(name) && (item?.missing || Number(item?.price || 0) <= 0);
  });
  return !importantMissing && missingCount < Math.max(3, Math.ceil(items.length * 0.25));
}

export function isUsableCrystalSection(data) {
  return data?.ok === true && Number(data?.crystalGoldPer100 || 0) > 0;
}

export function isBlobWriteConflict(error) {
  return error instanceof BlobPreconditionFailedError || error?.name === 'BlobPreconditionFailedError';
}

function normalizeSectionResult(result) {
  if (result?.status === 'fulfilled') return { value: result.value, error: '' };
  if (result?.status === 'rejected') return { value: null, error: errorMessage(result.reason) };
  if (result instanceof Error) return { value: null, error: errorMessage(result) };
  return { value: result, error: '' };
}

function errorMessage(error) {
  return error?.message || String(error || '조회 실패');
}

function compactSection(section, data) {
  if (section === 'gem') {
    return compactBase(data, {
      rows: (data.rows || []).map(row => ({
        level: Number(row.level || 0),
        damage: compactMarketItem(row.damage),
        cooldown: compactMarketItem(row.cooldown)
      }))
    });
  }
  if (section === 'engraving') {
    return compactBase(data, { items: (data.items || []).map(compactMarketItem).filter(Boolean) });
  }
  if (section === 'material') {
    return compactBase(data, {
      groups: Array.isArray(data.groups) ? data.groups : [],
      items: (data.items || []).map(item => compactMarketItem(item, true)).filter(Boolean)
    });
  }
  return { ...data };
}

function compactBase(data, extra) {
  return {
    ok: true,
    apiVersion: data.apiVersion || '',
    source: data.source || '',
    mode: data.mode || '',
    updatedAt: data.updatedAt || new Date().toISOString(),
    ...extra
  };
}

function compactMarketItem(item, material = false) {
  if (!item) return null;
  const base = {
    id: item.id || null,
    name: item.name || '',
    icon: item.icon || '',
    grade: item.grade || '',
    price: Number(item.price || 0)
  };
  if (!material) return base;
  return {
    ...base,
    group: item.group || '',
    requestedName: item.requestedName || item.name || '',
    source: item.source || '',
    unitPrice: Number(item.unitPrice || 0),
    bundleCount: Number(item.bundleCount || 1),
    shardCount: Number(item.shardCount || 0),
    shardUnitPrice: Number(item.shardUnitPrice || 0),
    pheonCost: Number(item.pheonCost || 0),
    missing: Boolean(item.missing),
    error: item.error || ''
  };
}
