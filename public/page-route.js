const characterPages = new Set(['character', 'nodes', 'combat']);
const supportOptions = new Set(['none', 'bard', 'artist', 'paladin', 'valkyrie']);
const recommendationModes = new Set(['auto', 'estimate', 'theory', 'shortage', 'unverified']);
const marketCategories = new Set(['accessory', 'avatar', 'engraving', 'gem', 'material', 'crystal']);

export function validCharacterName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name === '.' || name === '..' || /[/\\\u0000-\u001f\u007f]/u.test(name)) return '';
  try { encodeURIComponent(name); } catch { return ''; }
  return name;
}

export function isCharacterPage(page) {
  return characterPages.has(page);
}

export function readPageRoute({ pathname, search }) {
  const query = new URLSearchParams(search);
  const path = pathname.replace(/\/$/, '') || '/';
  const scenario = query.get('scenario') || '';
  if (path === '/' || path === '/index.html') return { page: 'home', scenario };
  if (path === '/simulator') return { page: 'simulator', name: validCharacterName(query.get('character')), scenario };
  if (path === '/market') {
    const category = query.get('category');
    return { page: 'market', category: marketCategories.has(category) ? category : 'accessory' };
  }
  if (path === '/ratios') return { page: 'ratios' };
  const match = path.match(/^\/character\/([^/]+)(?:\/(nodes|combat))?$/);
  if (match) {
    try {
      const name = validCharacterName(decodeURIComponent(match[1]));
      const support = query.get('support');
      const mode = query.get('mode');
      if (name) return { page: match[2] || 'character', name,
        support: supportOptions.has(support) ? support : 'none',
        mode: recommendationModes.has(mode) ? mode : 'auto' };
    } catch {}
  }
  return { page: 'notFound' };
}

export function pagePath({ page, name, support, mode, scenario, category }) {
  const query = new URLSearchParams();
  let path = '/';
  if (isCharacterPage(page)) {
    path = '/character/' + encodeURIComponent(name);
    if (page !== 'character') path += '/' + page;
    if (supportOptions.has(support) && support !== 'none') query.set('support', support);
    if (recommendationModes.has(mode) && mode !== 'auto') query.set('mode', mode);
  } else if (page === 'simulator') {
    path = '/simulator';
    if (name) query.set('character', name);
    if (scenario) query.set('scenario', scenario);
  } else if (page === 'market') {
    path = '/market';
    if (marketCategories.has(category) && category !== 'accessory') query.set('category', category);
  } else if (page === 'ratios') {
    path = '/ratios';
  }
  return query.size ? path + '?' + query : path;
}
