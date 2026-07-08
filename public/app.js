const VERSION = '5.0.9';
const COOLDOWN_NODE_NAMES = ['최적화 훈련', '끝없는 마나', '무한한 마력'];
function isCooldownExcluded() { return Boolean(document.getElementById('excludeCooldown')?.checked); }
function hasCooldownEffect(name) {
  const node = getNode(name);
  if (!node) return COOLDOWN_NODE_NAMES.includes(name);
  return COOLDOWN_NODE_NAMES.includes(name) || Object.values(node.levels || {}).some(effect => Number(effect?.cooldownReduction || 0) > 0);
}
function hasCooldownCandidate(tier2Entries, fourNames, fiveName) {
  return [
    ...(tier2Entries || []).map(x => x.name),
    ...(fourNames || []),
    fiveName
  ].filter(Boolean).some(name => hasCooldownEffect(name));
}

function emptyEngravingState() {
  return { effects: { critRate: 0, critDamage: 0, critHitDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0, conditionalDamage: 0 }, items: [], rawText: '', adrenaline: { adopted: false, level: 0, critRate: 0, attackPower: 0 } };
}

const $ = (id) => document.getElementById(id);
const EVOLUTION_TIERS = [1, 2, 3, 4, 5];
const state = { evolution: null, index: new Map(), selected: {}, apiSelected: {}, foundEffects: [], profileStats: { crit: 0, swift: 0, spec: 0 }, accessory: { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] }, bracelet: { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] }, abilityStone: { attackPower: 0, effects: { critRate: 0, critDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0, conditionalDamage: 0 }, engravings: [], items: [] }, engraving: emptyEngravingState(), enlightenment: { critRate: 0, critDamage: 0, critHitDamage: 0, evolutionDamage: 0, enemyDamage: 0, additionalDamage: 0, attackSpeed: 0, moveSpeed: 0, items: [] }, arkGrid: { critRate: 0, critDamage: 0, additionalDamage: 0, enemyDamage: 0, attackSpeed: 0, moveSpeed: 0, items: [], rawText: '' } };

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

function emptyArkGridState() {
  return { critRate: 0, critDamage: 0, additionalDamage: 0, enemyDamage: 0, attackSpeed: 0, moveSpeed: 0, items: [], rawText: '' };
}
function arkGridCandidateTexts(value, path = '', out = []) {
  if (value == null) return out;
  const pathHit = /ark\s*grid|arkgrid|아크\s*그리드|아크그리드/i.test(path);
  if (typeof value === 'string') {
    const cleaned = stripHtml(value);
    if (pathHit || /아크\s*그리드|아크그리드|ark\s*grid|arkgrid/i.test(cleaned)) out.push(cleaned);
    const t = value.trim();
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { arkGridCandidateTexts(JSON.parse(t), path, out); } catch {}
    }
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => arkGridCandidateTexts(item, `${path}.${i}`, out));
    return out;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) arkGridCandidateTexts(v, path ? `${path}.${k}` : k, out);
  }
  return out;
}
function addArkGridMatches(out, key, text, regexList) {
  const seen = out.__seen || (out.__seen = new Set());
  for (const re of regexList) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      const value = Number(match[1] || 0);
      if (!Number.isFinite(value)) continue;
      const token = `${key}:${value}:${normalizeMatchToken(match[0])}`;
      if (seen.has(token)) continue;
      seen.add(token);
      out[key] += value;
    }
  }
}
function parseArkGridEffectText(text) {
  const out = { critRate: 0, critDamage: 0, additionalDamage: 0, enemyDamage: 0, attackSpeed: 0, moveSpeed: 0 };
  const source = stripHtml(text);
  addArkGridMatches(out, 'critRate', source, [
    /치명타\s*적중률(?:이|이\s*)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:만큼)?\s*(?:증가|상승)?/g,
    /치명타\s*확률(?:이|이\s*)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:만큼)?\s*(?:증가|상승)?/g,
    /치적\s*(?:\+)?(\d+(?:\.\d+)?)%/g
  ]);
  addArkGridMatches(out, 'critDamage', source, [
    /치명타\s*피해(?:량)?(?:이|가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:만큼)?\s*(?:증가|상승)?/g,
    /치피\s*(?:\+)?(\d+(?:\.\d+)?)%/g
  ]);
  addArkGridMatches(out, 'additionalDamage', source, [
    /추가\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:만큼)?\s*(?:증가|상승)?/g,
    /추피\s*(?:\+)?(\d+(?:\.\d+)?)%/g
  ]);
  addArkGridMatches(out, 'enemyDamage', source, [
    /(?<!무력화\s*상태의\s*)(?<!치명타로\s*적중\s*시\s*)적에게\s*주는\s*(?:모든\s*)?피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:만큼)?\s*(?:증가|상승)?/g,
    /적주피\s*(?:\+)?(\d+(?:\.\d+)?)%/g
  ]);
  addArkGridMatches(out, 'attackSpeed', source, [
    /공격\s*속도(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:만큼)?\s*(?:증가|상승)?/g,
    /공속\s*(?:\+)?(\d+(?:\.\d+)?)%/g
  ]);
  addArkGridMatches(out, 'moveSpeed', source, [
    /이동\s*속도(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:만큼)?\s*(?:증가|상승)?/g,
    /이속\s*(?:\+)?(\d+(?:\.\d+)?)%/g
  ]);
  delete out.__seen;
  for (const key of Object.keys(out)) out[key] = Math.round(out[key] * 100) / 100;
  return out;
}
function extractArkGridEffects(arkPassive) {
  const result = emptyArkGridState();
  const candidates = [...new Set(arkGridCandidateTexts(arkPassive).filter(Boolean))];
  result.rawText = candidates.join(' ').slice(0, 8000);
  const applied = new Set();
  candidates.forEach((text, index) => {
    const effects = parseArkGridEffectText(text);
    const hasValue = ['critRate','critDamage','additionalDamage','enemyDamage','attackSpeed','moveSpeed'].some(k => Math.abs(Number(effects[k] || 0)) > 0.0001);
    if (!hasValue) return;
    const sig = ['critRate','critDamage','additionalDamage','enemyDamage','attackSpeed','moveSpeed'].map(k => `${k}:${Number(effects[k] || 0).toFixed(3)}`).join('|');
    if (applied.has(sig)) return;
    applied.add(sig);
    for (const key of ['critRate','critDamage','additionalDamage','enemyDamage','attackSpeed','moveSpeed']) result[key] += Number(effects[key] || 0);
    result.items.push({ name: `아크그리드 ${index + 1}`, effects, text: text.slice(0, 500) });
  });
  for (const key of ['critRate','critDamage','additionalDamage','enemyDamage','attackSpeed','moveSpeed']) result[key] = Math.round(result[key] * 100) / 100;
  return result;
}

function parsePercentEffectText(text) {
  const out = { critRate: 0, critDamage: 0, critHitDamage: 0, evolutionDamage: 0, enemyDamage: 0, additionalDamage: 0 };
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
  // 회심: "공격이 치명타로 적중 시 적에게 주는 피해"는 치피가 아니라
  // 치명타 발생분에만 적용되는 조건부 적주피다. 일반 적주피에 무조건 합산하지 않는다.
  addMatchesTo(out, 'critHitDamage', source, [
    /공격이\s*치명타로\s*적중\s*시\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가|상승)?/g
  ]);
  addMatchesTo(out, 'enemyDamage', source, [
    /(?<!무력화\s*상태의\s*)(?<!치명타로\s*적중\s*시\s*)적에게\s*주는\s*(?:모든\s*)?피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:만큼)?\s*(?:증가|상승)?/g,
    /백어택\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /헤드어택\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /방향성\s*공격이\s*아닌\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ]);
  for (const key of Object.keys(out)) out[key] = Math.round(out[key] * 100) / 100;
  return out;
}
function hasAnyEffect(effects) {
  return ['critRate','critDamage','critHitDamage','evolutionDamage','enemyDamage','additionalDamage'].some(k => Math.abs(Number(effects?.[k] || 0)) > 0);
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
  const values = ['critRate','critDamage','critHitDamage','evolutionDamage','enemyDamage','additionalDamage','attackSpeed','moveSpeed']
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
  const result = { critRate: 0, critDamage: 0, critHitDamage: 0, evolutionDamage: 0, enemyDamage: 0, additionalDamage: 0, attackSpeed: 0, moveSpeed: 0, items: [] };
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
    for (const key of ['critRate','critDamage','critHitDamage','evolutionDamage','enemyDamage','additionalDamage','attackSpeed','moveSpeed']) result[key] += Number(parsed[key] || 0);
    result.items.push({ name: effect.name || '깨달음 효과', level: effect.level || 0, effects: parsed });
  }
  for (const key of ['critRate','critDamage','critHitDamage','evolutionDamage','enemyDamage','additionalDamage','attackSpeed','moveSpeed']) result[key] = Math.round(result[key] * 100) / 100;
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
  const adrenalineReplacementDamage = num($('adrenalineReplacementDamage')?.value);
  const extraAttackSpeed = num($('extraAttackSpeed').value);
  const extraMoveSpeed = num($('extraMoveSpeed').value);
  const critSynergy = $('critSynergyEnabled').checked ? 10 : 0;
  const backAttackCritRate = $('backAttackEnabled').checked ? 10 : 0;
  const backAttackEnemyDamage = $('backAttackEnabled').checked ? 5 : 0;
  const baseSpeed = 114;
  const enlightenmentAttackSpeed = num(state.enlightenment.attackSpeed);
  const enlightenmentMoveSpeed = num(state.enlightenment.moveSpeed);
  const arkGridAttackSpeed = num(state.arkGrid.attackSpeed);
  const arkGridMoveSpeed = num(state.arkGrid.moveSpeed);
  const attackSpeed = baseSpeed + swiftSpeedBonus + enlightenmentAttackSpeed + arkGridAttackSpeed + extraAttackSpeed;
  const moveSpeed = baseSpeed + swiftSpeedBonus + enlightenmentMoveSpeed + arkGridMoveSpeed + extraMoveSpeed;
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
  pushDamageSource(enemyDamageSources, '아크그리드', state.arkGrid.enemyDamage);
  pushDamageSource(enemyDamageSources, '각인서/API', state.engraving?.effects?.enemyDamage);
  pushDamageSource(enemyDamageSources, '어빌리티 스톤 각인 보너스', state.abilityStone?.effects?.enemyDamage);
  pushDamageSource(enemyDamageSources, '추가 입력', extraEnemyDamage);
  if ($('adrenalineEnabled')?.checked && !state.engraving?.adrenaline?.adopted && adrenalineReplacementDamage > 0) {
    pushDamageSource(enemyDamageSources, '아드 대체 각인 차감', -adrenalineReplacementDamage);
  }
  pushDamageSource(enemyDamageSources, '백어택', backAttackEnemyDamage);
  const critHitDamageSources = [
    ...collectItemDamageSources(state.accessory, 'critHitDamage', '악세'),
    ...collectItemDamageSources(state.bracelet, 'critHitDamage', '팔찌')
  ];
  pushDamageSource(critHitDamageSources, '깨달음 · 회심', state.enlightenment.critHitDamage);
  pushDamageSource(critHitDamageSources, '각인서/API', state.engraving?.effects?.critHitDamage);
  pushDamageSource(critHitDamageSources, '어빌리티 스톤 각인 보너스', state.abilityStone?.effects?.critHitDamage);
  return {
    critStat,
    swiftStat,
    statCritRate,
    critRate: statCritRate + num(state.accessory.critRate) + num(state.bracelet.critRate) + num(state.enlightenment.critRate) + num(state.arkGrid.critRate) + num(state.engraving?.effects?.critRate) + num(state.abilityStone?.effects?.critRate) + dynamicEnlightenmentCritRate + extraCritRate + critSynergy + backAttackCritRate,
    critDamage: 200 + num(state.accessory.critDamage) + num(state.bracelet.critDamage) + num(state.enlightenment.critDamage) + num(state.arkGrid.critDamage) + num(state.engraving?.effects?.critDamage) + num(state.abilityStone?.effects?.critDamage) + dynamicEnlightenmentCritDamage + extraCritDamage,
    critHitDamage: num(state.accessory.critHitDamage) + num(state.bracelet.critHitDamage) + num(state.enlightenment.critHitDamage) + num(state.engraving?.effects?.critHitDamage) + num(state.abilityStone?.effects?.critHitDamage),
    critHitDamageSources,
    evolutionDamage: num(state.enlightenment.evolutionDamage) + extraEvolutionDamage,
    additionalDamage: num(state.accessory.additionalDamage) + num(state.bracelet.additionalDamage) + num(state.enlightenment.additionalDamage) + num(state.arkGrid.additionalDamage) + num(state.engraving?.effects?.additionalDamage) + num(state.abilityStone?.effects?.additionalDamage) + extraAdditionalDamage,
    enemyDamage: effectivePercentFromSources(enemyDamageSources),
    enemyDamageSources,
    skillCritBonus: 0,
    critSynergy,
    backAttackCritRate,
    backAttackEnemyDamage,
    adrenalineCritRate: $('adrenalineEnabled').checked ? num($('adrenalineCritRate').value) : 0,
    attackPower: ($('adrenalineEnabled').checked ? num($('adrenalineAttackPower').value) : 0) + num(state.abilityStone?.attackPower) + num(state.abilityStone?.effects?.attackPower) + num(state.engraving?.effects?.attackPower),
    swiftSpeedBonus,
    enlightenmentAttackSpeed,
    enlightenmentMoveSpeed,
    arkGridAttackSpeed,
    arkGridMoveSpeed,
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
    adrenalineReplacementDamage,
    extraAttackSpeed,
    extraMoveSpeed
  };
}
function applyEffect(stats, effect, sourceLabel = '진화') {
  const out = { ...stats };
  if (effect.critStat) { out.critStat = (out.critStat || 0) + effect.critStat; out.statCritRate = critRateFromStat(out.critStat); out.critRate += critRateFromStat(effect.critStat); }
  if (effect.swiftStat) { out.swiftStat = (out.swiftStat || 0) + effect.swiftStat; out.swiftSpeedBonus = speedFromSwift(out.swiftStat || 0); out.attackSpeed = (out.baseMoveAttackSpeed || 114) + out.swiftSpeedBonus + (out.enlightenmentAttackSpeed || 0) + (out.arkGridAttackSpeed || 0) + (out.extraAttackSpeed || 0); out.moveSpeed = (out.baseMoveAttackSpeed || 114) + out.swiftSpeedBonus + (out.enlightenmentMoveSpeed || 0) + (out.arkGridMoveSpeed || 0) + (out.extraMoveSpeed || 0); out.moveAttackSpeed = Math.min(out.attackSpeed, out.moveSpeed); }
  if (effect.critRate) out.critRate += effect.critRate;
  if (effect.critDamage) out.critDamage += effect.critDamage;
  if (effect.critHitDamage) {
    out.critHitDamage = (out.critHitDamage || 0) + effect.critHitDamage;
    out.critHitDamageSources = [...(out.critHitDamageSources || []), { label: sourceLabel, value: effect.critHitDamage }];
  }
  if (effect.evolutionDamage) out.evolutionDamage += effect.evolutionDamage;
  if (effect.cooldownReduction && !isCooldownExcluded()) out.cooldownReduction = (out.cooldownReduction || 0) + effect.cooldownReduction;
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
  // v4.8.8: 쿨감의 이론 DPS 증가분을 사용자가 입력한 '주력기 딜 지분'만큼 반영.
  // 쿨감 효과 제외 체크 시 끝마/무마/최적화 훈련 등 모든 cooldownReduction은 점수에서 0으로 처리.
  const cooldownExcluded = isCooldownExcluded();
  const cooldownReduction = cooldownExcluded ? 0 : Math.max(0, Math.min(Number(stats.cooldownReduction || 0), 95));
  const mainSkillDamageSharePct = cooldownExcluded ? 0 : Math.max(0, Math.min(Number($('mainSkillDamageShare')?.value ?? 60), 100));
  const cooldownRatio = mainSkillDamageSharePct / 100;
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
  pushTotal('치명타 적중 주피', state.enlightenment.critHitDamage);
  pushTotal('진피', state.enlightenment.evolutionDamage);
  pushTotal('추피', state.enlightenment.additionalDamage);
  pushTotal('적주피', state.enlightenment.enemyDamage);
  const totalLine = totals.length ? `<div class="enlightenmentDetailTotal"><strong>깨달음 합계</strong><em>${escapeHtml(totals.join(' / '))}</em></div>` : '';
  return `<details class="enlightenmentDetails"><summary>깨달음 적용 내역 / 중복 확인</summary><div class="enlightenmentDetailBody">${rows.join('')}${totalLine}<p>같은 깨달음 효과 안에서 RAW·Tooltip·Description 반복 문장은 가장 큰 유효값 1개만 반영합니다. v4.8.1부터 API Name이 '깨달음'인 항목만 깨달음으로 반영합니다. 도약/진화 항목은 깨달음 계산에서 제외합니다.</p></div></details>`;
}



function arkGridAppliedDetailHtml() {
  const rows = [];
  for (const item of state.arkGrid.items || []) {
    const eff = item?.effects || {};
    const parts = [];
    const push = (label, key) => {
      const value = Number(eff?.[key] || 0);
      if (Number.isFinite(value) && Math.abs(value) > 0.0001) parts.push(`${label} ${pct(value)}`);
    };
    push('치적', 'critRate');
    push('치피', 'critDamage');
    push('추피', 'additionalDamage');
    push('적주피', 'enemyDamage');
    push('공속', 'attackSpeed');
    push('이속', 'moveSpeed');
    if (parts.length) rows.push(`<div class="appliedItem"><b>${escapeHtml(item.name || '아크그리드')}</b><span>${escapeHtml(parts.join(' · '))}</span></div>`);
  }
  return rows.length ? `<div class="appliedDetail"><h4>아크그리드 API 적용값</h4>${rows.join('')}</div>` : '';
}

function engravingAppliedDetailHtml() {
  const stoneItems = state.abilityStone?.items || [];
  const engravingItems = state.engraving?.items || [];
  const rows = [];
  for (const item of stoneItems) {
    const parts = [];
    for (const e of item.engravings || []) parts.push(`${e.name} Lv.${e.level}`);
    if (Number(item.attackPower || 0)) parts.push(`기본 공격력 ${pct(item.attackPower)}`);
    if (parts.length) rows.push(`<div class="enlightenmentDetailLine"><b>${escapeHtml(item.name || '어빌리티 스톤')}</b><span>${escapeHtml(parts.join(' / '))}</span></div>`);
  }
  if (engravingItems.length) {
    rows.push(`<div class="enlightenmentDetailLine"><b>각인서/API</b><span>${escapeHtml(engravingItems.map(e => `${e.name} ${e.grade ? '[' + e.grade + '] ' : ''}${Number.isFinite(Number(e.bookLevel)) ? (e.bookLevel * 5) + '장 Lv.' + e.bookLevel : 'Lv.' + (e.level ?? 0)}`).join(' / '))}</span></div>`);
  }
  const eff = state.engraving?.effects || {};
  const effParts = [];
  if (Number(eff.critRate || 0)) effParts.push(`치적 ${pct(eff.critRate)}`);
  if (Number(eff.critDamage || 0)) effParts.push(`치피 ${pct(eff.critDamage)}`);
  if (Number(eff.additionalDamage || 0)) effParts.push(`추피 ${pct(eff.additionalDamage)}`);
  if (Number(eff.enemyDamage || 0)) effParts.push(`적주피 ${pct(eff.enemyDamage)}`);
  if (Number(eff.attackPower || 0)) effParts.push(`공격력 ${pct(eff.attackPower)}`);
  if (Number(eff.conditionalDamage || 0)) effParts.push(`조건부 피해 ${pct(eff.conditionalDamage)}`);
  const adr = state.engraving?.adrenaline || {};
  if (adr.adopted) effParts.push(`아드레날린 치적 ${pct(adr.critRate || 0)}`, `아드레날린 공격력 ${pct(adr.attackPower || 0)}`);
  if (effParts.length) rows.push(`<div class="enlightenmentDetailLine"><b>각인서 효과 파싱값</b><span>${escapeHtml(effParts.join(' / '))}</span></div>`);
  const stoneEff = state.abilityStone?.effects || {};
  const stoneEffParts = [];
  if (stoneEff.critRate) stoneEffParts.push(`치적 +${fmt(stoneEff.critRate)}%`);
  if (stoneEff.critDamage) stoneEffParts.push(`치피 +${fmt(stoneEff.critDamage)}%`);
  if (stoneEff.additionalDamage) stoneEffParts.push(`추피 +${fmt(stoneEff.additionalDamage)}%`);
  if (stoneEff.enemyDamage) stoneEffParts.push(`적주피 +${fmt(stoneEff.enemyDamage)}%`);
  if (stoneEff.attackPower) stoneEffParts.push(`공격력 +${fmt(stoneEff.attackPower)}%`);
  if (stoneEff.conditionalDamage) stoneEffParts.push(`조건부 피해 +${fmt(stoneEff.conditionalDamage)}%`);
  if (stoneEffParts.length) rows.push(`<div class="enlightenmentDetailLine"><b>스톤 각인 보너스</b><span>${escapeHtml(stoneEffParts.join(' / '))}</span></div>`);
  if (!rows.length) return `<details class="enlightenmentDetails"><summary>어빌리티 스톤 / 각인서 적용 내역</summary><div class="enlightenmentDetailBody"><div class="enlightenmentDetailLine muted"><span>API에서 파싱된 어빌리티 스톤/각인서 효과가 없습니다.</span></div></div></details>`;
  return `<details class="enlightenmentDetails" open><summary>어빌리티 스톤 / 각인서 적용 내역</summary><div class="enlightenmentDetailBody">${rows.join('')}</div></details>`;
}

function buildSourceSummary(current) {
  const base = getBaseStats();
  const critEvolution = [];
  const critDamageEvolution = [];
  const critHitEvolution = [];
  const evoEvolution = [];
  const addEvolution = [];
  const enemyEvolution = [];
  for (const row of selectedEntries()) {
    if (row.name === '치명' || row.name === '신속') continue;
    const eff = getLevelEffect(row.name, row.level);
    const label = `[진화] ${row.name} (Lv.${row.level})`;
    if (eff.critRate) critEvolution.push(sourceLine(label, eff.critRate));
    if (eff.critDamage) critDamageEvolution.push(sourceLine(label, eff.critDamage));
    if (eff.critHitDamage) critHitEvolution.push(sourceLine(label + ' 치명타 적중 주피', eff.critHitDamage));
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
  if (state.arkGrid.critRate) critLines.push(sourceLine('아크그리드', state.arkGrid.critRate));
  if (state.engraving?.effects?.critRate) critLines.push(sourceLine('각인서/API', state.engraving.effects.critRate));
  if (state.abilityStone?.effects?.critRate) critLines.push(sourceLine('어빌리티 스톤 각인 보너스', state.abilityStone.effects.critRate));
  if (base.dynamicEnlightenmentCritRate) critLines.push(sourceLine('깨달음 · 기민함', base.dynamicEnlightenmentCritRate));
  if (base.extraCritRate) critLines.push(sourceLine('추가 입력', base.extraCritRate));
  critLines.push(...critEvolution);

  const critDamageLines = [sourceLine('기본 치명타 피해', 200)];
  if (state.accessory.critDamage) critDamageLines.push(sourceLine('악세', state.accessory.critDamage));
  if (state.bracelet.critDamage) critDamageLines.push(sourceLine('팔찌', state.bracelet.critDamage));
  if (state.enlightenment.critDamage) critDamageLines.push(sourceLine('깨달음', state.enlightenment.critDamage));
  if (state.arkGrid.critDamage) critDamageLines.push(sourceLine('아크그리드', state.arkGrid.critDamage));
  if (state.engraving?.effects?.critDamage) critDamageLines.push(sourceLine('각인서/API', state.engraving.effects.critDamage));
  if (state.abilityStone?.effects?.critDamage) critDamageLines.push(sourceLine('어빌리티 스톤 각인 보너스', state.abilityStone.effects.critDamage));
  if (base.dynamicEnlightenmentCritDamage) critDamageLines.push(sourceLine('깨달음 · 기민함', base.dynamicEnlightenmentCritDamage));
  if (base.extraCritDamage) critDamageLines.push(sourceLine('추가 입력', base.extraCritDamage));
  critDamageLines.push(...critDamageEvolution);

  const critHitLines = [];
  for (const src of current.stats.critHitDamageSources || []) critHitLines.push(sourceLine(src.label || '치명타 적중 주피', Number(src.value || 0)));
  critHitLines.push(...critHitEvolution);
  if (!critHitLines.length && current.stats.critHitDamage) critHitLines.push(sourceLine('치명타 적중 주피', current.stats.critHitDamage));

  const evoLines = [];
  if (state.enlightenment.evolutionDamage) evoLines.push(sourceLine('깨달음', state.enlightenment.evolutionDamage));
  if (base.extraEvolutionDamage) evoLines.push(sourceLine('추가 입력', base.extraEvolutionDamage));
  evoLines.push(...evoEvolution);

  const addLines = [];
  if (state.accessory.additionalDamage) addLines.push(sourceLine('악세', state.accessory.additionalDamage));
  if (state.bracelet.additionalDamage) addLines.push(sourceLine('팔찌', state.bracelet.additionalDamage));
  if (state.enlightenment.additionalDamage) addLines.push(sourceLine('깨달음', state.enlightenment.additionalDamage));
  if (state.arkGrid.additionalDamage) addLines.push(sourceLine('아크그리드', state.arkGrid.additionalDamage));
  if (state.engraving?.effects?.additionalDamage) addLines.push(sourceLine('각인서/API', state.engraving.effects.additionalDamage));
  if (state.abilityStone?.effects?.additionalDamage) addLines.push(sourceLine('어빌리티 스톤 각인 보너스', state.abilityStone.effects.additionalDamage));
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
  if (base.arkGridAttackSpeed) attackSpeedLines.push(sourceLine('아크그리드', base.arkGridAttackSpeed));
  if (base.arkGridMoveSpeed) moveSpeedLines.push(sourceLine('아크그리드', base.arkGridMoveSpeed));
  if (base.extraAttackSpeed) attackSpeedLines.push(sourceLine('추가 입력', base.extraAttackSpeed));
  if (base.extraMoveSpeed) moveSpeedLines.push(sourceLine('추가 입력', base.extraMoveSpeed));

  const enemyLines = [];
  if (state.accessory.enemyDamage) enemyLines.push(sourceLine('악세', state.accessory.enemyDamage));
  if (state.bracelet.enemyDamage) enemyLines.push(sourceLine('팔찌', state.bracelet.enemyDamage));
  if (state.enlightenment.enemyDamage) enemyLines.push(sourceLine('깨달음', state.enlightenment.enemyDamage));
  if (state.arkGrid.enemyDamage) enemyLines.push(sourceLine('아크그리드', state.arkGrid.enemyDamage));
  if (state.engraving?.effects?.enemyDamage) enemyLines.push(sourceLine('각인서/API', state.engraving.effects.enemyDamage));
  if (state.abilityStone?.effects?.enemyDamage) enemyLines.push(sourceLine('어빌리티 스톤 각인 보너스', state.abilityStone.effects.enemyDamage));
  if (base.extraEnemyDamage) enemyLines.push(sourceLine('추가 입력', base.extraEnemyDamage));
  if (base.backAttackEnemyDamage) enemyLines.push(sourceLine('백어택', base.backAttackEnemyDamage));
  enemyLines.push(...enemyEvolution);

  const attackPowerLines = [];
  if (base.adrenalineAttackPower) attackPowerLines.push(sourceLine('아드레날린', base.adrenalineAttackPower));
  if (state.abilityStone?.attackPower) attackPowerLines.push(sourceLine('어빌리티 스톤', state.abilityStone.attackPower, '기본 공격력 보너스'));
  if (state.abilityStone?.effects?.attackPower) attackPowerLines.push(sourceLine('어빌리티 스톤 각인 보너스', state.abilityStone.effects.attackPower));
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
    ${arkGridAppliedDetailHtml()}
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
function tier5NameFromSelection(selection) {
  const entry = selectedEntries(selection || {}).find(row => Number(row.tier) === 5);
  return entry?.name || '';
}
function shortNodeName(name) {
  const map = {
    '끝없는 마나': '끝마',
    '금단의 주문': '금주',
    '무한한 마력': '무마',
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

function isManaShortageBonusEnabled() {
  return Boolean($('manaShortageClass')?.checked) && !Boolean($('noManaMainSkill')?.checked);
}
function manaStabilityBonusFromSelection(selection = state.selected) {
  if (!isManaShortageBonusEnabled()) return 0;
  const table = {
    '끝없는 마나': { 1: 0.5, 2: 1.0 },
    '금단의 주문': { 1: 0.3, 2: 0.6 },
    '무한한 마력': { 1: 0.4, 2: 0.8 }
  };
  let bonus = 0;
  for (const [name, levels] of Object.entries(table)) {
    const lv = Math.max(0, Math.min(Number(selection?.[name]?.level || 0), 2));
    bonus += Number(levels[lv] || 0);
  }
  return bonus;
}
function candidateMemo(fourNames, fiveName, calc, singleHitPenalty = false, critOverPenalty = 0, critLowPenalty = 0, manaStabilityBonus = 0) {
  const current4 = currentTierNames(4);
  const current5 = currentTierNames(5).join(' + ') || '-';
  const bits = [];
  if (sameNameSet(fourNames, current4) && fiveName === current5) bits.push('현재 조합');
  else bits.push(`${tier4PairLabel(fourNames)} / ${fiveName}`);
  if (calc?.result?.convertedEvolutionDamage > 0) bits.push(`뭉가 전환 ${fmt(calc.result.convertedEvolutionDamage)}%(기본 포함 총 ${fmt(calc.result.convertedEvolutionDamage + 15)}%)`);
  if (singleHitPenalty) bits.push('주력기 단타 보정 -2.5%(추천만)');
  if (Boolean($('excludeCooldown')?.checked) && (calc?.result?.cooldownReduction || 0) === 0) bits.push('쿨감 제외');
  if (critLowPenalty > 0) bits.push(`치적 95% 이하 보정 -${fmt(critLowPenalty)}%(추천만)`);
  if (critOverPenalty > 0) bits.push(`치적 초과 보정 -${fmt(critOverPenalty)}%(추천만)`);
  if (manaStabilityBonus > 0) bits.push(`마나 안정성 +${fmt(manaStabilityBonus)}% 보정`);
  if (calc?.result?.sonicBreakEvolutionDamage > 0) bits.push(`음속 ${fmt(calc.result.sonicBreakEvolutionDamage)}%`);
  return bits.join(' / ');
}
function recommendationAdjustmentFor(fiveName, calc, singleHitPenaltyEnabled, selection = state.selected) {
  let multiplier = 1;
  const details = { singleHitPenalty: false, critOverPenalty: 0, critLowPenalty: 0, manaStabilityBonus: 0 };
  if (singleHitPenaltyEnabled && fiveName === '뭉툭한 가시') {
    multiplier *= 0.975;
    details.singleHitPenalty = true;
  }

  const finalCritRate = Number(calc?.result?.critRate || 0);

  // v4.9.4 추천 보정:
  // 1) 최종 치적 95% 이하이면 추천값 -0.5% 고정 보정.
  // 2) 일반 조합은 치적 100% 초과분 1%p당 추천값 -0.5% 보정.
  // 3) 뭉툭한 가시는 치적 120% 초과분 1%p당 추천값 -0.5% 보정.
  if (finalCritRate <= 95) {
    multiplier *= 0.995;
    details.critLowPenalty = 0.5;
  }
  {
    const critCap = fiveName === '뭉툭한 가시' ? 120 : 100;
    const overCrit = Math.max(0, finalCritRate - critCap);
    const penalty = overCrit * 0.5;
    if (penalty > 0) {
      multiplier *= Math.max(0, 1 - penalty / 100);
      details.critOverPenalty = penalty;
    }
  }
  const manaBonus = manaStabilityBonusFromSelection(selection);
  if (manaBonus > 0) {
    multiplier *= (1 + manaBonus / 100);
    details.manaStabilityBonus = manaBonus;
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
  if (c.critLowPenalty > 0) notes.push(`치적 95% 이하 -${fmt(c.critLowPenalty)}% 추천보정`);
  if (c.critOverPenalty > 0) notes.push(`치적초과 -${fmt(c.critOverPenalty)}% 추천보정`);
  if (c.manaStabilityBonus > 0) notes.push(`마나 안정성 +${fmt(c.manaStabilityBonus)}% 보정`);
  if (c.penaltyApplied) notes.push('단타 -2.5% 추천보정');
  return notes.length ? `<div class="penaltyNote">${escapeHtml(notes.join(' · '))}</div>` : '';
}
function calculateAndRender() {
  const current = statsWithSelection(state.selected);
  const apiBase = statsWithSelection(Object.keys(state.apiSelected || {}).length ? state.apiSelected : state.selected);
  renderCombatStats(current);
  renderKeenEfficiency(current);
  const apiSelectionForBaseline = Object.keys(state.apiSelected || {}).length ? state.apiSelected : state.selected;
  const apiFiveName = tier5NameFromSelection(apiSelectionForBaseline);
  const currentFiveName = tier5NameFromSelection(state.selected);
  // API 기준값에도 추천 후보와 동일한 치적 보정/마나 안정성 보정을 적용해야 API 대비가 비대칭으로 뜨지 않습니다.
  // 단타 주력기 보정은 사용자가 후보 선별용으로 켜는 추천 전용 보정이므로 API/현재 기준값에는 적용하지 않습니다.
  const apiBaseAdjustment = recommendationAdjustmentFor(apiFiveName, apiBase, false, apiSelectionForBaseline);
  const currentAdjustment = recommendationAdjustmentFor(currentFiveName, current, false, state.selected);
  const apiBaseAdjustedValue = apiBaseAdjustment.value || Number(apiBase.result.value || 0);
  const currentAdjustedValue = currentAdjustment.value || Number(current.result.value || 0);
  const apiManaStabilityBonus = apiBaseAdjustment.manaStabilityBonus || 0;
  const currentManaStabilityBonus = currentAdjustment.manaStabilityBonus || 0;
  const baseValue = apiBaseAdjustedValue || currentAdjustedValue || current.result.value || 1;
  const currentDiff = ((currentAdjustedValue / baseValue) - 1) * 100;
  const candidates = [];
  const noManaMainSkill = Boolean($('noManaMainSkill')?.checked);
  const excludeCooldown = isCooldownExcluded();
  const shareInput = $('mainSkillDamageShare');
  const shareControl = document.querySelector('.shareControl');
  if (shareInput) {
    shareInput.disabled = excludeCooldown;
    shareInput.dataset.effectiveValue = excludeCooldown ? '0' : String(Math.max(0, Math.min(Number(shareInput.value || 60), 100)));
  }
  if (shareControl) shareControl.classList.toggle('disabled', excludeCooldown);
  const singleHitPenaltyEnabled = Boolean($('singleHitMainSkill')?.checked);

  // 딜러 추천 규칙: 축복의 여신은 항상 제외. 한계 돌파만 Lv.3 가능하며 DB maxLevel을 그대로 사용.
  const tier2Options = allOptions(2).filter(name => {
    if (!getNode(name) || name === '축복의 여신') return false;
    if (excludeCooldown && hasCooldownEffect(name)) return false;
    if (noManaMainSkill && ['끝없는 마나', '금단의 주문', '무한한 마력'].includes(name)) return false;
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
        if (excludeCooldown && hasCooldownCandidate(tier2Entries, fourNames, fiveName)) continue;
        const fiveNode = getNode(fiveName);
        const fiveLevel = fiveNode?.maxLevel || 2;
        // 추천 계산에서 현재 2/4/5티어만 제거하고 후보 조합을 삽입. 1/3티어와 입력값은 유지.
        const next = selectionWithoutTiers(state.selected, [2, 4, 5]);
        for (const e of tier2Entries) next[e.name] = { level: e.level, source: 'candidate' };
        for (const fourName of fourNames) next[fourName] = { level: fourLevel, source: 'candidate' };
        next[fiveName] = { level: fiveLevel, source: 'candidate' };
        const calc = statsWithSelection(next);
        const adjustment = recommendationAdjustmentFor(fiveName, calc, singleHitPenaltyEnabled, next);
        const recValue = adjustment.value;
        candidates.push({
          tier2Entries, fourNames, fourLevel, fiveName, fiveLevel, calc, recValue,
          penaltyApplied: adjustment.singleHitPenalty,
          critOverPenalty: adjustment.critOverPenalty,
          critLowPenalty: adjustment.critLowPenalty,
          manaStabilityBonus: adjustment.manaStabilityBonus,
          diff: ((recValue / baseValue) - 1) * 100
        });
      }
    }
  }
  candidates.sort((a, b) => b.recValue - a.recValue);
  const top = candidates.slice(0, 5);
  const currentDiffText = `${currentDiff >= 0 ? '+' : ''}${currentDiff.toFixed(2)}%`;
  const apiAdjustParts = [];
  if (apiBaseAdjustment.critLowPenalty > 0) apiAdjustParts.push(`치적 95% 이하 -${fmt(apiBaseAdjustment.critLowPenalty)}%`);
  if (apiBaseAdjustment.critOverPenalty > 0) apiAdjustParts.push(`치적초과 -${fmt(apiBaseAdjustment.critOverPenalty)}%`);
  if (apiBaseAdjustment.manaStabilityBonus > 0) apiAdjustParts.push(`마나 안정성 +${fmt(apiBaseAdjustment.manaStabilityBonus)}%`);
  const currentAdjustParts = [];
  if (currentAdjustment.critLowPenalty > 0) currentAdjustParts.push(`치적 95% 이하 -${fmt(currentAdjustment.critLowPenalty)}%`);
  if (currentAdjustment.critOverPenalty > 0) currentAdjustParts.push(`치적초과 -${fmt(currentAdjustment.critOverPenalty)}%`);
  if (currentAdjustment.manaStabilityBonus > 0) currentAdjustParts.push(`마나 안정성 +${fmt(currentAdjustment.manaStabilityBonus)}%`);
  const apiManaLabel = apiAdjustParts.length ? `<small>이론 ${apiBase.result.value.toFixed(4)} · ${escapeHtml(apiAdjustParts.join(' · '))}</small>` : '';
  const currentManaLabel = currentAdjustParts.length ? `<small>이론 ${current.result.value.toFixed(4)} · ${escapeHtml(currentAdjustParts.join(' · '))}</small>` : '';
  $('currentScore').innerHTML = `<div class="apiBaselineRow">
    <div><span>API 원본 기대값</span><b>${apiBaseAdjustedValue.toFixed(4)}</b>${apiManaLabel}</div>
    <div><span>현재 화면 선택값</span><b>${currentAdjustedValue.toFixed(4)}</b>${currentManaLabel}</div>
    <div><span>현재 대비</span><b class="${currentDiff >= 0 ? 'up' : 'down'}">${currentDiffText}</b></div>
    <p>비교 기준은 API가 읽어온 원본 아크패시브 기대값으로 고정됩니다. 치적 95% 이하/초과 보정과 마나 부족 직업 보정은 API 기준값과 추천 후보에 동일하게 적용됩니다.${singleHitPenaltyEnabled ? ' 뭉가 후보는 추가로 추천점수만 -2.5% 적용됩니다.' : ''}</p>
  </div>`;
  const apiDetailParts = [];
  if (apiBaseAdjustment.critLowPenalty > 0) apiDetailParts.push(`치적 95% 이하 -${fmt(apiBaseAdjustment.critLowPenalty)}%`);
  if (apiBaseAdjustment.critOverPenalty > 0) apiDetailParts.push(`치적초과 -${fmt(apiBaseAdjustment.critOverPenalty)}%`);
  if (apiBaseAdjustment.manaStabilityBonus > 0) apiDetailParts.push(`마나 안정성 +${fmt(apiBaseAdjustment.manaStabilityBonus)}%`);
  const apiManaDetail = apiDetailParts.length ? ` · ${escapeHtml(apiDetailParts.join(' · '))}` : '';
  $('baseInfo').innerHTML = `<b>API 기준 상세</b><span>치명 ${Math.round(apiBase.stats.critStat || 0)} · 최종치적 ${fmt(apiBase.result.critRate)}% · 치피 ${fmt(apiBase.result.critDamage)}% · 치적주피 ${fmt(apiBase.result.critHitDamage)}% · 진피 ${fmt(apiBase.result.evo)}% · 추피 ${fmt(apiBase.result.additionalDamage)}% · 적주피 ${fmt(apiBase.result.enemyDamage)}% · 공증 ${fmt(apiBase.result.attackPower)}%${apiManaDetail}</span>`;
  $('recommendList').innerHTML = top.length ? `<div class="comboRows">${top.map((c, i) => {
    const cls = c.diff >= 0 ? 'up' : 'down';
    const memo = candidateMemo(c.fourNames, c.fiveName, c.calc, c.penaltyApplied, c.critOverPenalty, c.critLowPenalty, c.manaStabilityBonus);
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
        <div class="rowMetric"><span>추천값</span><b>${c.recValue.toFixed(4)}</b>${(c.penaltyApplied || c.critOverPenalty > 0 || c.critLowPenalty > 0 || c.manaStabilityBonus > 0) ? `<small>이론 ${c.calc.result.value.toFixed(4)}</small>` : ''}</div>
        <div class="rowMetric"><span>API 대비</span><b class="${cls}">${pct(c.diff)}</b></div>
        <div class="rowMetric"><span>치적</span><b>${fmt(c.calc.result.critRate)}%</b></div>
      </div>
    </article>`;
  }).join('')}</div>` : `<div class="emptyNotice">추천 가능한 2/4/5티어 조합이 없습니다. 쿨감 효과 제외 상태에서는 끝없는 마나/최적화 훈련 등 쿨감 노드가 추천 후보에서 제거됩니다.</div>`;
}

async function loadDb() {
  state.evolution = await fetch('/data/evolution.json').then(r => r.json());
  state.index = buildIndex(state.evolution);
  state.selected = defaultSelection();
  state.apiSelected = JSON.parse(JSON.stringify(state.selected));
  renderEvolutionTiers();
  calculateAndRender();
}

function syncAdrenalineControlsFromEngraving() {
  const adr = state.engraving?.adrenaline || { adopted: false, critRate: 0, attackPower: 0 };
  if ($('adrenalineEnabled')) $('adrenalineEnabled').checked = !!adr.adopted;
  if ($('adrenalineCritRate')) $('adrenalineCritRate').value = adr.adopted ? fmt(adr.critRate || 0) : '20';
  if ($('adrenalineAttackPower')) $('adrenalineAttackPower').value = adr.adopted ? fmt(adr.attackPower || 0) : '5.4';
  updateAdrenalineReplacementVisibility();
}

function updateAdrenalineReplacementVisibility() {
  const wrap = $('adrenalineReplacementWrap');
  if (!wrap) return;
  const needsReplacement = !!$('adrenalineEnabled')?.checked && !state.engraving?.adrenaline?.adopted;
  wrap.classList.toggle('hidden', !needsReplacement);
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
  state.abilityStone = { attackPower: 0, effects: { critRate: 0, critDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0, conditionalDamage: 0 }, engravings: [], items: [] };
  state.engraving = emptyEngravingState();
  state.enlightenment = { critRate: 0, critDamage: 0, critHitDamage: 0, evolutionDamage: 0, enemyDamage: 0, additionalDamage: 0, attackSpeed: 0, moveSpeed: 0, items: [] };
  state.arkGrid = emptyArkGridState();
  renderEvolutionTiers();
  calculateAndRender();
  try {
    const res = await fetch(`/api/character?name=${encodeURIComponent(name)}&_=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || data.message || '검색 실패');
    if (!data.profile?.CharacterName) throw new Error('캐릭터 프로필을 가져오지 못했습니다.');
    state.accessory = data.accessoryEffects || { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
    state.bracelet = data.braceletEffects || { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
    state.abilityStone = data.abilityStoneEffects || { attackPower: 0, effects: { critRate: 0, critDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0, conditionalDamage: 0 }, engravings: [], items: [] };
    state.engraving = data.engravingEffects || emptyEngravingState();
    syncAdrenalineControlsFromEngraving();
    renderCharacter(data.profile);
    state.foundEffects = readEffects(data.arkPassive);
    state.enlightenment = extractEnlightenmentEffects(state.foundEffects);
    state.arkGrid = extractArkGridEffects(data.arkPassive);
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
['extraCritRate','extraCritDamage','extraEvolutionDamage','extraAdditionalDamage','extraEnemyDamage','extraAttackSpeed','extraMoveSpeed','adrenalineCritRate','adrenalineAttackPower','adrenalineReplacementDamage'].forEach(id => $(id).addEventListener('input', calculateAndRender));
$('adrenalineEnabled').addEventListener('change', () => { updateAdrenalineReplacementVisibility(); calculateAndRender(); });
$('critSynergyEnabled').addEventListener('change', calculateAndRender);
$('backAttackEnabled').addEventListener('change', calculateAndRender);
$('excludeCooldown')?.addEventListener('change', calculateAndRender);
$('noManaMainSkill')?.addEventListener('change', calculateAndRender);
$('manaShortageClass')?.addEventListener('change', calculateAndRender);
$('singleHitMainSkill')?.addEventListener('change', calculateAndRender);
$('mainSkillDamageShare')?.addEventListener('input', calculateAndRender);


const LOSTARK_JOBS = [
  '버서커','디스트로이어','워로드','홀리나이트','슬레이어','발키리',
  '배틀마스터','인파이터','기공사','창술사','스트라이커','브레이커',
  '데빌헌터','블래스터','호크아이','스카우터','건슬링어',
  '바드','서머너','아르카나','소서리스',
  '블레이드','데모닉','리퍼','소울이터',
  '도화가','기상술사','환수사','차원술사',
  '가디언나이트'
];

const LOSTARK_JOB_GROUPS = [
  { group: '전사', jobs: ['디스트로이어','발키리','버서커','슬레이어','워로드','홀리나이트'] },
  { group: '무도가', jobs: ['배틀마스터','인파이터','기공사','창술사','스트라이커','브레이커'] },
  { group: '헌터', jobs: ['데빌헌터','블래스터','호크아이','스카우터','건슬링어'] },
  { group: '마법사', jobs: ['바드','서머너','아르카나','소서리스'] },
  { group: '암살자', jobs: ['블레이드','데모닉','리퍼','소울이터'] },
  { group: '스페셜리스트', jobs: ['도화가','기상술사','환수사','차원술사'] },
  { group: '오리지널', jobs: ['가디언나이트'] }
];


function formatGold(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? `${n.toLocaleString('ko-KR')}G` : '-';
}

function setActiveTab(tabName) {
  document.querySelectorAll('.tabButton').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
  const isAvatar = tabName === 'legendAvatar';
  document.body.classList.toggle('avatarMode', isAvatar);
  document.querySelectorAll('.calcTabPanel').forEach(el => {
    el.classList.toggle('hiddenByTab', isAvatar);
    el.style.display = isAvatar ? 'none' : '';
  });
  const avatarPanel = $('legendAvatarPanel');
  if (avatarPanel) {
    avatarPanel.classList.toggle('hidden', !isAvatar);
    avatarPanel.classList.toggle('hiddenByTab', !isAvatar);
    avatarPanel.style.display = isAvatar ? '' : 'none';
  }
  if (isAvatar) prepareLegendAvatarTab();
}

let legendAvatarCache = new Map();
let selectedAvatarJob = null;
let legendAvatarLoading = false;

function initLegendAvatarTab() {
  renderAvatarJobPicker();
  document.querySelectorAll('.tabButton').forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));
  $('avatarSearchAllButton')?.addEventListener('click', () => prepareLegendAvatarTab());
  $('avatarRefreshButton')?.addEventListener('click', () => { if (selectedAvatarJob) loadLegendAvatarSet(selectedAvatarJob, true); });
}

function renderAvatarJobPicker() {
  const wrap = $('avatarJobPicker');
  if (!wrap) return;
  wrap.innerHTML = LOSTARK_JOB_GROUPS.map(group => `
    <div class="avatarJobRow">
      <div class="avatarJobGroupName">${escapeHtml(group.group)}</div>
      <div class="avatarJobButtonList">
        ${group.jobs.map(job => `<button type="button" class="avatarJobButton ${job === selectedAvatarJob ? 'active' : ''}" data-avatar-job="${escapeHtml(job)}">${escapeHtml(job)}</button>`).join('')}
      </div>
    </div>
  `).join('');
  wrap.querySelectorAll('[data-avatar-job]').forEach(btn => btn.addEventListener('click', () => selectAvatarJob(btn.dataset.avatarJob)));
}

function selectAvatarJob(job) {
  selectedAvatarJob = job || null;
  renderAvatarJobPicker();
  if (!selectedAvatarJob) return;
  loadLegendAvatarSet(selectedAvatarJob, false);
}

function setAvatarMessage(text, isError = false) {
  const el = $('avatarMessage');
  if (!el) return;
  if (!text) { el.classList.add('hidden'); el.textContent = ''; return; }
  el.classList.remove('hidden');
  el.classList.toggle('error', !!isError);
  el.textContent = text;
}

function prepareLegendAvatarTab() {
  setAvatarMessage('직업을 선택하면 해당 직업의 머리/상의/하의/무기 최저가를 조회합니다. 계산기 화면은 숨긴 상태로 분리 표시됩니다.');
  if ($('avatarResult')) $('avatarResult').innerHTML = `<div class="avatarEmptyBox">직업 버튼을 선택하세요.</div>`;
}

async function readJsonSafely(res) {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch {
    const preview = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
    throw new Error(preview || `서버 응답이 JSON 형식이 아닙니다. HTTP ${res.status}`);
  }
}

function avatarPartCard(part, item) {
  if (!item) {
    return `<article class="avatarPart missing"><div class="avatarThumb empty">?</div><div><b>${escapeHtml(part)}</b><span>매물 없음</span><small>현재 조회 범위에서 ${escapeHtml(part)} 부위를 찾지 못했습니다.</small></div></article>`;
  }
  const icon = item.icon ? `<img src="${escapeHtml(item.icon)}" alt="" loading="lazy" />` : `<span>${escapeHtml(part.slice(0, 1))}</span>`;
  return `<article class="avatarPart">
    <div class="avatarThumb">${icon}</div>
    <div class="avatarPartInfo">
      <b>${escapeHtml(part)}</b>
      <span>${formatGold(item.price)}</span>
      <small>${escapeHtml(item.name || '-')}</small>
    </div>
  </article>`;
}

function renderLegendAvatarResult(data) {
  const parts = data.parts || {};
  const order = ['머리', '상의', '하의', '무기'];
  const missing = order.filter(part => !parts[part]);
  $('avatarResult').innerHTML = `<div class="avatarTotalBox">
    <div>
      <span>${escapeHtml(data.job)} 전설 아바타 한 벌 최저가</span>
      <strong>${formatGold(data.totalPrice)}</strong>
      <small>${data.complete ? '머리/상의/하의/무기 모두 확인됨' : `미확인 부위: ${escapeHtml(missing.join(', '))}`}</small>
    </div>
    <div class="avatarScanInfo">조회 매물 ${Number(data.scanned || 0).toLocaleString('ko-KR')}개 · 상세 확인 ${Number(data.detailScanned || 0).toLocaleString('ko-KR')}개${data.cached ? ' · 캐시' : ''}</div>
  </div>
  <div class="avatarPartGrid">${order.map(part => avatarPartCard(part, parts[part])).join('')}</div>
  <p class="avatarNotice">현재 거래소 등록 매물의 최저가 기준입니다. 세트명은 섞일 수 있고, 각 부위별 최저가만 합산합니다.</p>`;
}

async function loadLegendAvatarSet(job, force = false) {
  if (!job) return prepareLegendAvatarTab();
  if (!force && legendAvatarCache.has(job)) {
    renderLegendAvatarResult(legendAvatarCache.get(job));
    setAvatarMessage(`${job} 전설 아바타 시세를 캐시에서 표시했습니다.`);
    return;
  }
  if (legendAvatarLoading) return;
  const mainButton = $('avatarSearchAllButton');
  const refreshButton = $('avatarRefreshButton');
  if (mainButton) mainButton.disabled = true;
  if (refreshButton) refreshButton.disabled = true;
  legendAvatarLoading = true;
  setAvatarMessage(`${job} 전설 아바타 시세를 부위별로 조회하는 중입니다.`);

  const order = ['머리', '상의', '하의', '무기'];
  const partial = {
    ok: true,
    apiVersion: '5.0.7',
    source: 'markets/items',
    mode: 'part-split',
    job,
    parts: { 머리: null, 상의: null, 하의: null, 무기: null },
    totalPrice: 0,
    complete: false,
    scanned: 0,
    detailScanned: 0,
    matchedCount: 0,
    matched: []
  };
  renderLegendAvatarResult(partial);

  try {
    const settled = await Promise.allSettled(order.map(async (part) => {
      const url = `/api/legend-avatars?job=${encodeURIComponent(job)}&part=${encodeURIComponent(part)}${force ? '&force=1' : ''}&_=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await readJsonSafely(res);
      if (!res.ok || !data?.ok) throw new Error(data?.error || data?.message || `${part} 조회 실패`);
      return { part, data };
    }));

    for (const row of settled) {
      if (row.status !== 'fulfilled') continue;
      const { part, data } = row.value;
      partial.parts[part] = data.item || data.parts?.[part] || null;
      partial.scanned += Number(data.scanned || 0);
      partial.detailScanned += Number(data.detailScanned || 0);
    }
    partial.totalPrice = Object.values(partial.parts).reduce((sum, item) => sum + Number(item?.price || 0), 0);
    partial.complete = order.every(part => !!partial.parts[part]);
    partial.matched = Object.values(partial.parts).filter(Boolean);
    partial.matchedCount = partial.matched.length;
    legendAvatarCache.set(job, partial);
    renderLegendAvatarResult(partial);

    const failed = settled.filter(x => x.status === 'rejected').length;
    setAvatarMessage(`${job} 조회 완료${partial.complete ? '' : ' · 일부 부위는 조회 범위에서 찾지 못했습니다.'}${failed ? ` · ${failed}개 부위 조회 실패` : ''}`, failed > 0);
  } catch (error) {
    setAvatarMessage(error.message, true);
  } finally {
    legendAvatarLoading = false;
    if (mainButton) mainButton.disabled = false;
    if (refreshButton) refreshButton.disabled = false;
  }
}

async function loadAllLegendAvatarSets(force = false, showJob = selectedAvatarJob) {
  return loadLegendAvatarSet(showJob, force);
}

async function searchLegendAvatarSet(job) {
  selectedAvatarJob = job || selectedAvatarJob;
  return loadLegendAvatarSet(selectedAvatarJob, false);
}



// v5.0.4 boot fix: 5.0.2에서 전설 아바타 코드가 뒤에 붙으면서 초기화 호출이 빠져
// 진화 DB가 로드되지 않고, 탭 버튼 이벤트도 연결되지 않았습니다.
// DOM 요소와 모든 함수가 정의된 뒤 한 번만 초기화합니다.
if (!window.__lostarkCalculatorBootedV506) {
  window.__lostarkCalculatorBootedV506 = true;
  initLegendAvatarTab();
  setActiveTab('calculator');
  loadDb().catch((error) => setMessage(error.message || '진화 노드 데이터를 불러오지 못했습니다.'));
}
