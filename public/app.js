const VERSION = '1.4.0';
const $ = (id) => document.getElementById(id);
const EVOLUTION_TIERS = [1, 2, 3, 4, 5];
const state = { evolution: null, index: new Map(), selected: {}, foundEffects: [] };

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
}
function stripHtml(v) {
  return String(v ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
function num(v, fallback = 0) {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}
function pct(v) { return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; }
function fmt(v) { return Number(v || 0).toFixed(2); }
function setMessage(text) {
  const el = $('message');
  if (!text) { el.classList.add('hidden'); el.textContent = ''; return; }
  el.classList.remove('hidden'); el.textContent = text;
}
function item(label, value) { return `<div class="cell"><b>${label}</b><span>${escapeHtml(value ?? '-')}</span></div>`; }
function getStat(profile, type) {
  const found = (profile?.Stats || []).find(s => s.Type === type);
  return found?.Value ?? '-';
}

function buildIndex(db) {
  const map = new Map();
  for (const [tier, names] of Object.entries(db?.tiers || {})) for (const name of names || []) map.set(name, Number(tier));
  for (const node of db?.nodes || []) map.set(node.name, Number(node.tier));
  return map;
}
function getNode(name) { return (state.evolution?.nodes || []).find(n => n.name === name); }
function getLevelEffect(name, level) { return getNode(name)?.levels?.[String(level)] || {}; }
function allOptions(tier) {
  const names = new Set(state.evolution?.tiers?.[String(tier)] || []);
  for (const node of state.evolution?.nodes || []) if (Number(node.tier) === Number(tier)) names.add(node.name);
  const selected = state.selected[tier]?.name;
  if (selected && !names.has(selected)) names.add(selected);
  return [...names];
}
function defaultSelection() {
  const selected = {};
  for (const tier of EVOLUTION_TIERS) selected[tier] = { name: '', level: 0, source: 'manual' };
  selected[5] = { name: '뭉툭한 가시', level: 2, source: 'default' };
  return selected;
}
function readEffects(arkPassive) {
  const effects = Array.isArray(arkPassive?.Effects) ? arkPassive.Effects : [];
  return effects.map((e, index) => ({
    index,
    name: e?.Name || '',
    level: Number(e?.Level || 0),
    description: stripHtml(e?.Description || ''),
    tooltip: stripHtml(e?.Tooltip || ''),
    raw: e
  })).filter(e => e.name);
}
function classifyEvolution(effects) {
  const selected = defaultSelection();
  for (const effect of effects) {
    const tier = state.index.get(effect.name);
    if (tier) selected[tier] = { name: effect.name, level: effect.level || 1, source: 'api' };
  }
  return selected;
}

function renderCharacter(profile) {
  const el = $('characterCard');
  const image = profile?.CharacterImage || '';
  el.innerHTML = `${image ? `<img src="${escapeHtml(image)}" alt="" />` : ''}<div><h2>${escapeHtml(profile?.CharacterName || '-')} / ${escapeHtml(profile?.CharacterClassName || '-')}</h2><p>서버 ${escapeHtml(profile?.ServerName || '-')} · 아이템 레벨 ${escapeHtml(profile?.ItemAvgLevel || '-')} · 전투력 ${escapeHtml(profile?.CombatPower || '-')}</p></div>`;
  el.classList.remove('hidden');
}
function renderSummary(profile, arkPassive) {
  const points = Array.isArray(arkPassive?.Points) ? arkPassive.Points : [];
  const point = (name) => points.find(p => p.Name === name)?.Value ?? '-';
  $('basicStatGrid').innerHTML = [
    item('직업', profile?.CharacterClassName), item('아이템 레벨', profile?.ItemAvgLevel), item('서버', profile?.ServerName),
    item('치명', getStat(profile, '치명')), item('신속', getStat(profile, '신속')), item('특화', getStat(profile, '특화')),
    item('진화 포인트', point('진화')), item('깨달음 포인트', point('깨달음')), item('도약 포인트', point('도약'))
  ].join('');
  $('summaryPanel').classList.remove('hidden');
  renderCombatStats();
}
function renderFoundEffects() {
  const rows = state.foundEffects.map(e => {
    const tier = state.index.get(e.name);
    const known = tier ? `진화 ${tier}티어 DB 매칭` : 'DB 미매칭 / 참고용';
    return `<div class="effect ${tier ? 'known' : ''}"><b>${escapeHtml(e.name)} Lv.${escapeHtml(e.level || '-')}</b><span>${known}</span>${e.description ? `<p>${escapeHtml(e.description)}</p>` : ''}</div>`;
  }).join('') || '<div class="effect"><b>검색된 노드 없음</b><span>API 응답에 ArkPassive Effects가 없거나 비활성 상태입니다.</span></div>';
  $('foundEffects').innerHTML = rows;
  $('foundPanel').classList.remove('hidden');
}
function renderEvolutionTiers() {
  const html = EVOLUTION_TIERS.map(tier => {
    const selected = state.selected[tier] || { name: '', level: 0 };
    const options = allOptions(tier);
    const optionHtml = [`<option value="">선택 없음</option>`, ...options.map(name => `<option value="${escapeHtml(name)}" ${name === selected.name ? 'selected' : ''}>${escapeHtml(name)}</option>`)].join('');
    const node = getNode(selected.name);
    const max = node?.maxLevel || Math.max(2, selected.level || 2);
    const levelHtml = Array.from({ length: max + 1 }, (_, i) => `<option value="${i}" ${i === Number(selected.level || 0) ? 'selected' : ''}>Lv.${i}</option>`).join('');
    const source = selected.source === 'api' ? '<em>검색됨</em>' : selected.source === 'default' ? '<em class="gray">기본값</em>' : '';
    return `<div class="tier ${tier === 5 ? 'mainTier' : ''}"><h4>${tier}티어 ${source}</h4><select data-tier="${tier}" data-field="name">${optionHtml}</select><select data-tier="${tier}" data-field="level">${levelHtml}</select>${selected.name ? `<p>${escapeHtml(node?.description || 'DB에 계산식이 없는 노드입니다. 선택값 표시는 가능하지만 계산 수치에는 반영되지 않습니다.')}</p>` : `<p class="empty">검색된 값 없음</p>`}</div>`;
  }).join('');
  $('evolutionTiers').innerHTML = `<div class="groupBox"><div class="tiers">${html}</div></div>`;
  $('evolutionTiers').querySelectorAll('select').forEach(sel => sel.addEventListener('change', onSelectionChange));
}
function onSelectionChange(event) {
  const el = event.target;
  const tier = Number(el.dataset.tier);
  const field = el.dataset.field;
  if (!state.selected[tier]) state.selected[tier] = { name: '', level: 0, source: 'manual' };
  state.selected[tier][field] = field === 'level' ? Number(el.value) : el.value;
  state.selected[tier].source = 'manual';
  if (field === 'name' && !el.value) state.selected[tier].level = 0;
  if (field === 'name' && el.value && !state.selected[tier].level) state.selected[tier].level = getNode(el.value)?.maxLevel || 1;
  renderEvolutionTiers();
  calculateAndRender();
}

function getBaseStats() {
  return {
    critRate: num($('baseCritRate').value),
    critDamage: num($('baseCritDamage').value, 200),
    evolutionDamage: num($('baseEvolutionDamage').value),
    additionalDamage: num($('baseAdditionalDamage').value),
    enemyDamage: num($('baseEnemyDamage').value),
    skillCritBonus: num($('skillCritBonus').value)
  };
}
function applyEffect(stats, effect) {
  const out = { ...stats };
  if (effect.critRate) out.critRate += effect.critRate;
  if (effect.critDamage) out.critDamage += effect.critDamage;
  if (effect.evolutionDamage) out.evolutionDamage += effect.evolutionDamage;
  if (effect.additionalDamage) out.additionalDamage += effect.additionalDamage;
  if (effect.enemyDamage) out.enemyDamage += effect.enemyDamage;
  if (effect.finalDamage) out.enemyDamage += effect.finalDamage;
  if (effect.critCap != null) out.critCap = effect.critCap;
  if (effect.overCritToEvolutionDamageRate) out.overCritToEvolutionDamageRate = effect.overCritToEvolutionDamageRate;
  if (effect.overCritEvolutionDamageCap != null) out.overCritEvolutionDamageCap = effect.overCritEvolutionDamageCap;
  return out;
}
function selectedEntries(selection = state.selected) {
  return EVOLUTION_TIERS.map(tier => ({ tier, ...(selection[tier] || {}) })).filter(row => row.name && row.level > 0);
}
function score(stats) {
  let critRate = stats.critRate + stats.skillCritBonus;
  let evo = stats.evolutionDamage;
  if (stats.critCap != null && critRate > stats.critCap) {
    const over = critRate - stats.critCap;
    const converted = Math.min(over * (stats.overCritToEvolutionDamageRate || 0), stats.overCritEvolutionDamageCap ?? Infinity);
    evo += converted;
    critRate = stats.critCap;
  }
  const critChance = Math.max(0, Math.min(critRate, 100)) / 100;
  const critMultiplier = 1 + critChance * ((stats.critDamage - 100) / 100);
  const evoMultiplier = 1 + evo / 100;
  const addMultiplier = 1 + stats.additionalDamage / 100;
  const enemyMultiplier = 1 + stats.enemyDamage / 100;
  return { value: critMultiplier * evoMultiplier * addMultiplier * enemyMultiplier, critRate, critDamage: stats.critDamage, evo, additionalDamage: stats.additionalDamage, enemyDamage: stats.enemyDamage, critMultiplier, evoMultiplier, addMultiplier, enemyMultiplier };
}
function statsWithSelection(baseStats, selection) {
  let s = { ...baseStats };
  for (const row of selectedEntries(selection)) s = applyEffect(s, getLevelEffect(row.name, row.level));
  const result = score(s);
  return { stats: s, result };
}
function cloneSelection() { return JSON.parse(JSON.stringify(state.selected)); }
function renderCombatStats(current = statsWithSelection(getBaseStats(), state.selected)) {
  $('combatStatGrid').innerHTML = [
    item('치명타 확률', `${fmt(current.result.critRate)}%`),
    item('치명타 피해', `${fmt(current.result.critDamage)}%`),
    item('진피', `${fmt(current.result.evo)}%`),
    item('추피', `${fmt(current.result.additionalDamage)}%`),
    item('적주피', `${fmt(current.result.enemyDamage)}%`),
    item('기대값 점수', current.result.value.toFixed(4))
  ].join('');
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
    next[5] = { name, level, source: 'candidate' };
    const calc = statsWithSelection(baseStats, next);
    candidates.push({ name, level, calc, diff: ((calc.result.value / baseValue) - 1) * 100 });
  }
  candidates.sort((a, b) => b.calc.result.value - a.calc.result.value);
  $('currentScore').innerHTML = `<strong>${current.result.value.toFixed(4)}</strong><span>현재 선택 노드 반영 기준</span>`;
  $('baseInfo').innerHTML = `현재 표시값: 치적 ${fmt(current.result.critRate)}%, 치피 ${fmt(current.result.critDamage)}%, 진피 ${fmt(current.result.evo)}%, 추피 ${fmt(current.result.additionalDamage)}%, 적주피 ${fmt(current.result.enemyDamage)}%`;
  $('recommendList').innerHTML = candidates.map((c, i) => {
    const cls = c.diff >= 0 ? 'up' : 'down';
    const currentMark = state.selected[5]?.name === c.name ? '<em>현재</em>' : '';
    return `<div class="recommend ${cls}"><div><b>${i + 1}. ${escapeHtml(c.name)} Lv.${c.level}</b>${currentMark}<small>점수 ${c.calc.result.value.toFixed(4)} · 치적 ${fmt(c.calc.result.critRate)}% · 진피 ${fmt(c.calc.result.evo)}%</small></div><strong>${pct(c.diff)}</strong></div>`;
  }).join('');
}

async function loadDb() {
  state.evolution = await fetch('/data/evolution.json').then(r => r.json());
  state.index = buildIndex(state.evolution);
  state.selected = defaultSelection();
  $('evolutionDbStatus').textContent = `${state.index.size}개 노드 / 진화 전용`;
  renderEvolutionTiers();
  calculateAndRender();
}
async function searchCharacter(name) {
  const button = $('searchButton');
  button.disabled = true; button.textContent = '검색...'; setMessage('');
  try {
    const res = await fetch(`/api/character?name=${encodeURIComponent(name)}`);
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || data.message || '검색 실패');
    renderCharacter(data.profile);
    state.foundEffects = readEffects(data.arkPassive);
    state.selected = classifyEvolution(state.foundEffects);
    renderSummary(data.profile, data.arkPassive);
    renderFoundEffects();
    renderEvolutionTiers();
    calculateAndRender();
  } catch (error) { setMessage(error.message); }
  finally { button.disabled = false; button.textContent = '검색'; }
}

$('searchForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('characterName').value.trim();
  if (!name) return setMessage('캐릭터명을 입력하세요.');
  searchCharacter(name);
});
['baseCritRate','baseCritDamage','baseEvolutionDamage','baseAdditionalDamage','baseEnemyDamage','skillCritBonus'].forEach(id => $(id).addEventListener('input', calculateAndRender));

await loadDb();
