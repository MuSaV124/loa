const VERSION = '1.3.0';
const $ = (id) => document.getElementById(id);

const GROUPS = { '진화': [1, 2, 3, 4, 5], '깨달음': [1, 2, 3, 4], '도약': [1, 2] };
const state = { db: {}, indexes: {}, selected: {}, effects: [] };

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
function setMessage(text) {
  const el = $('message');
  if (!text) { el.classList.add('hidden'); el.textContent = ''; return; }
  el.classList.remove('hidden'); el.textContent = text;
}
function getStat(profile, type) {
  const stats = profile?.Stats || [];
  const found = stats.find(s => s.Type === type);
  return found?.Value ?? '-';
}
function item(label, value) { return `<div class="cell"><b>${label}</b><span>${escapeHtml(value ?? '-')}</span></div>`; }

function readEffects(arkPassive) {
  const effects = Array.isArray(arkPassive?.Effects) ? arkPassive.Effects : [];
  return effects.map((e, index) => ({ index, name: e?.Name || '', level: Number(e?.Level || 0), description: stripHtml(e?.Description || ''), tooltip: stripHtml(e?.Tooltip || '') })).filter(e => e.name);
}
function buildIndexes(db) {
  const map = new Map();
  for (const [tier, names] of Object.entries(db?.tiers || {})) for (const name of names || []) map.set(name, Number(tier));
  for (const node of db?.nodes || []) map.set(node.name, Number(node.tier));
  return map;
}
function getNode(group, name) { return (state.db[group]?.nodes || []).find(n => n.name === name); }
function getLevelEffect(group, name, level) {
  const node = getNode(group, name);
  return node?.levels?.[String(level)] || {};
}
function classifyEffects(effects) {
  const selected = {};
  for (const group of Object.keys(GROUPS)) {
    selected[group] = {};
    for (const tier of GROUPS[group]) selected[group][tier] = { name: '', level: 0 };
  }
  for (const effect of effects) {
    for (const group of Object.keys(GROUPS)) {
      const tier = state.indexes[group]?.get(effect.name);
      if (tier) { selected[group][tier] = { name: effect.name, level: effect.level || 1 }; break; }
    }
  }
  return selected;
}
function allOptions(group, tier) {
  const db = state.db[group] || {};
  const byTier = new Set(db.tiers?.[String(tier)] || []);
  for (const node of db.nodes || []) if (Number(node.tier) === Number(tier)) byTier.add(node.name);
  return [...byTier];
}

function renderCharacter(profile) {
  const el = $('characterCard');
  const image = profile?.CharacterImage || '';
  el.innerHTML = `${image ? `<img src="${escapeHtml(image)}" alt="" />` : ''}<div><h2>${escapeHtml(profile?.CharacterName || '-')} / ${escapeHtml(profile?.CharacterClassName || '-')}</h2><p>서버 ${escapeHtml(profile?.ServerName || '-')} · 아이템 레벨 ${escapeHtml(profile?.ItemAvgLevel || '-')} · 전투력 ${escapeHtml(profile?.CombatPower || '-')}</p></div>`;
  el.classList.remove('hidden');
}
function renderStats(profile, arkPassive) {
  const points = Array.isArray(arkPassive?.Points) ? arkPassive.Points : [];
  const point = (name) => points.find(p => p.Name === name)?.Value ?? '-';
  $('statGrid').innerHTML = [item('직업', profile?.CharacterClassName), item('아이템 레벨', profile?.ItemAvgLevel), item('서버', profile?.ServerName), item('치명', getStat(profile, '치명')), item('신속', getStat(profile, '신속')), item('특화', getStat(profile, '특화')), item('진화', point('진화')), item('깨달음', point('깨달음')), item('도약', point('도약'))].join('');
  $('resultPanel').classList.remove('hidden');
}
function renderTierGroups() {
  const html = Object.entries(GROUPS).map(([group, tiers]) => {
    const tierHtml = tiers.map(tier => {
      const selected = state.selected[group]?.[tier] || { name: '', level: 0 };
      const options = allOptions(group, tier);
      const optionHtml = [`<option value="">선택 없음</option>`, ...options.map(name => `<option value="${escapeHtml(name)}" ${name === selected.name ? 'selected' : ''}>${escapeHtml(name)}</option>`)].join('');
      const node = getNode(group, selected.name);
      const max = node?.maxLevel || Math.max(2, selected.level || 2);
      const levelHtml = Array.from({ length: max + 1 }, (_, i) => `<option value="${i}" ${i === Number(selected.level || 0) ? 'selected' : ''}>Lv.${i}</option>`).join('');
      return `<div class="tier"><h4>${tier}티어</h4><select data-group="${group}" data-tier="${tier}" data-field="name">${optionHtml}</select><select data-group="${group}" data-tier="${tier}" data-field="level">${levelHtml}</select>${selected.name ? `<p>${escapeHtml(node?.description || 'DB 설명 없음')}</p>` : `<p class="empty">-</p>`}</div>`;
    }).join('');
    return `<div class="groupBox" data-group="${group}"><h3>${group}</h3><div class="tiers">${tierHtml}</div></div>`;
  }).join('');
  $('tierGroups').innerHTML = html;
  $('tierPanel').classList.remove('hidden');
  $('tierGroups').querySelectorAll('select').forEach(sel => sel.addEventListener('change', onSelectionChange));
}
function onSelectionChange(event) {
  const el = event.target;
  const group = el.dataset.group;
  const tier = Number(el.dataset.tier);
  const field = el.dataset.field;
  state.selected[group][tier][field] = field === 'level' ? Number(el.value) : el.value;
  if (field === 'name' && !el.value) state.selected[group][tier].level = 0;
  if (field === 'name' && el.value && !state.selected[group][tier].level) state.selected[group][tier].level = getNode(group, el.value)?.maxLevel || 1;
  renderTierGroups();
  calculateAndRender();
}

function getInputStats() {
  return {
    critRate: num($('critRate').value),
    critDamage: num($('critDamage').value, 200),
    evolutionDamage: num($('evolutionDamage').value),
    finalDamage: num($('finalDamage').value),
    skillCritBonus: num($('skillCritBonus').value),
    targetSkill: $('targetSkill').value || '전체 딜'
  };
}
function applyEffect(stats, effect) {
  const out = { ...stats };
  if (effect.critRate) out.critRate += effect.critRate;
  if (effect.critDamage) out.critDamage += effect.critDamage;
  if (effect.finalDamage) out.finalDamage += effect.finalDamage;
  if (effect.evolutionDamage) out.evolutionDamage += effect.evolutionDamage;
  if (effect.critCap != null) out.critCap = effect.critCap;
  if (effect.overCritToEvolutionDamageRate) out.overCritToEvolutionDamageRate = effect.overCritToEvolutionDamageRate;
  if (effect.overCritEvolutionDamageCap != null) out.overCritEvolutionDamageCap = effect.overCritEvolutionDamageCap;
  return out;
}
function selectedEntries(selected = state.selected) {
  const rows = [];
  for (const [group, tiers] of Object.entries(selected)) for (const [tier, data] of Object.entries(tiers)) if (data.name && data.level > 0) rows.push({ group, tier: Number(tier), name: data.name, level: Number(data.level) });
  return rows;
}
function removeSelectedEffects(finalStats) {
  let base = { ...finalStats };
  for (const row of selectedEntries()) {
    const effect = getLevelEffect(row.group, row.name, row.level);
    if (effect.evolutionDamage) base.evolutionDamage -= effect.evolutionDamage;
    if (effect.critDamage) base.critDamage -= effect.critDamage;
    if (effect.critRate) base.critRate -= effect.critRate;
    if (effect.finalDamage) base.finalDamage -= effect.finalDamage;
    // 뭉툭한 가시의 초과치적 전환분은 최종값에서 자동 산출되는 조건부 효과라 기본 진피 입력값에서 직접 차감하지 않습니다.
  }
  return base;
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
  const finalMultiplier = 1 + stats.finalDamage / 100;
  return { value: critMultiplier * evoMultiplier * finalMultiplier, critRate, evo, critMultiplier, evoMultiplier, finalMultiplier };
}
function scoreWithSelection(baseStats, selection) {
  let s = { ...baseStats };
  for (const row of selectedEntries(selection)) s = applyEffect(s, getLevelEffect(row.group, row.name, row.level));
  return { stats: s, result: score(s) };
}
function cloneSelection() { return JSON.parse(JSON.stringify(state.selected)); }
function calculateAndRender() {
  const finalStats = getInputStats();
  const baseStats = removeSelectedEffects(finalStats);
  const current = scoreWithSelection(baseStats, state.selected);
  const baseValue = current.result.value || 1;
  const candidates = [];
  for (const [group, tiers] of Object.entries(GROUPS)) {
    for (const tier of tiers) {
      for (const name of allOptions(group, tier)) {
        const node = getNode(group, name);
        const level = node?.maxLevel || 2;
        const next = cloneSelection();
        next[group][tier] = { name, level };
        const calc = scoreWithSelection(baseStats, next);
        candidates.push({ group, tier, name, level, calc, diff: ((calc.result.value / baseValue) - 1) * 100 });
      }
    }
  }
  candidates.sort((a, b) => b.calc.result.value - a.calc.result.value);
  $('currentScore').innerHTML = `<strong>${current.result.value.toFixed(4)}</strong><span>${escapeHtml(finalStats.targetSkill)} 기준</span>`;
  $('baseInfo').innerHTML = `효과 제거 후 기준값: 치적 ${baseStats.critRate.toFixed(2)}%, 치피 ${baseStats.critDamage.toFixed(2)}%, 진피 ${baseStats.evolutionDamage.toFixed(2)}%<br>현재 재적용값: 치적 ${current.result.critRate.toFixed(2)}%, 진피 ${current.result.evo.toFixed(2)}%`;
  $('recommendList').innerHTML = candidates.slice(0, 8).map((c, i) => {
    const cls = c.diff >= 0 ? 'up' : 'down';
    const currentMark = state.selected[c.group]?.[c.tier]?.name === c.name ? '<em>현재</em>' : '';
    return `<div class="recommend ${cls}"><div><b>${i + 1}. ${escapeHtml(c.name)} Lv.${c.level}</b>${currentMark}<small>${c.group} ${c.tier}티어 · 점수 ${c.calc.result.value.toFixed(4)} · 진피 ${c.calc.result.evo.toFixed(2)}%</small></div><strong>${pct(c.diff)}</strong></div>`;
  }).join('');
  $('recommendPanel').classList.remove('hidden');
}

async function loadDb() {
  const [evolution, enlightenment, leap] = await Promise.all([
    fetch('/data/evolution.json').then(r => r.json()),
    fetch('/data/enlightenment-breaker-sura.json').then(r => r.json()),
    fetch('/data/leap-breaker.json').then(r => r.json())
  ]);
  state.db = { '진화': evolution, '깨달음': enlightenment, '도약': leap };
  for (const group of Object.keys(GROUPS)) state.indexes[group] = buildIndexes(state.db[group]);
  $('evolutionDbStatus').textContent = `${state.indexes['진화'].size}개 노드 / 계산식 포함`;
  $('enlightenmentDbStatus').textContent = `${state.indexes['깨달음'].size}개 노드 / 구조 준비`;
  $('leapDbStatus').textContent = `${state.indexes['도약'].size}개 노드 / 구조 준비`;
  state.selected = classifyEffects([]);
  state.selected['진화'][5] = { name: '뭉툭한 가시', level: 2 };
  renderTierGroups();
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
    renderStats(data.profile, data.arkPassive);
    state.effects = readEffects(data.arkPassive);
    state.selected = classifyEffects(state.effects);
    renderTierGroups();
    calculateAndRender();
  } catch (error) { setMessage(error.message); }
  finally { button.disabled = false; button.textContent = '검색'; }
}

$('searchForm').addEventListener('submit', (event) => { event.preventDefault(); const name = $('characterName').value.trim(); if (!name) return setMessage('캐릭터명을 입력하세요.'); searchCharacter(name); });
$('recalcButton').addEventListener('click', calculateAndRender);
['critRate','critDamage','evolutionDamage','finalDamage','skillCritBonus','targetSkill'].forEach(id => $(id).addEventListener('input', calculateAndRender));

await loadDb();
