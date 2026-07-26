import { timingSafeEqual } from 'node:crypto';
import { loadCrystalPriceData } from './crystal-price.js';
import { loadMarketPriceSection } from './market-prices.js';
import {
  createNextMarketSnapshot,
  isBlobWriteConflict,
  isMarketBlobConfigured,
  readMarketSnapshot,
  writeMarketSnapshot
} from '../server/market-cache.js';

const API_VERSION = '5.8.19';
let refreshInflight = null;

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (String(req.method || 'GET').toUpperCase() !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: '허용되지 않은 요청 방식입니다.' });
  }

  const expectedSecret = process.env.MARKET_CACHE_REFRESH_SECRET || '';
  if (!expectedSecret || !isMarketBlobConfigured()) {
    return res.status(503).json({ ok: false, error: '자동 시세 캐시 환경변수가 준비되지 않았습니다.' });
  }
  const suppliedSecret = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!secureEqual(suppliedSecret, expectedSecret)) {
    return res.status(401).json({ ok: false, error: '자동 갱신 인증에 실패했습니다.' });
  }

  try {
    if (!refreshInflight) refreshInflight = refreshMarketCache().finally(() => { refreshInflight = null; });
    const result = await refreshInflight;
    return res.status(200).json({ ok: true, apiVersion: API_VERSION, ...result });
  } catch (error) {
    return res.status(isBlobWriteConflict(error) ? 409 : 500).json({
      ok: false,
      apiVersion: API_VERSION,
      error: '자동 시세 캐시 갱신 실패',
      message: error?.message || String(error)
    });
  }
}

async function refreshMarketCache() {
  const previousRecord = await readMarketSnapshot();
  const entries = await Promise.allSettled([
    loadMarketPriceSection('gemList', { force: '1' }),
    loadMarketPriceSection('engravingList', { force: '1', pages: '8' }),
    loadMarketPriceSection('t4Materials', { force: '1' }),
    loadCrystalPriceData({ force: true })
  ]);
  const results = Object.fromEntries(['gem', 'engraving', 'material', 'crystal'].map((section, index) => [section, entries[index]]));
  let baseRecord = previousRecord;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const snapshot = createNextMarketSnapshot(baseRecord?.snapshot, results, { apiVersion: API_VERSION });
    try {
      const blob = await writeMarketSnapshot(snapshot, { ifMatch: baseRecord?.etag });
      return {
        updatedAt: snapshot.updatedAt,
        freshSections: snapshot.refresh.freshSections,
        preservedSections: snapshot.refresh.preservedSections,
        errors: snapshot.refresh.errors,
        blob: { pathname: blob.pathname, etag: blob.etag }
      };
    } catch (error) {
      if (!isBlobWriteConflict(error) || attempt > 0) throw error;
      baseRecord = await readMarketSnapshot();
    }
  }
  throw new Error('자동 시세 캐시를 갱신하지 못했습니다.');
}

function secureEqual(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || ''));
  const expectedBuffer = Buffer.from(String(expected || ''));
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}
