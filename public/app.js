const VERSION = '2.1.0';
const $ = (id) => document.getElementById(id);
const EVOLUTION_TIERS = [1, 2, 3, 4, 5];
const state = { evolution: null, index: new Map(), selected: {}, foundEffects: [], accessory: { critRate: 0, critDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] }, bracelet: { critRate: 0, critDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] } };

function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m]); }
function stripHtml(v) { return String(v ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
function num(v, fallback = 0) { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : fallback; }
function pct(v) { return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; }
function fmt(v) { return Number(v || 0).toFixed(2); }
function item(label, value) { return `<div class="cell"><b>${label}</b><span>${escapeHtml(value ?? '-')}</span></div>`; }
function setMessage(text) { const el = $('message'); if (!text) { el.classList.add('hidden'); el.textContent = ''; return; } el.classList.remove('hidden'); el.textContent = text; }
function getStat(profile, type) { return (profile?.Stats || []).find(s => s.Type === type)?.Value ?? '-'; }

function parseProfileCombat(profile) {
  const out = { critRate: null };
  const stats = Array.isArray(profile?.Stats) ? profile.Stats : [];
  const crit = stats.find(s => s.Type === '치명');
  const text = stripHtml(crit?.Tooltip || '');
  const match = text.match(/치명타\s*(?:적중률|확률)[^0-9+]*([+]?\d+(?:\.\d+)?)%/);
  if (match) out.critRate = Number(match[1]);
  return out;
}
function applyProfileDefaults(profile) {
  const parsed = parseProfileCombat(profile);
  if (Number.isFinite(parsed.critRate)) $('baseCritRate').value = parsed.critRate.toFixed(2);
}

function buildIndex(db) {
  const map = new Map();
  for (const [tier, names] of Object.entries(db?.tiers || {})) for (const name of names || []) map.set(name, Number(tier));
  for (const node of db?.nodes || []) map.set(node.name, Number(node.tier));
  return map;
}
function getNode(name) { return (state.evolution?.nodes || []).find(n => n.name === name); }
function getLevelEffect(name, level) {
  const node = getNode(name);
  const raw = node?.levels?.[String(level)] || {};
  if (Object.keys(raw).length) return raw;
  // 1티어 특성 노드는 레벨 비례 추정값. 실제값과 다르면 JSON에서 조정하면 됨.
  if (name === '치명') return { critRate: level * 0.716 };
  return {};
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
function classifyEvolution(effects) {
  const selected = {};
  for (const effect of effects) {
    const node = getNode(effect.name);
    if (node) selected[effect.name] = { level: Math.min(effect.level || 1, node.maxLevel || effect.level || 1), source: 'api' };
  }
  return Object.keys(selected).length ? selected : defaultSelection();
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
    item('진화 포인트', point('진화')), item('악세 치적', `${fmt(state.accessory.critRate)}%`), item('악세 치피', `${fmt(state.accessory.critDamage)}%`),
    item('악세 추피', `${fmt(state.accessory.additionalDamage)}%`), item('악세 적주피', `${fmt(state.accessory.enemyDamage)}%`),
    item('팔찌 치적', `${fmt(state.bracelet.critRate)}%`), item('팔찌 치피', `${fmt(state.bracelet.critDamage)}%`)
  ].join('');
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
  return {
    critRate: num($('baseCritRate').value) + num(state.accessory.critRate) + num($('braceletCritRate').value),
    critDamage: num($('baseCritDamage').value, 200) + num(state.accessory.critDamage) + num($('braceletCritDamage').value),
    evolutionDamage: num($('baseEvolutionDamage').value),
    additionalDamage: num($('baseAdditionalDamage').value) + num(state.accessory.additionalDamage) + num(state.bracelet.additionalDamage),
    enemyDamage: num($('baseEnemyDamage').value) + num(state.accessory.enemyDamage) + num(state.bracelet.enemyDamage),
    skillCritBonus: num($('skillCritBonus').value),
    adrenalineCritRate: $('adrenalineEnabled').checked ? num($('adrenalineCritRate').value) : 0,
    attackPower: $('adrenalineEnabled').checked ? num($('adrenalineAttackPower').value) : 0,
    moveAttackSpeed: num($('baseMoveAttackSpeed').value, 114)
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
  for (const row of selectedEntries(selection)) s = applyEffect(s, getLevelEffect(row.name, row.level));
  return { stats: s, result: score(s) };
}
function renderCombatStats(current = statsWithSelection(getBaseStats(), state.selected)) {
  const convertedText = current.result.convertedEvolutionDamage > 0
    ? `${fmt(current.result.evo)}% (뭉가 전환 +${fmt(current.result.convertedEvolutionDamage)}%)`
    : `${fmt(current.result.evo)}%`;
  $('combatStatGrid').innerHTML = [
    item('치명타 확률', `${fmt(current.result.critRate)}%`), item('치명타 피해', `${fmt(current.result.critDamage)}%`),
    item('진피', convertedText), item('추피', `${fmt(current.result.additionalDamage)}%`),
    item('적주피', `${fmt(current.result.enemyDamage)}%`), item('아드 공증', `${fmt(current.result.attackPower)}%`),
    item('공이속', `${fmt(current.result.moveAttackSpeed)}%`), item('기대값 점수', current.result.value.toFixed(4))
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
    for (const opt of allOptions(5)) delete next[opt];
    next[name] = { level, source: 'candidate' };
    const calc = statsWithSelection(baseStats, next);
    candidates.push({ name, level, calc, diff: ((calc.result.value / baseValue) - 1) * 100 });
  }
  candidates.sort((a, b) => b.calc.result.value - a.calc.result.value);
  $('currentScore').innerHTML = `<strong>${current.result.value.toFixed(4)}</strong><span>현재 선택 노드 반영 기준</span>`;
  $('baseInfo').innerHTML = `치적 ${fmt(current.result.critRate)}%, 치피 ${fmt(current.result.critDamage)}%, 진피 ${fmt(current.result.evo)}%, 추피 ${fmt(current.result.additionalDamage)}%, 적주피 ${fmt(current.result.enemyDamage)}%, 공증 ${fmt(current.result.attackPower)}%, 공이속 ${fmt(current.result.moveAttackSpeed)}%`;
  $('recommendList').innerHTML = candidates.map((c, i) => {
    const cls = c.diff >= 0 ? 'up' : 'down';
    const currentMark = state.selected[c.name]?.level > 0 ? '<em>현재</em>' : '';
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
    state.accessory = data.accessoryEffects || { critRate: 0, critDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
    state.bracelet = data.braceletEffects || { critRate: 0, critDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
    if (data.braceletEffects) {
      $('braceletCritRate').value = fmt(data.braceletEffects.critRate || 0);
      $('braceletCritDamage').value = fmt(data.braceletEffects.critDamage || 0);
    }
    renderCharacter(data.profile);
    applyProfileDefaults(data.profile);
    state.foundEffects = readEffects(data.arkPassive);
    state.selected = classifyEvolution(state.foundEffects);
    renderSummary(data.profile, data.arkPassive);
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
['baseCritRate','baseCritDamage','baseEvolutionDamage','baseAdditionalDamage','baseEnemyDamage','skillCritBonus','adrenalineCritRate','adrenalineAttackPower','braceletCritRate','braceletCritDamage','baseMoveAttackSpeed'].forEach(id => $(id).addEventListener('input', calculateAndRender));
$('adrenalineEnabled').addEventListener('change', calculateAndRender);

await loadDb();
