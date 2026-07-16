const API_VERSION = '5.7.4';
const LOSTARK_ORIGIN = 'https://lostark.game.onstove.com';
const NOTICE_URL = `${LOSTARK_ORIGIN}/News/Notice/List`;
const UPDATE_URL = `${LOSTARK_ORIGIN}/News/Update/List`;
const NEWS_CACHE_TTL_MS = 5 * 60 * 1000;

let newsCache = { expiresAt: 0, data: null };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  try {
    const now = Date.now();
    if (newsCache.data && newsCache.expiresAt > now) {
      return res.status(200).json({ ...newsCache.data, cached: true });
    }

    const [noticeHtml, updateHtml] = await Promise.all([
      fetchOfficialHtml(NOTICE_URL),
      fetchOfficialHtml(UPDATE_URL).catch(() => '')
    ]);
    const notices = parseNoticeList(noticeHtml).slice(0, 8);
    const updates = parseUpdateList(updateHtml).slice(0, 4);
    const featured =
      notices.find(item => /업데이트\s*내역\s*안내/.test(item.title)) ||
      notices.find(item => /업데이트|클라이언트\s*패치/.test(item.title)) ||
      notices[0] ||
      updates[0] ||
      null;

    const data = {
      ok: true,
      apiVersion: API_VERSION,
      source: 'lostark-official',
      sourceUrl: NOTICE_URL,
      updatedAt: new Date().toISOString(),
      featured,
      notices,
      updates
    };
    newsCache = { data, expiresAt: now + NEWS_CACHE_TTL_MS };
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      apiVersion: API_VERSION,
      error: '로아 공홈 공지사항을 불러오지 못했습니다.',
      message: error?.message || String(error)
    });
  }
}

async function fetchOfficialHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 LostarkCalculator/5.7.4',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    if (!res.ok) throw new Error(`공홈 응답 오류 ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseNoticeList(html) {
  return parseOfficialList(html, '/News/Notice/Views/', '공지');
}

function parseUpdateList(html) {
  return parseOfficialList(html, '/News/Update/Views/', '업데이트');
}

function parseOfficialList(html, hrefToken, fallbackCategory) {
  const rows = [];
  const source = String(html || '');
  const escapedToken = escapeRegExp(hrefToken);
  const linkRe = new RegExp(`<a\\b[^>]*href=["']([^"']*${escapedToken}[^"']*)["'][^>]*>([\\s\\S]*?)<\\/a>`, 'gi');
  let match;
  while ((match = linkRe.exec(source)) !== null) {
    const href = absoluteLostarkUrl(match[1]);
    const rowHtml = surroundingRowHtml(source, match.index, linkRe.lastIndex) || match[0];
    const raw = stripHtml(rowHtml);
    const item = parseNewsRow(raw, href, fallbackCategory);
    if (item && !rows.some(row => row.url === item.url || row.title === item.title)) rows.push(item);
  }
  return rows;
}

function surroundingRowHtml(source, start, end) {
  const before = source.slice(0, start);
  const after = source.slice(end);
  const liStart = before.lastIndexOf('<li');
  const trStart = before.lastIndexOf('<tr');
  const rowStart = Math.max(liStart, trStart);
  if (rowStart < 0) return '';
  const closeTag = rowStart === trStart ? '</tr>' : '</li>';
  const close = after.toLowerCase().indexOf(closeTag);
  if (close < 0) return '';
  return source.slice(rowStart, end + close + closeTag.length);
}

function parseNewsRow(rawText, url, fallbackCategory) {
  const raw = normalizeText(rawText);
  if (!raw || !url) return null;
  const category = raw.match(/^(공지|점검|상점|이벤트|업데이트)\b/)?.[1] || fallbackCategory;
  const date = raw.match(/(\d{4}\.\d{2}\.\d{2}|(?:\d+분|\d+시간)\s*전)/)?.[1] || '';
  const dateIndex = date ? raw.indexOf(date) : -1;
  let titlePart = dateIndex > 0 ? raw.slice(0, dateIndex) : raw;
  titlePart = titlePart
    .replace(new RegExp(`^${escapeRegExp(category)}\\s*`), '')
    .replace(/\s*새\s*글\s*/g, ' ')
    .replace(/\s*N\s*$/i, '')
    .replace(/\s*(?:9999\+|\d{1,3}(?:,\d{3})*)\s*$/g, '')
    .trim();
  if (!titlePart || /처음|이전|다음|마지막|리스트\s*검색/.test(titlePart)) return null;
  const views = ((dateIndex > 0 ? raw.slice(0, dateIndex) : raw).match(/(?:9999\+|\d{1,3}(?:,\d{3})*)\s*$/)?.[0] || '').trim();
  return { category, title: titlePart, date, views, url };
}

function absoluteLostarkUrl(href) {
  const decoded = String(href || '').replace(/&amp;/g, '&').trim();
  if (!decoded) return '';
  if (/^https?:\/\//i.test(decoded)) return decoded;
  return `${LOSTARK_ORIGIN}${decoded.startsWith('/') ? decoded : `/${decoded}`}`;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripHtml(value) {
  return normalizeText(String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#40;/g, '(')
    .replace(/&#41;/g, ')')
    .replace(/&#37;/g, '%'));
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
