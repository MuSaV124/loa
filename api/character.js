export default async function handler(req, res) {
  try {
    const name = String(req.query.name || '').trim();

    if (!name) {
      return res.status(400).json({ error: '캐릭터명을 입력하세요.' });
    }

    const apiKey = process.env.LOSTARK_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Vercel 환경변수 LOSTARK_API_KEY가 없습니다.' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const url = `https://developer-lostark.game.onstove.com/armories/characters/${encodeURIComponent(name)}?filters=profiles+arkpassive`;

    const response = await fetch(url, {
      headers: {
        Authorization: `bearer ${apiKey}`,
        Accept: 'application/json'
      },
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: '로스트아크 Open API 호출 실패',
        status: response.status,
        body: text.slice(0, 500)
      });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      return res.status(502).json({
        error: 'Open API 응답이 JSON이 아닙니다.',
        body: text.slice(0, 500)
      });
    }

    const profile = data.ArmoryProfile || data.Profile || null;
    const arkPassive = data.ArkPassive || data.ArmoryArkPassive || null;

    return res.status(200).json({
      ok: true,
      apiVersion: '1.2.0',
      profile,
      arkPassive,
      raw: data
    });
  } catch (error) {
    const message = error.name === 'AbortError'
      ? 'Open API 응답 시간이 길어서 중단했습니다.'
      : error.message;

    return res.status(500).json({
      error: '서버 함수 오류',
      message
    });
  }
}