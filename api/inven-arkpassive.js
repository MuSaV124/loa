export default async function handler(req, res) {
  try {
    const code = String(req.query.code || '313').trim();
    const url = `https://lostark.inven.co.kr/datainfo/arkpassive/?code=${encodeURIComponent(code)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 LOSTARK node calculator data generator',
        'Accept': 'text/html,application/xhtml+xml'
      },
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));

    const html = await response.text();

    return res.status(200).json({
      ok: response.ok,
      status: response.status,
      source: url,
      htmlLength: html.length,
      note: 'v1.2.0에서는 인벤 DB를 직접 계산에 쓰기보다 JSON DB 구조를 준비합니다. 실제 파싱은 scripts/generate-inven-db.js에서 보정합니다.'
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}