import { readMarketSnapshot } from '../server/market-cache.js';

const API_VERSION = '5.8.20';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300, stale-if-error=86400');
  try {
    const record = await readMarketSnapshot();
    if (!record) {
      return res.status(503).json({
        ok: false,
        apiVersion: API_VERSION,
        cacheReady: false,
        error: '자동 시세 캐시가 아직 준비되지 않았습니다.'
      });
    }
    return res.status(200).json({
      ...record.snapshot,
      apiVersion: API_VERSION,
      cached: true,
      cacheReady: true
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      apiVersion: API_VERSION,
      cacheReady: false,
      error: '자동 시세 캐시 조회 실패',
      message: error?.message || String(error)
    });
  }
}
