export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const job = String(req.query.job || '').trim();
    if (!job) return res.status(400).json({ error: '직업을 선택하세요.' });

    const apiKey = process.env.LOSTARK_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Vercel 환경변수 LOSTARK_API_KEY가 없습니다.' });

    const pageLimit = Math.max(1, Math.min(50, Number(req.query.pageLimit || 30)));
    const items = [];
    let totalCount = 0;

    for (let page = 1; page <= pageLimit; page += 1) {
      const payload = {
        CategoryCode: 200000,
        ItemGrade: '전설',
        Sort: 'BUY_PRICE',
        SortCondition: 'ASC',
        PageNo: page
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      const response = await fetch('https://developer-lostark.game.onstove.com/auctions/items', {
        method: 'POST',
        headers: {
          Authorization: `bearer ${apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      }).finally(() => clearTimeout(timeout));

      const text = await response.text();
      if (!response.ok) {
        return res.status(response.status).json({ error: '로스트아크 경매장 API 호출 실패', status: response.status, body: text.slice(0, 500) });
      }

      let data;
      try { data = JSON.parse(text); } catch { return res.status(502).json({ error: '경매장 API 응답이 JSON이 아닙니다.', body: text.slice(0, 500) }); }
      const pageItems = Array.isArray(data?.Items) ? data.Items : [];
      totalCount = Number(data?.TotalCount || totalCount || 0);
      items.push(...pageItems);

      const pageSize = Number(data?.PageSize || pageItems.length || 10);
      if (!pageItems.length || (totalCount > 0 && page * pageSize >= totalCount)) break;
    }

    const result = buildLegendAvatarSet(items, job);
    return res.status(200).json({ ok: true, apiVersion: '4.9.5', job, scanned: items.length, totalCount, pageLimit, ...result });
  } catch (error) {
    const message = error.name === 'AbortError' ? '경매장 API 응답 시간이 길어서 중단했습니다.' : error.message;
    return res.status(500).json({ error: '서버 함수 오류', message });
  }
}

function buildLegendAvatarSet(items, job) {
  const parts = { 머리: null, 상의: null, 하의: null, 무기: null };
  const matched = [];

  for (const item of items) {
    const price = Number(item?.AuctionInfo?.BuyPrice || 0);
    if (!price) continue;

    const text = itemFullText(item);
    if (!isJobOnly(text, job)) continue;

    const part = detectPart(item, text);
    if (!part || !(part in parts)) continue;

    const normalized = {
      name: item?.Name || '',
      grade: item?.Grade || '전설',
      part,
      price,
      icon: item?.Icon || item?.IconPath || item?.Image || null,
      endDate: item?.AuctionInfo?.EndDate || null,
      bidStartPrice: Number(item?.AuctionInfo?.BidStartPrice || 0),
      rawType: item?.Type || ''
    };
    matched.push(normalized);

    if (!parts[part] || price < parts[part].price) parts[part] = normalized;
  }

  const complete = Object.values(parts).every(Boolean);
  const totalPrice = Object.values(parts).reduce((sum, item) => sum + Number(item?.price || 0), 0);
  return { parts, totalPrice, complete, matchedCount: matched.length, matched };
}

function isJobOnly(text, job) {
  const compact = normalizeText(text).replace(/\s+/g, '');
  const jobCompact = normalizeText(job).replace(/\s+/g, '');
  return compact.includes(`${jobCompact}전용`);
}

function detectPart(item, text) {
  const type = normalizeText(item?.Type || '');
  const name = normalizeText(item?.Name || '');
  const all = normalizeText(`${type} ${name} ${text}`);

  if (/무기/.test(all)) return '무기';
  if (/머리/.test(all)) return '머리';
  if (/상의/.test(all)) return '상의';
  if (/하의/.test(all)) return '하의';
  return null;
}

function itemFullText(item) {
  return normalizeText([item?.Name, item?.Type, item?.Grade, tooltipText(item?.Tooltip), JSON.stringify(item?.Options || '')].join(' '));
}

function tooltipText(tooltip) {
  if (!tooltip) return '';
  if (typeof tooltip === 'string') {
    try { return normalizeText(JSON.stringify(JSON.parse(tooltip))); } catch { return normalizeText(tooltip); }
  }
  return normalizeText(JSON.stringify(tooltip));
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>(\n)?/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#40;/g, '(')
    .replace(/&#41;/g, ')')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
