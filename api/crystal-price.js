const API_VERSION = '5.8.12';
const LOSPI_OHLC_URL = 'https://loatool.taeu.kr/api/crystal-history/ohlc/1h';
const REQUEST_TIMEOUT_MS = 6500;
const CACHE_TTL_MS = 60 * 1000;
const PHEON_PACKAGES = [
  { pheons: 1, crystals: 10, crystalPerPheon: 10 },
  { pheons: 30, crystals: 270, crystalPerPheon: 9 },
  { pheons: 100, crystals: 850, crystalPerPheon: 8.5 }
];

let cache = null;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    const force = String(req.query.force || '') === '1';
    const now = Date.now();
    if (!force && cache && cache.expiresAt > now) {
      return res.status(200).json({ ...cache.data, cached: true });
    }

    const rows = await fetchLospiOhlc();
    const latest = rows
      .filter(row => Number(row?.close || 0) > 0)
      .sort((a, b) => new Date(a.dt).getTime() - new Date(b.dt).getTime())
      .at(-1);

    if (!latest) throw new Error('LOSPI OHLC 최신 시세를 찾지 못했습니다.');

    const crystalGoldPer100 = Number(latest.close || 0);
    const defaultPackage = PHEON_PACKAGES.find(pack => pack.pheons === 100);
    const pheonCrystalPerOne = defaultPackage.crystalPerPheon;
    const pheonGoldPerOne = round4((crystalGoldPer100 / 100) * pheonCrystalPerOne);
    const data = {
      ok: true,
      apiVersion: API_VERSION,
      source: 'loatool-lospi-ohlc',
      sourceUrl: LOSPI_OHLC_URL,
      basis: '100 크리스탈 / 골드',
      crystalGoldPer100,
      latest,
      pheonPackages: PHEON_PACKAGES,
      defaultPheonPackage: defaultPackage,
      pheonCrystalPerOne,
      pheonGoldPerOne,
      updatedAt: new Date().toISOString()
    };

    cache = { expiresAt: Date.now() + CACHE_TTL_MS, data };
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      apiVersion: API_VERSION,
      source: 'loatool-lospi-ohlc',
      error: '크리스탈 시세 조회 실패',
      message: error?.message || String(error)
    });
  }
}

async function fetchLospiOhlc() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const response = await fetch(LOSPI_OHLC_URL, {
    signal: controller.signal,
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': `Mozilla/5.0 LostarkCalculator/${API_VERSION}`
    }
  }).finally(() => clearTimeout(timeout));
  const text = await response.text();
  if (!response.ok) throw new Error(`LOSPI API 오류 (${response.status}): ${text.slice(0, 180)}`);
  try {
    const data = text ? JSON.parse(text) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    throw new Error(`LOSPI 응답 JSON 파싱 실패: ${text.slice(0, 180)}`);
  }
}

function round4(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}
