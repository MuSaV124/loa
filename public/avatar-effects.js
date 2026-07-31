/**
 * 아바타 기본 효과 파싱
 *
 * 아바타 스탯은 Tooltip JSON의 ItemPartBox 안에 `"힘 +2.00%"` 같은 문자열로 들어온다.
 * 성향(지성/담력/매력/친절)은 SymbolString에 따로 있으므로 ItemPartBox만 읽으면 자연히 걸러진다.
 *
 * 같은 부위에 속옷(IsInner) 아바타와 일반 아바타를 함께 장착할 수 있고 둘 다 효과가 붙으므로
 * 부위별로 하나만 고르지 않고 장착된 전부를 합산한다.
 */

const STAT_PATTERN = /^(.*?)\s*([+-])\s*([\d,.]+)\s*(%?)\s*$/;

// 아바타 기본 효과로 실제 등장하는 전투 스탯만 받는다. 그 외 문구는 unparsed로 남긴다.
const COMBAT_STAT_NAMES = new Set([
  '힘', '민첩', '지능', '체력',
  '공격력', '무기 공격력',
  '치명', '특화', '신속', '제압', '인내', '숙련',
  '최대 생명력', '최대 마나'
]);

export function stripTags(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z_]+;?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseAvatarStatLine(line) {
  const text = stripTags(line);
  if (!text) return null;
  const match = STAT_PATTERN.exec(text);
  if (!match) return null;

  const label = match[1].trim();
  if (!COMBAT_STAT_NAMES.has(label)) return null;

  const value = Number(match[3].replace(/,/g, ''));
  if (!Number.isFinite(value) || value === 0) return null;

  return {
    label,
    value: match[2] === '-' ? -value : value,
    unit: match[4] === '%' ? 'percent' : 'flat'
  };
}

function collectItemPartBoxValues(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'ItemPartBox' && node.value && typeof node.value === 'object') {
    for (const value of Object.values(node.value)) {
      if (typeof value === 'string') out.push(value);
    }
    return out;
  }
  for (const value of Object.values(node)) collectItemPartBoxValues(value, out);
  return out;
}

export function extractAvatarStats(tooltip) {
  let parsed = tooltip;
  if (typeof tooltip === 'string') {
    try {
      parsed = JSON.parse(tooltip);
    } catch {
      return [];
    }
  }
  return collectItemPartBoxValues(parsed)
    .map(parseAvatarStatLine)
    .filter(Boolean);
}

export function extractAvatarEffects(avatars) {
  const list = Array.isArray(avatars) ? avatars : [];
  const items = [];
  const percentTotals = {};
  const flatTotals = {};

  for (const avatar of list) {
    const stats = extractAvatarStats(avatar?.Tooltip);
    items.push({
      type: String(avatar?.Type || ''),
      name: String(avatar?.Name || ''),
      grade: String(avatar?.Grade || ''),
      icon: String(avatar?.Icon || ''),
      isInner: Boolean(avatar?.IsInner),
      isSet: Boolean(avatar?.IsSet),
      stats
    });

    for (const stat of stats) {
      const bucket = stat.unit === 'percent' ? percentTotals : flatTotals;
      bucket[stat.label] = round2((bucket[stat.label] || 0) + stat.value);
    }
  }

  return {
    items,
    percentTotals,
    flatTotals,
    count: items.length,
    withStatCount: items.filter(item => item.stats.length > 0).length
  };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
