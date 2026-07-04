const VERSION = '4.8.1';
const $ = (id) => document.getElementById(id);
const EVOLUTION_TIERS = [1, 2, 3, 4, 5];
const state = { evolution: null, index: new Map(), selected: {}, apiSelected: {}, foundEffects: [], profileStats: { crit: 0, swift: 0, spec: 0 }, accessory: { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] }, bracelet: { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] }, abilityStone: { critRate: 0, critDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0, baseAttackPower: 0, engravings: [], items: [] }, engraving: { effects: { critRate: 0, critDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0 }, items: [], rawText: '' }, enlightenment: { critRate: 0, critDamage: 0, evolutionDamage: 0, enemyDamage: 0, additionalDamage: 0, attackSpeed: 0, moveSpeed: 0, items: [] } };

function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m]); }
function escapeRegExp(v) { return String(v || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function stripHtml(v) { return String(v ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#40;/g, '(').replace(/&#41;/g, ')').replace(/&#37;/g, '%').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim(); }
function collectTextDeep(value, bucket = []) {
  if (value == null) return bucket;
  if (typeof value === 'string') {
    const cleaned = stripHtml(value);
    if (cleaned) bucket.push(cleaned);
    const t = value.trim();
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { collectTextDeep(JSON.parse(t), bucket); } catch {}
    }
    return bucket;
  }
  if (typeof value === 'number' || typeof value === 'boolean') { bucket.push(String(value)); return bucket; }
  if (Array.isArray(value)) { for (const item of value) collectTextDeep(item, bucket); return bucket; }
  if (typeof value === 'object') { for (const v of Object.values(value)) collectTextDeep(v, bucket); return bucket; }
  return bucket;
}
function effectFullText(effect) {
  const parts = collectTextDeep({ name: effect?.name, level: effect?.level, description: effect?.description, tooltip: effect?.tooltip, raw: effect?.raw });
  return [...new Set(parts)].join(' ');
}
function num(v, fallback = 0) { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : fallback; }
function pct(v) { return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; }
function fmt(v) { return Number(v || 0).toFixed(2); }
function item(label, value) { return `<div class="cell"><b>${label}</b><span>${escapeHtml(value ?? '-')}</span></div>`; }
function setMessage(text) { const el = $('message'); if (!text) { el.classList.add('hidden'); el.textContent = ''; return; } el.classList.remove('hidden'); el.textContent = text; }
function getStat(profile, type) { return (profile?.Stats || []).find(s => s.Type === type)?.Value ?? '-'; }

function parseProfileStats(profile) {
  const stat = (type) => num((profile?.Stats || []).find(s => s.Type === type)?.Value, 0);
  return { crit: stat('치명'), swift: stat('신속'), spec: stat('특화') };
}
function tier1StatBonus(name, selection = state.selected) {
  const level = Number(selection?.[name]?.level || 0);
  return level * 50;
}
function applyProfileDefaults(profile, selection = state.selected) {
  state.profileStats = parseProfileStats(profile);
  // Open API의 치명/신속 수치는 현재 진화 1티어 선택분이 이미 들어간 값입니다.
  // v3부터는 진화 1티어를 먼저 제외한 뒤, 사용자가 선택한 레벨을 다시 더해 계산합니다.
  const baseCritStat = Math.max(0, state.profileStats.crit - tier1StatBonus('치명', selection));
  const baseSwiftStat = Math.max(0, state.profileStats.swift - tier1StatBonus('신속', selection));
  $('baseCritStat').value = Math.round(baseCritStat);
  $('baseSwiftStat').value = Math.round(baseSwiftStat);
}
function critRateFromStat(critStat) { return Number(critStat || 0) * 0.03579; }
function speedFromSwift(swiftStat) { return Number(swiftStat || 0) / 58.21; }
function buildIndex(db) {
  const map = new Map();
  for (const [tier, names] of Object.entries(db?.tiers || {})) for (const name of names || []) map.set(name, Number(tier));
  for (const node of db?.nodes || []) map.set(node.name, Number(node.tier));
  return map;
}
function getNode(name) { return (state.evolution?.nodes || []).find(n => n.name === name); }
function getLevelEffect(name, level) {
  if (name === '치명') return { critStat: level * 50 };
  if (name === '신속') return { swiftStat: level * 50 };
  if (['특화','제압','인내','숙련'].includes(name)) return { statBonus: level * 50 };
  const node = getNode(name);
  return node?.levels?.[String(level)] || {};
}
function allOptions(tier) { return [...new Set([...(state.evolution?.tiers?.[String(tier)] || []), ...(state.evolution?.nodes || []).filter(n => Number(n.tier) === Number(tier)).map(n => n.name)])]; }
function defaultSelection() {
  return {
    '치명': { level: 29, source: 'default' },
    '신속': { level: 11, source: 'default' },
    '예리한 감각': { level: 1, source: 'default' },
    '한계 돌파': { level: 1, source: 'default' },
    '최적화 훈련': { level: 1, source: 'default' },
    '일격': { level: 2, source: 'default' },
    '회심': { level: 1, source: 'default' },
    '달인': { level: 1, source: 'default' },
    '뭉툭한 가시': { level: 2, source: 'default' }
  };
}
function readEffects(arkPassive) {
  const effects = Array.isArray(arkPassive?.Effects) ? arkPassive.Effects : [];
  return effects.map((e, index) => ({ index, name: e?.Name || '', level: Number(e?.Level || 0), description: stripHtml(e?.Description || ''), tooltip: stripHtml(e?.Tooltip || ''), raw: e })).filter(e => e.name);
}

function normalizeMatchToken(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}
function addMatchesTo(out, key, text, regexList) {
  // 깨달음 Tooltip은 같은 문장이 raw JSON, Element_*, Description 쪽에 반복되어 들어오는 경우가 있습니다.
  // 그래서 한 효과 안에서 같은 계열 수치는 합산하지 않고 가장 큰 유효값 1개만 사용합니다.
  // 예: 블래스터 깨달음 치피 40%가 중복 파싱되어 80%가 되는 문제 방지.
  let best = 0;
  const seen = new Set();
  for (const re of regexList) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      const value = Number(match[1] || 0);
      if (!Number.isFinite(value)) continue;
      const token = `${key}:${value}:${normalizeMatchToken(match[0])}`;
      if (seen.has(token)) continue;
      seen.add(token);
      best = Math.max(best, value);
    }
  }
  if (best > 0) out[key] += best;
}
function parsePercentEffectText(text) {
  const out = { critRate: 0, critDamage: 0, evolutionDamage: 0, enemyDamage: 0, additionalDamage: 0 };
  const source = stripHtml(text);
  addMatchesTo(out, 'critRate', source, [
    /치명타\s*적중률(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:만큼)?\s*(?:증가|상승)?/g,
    /치명타\s*확률(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:만큼)?\s*(?:증가|상승)?/g,
    /치명타\s*(?:적중률|확률)[^0-9+]{0,30}\+?(\d+(?:\.\d+)?)%/g
  ]);
  addMatchesTo(out, 'critDamage', source, [
    /치명타\s*피해(?:량)?(?:이|가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:만큼)?\s*(?:증가|상승)?/g
  ]);
  addMatchesTo(out, 'evolutionDamage', source, [
    /진화형?\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:만큼)?\s*(?:증가|상승)?/g,
    /진화\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:만큼)?\s*(?:증가|상승)?/g,
    /진피\s*(?:\+)?(\d+(?:\.\d+)?)%/g
  ]);
  addMatchesTo(out, 'additionalDamage', source, [
    /추가\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:만큼)?\s*(?:증가|상승)?/g
  ]);
  addMatchesTo(out, 'enemyDamage', source, [
    /(?<!무력화\s*상태의\s*)적에게\s*주는\s*(?:모든\s*)?피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:만큼)?\s*(?:증가|상승)?/g,
    /공격이\s*치명타로\s*적중\s*시\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /백어택\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /헤드어택\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /방향성\s*공격이\s*아닌\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ]);
  for (const key of Object.keys(out)) out[key] = Math.round(out[key] * 100) / 100;
  return out;
}
function hasAnyEffect(effects) {
  return ['critRate','critDamage','evolutionDamage','enemyDamage','additionalDamage'].some(k => Math.abs(Number(effects?.[k] || 0)) > 0);
}
function isKnownEvolutionEffect(effect) {
  const name = normalizeNodeName(effect?.name || '');
  const joined = normalizeNodeName(`${effect?.name || ''} ${effect?.description || ''} ${effect?.tooltip || ''}`);

  // ArkPassive.Effects가 '진화/깨달음/도약' 같은 카테고리 단위로 내려오는 경우가 있습니다.
  // 특히 깨달음 설명에는 '치명타'라는 단어가 들어가는데, 기존 로직은 1티어 노드 '치명'과
  // 부분 문자열로 매칭되어 깨달음을 진화 노드로 오인했습니다.
  if (name.includes('깨달음')) return false;
  if (name.includes('도약')) return false;
  if (name.includes('진화')) return true;

  return (state.evolution?.nodes || []).some(node => {
    if (name === node.name) return true;
    const nodeName = String(node.name || '');
    // 치명/신속/특화처럼 일반 단어와 겹치는 1티어 스탯명은 부분 매칭하지 않습니다.
    if (['치명','특화','신속','제압','인내','숙련'].includes(nodeName)) return false;
    const escaped = escapeRegExp(nodeName);
    return new RegExp(`(?:\\[진화\\]|진화|^|\\s)${escaped}(?:\\s*Lv\\.?|\\s*레벨|\\s*\\(|\\s|$)`, 'i').test(joined);
  });
}
function levelNearName(text, nodeName, fallback = 1) {
  const source = String(text || '');
  const escaped = escapeRegExp(nodeName);
  const near = source.match(new RegExp(`${escaped}.{0,80}(?:Lv\\.?|레벨)\\s*(\\d+)`, 'i'))
    || source.match(new RegExp(`${escaped}.{0,80}([1-5])\\s*단계`, 'i'));
  if (near) return Number(near[1]);
  return fallback;
}
function enlightenmentSignature(effect, parsed) {
  const values = ['critRate','critDamage','evolutionDamage','enemyDamage','additionalDamage','attackSpeed','moveSpeed']
    .map(k => `${k}:${Number(parsed?.[k] || 0).toFixed(3)}`).join('|');
  const special = parsed?.windfuryAgility ? `|windfury:${parsed.windfuryAgility.level}` : '';
  return `${normalizeNodeName(effect?.name || '')}|lv:${Number(effect?.level || 0)}|${values}${special}`;
}
function isLeapEffect(effect, joinedText = '') {
  const source = normalizeNodeName(`${effect?.name || ''} ${effect?.description || ''} ${effect?.tooltip || ''} ${joinedText || ''}`);
  const normalized = normalizeNodeName(source).toLowerCase();

  // v4.6.6: 보조 안전장치. 기본 구분은 extractEnlightenmentEffects의 Name 화이트리스트에서 처리합니다.
  // Open API가 도약 효과를 깨달음과 같은 ArkPassive.Effects 묶음으로 내려주는 경우가 있어
  // 깨달음 파싱에서 도약 텍스트가 포함된 항목은 전부 제외합니다.
  return normalized.includes('도약') || normalized.includes('leap');
}
function extractEnlightenmentEffects(effects) {
  const result = { critRate: 0, critDamage: 0, evolutionDamage: 0, enemyDamage: 0, additionalDamage: 0, attackSpeed: 0, moveSpeed: 0, items: [] };
  const applied = new Set();
  for (const effect of effects || []) {
    const categoryName = normalizeNodeName(effect?.name || '');
    // v4.6.6: Open API의 ArkPassive.Effects는 Name 값으로 깨달음/진화/도약을 구분합니다.
    // 깨달음 계산에는 Name이 정확히 '깨달음'인 항목만 사용합니다.
    // 도약은 Name이 '도약'으로 내려오므로 이 단계에서 자동 제외됩니다.
    if (categoryName !== '깨달음') continue;

    const joined = effectFullText(effect);
    const normalized = normalizeNodeName(`${effect?.name || ''} ${joined}`);
    const parsed = parsePercentEffectText(joined);

    // 기상술사 질풍노도/기민함처럼 문장 안에 고정 수치가 아니라
    // 공속/이속 증가량을 참조하는 깨달음 효과는 별도 계산합니다.
    const baseLevel = Math.max(1, Number(effect?.level || parseLevelFromText(joined, 1) || 1));
    if (normalized.includes('질풍노도')) {
      parsed.attackSpeed = (parsed.attackSpeed || 0) + 12;
      parsed.moveSpeed = (parsed.moveSpeed || 0) + 12;
    }
    if (normalized.includes('기민함')) {
      const lv = Math.min(3, levelNearName(joined, '기민함', baseLevel));
      const critDamageRate = [0, 0.4, 0.8, 1.2][lv] || 0;
      const critRateRate = [0, 0.1, 0.2, 0.3][lv] || 0;
      parsed.windfuryAgility = { level: lv, critDamageRate, critRateRate };
    }
    if (normalized.includes('자연의 흐름')) {
      const lv = Math.min(5, levelNearName(joined, '자연의 흐름', baseLevel));
      parsed.enemyDamage += lv * 1.2;
    }
    if (normalized.includes('바람의 길')) {
      const lv = Math.min(5, levelNearName(joined, '바람의 길', baseLevel));
      parsed.enemyDamage += lv * 1.2; // 최대 2중첩 기준: 0.6/1.2/1.8/2.4/3.0 × 2
    }

    if (!hasAnyEffect(parsed) && !parsed.attackSpeed && !parsed.moveSpeed && !parsed.windfuryAgility) continue;
    const sig = enlightenmentSignature(effect, parsed);
    if (applied.has(sig)) continue;
    applied.add(sig);
    for (const key of ['critRate','critDamage','evolutionDamage','enemyDamage','additionalDamage','attackSpeed','moveSpeed']) result[key] += Number(parsed[key] || 0);
    result.items.push({ name: effect.name || '깨달음 효과', level: effect.level || 0, effects: parsed });
  }
  for (const key of ['critRate','critDamage','evolutionDamage','enemyDamage','additionalDamage','attackSpeed','moveSpeed']) result[key] = Math.round(result[key] * 100) / 100;
  return result;
}

function normalizeNodeName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim();
}
function parseLevelFromText(text, fallback = 1) {
  const source = String(text || '');
  const m = source.match(/(?:Lv\.?|레벨)\s*(\d+)/i) || source.match(/(\d+)\s*레벨/);
  const level = Number(m?.[1] || fallback || 1);
  return Number.isFinite(level) && level > 0 ? level : 1;
}
function classifyEvolution(effects) {
  const selected = {};
  const knownNodes = state.evolution?.nodes || [];
  for (const effect of effects || []) {
    const joined = normalizeNodeName(`${effect.name} ${effect.description} ${effect.tooltip}`);

    // 1) API가 노드명을 Name으로 직접 주는 경우
    const direct = getNode(effect.name);
    if (direct) {
      const level = Math.min(effect.level || parseLevelFromText(joined, 1), direct.maxLevel || 1);
      selected[direct.name] = { level, source: 'api' };
      continue;
    }

    // 2) API가 설명/툴팁 문자열 안에 진화 노드명을 넣어주는 경우
    for (const node of knownNodes) {
      if (!joined.includes(node.name)) continue;
      const escaped = node.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const near = joined.match(new RegExp(`${escaped}[^\d]*(?:Lv\\.?|레벨)?\\s*(\\d+)?`, 'i'));
      const level = Math.min(parseLevelFromText(near?.[0] || joined, effect.level || 1), node.maxLevel || 1);
      selected[node.name] = { level, source: 'api' };
    }
  }
  // 검색 캐릭터의 진화 노드가 안 읽히면 이전 캐릭터/기본값을 쓰지 않고 빈 선택으로 둡니다.
  return selected;
}


function renderCharacter(profile) {
  const el = $('characterCard');
  const image = profile?.CharacterImage || '';
  el.innerHTML = `${image ? `<img src="${escapeHtml(image)}" alt="" />` : ''}<div><h2>${escapeHtml(profile?.CharacterName || '-')} / ${escapeHtml(profile?.CharacterClassName || '-')}</h2><p>서버 ${escapeHtml(profile?.ServerName || '-')} · 아이템 레벨 ${escapeHtml(profile?.ItemAvgLevel || '-')} · 전투력 ${escapeHtml(profile?.CombatPower || '-')}</p></div>`;
  el.classList.remove('hidden');
}
function renderSummary(profile, arkPassive) {
  $('summaryPanel').classList.remove('hidden');
  renderCombatStats();
}

function tierCost(tier) {
  let used = 0;
  for (const row of selectedEntries()) if (row.tier === tier) used += (getNode(row.name)?.costPerLevel || 0) * row.level;
  const max = { 1: 40, 2: 30, 3: 20, 4: 20, 5: 30 }[tier] || 0;
  return { used, max };
}
function clampLevelByTierBudget(name, desiredLevel) {
  const node = getNode(name);
  if (!node) return 0;
  const tier = Number(node.tier);
  const maxLevel = Number(node.maxLevel || 0);
  let next = Math.max(0, Math.min(maxLevel, desiredLevel));
  const tierMax = { 1: 40, 2: 30, 3: 20, 4: 20, 5: 30 }[tier] || Infinity;
  const cost = Number(node.costPerLevel || 0);
  if (!cost) return next;
  let usedWithoutThis = 0;
  for (const row of selectedEntries()) {
    if (row.name !== name && row.tier === tier) usedWithoutThis += (getNode(row.name)?.costPerLevel || 0) * row.level;
  }
  const availableLevels = Math.floor(Math.max(0, tierMax - usedWithoutThis) / cost);
  return Math.min(next, availableLevels);
}
function renderEvolutionTiers() {
  const html = EVOLUTION_TIERS.map(tier => {
    const cost = tierCost(tier);
    const over = cost.used > cost.max ? ' over' : '';
    const cards = allOptions(tier).map(name => {
      const node = getNode(name) || { name, maxLevel: 0, icon: '◆' };
      const selected = !!state.selected[name];
      const level = selected ? Number(state.selected[name]?.level || 0) : 0;
      const api = selected && state.selected[name]?.source === 'api' ? '<span class="apiMark">API</span>' : '';
      return `<button class="nodeCard ${selected && level > 0 ? 'selected' : ''}" type="button" data-tier="${tier}" data-name="${escapeHtml(name)}">
        <div class="nodeIcon">${node.iconImage ? `<img src="${escapeHtml(node.iconImage)}" alt="" />` : escapeHtml(node.icon || '◆')}</div>
        <div class="nodeName">${escapeHtml(name)}</div>
        <div class="nodeControls">
          <span class="minus" data-action="minus">−</span>
          <b>Lv.${level}</b>
          <span class="plus" data-action="plus">＋</span>
        </div>
        ${api}
      </button>`;
    }).join('');
    return `<div class="tierBlock"><h3 class="${over}">${tier}티어 <span>(${cost.max}P)</span> <em>(${cost.used}/${cost.max}P)</em></h3><div class="nodeGrid">${cards}</div></div>`;
  }).join('');
  $('evolutionTiers').innerHTML = html;
  $('evolutionTiers').querySelectorAll('.nodeCard').forEach(card => card.addEventListener('click', onNodeCardClick));
}
function onNodeCardClick(event) {
  const card = event.currentTarget;
  const name = card.dataset.name;
  const action = event.target?.dataset?.action || 'select';
  const cur = Number(state.selected[name]?.level || 0);
  let nextLevel = cur;
  if (action === 'minus') nextLevel = cur - 1;
  else if (action === 'plus') nextLevel = cur + 1;
  else nextLevel = cur > 0 ? 0 : 1;
  nextLevel = clampLevelByTierBudget(name, nextLevel);
  if (nextLevel <= 0) delete state.selected[name];
  else state.selected[name] = { level: nextLevel, source: 'manual' };
  renderEvolutionTiers();
  calculateAndRender();
}


function pushDamageSource(list, label, value) {
  const v = Number(value || 0);
  if (!Number.isFinite(v) || Math.abs(v) < 0.0001) return;
  list.push({ label, value: v });
}
function collectItemDamageSources(group, key, groupLabel) {
  const list = [];
  let usedItem = false;
  for (const item of group?.items || []) {
    const value = Number(item?.effects?.[key] || 0);
    if (!Number.isFinite(value) || Math.abs(value) < 0.0001) continue;
    usedItem = true;
    pushDamageSource(list, `${groupLabel} · ${item.type || item.name || '옵션'}`, value);
  }
  if (!usedItem && Number(group?.[key] || 0)) pushDamageSource(list, groupLabel, group[key]);
  return list;
}
function multiplyPercentSources(sources) {
  let multiplier = 1;
  for (const src of sources || []) {
    const v = typeof src === 'number' ? src : Number(src?.value || 0);
    if (!Number.isFinite(v)) continue;
    multiplier *= (1 + v / 100);
  }
  return multiplier;
}
function effectivePercentFromSources(sources) {
  return (multiplyPercentSources(sources) - 1) * 100;
}
function additivePercentFromSources(sources) {
  return (sources || []).reduce((sum, src) => {
    const v = typeof src === 'number' ? src : Number(src?.value || 0);
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);
}
function safePercentSources(sources, aggregateValue, aggregateLabel = '합산값') {
  const list = Array.isArray(sources) ? sources.filter(src => Math.abs(Number(src?.value ?? src ?? 0)) > 0.0001) : [];
  if (list.length) return list;
  const v = Number(aggregateValue || 0);
  return Math.abs(v) > 0.0001 ? [{ label: aggregateLabel, value: v }] : [];
}


function getBaseStats(selection = state.selected) {
  const selectedCritStat = tier1StatBonus('치명', selection);
  const selectedSwiftStat = tier1StatBonus('신속', selection);
  const critStat = num($('baseCritStat').value) + selectedCritStat;
  const swiftStat = num($('baseSwiftStat').value) + selectedSwiftStat;
  const statCritRate = critRateFromStat(critStat);
  const swiftSpeedBonus = speedFromSwift(swiftStat);
  const extraCritRate = num($('extraCritRate').value);
  const extraCritDamage = num($('extraCritDamage').value);
  const skillCritDamage = 0;
  const extraEvolutionDamage = num($('extraEvolutionDamage').value);
  const extraAdditionalDamage = num($('extraAdditionalDamage').value);
  const extraEnemyDamage = num($('extraEnemyDamage').value);
  const extraAttackSpeed = num($('extraAttackSpeed').value);
  const extraMoveSpeed = num($('extraMoveSpeed').value);
  const critSynergy = $('critSynergyEnabled').checked ? 10 : 0;
  const backAttackCritRate = $('backAttackEnabled').checked ? 10 : 0;
  const backAttackEnemyDamage = $('backAttackEnabled').checked ? 5 : 0;
  const baseSpeed = 114;
  const enlightenmentAttackSpeed = num(state.enlightenment.attackSpeed);
  const enlightenmentMoveSpeed = num(state.enlightenment.moveSpeed);
  const attackSpeed = baseSpeed + swiftSpeedBonus + enlightenmentAttackSpeed + extraAttackSpeed;
  const moveSpeed = baseSpeed + swiftSpeedBonus + enlightenmentMoveSpeed + extraMoveSpeed;
  let dynamicEnlightenmentCritRate = 0;
  let dynamicEnlightenmentCritDamage = 0;
  for (const item of state.enlightenment.items || []) {
    const wf = item?.effects?.windfuryAgility;
    if (!wf) continue;
    // 기상술사 '기민함'은 기본 공속/이속 증가량을 기준으로 계산합니다.
    // 로아의 공속/이속 상한은 각각 140%라서 증가량은 최대 40%까지만 반영됩니다.
    // Lv1: 치피 40% / 치적 10%, Lv2: 80% / 20%, Lv3: 120% / 30%
    // 최대값: Lv1 치피 16%·치적 4%, Lv2 치피 32%·치적 8%, Lv3 치피 48%·치적 12%
    const cappedAttackIncrease = Math.max(0, Math.min(attackSpeed, 140) - 100);
    const cappedMoveIncrease = Math.max(0, Math.min(moveSpeed, 140) - 100);
    dynamicEnlightenmentCritDamage += cappedAttackIncrease * Number(wf.critDamageRate || 0);
    dynamicEnlightenmentCritRate += cappedMoveIncrease * Number(wf.critRateRate || 0);
  }
  dynamicEnlightenmentCritRate = Math.round(dynamicEnlightenmentCritRate * 100) / 100;
  dynamicEnlightenmentCritDamage = Math.round(dynamicEnlightenmentCritDamage * 100) / 100;
  const enemyDamageSources = [
    ...collectItemDamageSources(state.accessory, 'enemyDamage', '악세'),
    ...collectItemDamageSources(state.bracelet, 'enemyDamage', '팔찌')
  ];
  pushDamageSource(enemyDamageSources, '깨달음', state.enlightenment.enemyDamage);
  pushDamageSource(enemyDamageSources, '어빌리티 스톤', state.abilityStone?.enemyDamage);
  pushDamageSource(enemyDamageSources, '각인서/API', state.engraving?.effects?.enemyDamage);
  pushDamageSource(enemyDamageSources, '추가 입력', extraEnemyDamage);
  pushDamageSource(enemyDamageSources, '백어택', backAttackEnemyDamage);
  const critHitDamageSources = [
    ...collectItemDamageSources(state.accessory, 'critHitDamage', '악세'),
    ...collectItemDamageSources(state.bracelet, 'critHitDamage', '팔찌')
  ];
  return {
    critStat,
    swiftStat,
    statCritRate,
    critRate: statCritRate + num(state.accessory.critRate) + num(state.bracelet.critRate) + num(state.enlightenment.critRate) + num(state.abilityStone?.critRate) + num(state.engraving?.effects?.critRate) + dynamicEnlightenmentCritRate + extraCritRate + critSynergy + backAttackCritRate,
    critDamage: 200 + num(state.accessory.critDamage) + num(state.bracelet.critDamage) + num(state.enlightenment.critDamage) + num(state.abilityStone?.critDamage) + num(state.engraving?.effects?.critDamage) + dynamicEnlightenmentCritDamage + extraCritDamage,
    critHitDamage: num(state.accessory.critHitDamage) + num(state.bracelet.critHitDamage),
    critHitDamageSources,
    evolutionDamage: num(state.enlightenment.evolutionDamage) + extraEvolutionDamage,
    additionalDamage: num(state.accessory.additionalDamage) + num(state.bracelet.additionalDamage) + num(state.enlightenment.additionalDamage) + num(state.abilityStone?.additionalDamage) + num(state.engraving?.effects?.additionalDamage) + extraAdditionalDamage,
    enemyDamage: effectivePercentFromSources(enemyDamageSources),
    enemyDamageSources,
    skillCritBonus: 0,
    critSynergy,
    backAttackCritRate,
    backAttackEnemyDamage,
    adrenalineCritRate: $('adrenalineEnabled').checked ? num($('adrenalineCritRate').value) : 0,
    attackPower: ($('adrenalineEnabled').checked ? num($('adrenalineAttackPower').value) : 0) + num(state.abilityStone?.attackPower) + num(state.engraving?.effects?.attackPower),
    swiftSpeedBonus,
    enlightenmentAttackSpeed,
    enlightenmentMoveSpeed,
    dynamicEnlightenmentCritRate,
    dynamicEnlightenmentCritDamage,
    baseMoveAttackSpeed: baseSpeed,
    moveAttackSpeed: Math.min(attackSpeed, moveSpeed),
    attackSpeed,
    moveSpeed,
    extraCritRate,
    extraCritDamage,
    extraEvolutionDamage,
    extraAdditionalDamage,
    extraEnemyDamage,
    extraAttackSpeed,
    extraMoveSpeed
  };
}
function applyEffect(stats, effect, sourceLabel = '진화') {
  const out = { ...stats };
  if (effect.critStat) { out.critStat = (out.critStat || 0) + effect.critStat; out.statCritRate = critRateFromStat(out.critStat); out.critRate += critRateFromStat(effect.critStat); }
  if (effect.swiftStat) { out.swiftStat = (out.swiftStat || 0) + effect.swiftStat; out.swiftSpeedBonus = speedFromSwift(out.swiftStat || 0); out.attackSpeed = (out.baseMoveAttackSpeed || 114) + out.swiftSpeedBonus + (out.enlightenmentAttackSpeed || 0) + (out.extraAttackSpeed || 0); out.moveSpeed = (out.baseMoveAttackSpeed || 114) + out.swiftSpeedBonus + (out.enlightenmentMoveSpeed || 0) + (out.extraMoveSpeed || 0); out.moveAttackSpeed = Math.min(out.attackSpeed, out.moveSpeed); }
  if (effect.critRate) out.critRate += effect.critRate;
  if (effect.critDamage) out.critDamage += effect.critDamage;
  if (effect.critHitDamage) {
    out.critHitDamage = (out.critHitDamage || 0) + effect.critHitDamage;
    out.critHitDamageSources = [...(out.critHitDamageSources || []), { label: sourceLabel, value: effect.critHitDamage }];
  }
  if (effect.evolutionDamage) out.evolutionDamage += effect.evolutionDamage;
  if (effect.cooldownReduction) out.cooldownReduction = (out.cooldownReduction || 0) + effect.cooldownReduction;
  if (effect.sonicBreak) {
    const attackIncrease = Math.max(0, (out.attackSpeed || out.moveAttackSpeed || 100) - 100);
    const moveIncrease = Math.max(0, (out.moveSpeed || out.moveAttackSpeed || 100) - 100);
    // 음속돌파는 공속 증가량과 이속 증가량을 각각 계산한 뒤 합산한다.
    // 로아 공속/이속 상한은 각각 140%라서 기본 구간 최대 증가량은 40 + 40 = 80이다.
    const speedIncrease = attackIncrease + moveIncrease;
    const overCap = Math.max(0, (out.attackSpeed || out.moveAttackSpeed || 100) - 140) + Math.max(0, (out.moveSpeed || out.moveAttackSpeed || 100) - 140);
    let sonicDamage = speedIncrease * Number(effect.sonicBreak.rate || 0);
    if (overCap > 0) sonicDamage += Number(effect.sonicBreak.overCapBonus || 0) + overCap * Number(effect.sonicBreak.overCapRate || 0);
    sonicDamage = Math.min(sonicDamage, Number(effect.sonicBreak.maxEvolutionDamage ?? Infinity));
    out.evolutionDamage += sonicDamage;
    out.sonicBreakEvolutionDamage = (out.sonicBreakEvolutionDamage || 0) + sonicDamage;
  }
  if (effect.additionalDamage) out.additionalDamage += effect.additionalDamage;
  if (effect.enemyDamage) {
    out.enemyDamageSources = [...(out.enemyDamageSources || []), { label: '진화', value: effect.enemyDamage }];
    out.enemyDamage = effectivePercentFromSources(out.enemyDamageSources);
  }
  if (effect.finalDamage) {
    out.enemyDamageSources = [...(out.enemyDamageSources || []), { label: '진화', value: effect.finalDamage }];
    out.enemyDamage = effectivePercentFromSources(out.enemyDamageSources);
  }
  if (effect.attackPower) out.attackPower = (out.attackPower || 0) + effect.attackPower;
  if (effect.speedBonus) { out.attackSpeed = (out.attackSpeed || out.moveAttackSpeed || 0) + effect.speedBonus; out.moveSpeed = (out.moveSpeed || out.moveAttackSpeed || 0) + effect.speedBonus; out.moveAttackSpeed = Math.min(out.attackSpeed, out.moveSpeed); }
  if (effect.critCap != null) out.critCap = effect.critCap;
  if (effect.overCritToEvolutionDamageRate) out.overCritToEvolutionDamageRate = effect.overCritToEvolutionDamageRate;
  if (effect.overCritEvolutionDamageCap != null) out.overCritEvolutionDamageCap = effect.overCritEvolutionDamageCap;
  return out;
}
function selectedEntries(selection = state.selected) { return Object.entries(selection || {}).map(([name, data]) => ({ name, tier: getNode(name)?.tier, level: Number(data?.level || 0), source: data?.source })).filter(row => row.name && row.level > 0 && row.tier); }
function cloneSelection(selection = state.selected) { return JSON.parse(JSON.stringify(selection)); }
function selectionWithoutTiers(selection = state.selected, tiers = [4, 5]) {
  const next = cloneSelection(selection);
  const tierSet = new Set(tiers.map(Number));
  for (const row of selectedEntries(next)) {
    if (tierSet.has(Number(row.tier))) delete next[row.name];
  }
  return next;
}
function score(stats) {
  // Lost Ark damage buckets: same bucket effects are additive first, then each bucket is multiplied.
  // Expected value = crit EV × 진화형피해 × 추가피해 × 적에게주는피해 × 공격력증가.
  const rawCritRate = stats.critRate + stats.skillCritBonus + (stats.adrenalineCritRate || 0);
  let effectiveCritRate = rawCritRate;
  let evo = stats.evolutionDamage;
  let overCrit = 0;
  let convertedEvolutionDamage = 0;
  if (stats.critCap != null && rawCritRate > stats.critCap) {
    overCrit = rawCritRate - stats.critCap;
    // 뭉툭한 가시 Lv.2 기준: 치적 120% => 기본 진피 15% + (120-80)*1.5 = 총 진피 75%.
    // 따라서 overCritEvolutionDamageCap은 “초과 치적 전환분”의 상한입니다. Lv.2는 60%.
    convertedEvolutionDamage = Math.min(overCrit * (stats.overCritToEvolutionDamageRate || 0), stats.overCritEvolutionDamageCap ?? Infinity);
    evo += convertedEvolutionDamage;
    effectiveCritRate = stats.critCap;
  }
  const critChance = Math.max(0, Math.min(effectiveCritRate, 100)) / 100;
  const critHitSources = safePercentSources(stats.critHitDamageSources, stats.critHitDamage, '치명타 적중 주피');
  const critHitMultiplier = multiplyPercentSources(critHitSources);
  const critMultiplier = (1 - critChance) + critChance * (stats.critDamage / 100) * critHitMultiplier;
  const evoMultiplier = 1 + evo / 100;
  const addMultiplier = 1 + stats.additionalDamage / 100;
  const enemyMultiplier = stats.enemyDamageSources?.length ? multiplyPercentSources(stats.enemyDamageSources) : (1 + (stats.enemyDamage || 0) / 100);
  const effectiveEnemyDamage = (enemyMultiplier - 1) * 100;
  const effectiveCritHitDamage = (critHitMultiplier - 1) * 100;
  const displayEnemyDamage = additivePercentFromSources(stats.enemyDamageSources);
  const displayCritHitDamage = additivePercentFromSources(critHitSources);
  const attackMultiplier = 1 + (stats.attackPower || 0) / 100;
  // v4.8.1: 쿨감 실전 반영. 전분 '쿨타임 비율' 기본 75% 고정.
  // 이론 DPS 증가분 [1/(1-CDR)-1] 중 75%만 추천 기대값에 반영한다.
  const cooldownReduction = Math.max(0, Math.min(Number(stats.cooldownReduction || 0), 95));
  const cooldownRatio = 0.75;
  const theoreticalCooldownGain = cooldownReduction > 0 ? (1 / (1 - cooldownReduction / 100) - 1) : 0;
  const cooldownMultiplier = 1 + theoreticalCooldownGain * cooldownRatio;
  const value = critMultiplier * evoMultiplier * addMultiplier * enemyMultiplier * attackMultiplier * cooldownMultiplier;
  return { value, cooldownReduction, cooldownRatio: cooldownRatio * 100, cooldownMultiplier, rawCritRate, critRate: rawCritRate, effectiveCritRate, critDamage: stats.critDamage, critHitDamage: effectiveCritHitDamage, displayCritHitDamage, evo, baseEvo: stats.evolutionDamage, convertedEvolutionDamage, overCrit, additionalDamage: stats.additionalDamage, enemyDamage: effectiveEnemyDamage, displayEnemyDamage, attackPower: stats.attackPower || 0, moveAttackSpeed: stats.moveAttackSpeed || 0, attackSpeed: stats.attackSpeed || stats.moveAttackSpeed || 0, moveSpeed: stats.moveSpeed || stats.moveAttackSpeed || 0 };
}
function cloneBaseStats(stats) {
  return {
    ...stats,
    enemyDamageSources: [...(stats.enemyDamageSources || [])],
    critHitDamageSources: [...(stats.critHitDamageSources || [])]
  };
}
function statsWithSelection(selection = state.selected) {
  // v4.6.0 계산 엔진 순서 고정:
  // 1) 선택 세팅 기준 기본 스탯 생성
  // 2) 4/5티어 추천 계산이면 selection에서 현재 4/5티어를 이미 제거한 상태로 들어옴
  // 3) 해당 selection의 진화 노드를 전부 적용
  // 4) 모든 치적/치피/진피/추피/적주피/공증/공이속이 확정된 뒤 score()에서 뭉가를 마지막 처리
  let s = cloneBaseStats(getBaseStats(selection));
  const entries = selectedEntries(selection).sort((a, b) => Number(a.tier) - Number(b.tier));
  for (const row of entries) {
    if (row.name === '치명' || row.name === '신속') continue;
    s = applyEffect(s, getLevelEffect(row.name, row.level), `진화 ${row.name}`);
  }
  return { stats: s, result: score(s) };
}

function sourceLine(label, value, detail = '') {
  const detailHtml = detail ? `<small>${escapeHtml(detail)}</small>` : '';
  return `<div class="sourceLine"><span>${escapeHtml(label)}${detailHtml}</span><b>${pct(Number(value || 0))}</b></div>`;
}
function sourceGroup(title, colorClass, lines, total) {
  const body = lines.length ? lines.join('') : `<div class="sourceLine muted"><span>해당 없음</span><b>+0.00%</b></div>`;
  return `<div class="sourceGroup ${colorClass}"><div class="sourceHead"><strong>${escapeHtml(title)}</strong><em>${pct(Number(total || 0))}</em></div>${body}</div>`;
}
function getStatNodeLine(name) {
  const lv = Number(state.selected?.[name]?.level || 0);
  return lv > 0 ? `${name} Lv.${lv} · +${lv * 50}` : '';
}

function enlightenmentAppliedDetailHtml(base) {
  const rows = [];
  for (const item of state.enlightenment.items || []) {
    const eff = item?.effects || {};
    const parts = [];
    const push = (label, key) => {
      const value = Number(eff?.[key] || 0);
      if (Number.isFinite(value) && Math.abs(value) > 0.0001) parts.push(`${label} ${pct(value)}`);
    };
    push('치적', 'critRate');
    push('치피', 'critDamage');
    push('진피', 'evolutionDamage');
    push('추피', 'additionalDamage');
    push('적주피', 'enemyDamage');
    if (eff?.windfuryAgility) {
      const cr = Number(base?.dynamicEnlightenmentCritRate || 0);
      const cd = Number(base?.dynamicEnlightenmentCritDamage || 0);
      const dyn = [];
      if (Math.abs(cr) > 0.0001) dyn.push(`치적 ${pct(cr)}`);
      if (Math.abs(cd) > 0.0001) dyn.push(`치피 ${pct(cd)}`);
      if (dyn.length) parts.push(`기민함 동적 ${dyn.join(' / ')}`);
    }
    if (!parts.length) continue;
    const lv = Number(item?.level || 0) ? ` Lv.${Number(item.level)}` : '';
    rows.push(`<div class="enlightenmentDetailLine"><b>${escapeHtml((item?.name || '깨달음 효과') + lv)}</b><span>${escapeHtml(parts.join(' / '))}</span></div>`);
  }
  if (!rows.length) {
    return `<details class="enlightenmentDetails"><summary>깨달음 적용 내역</summary><div class="enlightenmentDetailBody"><div class="enlightenmentDetailLine muted"><span>API에서 적용된 깨달음 수치가 없습니다.</span></div></div></details>`;
  }
  const totals = [];
  const pushTotal = (label, value) => {
    const v = Number(value || 0);
    if (Number.isFinite(v) && Math.abs(v) > 0.0001) totals.push(`${label} ${pct(v)}`);
  };
  pushTotal('치적', state.enlightenment.critRate + Number(base?.dynamicEnlightenmentCritRate || 0));
  pushTotal('치피', state.enlightenment.critDamage + Number(base?.dynamicEnlightenmentCritDamage || 0));
  pushTotal('진피', state.enlightenment.evolutionDamage);
  pushTotal('추피', state.enlightenment.additionalDamage);
  pushTotal('적주피', state.enlightenment.enemyDamage);
  const totalLine = totals.length ? `<div class="enlightenmentDetailTotal"><strong>깨달음 합계</strong><em>${escapeHtml(totals.join(' / '))}</em></div>` : '';
  return `<details class="enlightenmentDetails"><summary>깨달음 적용 내역 / 중복 확인</summary><div class="enlightenmentDetailBody">${rows.join('')}${totalLine}<p>같은 깨달음 효과 안에서 RAW·Tooltip·Description 반복 문장은 가장 큰 유효값 1개만 반영합니다. v4.8.1부터 API Name이 '깨달음'인 항목만 깨달음으로 반영합니다. 도약/진화 항목은 깨달음 계산에서 제외합니다.</p></div></details>`;
}


function engravingAppliedDetailHtml() {
  const stoneItems = state.abilityStone?.items || [];
  const engravingItems = state.engraving?.items || [];
  const rows = [];
  for (const item of stoneItems) {
    const parts = [];
    for (const e of item.engravings || []) parts.push(`${e.name} Lv.${e.level}`);
    const se = item.effects || {};
    if (Number(se.critRate || 0)) parts.push(`치적 ${pct(se.critRate)}`);
    if (Number(se.critDamage || 0)) parts.push(`치피 ${pct(se.critDamage)}`);
    if (Number(se.additionalDamage || 0)) parts.push(`추피 ${pct(se.additionalDamage)}`);
    if (Number(se.enemyDamage || 0)) parts.push(`적주피 ${pct(se.enemyDamage)}`);
    if (Number(item.baseAttackPower || item.attackPower || 0)) parts.push(`기본 공격력 ${pct(item.baseAttackPower || item.attackPower)}`);
    const stoneOnlyAtk = Number(se.attackPower || 0) - Number(item.baseAttackPower || item.attackPower || 0);
    if (stoneOnlyAtk > 0.0001) parts.push(`공격력 ${pct(stoneOnlyAtk)}`);
    if (parts.length) rows.push(`<div class="enlightenmentDetailLine"><b>${escapeHtml(item.name || '어빌리티 스톤')}</b><span>${escapeHtml(parts.join(' / '))}</span></div>`);
  }
  if (engravingItems.length) {
    rows.push(`<div class="enlightenmentDetailLine"><b>각인서/API</b><span>${escapeHtml(engravingItems.map(e => `${e.name} Lv.${e.level}`).join(' / '))}</span></div>`);
  }
  const eff = state.engraving?.effects || {};
  const effParts = [];
  if (Number(eff.critRate || 0)) effParts.push(`치적 ${pct(eff.critRate)}`);
  if (Number(eff.critDamage || 0)) effParts.push(`치피 ${pct(eff.critDamage)}`);
  if (Number(eff.additionalDamage || 0)) effParts.push(`추피 ${pct(eff.additionalDamage)}`);
  if (Number(eff.enemyDamage || 0)) effParts.push(`적주피 ${pct(eff.enemyDamage)}`);
  if (Number(eff.attackPower || 0)) effParts.push(`공격력 ${pct(eff.attackPower)}`);
  if (effParts.length) rows.push(`<div class="enlightenmentDetailLine"><b>각인 효과 파싱값</b><span>${escapeHtml(effParts.join(' / '))}</span></div>`);
  if (!rows.length) return `<details class="enlightenmentDetails"><summary>어빌리티 스톤 / 각인서 적용 내역</summary><div class="enlightenmentDetailBody"><div class="enlightenmentDetailLine muted"><span>API에서 파싱된 어빌리티 스톤/각인서 효과가 없습니다.</span></div></div></details>`;
  return `<details class="enlightenmentDetails" open><summary>어빌리티 스톤 / 각인서 적용 내역</summary><div class="enlightenmentDetailBody">${rows.join('')}</div></details>`;
}

function buildSourceSummary(current) {
  const base = getBaseStats();
  const critEvolution = [];
  const critDamageEvolution = [];
  const evoEvolution = [];
  const addEvolution = [];
  const enemyEvolution = [];
  for (const row of selectedEntries()) {
    if (row.name === '치명' || row.name === '신속') continue;
    const eff = getLevelEffect(row.name, row.level);
    const label = `[진화] ${row.name} (Lv.${row.level})`;
    if (eff.critRate) critEvolution.push(sourceLine(label, eff.critRate));
    if (eff.critDamage) critDamageEvolution.push(sourceLine(label, eff.critDamage));
    if (eff.critHitDamage) critDamageEvolution.push(sourceLine(label + ' 치명타 적중 피해', eff.critHitDamage));
    if (eff.evolutionDamage) evoEvolution.push(sourceLine(label, eff.evolutionDamage));
    if (eff.sonicBreak) {
      const attackIncrease = Math.max(0, (current.stats.attackSpeed || current.stats.moveAttackSpeed || 100) - 100);
      const moveIncrease = Math.max(0, (current.stats.moveSpeed || current.stats.moveAttackSpeed || 100) - 100);
      const speedIncrease = attackIncrease + moveIncrease;
      const overCap = Math.max(0, (current.stats.attackSpeed || current.stats.moveAttackSpeed || 100) - 140) + Math.max(0, (current.stats.moveSpeed || current.stats.moveAttackSpeed || 100) - 140);
      let sonicDamage = speedIncrease * Number(eff.sonicBreak.rate || 0);
      if (overCap > 0) sonicDamage += Number(eff.sonicBreak.overCapBonus || 0) + overCap * Number(eff.sonicBreak.overCapRate || 0);
      sonicDamage = Math.min(sonicDamage, Number(eff.sonicBreak.maxEvolutionDamage ?? Infinity));
      if (sonicDamage) evoEvolution.push(sourceLine(label + ' 음속 전환', sonicDamage));
    }
    if (eff.additionalDamage) addEvolution.push(sourceLine(label, eff.additionalDamage));
    if (eff.enemyDamage || eff.finalDamage) enemyEvolution.push(sourceLine(label, Number(eff.enemyDamage || 0) + Number(eff.finalDamage || 0)));
  }
  if (current.result.convertedEvolutionDamage > 0) evoEvolution.push(sourceLine('[진화] 뭉가 전환', current.result.convertedEvolutionDamage, `80% 초과분 · Lv.2 전환 최대 60% / 총 뭉가 진피 75%`));
  const critLines = [sourceLine('치명 스탯', current.stats.statCritRate || 0, `치명 ${Math.round(current.stats.critStat || 0)}${getStatNodeLine('치명') ? ' · ' + getStatNodeLine('치명') : ''}`)];
  if (base.adrenalineCritRate) critLines.push(sourceLine('아드레날린', base.adrenalineCritRate));
  if (base.critSynergy) critLines.push(sourceLine('치적 시너지', base.critSynergy));
  if (base.backAttackCritRate) critLines.push(sourceLine('백어택', base.backAttackCritRate));
  if (state.accessory.critRate) critLines.push(sourceLine('악세', state.accessory.critRate));
  if (state.bracelet.critRate) critLines.push(sourceLine('팔찌', state.bracelet.critRate));
  if (state.enlightenment.critRate) critLines.push(sourceLine('깨달음', state.enlightenment.critRate));
  if (state.abilityStone?.critRate) critLines.push(sourceLine('어빌리티 스톤', state.abilityStone.critRate));
  if (state.engraving?.effects?.critRate) critLines.push(sourceLine('각인서/API', state.engraving.effects.critRate));
  if (base.dynamicEnlightenmentCritRate) critLines.push(sourceLine('깨달음 · 기민함', base.dynamicEnlightenmentCritRate));
  if (base.extraCritRate) critLines.push(sourceLine('추가 입력', base.extraCritRate));
  critLines.push(...critEvolution);

  const critDamageLines = [sourceLine('기본 치명타 피해', 200)];
  if (state.accessory.critDamage) critDamageLines.push(sourceLine('악세', state.accessory.critDamage));
  if (state.bracelet.critDamage) critDamageLines.push(sourceLine('팔찌', state.bracelet.critDamage));
  if (state.enlightenment.critDamage) critDamageLines.push(sourceLine('깨달음', state.enlightenment.critDamage));
  if (state.abilityStone?.critDamage) critDamageLines.push(sourceLine('어빌리티 스톤', state.abilityStone.critDamage));
  if (state.engraving?.effects?.critDamage) critDamageLines.push(sourceLine('각인서/API', state.engraving.effects.critDamage));
  if (base.dynamicEnlightenmentCritDamage) critDamageLines.push(sourceLine('깨달음 · 기민함', base.dynamicEnlightenmentCritDamage));
  if (base.extraCritDamage) critDamageLines.push(sourceLine('추가 입력', base.extraCritDamage));
  critDamageLines.push(...critDamageEvolution);

  const critHitLines = [];
  for (const src of current.stats.critHitDamageSources || []) critHitLines.push(sourceLine(src.label || '치명타 적중 주피', Number(src.value || 0)));
  if (!critHitLines.length && current.stats.critHitDamage) critHitLines.push(sourceLine('치명타 적중 주피', current.stats.critHitDamage));

  const evoLines = [];
  if (state.enlightenment.evolutionDamage) evoLines.push(sourceLine('깨달음', state.enlightenment.evolutionDamage));
  if (base.extraEvolutionDamage) evoLines.push(sourceLine('추가 입력', base.extraEvolutionDamage));
  evoLines.push(...evoEvolution);

  const addLines = [];
  if (state.accessory.additionalDamage) addLines.push(sourceLine('악세', state.accessory.additionalDamage));
  if (state.bracelet.additionalDamage) addLines.push(sourceLine('팔찌', state.bracelet.additionalDamage));
  if (state.enlightenment.additionalDamage) addLines.push(sourceLine('깨달음', state.enlightenment.additionalDamage));
  if (state.abilityStone?.additionalDamage) addLines.push(sourceLine('어빌리티 스톤', state.abilityStone.additionalDamage));
  if (state.engraving?.effects?.additionalDamage) addLines.push(sourceLine('각인서/API', state.engraving.effects.additionalDamage));
  if (base.extraAdditionalDamage) addLines.push(sourceLine('추가 입력', base.extraAdditionalDamage));
  addLines.push(...addEvolution);

  const attackSpeedLines = [sourceLine('기본 + 만찬 + 서폿 진화', 114, '100% + 5% + 9%')];
  const moveSpeedLines = [sourceLine('기본 + 만찬 + 서폿 진화', 114, '100% + 5% + 9%')];
  if (current.stats.swiftSpeedBonus) {
    const swiftDetail = `신속 ${Math.round(current.stats.swiftStat || 0)}${getStatNodeLine('신속') ? ' · ' + getStatNodeLine('신속') : ''}`;
    attackSpeedLines.push(sourceLine('신속 스탯', current.stats.swiftSpeedBonus, swiftDetail));
    moveSpeedLines.push(sourceLine('신속 스탯', current.stats.swiftSpeedBonus, swiftDetail));
  }
  if (base.enlightenmentAttackSpeed) attackSpeedLines.push(sourceLine('깨달음', base.enlightenmentAttackSpeed));
  if (base.enlightenmentMoveSpeed) moveSpeedLines.push(sourceLine('깨달음', base.enlightenmentMoveSpeed));
  if (base.extraAttackSpeed) attackSpeedLines.push(sourceLine('추가 입력', base.extraAttackSpeed));
  if (base.extraMoveSpeed) moveSpeedLines.push(sourceLine('추가 입력', base.extraMoveSpeed));

  const enemyLines = [];
  if (state.accessory.enemyDamage) enemyLines.push(sourceLine('악세', state.accessory.enemyDamage));
  if (state.bracelet.enemyDamage) enemyLines.push(sourceLine('팔찌', state.bracelet.enemyDamage));
  if (state.enlightenment.enemyDamage) enemyLines.push(sourceLine('깨달음', state.enlightenment.enemyDamage));
  if (state.abilityStone?.enemyDamage) enemyLines.push(sourceLine('어빌리티 스톤', state.abilityStone.enemyDamage));
  if (state.engraving?.effects?.enemyDamage) enemyLines.push(sourceLine('각인서/API', state.engraving.effects.enemyDamage));
  if (base.extraEnemyDamage) enemyLines.push(sourceLine('추가 입력', base.extraEnemyDamage));
  if (base.backAttackEnemyDamage) enemyLines.push(sourceLine('백어택', base.backAttackEnemyDamage));
  enemyLines.push(...enemyEvolution);

  const attackPowerLines = [];
  if (base.adrenalineAttackPower) attackPowerLines.push(sourceLine('아드레날린', base.adrenalineAttackPower));
  if (state.abilityStone?.attackPower) attackPowerLines.push(sourceLine('어빌리티 스톤', state.abilityStone.attackPower, '기본 공격력 보너스'));
  if (state.engraving?.effects?.attackPower) attackPowerLines.push(sourceLine('각인서/API', state.engraving.effects.attackPower));

  $('sourceSummary').innerHTML = `
    <div class="sourceTitle"><div><h3>계산 요약</h3><p>표시는 출처별 합산값, 기대값은 로아식 합연산/곱연산으로 계산합니다.</p></div><button id="resetViewButton" type="button">초기화</button></div>
    ${sourceGroup('치명타 확률', 'blue', critLines, current.result.critRate)}
    ${sourceGroup('치명타 피해', 'purple', critDamageLines, current.result.critDamage)}
    ${sourceGroup('치명타 적중 주피', 'pink', critHitLines, current.result.critHitDamage)}
    ${sourceGroup('진피', 'orange', evoLines, current.result.evo)}
    ${sourceGroup('추피', 'green', addLines, current.result.additionalDamage)}
    ${sourceGroup('적주피', 'pink', enemyLines, current.result.enemyDamage)}
    ${sourceGroup('공격력 증가', 'green', attackPowerLines, current.result.attackPower)}
    ${sourceGroup('공격 속도', 'cyan', attackSpeedLines, current.result.attackSpeed)}
    ${sourceGroup('이동 속도', 'cyan', moveSpeedLines, current.result.moveSpeed)}
    ${enlightenmentAppliedDetailHtml(base)}
    ${engravingAppliedDetailHtml()}
    <div class="sourceFoot">UI의 치피·진피·추피는 합산 표시이며, 적주피·치명타 적중 주피는 내부 기대값에서 출처별 곱연산으로 적용됩니다. 뭉가 Lv.2는 <b>기본 진피 15% + 초과 치적 전환 최대 60% = 총 75%</b> 기준입니다.</div>
  `;
  const reset = $('resetViewButton');
  if (reset) reset.addEventListener('click', () => { state.selected = JSON.parse(JSON.stringify(state.apiSelected || {})); renderEvolutionTiers(); calculateAndRender(); });
}

function renderCombatStats(current = statsWithSelection(state.selected)) {
  buildSourceSummary(current);
}

function keenEfficiency(current, bonusCritDamage) {
  const critRate = Math.max(0, Math.min(100, Number(current?.result?.effectiveCritRate ?? current?.result?.critRate ?? 0))) / 100;
  const critDamage = Number(current?.result?.critDamage || 200);
  const before = (1 - critRate) + critRate * (critDamage / 100);
  const after = ((1 - critRate) + critRate * ((critDamage + bonusCritDamage) / 100)) * 0.98;
  if (!before || !Number.isFinite(before) || !Number.isFinite(after)) return 0;
  return ((after / before) - 1) * 100;
}
function renderKeenEfficiency(current) {
  const el = $('keenEfficiency');
  if (!el) return;
  const rows = [
    { name: '전설 예둔', bonus: 44 },
    { name: '유물 예둔', bonus: 52 }
  ].map(row => {
    const eff = keenEfficiency(current, row.bonus);
    const recommend = eff >= 16;
    return `<div class="keenCard ${recommend ? 'recommend' : 'normal'}">
      <div><b>${row.name}</b><span>치명타 피해 +${row.bonus}% / 평균 페널티 0.98 적용</span></div>
      <strong>${eff.toFixed(2)}%</strong>
      <em>${recommend ? '추천' : '비추천'}</em>
    </div>`;
  }).join('');
  const crit = Math.max(0, Math.min(100, Number(current?.result?.effectiveCritRate ?? current?.result?.critRate ?? 0)));
  el.innerHTML = `<div class="keenNote">계산 기준: 실제 치적 ${crit.toFixed(2)}% / 치피 ${Number(current?.result?.critDamage || 0).toFixed(2)}%</div>${rows}`;
}
function currentTierNames(tier) {
  return selectedEntries().filter(row => Number(row.tier) === Number(tier)).map(row => row.name);
}
function shortNodeName(name) {
  const map = {
    '끝없는 마나': '끝마',
    '금단의 주문': '금주',
    '예리한 감각': '예감',
    '한계 돌파': '한돌',
    '최적화 훈련': '최훈'
  };
  return map[name] || name;
}
function shortNodeLabel(name, level) {
  return `${shortNodeName(name)} Lv.${level}`;
}
function tier4PairLabel(names) {
  return (names || []).filter(Boolean).join(' + ') || '-';
}
function sameNameSet(a, b) {
  const aa = [...(a || [])].sort().join('|');
  const bb = [...(b || [])].sort().join('|');
  return aa === bb;
}
function candidateMemo(fourNames, fiveName, calc, singleHitPenalty = false, critOverPenalty = 0) {
  const current4 = currentTierNames(4);
  const current5 = currentTierNames(5).join(' + ') || '-';
  const bits = [];
  if (sameNameSet(fourNames, current4) && fiveName === current5) bits.push('현재 조합');
  else bits.push(`${tier4PairLabel(fourNames)} / ${fiveName}`);
  if (calc?.result?.convertedEvolutionDamage > 0) bits.push(`뭉가 전환 ${fmt(calc.result.convertedEvolutionDamage)}%(기본 포함 총 ${fmt(calc.result.convertedEvolutionDamage + 15)}%)`);
  if (singleHitPenalty) bits.push('주력기 단타 보정 -2.5%(추천만)');
  if (critOverPenalty > 0) bits.push(`치적 초과 보정 -${fmt(critOverPenalty)}%(추천만)`);
  if (calc?.result?.sonicBreakEvolutionDamage > 0) bits.push(`음속 ${fmt(calc.result.sonicBreakEvolutionDamage)}%`);
  return bits.join(' / ');
}
function recommendationAdjustmentFor(fiveName, calc, singleHitPenaltyEnabled) {
  let multiplier = 1;
  const details = { singleHitPenalty: false, critOverPenalty: 0 };
  if (singleHitPenaltyEnabled && fiveName === '뭉툭한 가시') {
    multiplier *= 0.975;
    details.singleHitPenalty = true;
  }
  // 뭉가가 아닌 조합은 치적 100% 초과분이 실제 딜 기대값에는 버려지므로,
  // 추천 순위에서만 초과 치적 1%당 -0.3%, 최대 -3% 안전 보정을 적용한다.
  if (fiveName !== '뭉툭한 가시') {
    const overCrit = Math.max(0, Number(calc?.result?.critRate || 0) - 100);
    const penalty = Math.min(overCrit * 0.3, 3);
    if (penalty > 0) {
      multiplier *= (1 - penalty / 100);
      details.critOverPenalty = penalty;
    }
  }
  return { value: Number(calc?.result?.value || 0) * multiplier, ...details };
}
function recommendationValueFor(fiveName, calc, singleHitPenaltyEnabled) {
  return recommendationAdjustmentFor(fiveName, calc, singleHitPenaltyEnabled).value;
}
function tier2Label(entries) {
  return entries.map(x => shortNodeLabel(x.name, x.level)).join(' + ');
}
function tier2ChipHtml(entries) {
  return (entries || []).map(x => `<b class="miniChip">${escapeHtml(shortNodeLabel(x.name, x.level))}</b>`).join('');
}
function tier2Allocations(options) {
  const out = [];
  function walk(i, remain, picked) {
    if (i >= options.length) {
      if (remain === 0 && picked.length) out.push(picked.map(x => ({ ...x })));
      return;
    }
    const name = options[i];
    const node = getNode(name);
    const max = Math.min(Number(node?.maxLevel || 0), remain);
    for (let lv = 0; lv <= max; lv++) {
      if (lv > 0) picked.push({ name, level: lv });
      walk(i + 1, remain - lv, picked);
      if (lv > 0) picked.pop();
    }
  }
  walk(0, 3, []); // 2티어 30P = 10P × 3레벨
  return out;
}
function hasSameTier245(selection, tier2Entries, fourNames, fiveName) {
  const selected2 = selectedEntries(selection).filter(row => Number(row.tier) === 2).map(row => ({ name: row.name, level: Number(row.level) }));
  const selected4 = selectedEntries(selection).filter(row => Number(row.tier) === 4).map(row => row.name);
  const selected5 = selectedEntries(selection).filter(row => Number(row.tier) === 5).map(row => row.name);
  const a = [...selected2].sort((x,y) => x.name.localeCompare(y.name));
  const b = [...tier2Entries].sort((x,y) => x.name.localeCompare(y.name));
  const same2 = a.length === b.length && a.every((x,i) => x.name === b[i].name && x.level === b[i].level);
  return same2 && sameNameSet(fourNames, selected4) && selected5.includes(fiveName);
}
function candidateTag(c) {
  const tags = [];
  if (hasSameTier245(state.apiSelected, c.tier2Entries, c.fourNames, c.fiveName)) tags.push('<em class="apiTag">API</em>');
  if (hasSameTier245(state.selected, c.tier2Entries, c.fourNames, c.fiveName)) tags.push('<em class="currentTag">현재</em>');
  return tags.join('');
}
function penaltyNoteHtml(c) {
  const notes = [];
  if (c.critOverPenalty > 0) notes.push(`치적초과 -${fmt(c.critOverPenalty)}% 추천보정`);
  if (c.penaltyApplied) notes.push('단타 -2.5% 추천보정');
  return notes.length ? `<div class="penaltyNote">${escapeHtml(notes.join(' · '))}</div>` : '';
}
function calculateAndRender() {
  const current = statsWithSelection(state.selected);
  const apiBase = statsWithSelection(Object.keys(state.apiSelected || {}).length ? state.apiSelected : state.selected);
  renderCombatStats(current);
  renderKeenEfficiency(current);
  const baseValue = apiBase.result.value || current.result.value || 1;
  const currentDiff = ((current.result.value / baseValue) - 1) * 100;
  const candidates = [];
  const noManaMainSkill = Boolean($('noManaMainSkill')?.checked);
  const excludeCooldown = Boolean($('excludeCooldown')?.checked);
  const singleHitPenaltyEnabled = Boolean($('singleHitMainSkill')?.checked);

  // 딜러 추천 규칙: 축복의 여신은 항상 제외. 한계 돌파만 Lv.3 가능하며 DB maxLevel을 그대로 사용.
  const tier2Options = allOptions(2).filter(name => {
    if (!getNode(name) || name === '축복의 여신') return false;
    if (excludeCooldown && name === '최적화 훈련') return false;
    if (noManaMainSkill && ['끝없는 마나', '금단의 주문'].includes(name)) return false;
    return true;
  });
  const tier2Candidates = tier2Allocations(tier2Options);
  const tier4Options = allOptions(4).filter(name => getNode(name));
  const tier5Options = allOptions(5).filter(name => getNode(name) && !(noManaMainSkill && name === '마나 용광로'));

  const tier4Pairs = [];
  for (let i = 0; i < tier4Options.length; i++) {
    for (let j = i + 1; j < tier4Options.length; j++) tier4Pairs.push([tier4Options[i], tier4Options[j]]);
  }

  for (const tier2Entries of tier2Candidates) {
    for (const fourNames of tier4Pairs) {
      const fourLevel = 1;
      for (const fiveName of tier5Options) {
        const fiveNode = getNode(fiveName);
        const fiveLevel = fiveNode?.maxLevel || 2;
        // 추천 계산에서 현재 2/4/5티어만 제거하고 후보 조합을 삽입. 1/3티어와 입력값은 유지.
        const next = selectionWithoutTiers(state.selected, [2, 4, 5]);
        for (const e of tier2Entries) next[e.name] = { level: e.level, source: 'candidate' };
        for (const fourName of fourNames) next[fourName] = { level: fourLevel, source: 'candidate' };
        next[fiveName] = { level: fiveLevel, source: 'candidate' };
        const calc = statsWithSelection(next);
        const adjustment = recommendationAdjustmentFor(fiveName, calc, singleHitPenaltyEnabled);
        const recValue = adjustment.value;
        candidates.push({
          tier2Entries, fourNames, fourLevel, fiveName, fiveLevel, calc, recValue,
          penaltyApplied: adjustment.singleHitPenalty,
          critOverPenalty: adjustment.critOverPenalty,
          diff: ((recValue / baseValue) - 1) * 100
        });
      }
    }
  }
  candidates.sort((a, b) => b.recValue - a.recValue);
  const top = candidates.slice(0, 5);
  const currentDiffText = `${currentDiff >= 0 ? '+' : ''}${currentDiff.toFixed(2)}%`;
  $('currentScore').innerHTML = `<div class="apiBaselineRow">
    <div><span>API 원본 기대값</span><b>${apiBase.result.value.toFixed(4)}</b></div>
    <div><span>현재 화면 선택값</span><b>${current.result.value.toFixed(4)}</b></div>
    <div><span>현재 대비</span><b class="${currentDiff >= 0 ? 'up' : 'down'}">${currentDiffText}</b></div>
    <p>비교 기준은 API가 읽어온 원본 아크패시브 기대값으로 고정됩니다.${singleHitPenaltyEnabled ? ' 뭉가 후보는 추천점수만 -2.5% 적용됩니다. 비뭉가 후보는 치적 100% 초과분 1%당 -0.3%(최대 -3%) 추천 보정이 적용됩니다.' : ''}</p>
  </div>`;
  $('baseInfo').innerHTML = `<b>API 기준 상세</b><span>치명 ${Math.round(apiBase.stats.critStat || 0)} · 최종치적 ${fmt(apiBase.result.critRate)}% · 치피 ${fmt(apiBase.result.critDamage)}% · 치적주피 ${fmt(apiBase.result.critHitDamage)}% · 진피 ${fmt(apiBase.result.evo)}% · 추피 ${fmt(apiBase.result.additionalDamage)}% · 적주피 ${fmt(apiBase.result.enemyDamage)}% · 공증 ${fmt(apiBase.result.attackPower)}%</span>`;
  $('recommendList').innerHTML = `<div class="comboRows">${top.map((c, i) => {
    const cls = c.diff >= 0 ? 'up' : 'down';
    const memo = candidateMemo(c.fourNames, c.fiveName, c.calc, c.penaltyApplied, c.critOverPenalty);
    return `<article class="comboRow ${i === 0 ? 'best' : ''}">
      <div class="rankBadge">${i + 1}</div>
      <div class="rowBuild">
        <div class="buildMain">
          <div class="tierLine tier2Line"><span>2T</span><strong class="chipWrap">${tier2ChipHtml(c.tier2Entries)}</strong></div>
          <div class="tierLine"><span>4T</span><strong>${escapeHtml(tier4PairLabel(c.fourNames))}</strong></div>
          <div class="tierLine"><span>5T</span><strong class="nodePill">${escapeHtml(c.fiveName)} Lv.${c.fiveLevel}</strong>${candidateTag(c)}</div>
        </div>
        <div class="comboMemo">${escapeHtml(memo)}</div>
        ${penaltyNoteHtml(c)}
      </div>
      <div class="rowMetrics">
        <div class="rowMetric"><span>추천값</span><b>${c.recValue.toFixed(4)}</b>${(c.penaltyApplied || c.critOverPenalty > 0) ? `<small>이론 ${c.calc.result.value.toFixed(4)}</small>` : ''}</div>
        <div class="rowMetric"><span>API 대비</span><b class="${cls}">${pct(c.diff)}</b></div>
        <div class="rowMetric"><span>치적</span><b>${fmt(c.calc.result.critRate)}%</b></div>
      </div>
    </article>`;
  }).join('')}</div>`;
}

async function loadDb() {
  state.evolution = await fetch('/data/evolution.json').then(r => r.json());
  state.index = buildIndex(state.evolution);
  state.selected = defaultSelection();
  state.apiSelected = JSON.parse(JSON.stringify(state.selected));
  renderEvolutionTiers();
  calculateAndRender();
}
async function searchCharacter(name) {
  const button = $('searchButton');
  button.disabled = true; button.textContent = '검색...'; setMessage('');
  // 이전 검색 결과가 남아 보이지 않도록 검색 시작 시 화면을 먼저 비웁니다.
  $('characterCard').classList.add('hidden');
  $('characterCard').innerHTML = '';
  $('summaryPanel').classList.add('hidden');
  state.selected = {};
  state.apiSelected = {};
  state.abilityStone = { critRate: 0, critDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0, baseAttackPower: 0, engravings: [], items: [] };
  state.engraving = { effects: { critRate: 0, critDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0 }, items: [], rawText: '' };
  state.enlightenment = { critRate: 0, critDamage: 0, evolutionDamage: 0, enemyDamage: 0, additionalDamage: 0, attackSpeed: 0, moveSpeed: 0, items: [] };
  renderEvolutionTiers();
  calculateAndRender();
  try {
    const res = await fetch(`/api/character?name=${encodeURIComponent(name)}&_=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || data.message || '검색 실패');
    if (!data.profile?.CharacterName) throw new Error('캐릭터 프로필을 가져오지 못했습니다.');
    state.accessory = data.accessoryEffects || { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
    state.bracelet = data.braceletEffects || { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
    state.abilityStone = data.abilityStoneEffects || { critRate: 0, critDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0, baseAttackPower: 0, engravings: [], items: [] };
    state.engraving = data.engravingEffects || { effects: { critRate: 0, critDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0 }, items: [], rawText: '' };
    renderCharacter(data.profile);
    state.foundEffects = readEffects(data.arkPassive);
    state.enlightenment = extractEnlightenmentEffects(state.foundEffects);
    state.selected = classifyEvolution(state.foundEffects);
    state.apiSelected = JSON.parse(JSON.stringify(state.selected));
    applyProfileDefaults(data.profile, state.selected);
    renderEvolutionTiers();
    renderSummary(data.profile, data.arkPassive);
    calculateAndRender();
    if (!Object.keys(state.selected).length) setMessage('캐릭터 정보는 갱신됐지만 API에서 진화 노드를 읽지 못했습니다. 노드는 직접 선택해 주세요.');
  } catch (error) { setMessage(error.message); }
  finally { button.disabled = false; button.textContent = '검색'; }
}

$('searchForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('characterName').value.trim();
  if (!name) return setMessage('캐릭터명을 입력하세요.');
  searchCharacter(name);
});
['extraCritRate','extraCritDamage','extraEvolutionDamage','extraAdditionalDamage','extraEnemyDamage','extraAttackSpeed','extraMoveSpeed','adrenalineCritRate','adrenalineAttackPower'].forEach(id => $(id).addEventListener('input', calculateAndRender));
$('adrenalineEnabled').addEventListener('change', calculateAndRender);
$('critSynergyEnabled').addEventListener('change', calculateAndRender);
$('backAttackEnabled').addEventListener('change', calculateAndRender);
$('excludeCooldown')?.addEventListener('change', calculateAndRender);
$('noManaMainSkill')?.addEventListener('change', calculateAndRender);
$('singleHitMainSkill')?.addEventListener('change', calculateAndRender);

await loadDb();
