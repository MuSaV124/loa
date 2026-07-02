const VERSION = '3.3.0';
const $ = (id) => document.getElementById(id);
const EVOLUTION_TIERS = [1, 2, 3, 4, 5];
const state = { evolution: null, index: new Map(), selected: {}, apiSelected: {}, foundEffects: [], profileStats: { crit: 0, swift: 0, spec: 0 }, accessory: { critRate: 0, critDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] }, bracelet: { critRate: 0, critDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] }, enlightenment: { critRate: 0, critDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] } };

function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m]); }
function stripHtml(v) { return String(v ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
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
function speedFromSwift(swiftStat) { return Number(swiftStat || 0) * 0.01717; }
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

function addMatchesTo(out, key, text, regexList) {
  const seen = new Set();
  for (const re of regexList) {
    let match;
    while ((match = re.exec(text)) !== null) {
      const value = Number(match[1] || 0);
      if (!Number.isFinite(value)) continue;
      const token = `${key}:${String(match[0]).replace(/\s+/g, ' ').trim()}:${match.index}`;
      if (seen.has(token)) continue;
      seen.add(token);
      out[key] += value;
    }
  }
}
function parsePercentEffectText(text) {
  const out = { critRate: 0, critDamage: 0, enemyDamage: 0, additionalDamage: 0 };
  const source = stripHtml(text);
  addMatchesTo(out, 'critRate', source, [
    /치명타\s*적중률(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /치명타\s*확률(?:이)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ]);
  addMatchesTo(out, 'critDamage', source, [
    /치명타\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ]);
  addMatchesTo(out, 'additionalDamage', source, [
    /추가\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ]);
  addMatchesTo(out, 'enemyDamage', source, [
    /(?<!무력화\s*상태의\s*)적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /공격이\s*치명타로\s*적중\s*시\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /백어택\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /헤드어택\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g,
    /방향성\s*공격이\s*아닌\s*스킬이\s*적에게\s*주는\s*피해(?:가)?\s*(?:\+)?(\d+(?:\.\d+)?)%\s*(?:증가)?/g
  ]);
  for (const key of Object.keys(out)) out[key] = Math.round(out[key] * 100) / 100;
  return out;
}
function hasAnyEffect(effects) {
  return ['critRate','critDamage','enemyDamage','additionalDamage'].some(k => Math.abs(Number(effects?.[k] || 0)) > 0);
}
function isKnownEvolutionEffect(effect) {
  const joined = normalizeNodeName(`${effect?.name || ''} ${effect?.description || ''} ${effect?.tooltip || ''}`);
  return (state.evolution?.nodes || []).some(node => effect?.name === node.name || joined.includes(node.name));
}
function extractEnlightenmentEffects(effects) {
  const result = { critRate: 0, critDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
  for (const effect of effects || []) {
    const rawText = stripHtml(JSON.stringify(effect?.raw || {}));
    const joined = `${effect.name || ''} ${effect.description || ''} ${effect.tooltip || ''} ${rawText}`;
    const isEnlightenment = joined.includes('깨달음');
    if (!isEnlightenment) continue;
    if (isKnownEvolutionEffect(effect)) continue;
    const parsed = parsePercentEffectText(joined);
    if (!hasAnyEffect(parsed)) continue;
    for (const key of ['critRate','critDamage','enemyDamage','additionalDamage']) result[key] += parsed[key];
    result.items.push({ name: effect.name || '깨달음 효과', level: effect.level || 0, effects: parsed });
  }
  for (const key of ['critRate','critDamage','enemyDamage','additionalDamage']) result[key] = Math.round(result[key] * 100) / 100;
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


function getBaseStats() {
  const selectedCritStat = tier1StatBonus('치명');
  const selectedSwiftStat = tier1StatBonus('신속');
  const critStat = num($('baseCritStat').value) + selectedCritStat;
  const swiftStat = num($('baseSwiftStat').value) + selectedSwiftStat;
  const statCritRate = critRateFromStat(critStat);
  const swiftSpeedBonus = $('includeSwiftSpeed').checked ? speedFromSwift(swiftStat) : 0;
  return {
    critStat,
    swiftStat,
    statCritRate,
    critRate: statCritRate + num(state.accessory.critRate) + num(state.bracelet.critRate) + num($('braceletCritRateManual').value) + num(state.enlightenment.critRate),
    critDamage: num($('baseCritDamage').value, 200) + num(state.accessory.critDamage) + num(state.bracelet.critDamage) + num($('braceletCritDamageManual').value) + num(state.enlightenment.critDamage),
    evolutionDamage: num($('baseEvolutionDamage').value),
    additionalDamage: num($('baseAdditionalDamage').value) + num(state.accessory.additionalDamage) + num(state.bracelet.additionalDamage) + num($('braceletAdditionalDamageManual').value) + num(state.enlightenment.additionalDamage),
    enemyDamage: num($('baseEnemyDamage').value) + num(state.accessory.enemyDamage) + num(state.bracelet.enemyDamage) + num($('braceletEnemyDamageManual').value) + num(state.enlightenment.enemyDamage),
    skillCritBonus: num($('skillCritBonus').value),
    adrenalineCritRate: $('adrenalineEnabled').checked ? num($('adrenalineCritRate').value) : 0,
    attackPower: $('adrenalineEnabled').checked ? num($('adrenalineAttackPower').value) : 0,
    moveAttackSpeed: num($('baseMoveAttackSpeed').value, 114) + swiftSpeedBonus
  };
}
function applyEffect(stats, effect) {
  const out = { ...stats };
  if (effect.critStat) { out.critStat = (out.critStat || 0) + effect.critStat; out.statCritRate = critRateFromStat(out.critStat); out.critRate += critRateFromStat(effect.critStat); }
  if (effect.swiftStat) { out.swiftStat = (out.swiftStat || 0) + effect.swiftStat; }
  if (effect.critRate) out.critRate += effect.critRate;
  if (effect.critDamage) out.critDamage += effect.critDamage;
  if (effect.evolutionDamage) out.evolutionDamage += effect.evolutionDamage;
  if (effect.additionalDamage) out.additionalDamage += effect.additionalDamage;
  if (effect.enemyDamage) out.enemyDamage += effect.enemyDamage;
  if (effect.finalDamage) out.enemyDamage += effect.finalDamage;
  if (effect.attackPower) out.attackPower = (out.attackPower || 0) + effect.attackPower;
  if (effect.speedBonus) out.moveAttackSpeed = (out.moveAttackSpeed || 0) + effect.speedBonus;
  if (effect.critCap != null) out.critCap = effect.critCap;
  if (effect.overCritToEvolutionDamageRate) out.overCritToEvolutionDamageRate = effect.overCritToEvolutionDamageRate;
  if (effect.overCritEvolutionDamageCap != null) out.overCritEvolutionDamageCap = effect.overCritEvolutionDamageCap;
  return out;
}
function selectedEntries(selection = state.selected) { return Object.entries(selection || {}).map(([name, data]) => ({ name, tier: getNode(name)?.tier, level: Number(data?.level || 0), source: data?.source })).filter(row => row.name && row.level > 0 && row.tier); }
function cloneSelection() { return JSON.parse(JSON.stringify(state.selected)); }
function score(stats) {
  const rawCritRate = stats.critRate + stats.skillCritBonus + (stats.adrenalineCritRate || 0);
  let effectiveCritRate = rawCritRate;
  let evo = stats.evolutionDamage;
  let overCrit = 0;
  let convertedEvolutionDamage = 0;
  if (stats.critCap != null && rawCritRate > stats.critCap) {
    overCrit = rawCritRate - stats.critCap;
    convertedEvolutionDamage = Math.min(overCrit * (stats.overCritToEvolutionDamageRate || 0), stats.overCritEvolutionDamageCap ?? Infinity);
    evo += convertedEvolutionDamage;
    effectiveCritRate = stats.critCap;
  }
  const critChance = Math.max(0, Math.min(effectiveCritRate, 100)) / 100;
  const critMultiplier = 1 + critChance * ((stats.critDamage - 100) / 100);
  const evoMultiplier = 1 + evo / 100;
  const addMultiplier = 1 + stats.additionalDamage / 100;
  const enemyMultiplier = 1 + stats.enemyDamage / 100;
  const attackMultiplier = 1 + (stats.attackPower || 0) / 100;
  return { value: critMultiplier * evoMultiplier * addMultiplier * enemyMultiplier * attackMultiplier, rawCritRate, critRate: rawCritRate, effectiveCritRate, critDamage: stats.critDamage, evo, baseEvo: stats.evolutionDamage, convertedEvolutionDamage, overCrit, additionalDamage: stats.additionalDamage, enemyDamage: stats.enemyDamage, attackPower: stats.attackPower || 0, moveAttackSpeed: stats.moveAttackSpeed || 0 };
}
function statsWithSelection(baseStats, selection) {
  let s = { ...baseStats };
  for (const row of selectedEntries(selection)) {
    if (row.name === '치명' || row.name === '신속') continue;
    s = applyEffect(s, getLevelEffect(row.name, row.level));
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
    if (eff.evolutionDamage) evoEvolution.push(sourceLine(label, eff.evolutionDamage));
    if (eff.additionalDamage) addEvolution.push(sourceLine(label, eff.additionalDamage));
    if (eff.enemyDamage || eff.finalDamage) enemyEvolution.push(sourceLine(label, Number(eff.enemyDamage || 0) + Number(eff.finalDamage || 0)));
  }
  if (current.result.convertedEvolutionDamage > 0) evoEvolution.push(sourceLine('[진화] 뭉가 전환', current.result.convertedEvolutionDamage, `80% 초과분 · 최대 75%`));
  const critLines = [sourceLine('치명 스탯', current.stats.statCritRate || 0, `치명 ${Math.round(current.stats.critStat || 0)}${getStatNodeLine('치명') ? ' · ' + getStatNodeLine('치명') : ''}`)];
  if (base.adrenalineCritRate) critLines.push(sourceLine('아드레날린', base.adrenalineCritRate));
  if (state.accessory.critRate) critLines.push(sourceLine('악세', state.accessory.critRate));
  if (state.bracelet.critRate) critLines.push(sourceLine('팔찌', state.bracelet.critRate));
  if (state.enlightenment.critRate) critLines.push(sourceLine('깨달음', state.enlightenment.critRate));
  if (num($('braceletCritRateManual').value)) critLines.push(sourceLine('팔찌 추가 보정', num($('braceletCritRateManual').value)));
  if (base.skillCritBonus) critLines.push(sourceLine('주력기 보정', base.skillCritBonus));
  critLines.push(...critEvolution);

  const critDamageLines = [sourceLine('기준 치명타 피해', num($('baseCritDamage').value, 200))];
  if (state.accessory.critDamage) critDamageLines.push(sourceLine('악세', state.accessory.critDamage));
  if (state.bracelet.critDamage) critDamageLines.push(sourceLine('팔찌', state.bracelet.critDamage));
  if (state.enlightenment.critDamage) critDamageLines.push(sourceLine('깨달음', state.enlightenment.critDamage));
  if (num($('braceletCritDamageManual').value)) critDamageLines.push(sourceLine('팔찌 추가 보정', num($('braceletCritDamageManual').value)));
  critDamageLines.push(...critDamageEvolution);

  const evoLines = [];
  if (num($('baseEvolutionDamage').value)) evoLines.push(sourceLine('기준 진피', num($('baseEvolutionDamage').value)));
  evoLines.push(...evoEvolution);

  const addLines = [];
  if (num($('baseAdditionalDamage').value)) addLines.push(sourceLine('기준 추피', num($('baseAdditionalDamage').value)));
  if (state.accessory.additionalDamage) addLines.push(sourceLine('악세', state.accessory.additionalDamage));
  if (state.bracelet.additionalDamage) addLines.push(sourceLine('팔찌', state.bracelet.additionalDamage));
  if (state.enlightenment.additionalDamage) addLines.push(sourceLine('깨달음', state.enlightenment.additionalDamage));
  if (num($('braceletAdditionalDamageManual').value)) addLines.push(sourceLine('팔찌 추가 보정', num($('braceletAdditionalDamageManual').value)));
  addLines.push(...addEvolution);

  const enemyLines = [];
  if (num($('baseEnemyDamage').value)) enemyLines.push(sourceLine('기준 적주피', num($('baseEnemyDamage').value)));
  if (state.accessory.enemyDamage) enemyLines.push(sourceLine('악세', state.accessory.enemyDamage));
  if (state.bracelet.enemyDamage) enemyLines.push(sourceLine('팔찌', state.bracelet.enemyDamage));
  if (state.enlightenment.enemyDamage) enemyLines.push(sourceLine('깨달음', state.enlightenment.enemyDamage));
  if (num($('braceletEnemyDamageManual').value)) enemyLines.push(sourceLine('팔찌 추가 보정', num($('braceletEnemyDamageManual').value)));
  enemyLines.push(...enemyEvolution);

  $('sourceSummary').innerHTML = `
    <div class="sourceTitle"><div><h3>치명타 소스 요약</h3><p>진화 노드를 바꾸면 아래 수치가 즉시 바뀝니다.</p></div><button id="resetViewButton" type="button">↻ 초기화</button></div>
    ${sourceGroup('치명타 확률', 'blue', critLines, current.result.critRate)}
    ${sourceGroup('치명타 피해', 'purple', critDamageLines, current.result.critDamage)}
    ${sourceGroup('진피', 'orange', evoLines, current.result.evo)}
    ${sourceGroup('추피', 'green', addLines, current.result.additionalDamage)}
    ${sourceGroup('적주피', 'pink', enemyLines, current.result.enemyDamage)}
    <div class="sourceFoot">뭉가 전환 진피는 <b>최대 75%</b>까지 적용됩니다.</div>
  `;
  const reset = $('resetViewButton');
  if (reset) reset.addEventListener('click', () => { state.selected = JSON.parse(JSON.stringify(state.apiSelected || {})); renderEvolutionTiers(); calculateAndRender(); });
}

function renderCombatStats(current = statsWithSelection(getBaseStats(), state.selected)) {
  buildSourceSummary(current);
}
function calculateAndRender() {
  const baseStats = getBaseStats();
  const current = statsWithSelection(baseStats, state.selected);
  renderCombatStats(current);
  const baseValue = current.result.value || 1;
  const candidates = [];
  for (const name of allOptions(5)) {
    const node = getNode(name);
    if (!node) continue;
    const level = node.maxLevel || 2;
    const next = cloneSelection();
    for (const opt of allOptions(5)) delete next[opt];
    next[name] = { level, source: 'candidate' };
    const calc = statsWithSelection(baseStats, next);
    candidates.push({ name, level, calc, diff: ((calc.result.value / baseValue) - 1) * 100 });
  }
  candidates.sort((a, b) => b.calc.result.value - a.calc.result.value);
  $('currentScore').innerHTML = `<strong>${current.result.value.toFixed(4)}</strong><span>현재 선택 노드 반영 기준</span>`;
  $('baseInfo').innerHTML = `치명 ${Math.round(current.stats.critStat || 0)} / 스탯치적 ${fmt(current.stats.statCritRate || 0)}%, 최종치적 ${fmt(current.result.critRate)}%, 치피 ${fmt(current.result.critDamage)}%, 진피 ${fmt(current.result.evo)}%, 추피 ${fmt(current.result.additionalDamage)}%, 적주피 ${fmt(current.result.enemyDamage)}%, 공증 ${fmt(current.result.attackPower)}%, 공이속 ${fmt(current.result.moveAttackSpeed)}%`;
  $('recommendList').innerHTML = candidates.map((c, i) => {
    const cls = c.diff >= 0 ? 'up' : 'down';
    const currentMark = state.selected[c.name]?.level > 0 ? '<em>현재</em>' : '';
    return `<div class="recommend ${cls}"><div><b>${i + 1}. ${escapeHtml(c.name)} Lv.${c.level}</b>${currentMark}<small>점수 ${c.calc.result.value.toFixed(4)}</small></div><strong>${pct(c.diff)}</strong></div>`;
  }).join('');
}

async function loadDb() {
  state.evolution = await fetch('/data/evolution.json').then(r => r.json());
  state.index = buildIndex(state.evolution);
  state.selected = defaultSelection();
  state.apiSelected = JSON.parse(JSON.stringify(state.selected));
  $('evolutionDbStatus').textContent = `${state.index.size}개 노드 / 진화 전용`;
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
  state.enlightenment = { critRate: 0, critDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
  renderEvolutionTiers();
  calculateAndRender();
  try {
    const res = await fetch(`/api/character?name=${encodeURIComponent(name)}&_=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || data.message || '검색 실패');
    if (!data.profile?.CharacterName) throw new Error('캐릭터 프로필을 가져오지 못했습니다.');
    state.accessory = data.accessoryEffects || { critRate: 0, critDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
    state.bracelet = data.braceletEffects || { critRate: 0, critDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
    // 팔찌는 API 자동 합산값(state.bracelet)으로 계산에 반영합니다.
    // 아래 수동 입력칸은 API에서 못 읽은 팔찌 옵션을 추가 보정할 때만 사용합니다.
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
['baseCritStat','baseSwiftStat','baseCritDamage','baseEvolutionDamage','baseAdditionalDamage','baseEnemyDamage','skillCritBonus','adrenalineCritRate','adrenalineAttackPower','braceletCritRateManual','braceletCritDamageManual','braceletAdditionalDamageManual','braceletEnemyDamageManual','baseMoveAttackSpeed'].forEach(id => $(id).addEventListener('input', calculateAndRender));
$('adrenalineEnabled').addEventListener('change', calculateAndRender);
$('includeSwiftSpeed').addEventListener('change', calculateAndRender);

await loadDb();
