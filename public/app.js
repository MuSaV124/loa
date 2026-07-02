const VERSION = '4.4.1';
const $ = (id) => document.getElementById(id);
const EVOLUTION_TIERS = [1, 2, 3, 4, 5];
const state = { evolution: null, index: new Map(), selected: {}, apiSelected: {}, foundEffects: [], profileStats: { crit: 0, swift: 0, spec: 0 }, accessory: { critRate: 0, critDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] }, bracelet: { critRate: 0, critDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] }, enlightenment: { critRate: 0, critDamage: 0, evolutionDamage: 0, enemyDamage: 0, additionalDamage: 0, attackSpeed: 0, moveSpeed: 0, items: [] } };

function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m]); }
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

function addMatchesTo(out, key, text, regexList) {
  const seen = new Set();
  for (const re of regexList) {
    let match;
    while ((match = re.exec(text)) !== null) {
      const value = Number(match[1] || 0);
      if (!Number.isFinite(value)) continue;
      const token = `${key}:${match.index}:${value}`;
      if (seen.has(token)) continue;
      seen.add(token);
      out[key] += value;
    }
  }
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
  const joined = normalizeNodeName(`${effect?.name || ''} ${effect?.description || ''} ${effect?.tooltip || ''}`);
  return (state.evolution?.nodes || []).some(node => effect?.name === node.name || joined.includes(node.name));
}
function extractEnlightenmentEffects(effects) {
  const result = { critRate: 0, critDamage: 0, evolutionDamage: 0, enemyDamage: 0, additionalDamage: 0, attackSpeed: 0, moveSpeed: 0, items: [] };
  for (const effect of effects || []) {
    const joined = effectFullText(effect);
    const normalized = normalizeNodeName(`${effect?.name || ''} ${joined}`);
    // Open API가 깨달음/진화 구분명을 안정적으로 주지 않는 경우가 있어,
    // 진화 노드로 매칭되는 항목만 제외하고 남은 아크패시브 효과에서 필요한 수치를 읽습니다.
    if (isKnownEvolutionEffect(effect)) continue;
    const parsed = parsePercentEffectText(joined);

    // 기상술사 질풍노도/기민함처럼 문장 안에 고정 수치가 아니라
    // 공속/이속 증가량을 참조하는 깨달음 효과는 별도 계산합니다.
    const level = Math.max(1, Number(effect?.level || parseLevelFromText(joined, 1) || 1));
    if (normalized.includes('질풍노도')) {
      parsed.attackSpeed = (parsed.attackSpeed || 0) + 12;
      parsed.moveSpeed = (parsed.moveSpeed || 0) + 12;
    }
    if (normalized.includes('기민함')) {
      const lv = Math.min(3, level);
      const critDamageRate = [0, 0.4, 0.8, 1.2][lv] || 0;
      const critRateRate = [0, 0.1, 0.2, 0.3][lv] || 0;
      parsed.windfuryAgility = { level: lv, critDamageRate, critRateRate };
    }
    if (normalized.includes('자연의 흐름')) {
      const lv = Math.min(5, level);
      parsed.enemyDamage += lv * 1.2;
    }
    if (normalized.includes('바람의 길')) {
      const lv = Math.min(5, level);
      parsed.enemyDamage += lv * 1.2; // 최대 2중첩 기준: 0.6/1.2/1.8/2.4/3.0 × 2
    }

    if (!hasAnyEffect(parsed) && !parsed.attackSpeed && !parsed.moveSpeed && !parsed.windfuryAgility) continue;
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


function getBaseStats() {
  const selectedCritStat = tier1StatBonus('치명');
  const selectedSwiftStat = tier1StatBonus('신속');
  const critStat = num($('baseCritStat').value) + selectedCritStat;
  const swiftStat = num($('baseSwiftStat').value) + selectedSwiftStat;
  const statCritRate = critRateFromStat(critStat);
  const swiftSpeedBonus = speedFromSwift(swiftStat);
  const extraCritRate = num($('extraCritRate').value);
  const extraCritDamage = num($('extraCritDamage').value);
  const extraEvolutionDamage = num($('extraEvolutionDamage').value);
  const extraAdditionalDamage = num($('extraAdditionalDamage').value);
  const extraEnemyDamage = num($('extraEnemyDamage').value);
  const extraAttackSpeed = num($('extraAttackSpeed').value);
  const extraMoveSpeed = num($('extraMoveSpeed').value);
  const critSynergy = $('critSynergyEnabled').checked ? 10 : 0;
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
    dynamicEnlightenmentCritDamage += Math.max(0, attackSpeed - 100) * Number(wf.critDamageRate || 0);
    dynamicEnlightenmentCritRate += Math.max(0, moveSpeed - 100) * Number(wf.critRateRate || 0);
  }
  dynamicEnlightenmentCritRate = Math.round(dynamicEnlightenmentCritRate * 100) / 100;
  dynamicEnlightenmentCritDamage = Math.round(dynamicEnlightenmentCritDamage * 100) / 100;
  return {
    critStat,
    swiftStat,
    statCritRate,
    critRate: statCritRate + num(state.accessory.critRate) + num(state.bracelet.critRate) + num(state.enlightenment.critRate) + dynamicEnlightenmentCritRate + extraCritRate + critSynergy,
    critDamage: 200 + num(state.accessory.critDamage) + num(state.bracelet.critDamage) + num(state.enlightenment.critDamage) + dynamicEnlightenmentCritDamage + extraCritDamage,
    evolutionDamage: num(state.enlightenment.evolutionDamage) + extraEvolutionDamage,
    additionalDamage: num(state.accessory.additionalDamage) + num(state.bracelet.additionalDamage) + num(state.enlightenment.additionalDamage) + extraAdditionalDamage,
    enemyDamage: num(state.accessory.enemyDamage) + num(state.bracelet.enemyDamage) + num(state.enlightenment.enemyDamage) + extraEnemyDamage,
    skillCritBonus: 0,
    critSynergy,
    adrenalineCritRate: $('adrenalineEnabled').checked ? num($('adrenalineCritRate').value) : 0,
    attackPower: $('adrenalineEnabled').checked ? num($('adrenalineAttackPower').value) : 0,
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
function applyEffect(stats, effect) {
  const out = { ...stats };
  if (effect.critStat) { out.critStat = (out.critStat || 0) + effect.critStat; out.statCritRate = critRateFromStat(out.critStat); out.critRate += critRateFromStat(effect.critStat); }
  if (effect.swiftStat) { out.swiftStat = (out.swiftStat || 0) + effect.swiftStat; out.swiftSpeedBonus = speedFromSwift(out.swiftStat || 0); out.attackSpeed = (out.baseMoveAttackSpeed || 114) + out.swiftSpeedBonus + (out.extraAttackSpeed || 0); out.moveSpeed = (out.baseMoveAttackSpeed || 114) + out.swiftSpeedBonus + (out.extraMoveSpeed || 0); out.moveAttackSpeed = Math.min(out.attackSpeed, out.moveSpeed); }
  if (effect.critRate) out.critRate += effect.critRate;
  if (effect.critDamage) out.critDamage += effect.critDamage;
  if (effect.critHitDamage) out.critHitDamage = (out.critHitDamage || 0) + effect.critHitDamage;
  if (effect.evolutionDamage) out.evolutionDamage += effect.evolutionDamage;
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
  if (effect.enemyDamage) out.enemyDamage += effect.enemyDamage;
  if (effect.finalDamage) out.enemyDamage += effect.finalDamage;
  if (effect.attackPower) out.attackPower = (out.attackPower || 0) + effect.attackPower;
  if (effect.speedBonus) { out.attackSpeed = (out.attackSpeed || out.moveAttackSpeed || 0) + effect.speedBonus; out.moveSpeed = (out.moveSpeed || out.moveAttackSpeed || 0) + effect.speedBonus; out.moveAttackSpeed = Math.min(out.attackSpeed, out.moveSpeed); }
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
  const critMultiplier = (1 - critChance) + critChance * (stats.critDamage / 100) * (1 + (stats.critHitDamage || 0) / 100);
  const evoMultiplier = 1 + evo / 100;
  const addMultiplier = 1 + stats.additionalDamage / 100;
  const enemyMultiplier = 1 + stats.enemyDamage / 100;
  const attackMultiplier = 1 + (stats.attackPower || 0) / 100;
  return { value: critMultiplier * evoMultiplier * addMultiplier * enemyMultiplier * attackMultiplier, rawCritRate, critRate: rawCritRate, effectiveCritRate, critDamage: stats.critDamage, critHitDamage: stats.critHitDamage || 0, evo, baseEvo: stats.evolutionDamage, convertedEvolutionDamage, overCrit, additionalDamage: stats.additionalDamage, enemyDamage: stats.enemyDamage, attackPower: stats.attackPower || 0, moveAttackSpeed: stats.moveAttackSpeed || 0, attackSpeed: stats.attackSpeed || stats.moveAttackSpeed || 0, moveSpeed: stats.moveSpeed || stats.moveAttackSpeed || 0 };
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
  if (current.result.convertedEvolutionDamage > 0) evoEvolution.push(sourceLine('[진화] 뭉가 전환', current.result.convertedEvolutionDamage, `80% 초과분 · 최대 75%`));
  const critLines = [sourceLine('치명 스탯', current.stats.statCritRate || 0, `치명 ${Math.round(current.stats.critStat || 0)}${getStatNodeLine('치명') ? ' · ' + getStatNodeLine('치명') : ''}`)];
  if (base.adrenalineCritRate) critLines.push(sourceLine('아드레날린', base.adrenalineCritRate));
  if (base.critSynergy) critLines.push(sourceLine('치적 시너지', base.critSynergy));
  if (state.accessory.critRate) critLines.push(sourceLine('악세', state.accessory.critRate));
  if (state.bracelet.critRate) critLines.push(sourceLine('팔찌', state.bracelet.critRate));
  if (state.enlightenment.critRate) critLines.push(sourceLine('깨달음', state.enlightenment.critRate));
  if (base.dynamicEnlightenmentCritRate) critLines.push(sourceLine('깨달음 · 기민함', base.dynamicEnlightenmentCritRate));
  if (base.extraCritRate) critLines.push(sourceLine('추가 입력', base.extraCritRate));
  critLines.push(...critEvolution);

  const critDamageLines = [sourceLine('기본 치명타 피해', 200)];
  if (state.accessory.critDamage) critDamageLines.push(sourceLine('악세', state.accessory.critDamage));
  if (state.bracelet.critDamage) critDamageLines.push(sourceLine('팔찌', state.bracelet.critDamage));
  if (state.enlightenment.critDamage) critDamageLines.push(sourceLine('깨달음', state.enlightenment.critDamage));
  if (base.dynamicEnlightenmentCritDamage) critDamageLines.push(sourceLine('깨달음 · 기민함', base.dynamicEnlightenmentCritDamage));
  if (base.extraCritDamage) critDamageLines.push(sourceLine('추가 입력', base.extraCritDamage));
  critDamageLines.push(...critDamageEvolution);

  const evoLines = [];
  if (state.enlightenment.evolutionDamage) evoLines.push(sourceLine('깨달음', state.enlightenment.evolutionDamage));
  if (base.extraEvolutionDamage) evoLines.push(sourceLine('추가 입력', base.extraEvolutionDamage));
  evoLines.push(...evoEvolution);

  const addLines = [];
  if (state.accessory.additionalDamage) addLines.push(sourceLine('악세', state.accessory.additionalDamage));
  if (state.bracelet.additionalDamage) addLines.push(sourceLine('팔찌', state.bracelet.additionalDamage));
  if (state.enlightenment.additionalDamage) addLines.push(sourceLine('깨달음', state.enlightenment.additionalDamage));
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
  if (base.extraEnemyDamage) enemyLines.push(sourceLine('추가 입력', base.extraEnemyDamage));
  enemyLines.push(...enemyEvolution);

  $('sourceSummary').innerHTML = `
    <div class="sourceTitle"><div><h3>계산 요약</h3><p>출처별 합산값입니다. 진화 노드를 바꾸면 즉시 갱신됩니다.</p></div><button id="resetViewButton" type="button">초기화</button></div>
    ${sourceGroup('치명타 확률', 'blue', critLines, current.result.critRate)}
    ${sourceGroup('치명타 피해', 'purple', critDamageLines, current.result.critDamage)}
    ${sourceGroup('진피', 'orange', evoLines, current.result.evo)}
    ${sourceGroup('추피', 'green', addLines, current.result.additionalDamage)}
    ${sourceGroup('적주피', 'pink', enemyLines, current.result.enemyDamage)}
    ${sourceGroup('공격 속도', 'cyan', attackSpeedLines, current.result.attackSpeed)}
    ${sourceGroup('이동 속도', 'cyan', moveSpeedLines, current.result.moveSpeed)}
    <div class="sourceFoot">뭉가 전환 진피는 <b>최대 75%</b>까지 적용됩니다.</div>
  `;
  const reset = $('resetViewButton');
  if (reset) reset.addEventListener('click', () => { state.selected = JSON.parse(JSON.stringify(state.apiSelected || {})); renderEvolutionTiers(); calculateAndRender(); });
}

function renderCombatStats(current = statsWithSelection(getBaseStats(), state.selected)) {
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
function calculateAndRender() {
  const baseStats = getBaseStats();
  const current = statsWithSelection(baseStats, state.selected);
  renderCombatStats(current);
  renderKeenEfficiency(current);
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
  $('baseInfo').innerHTML = `치명 ${Math.round(current.stats.critStat || 0)} / 스탯치적 ${fmt(current.stats.statCritRate || 0)}%, 최종치적 ${fmt(current.result.critRate)}%, 치피 ${fmt(current.result.critDamage)}%, 진피 ${fmt(current.result.evo)}%, 추피 ${fmt(current.result.additionalDamage)}%, 적주피 ${fmt(current.result.enemyDamage)}%, 공증 ${fmt(current.result.attackPower)}%, 공속 ${fmt(current.result.attackSpeed)}%, 이속 ${fmt(current.result.moveSpeed)}%`;
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
  state.enlightenment = { critRate: 0, critDamage: 0, evolutionDamage: 0, enemyDamage: 0, additionalDamage: 0, attackSpeed: 0, moveSpeed: 0, items: [] };
  renderEvolutionTiers();
  calculateAndRender();
  try {
    const res = await fetch(`/api/character?name=${encodeURIComponent(name)}&_=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || data.message || '검색 실패');
    if (!data.profile?.CharacterName) throw new Error('캐릭터 프로필을 가져오지 못했습니다.');
    state.accessory = data.accessoryEffects || { critRate: 0, critDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
    state.bracelet = data.braceletEffects || { critRate: 0, critDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] };
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

await loadDb();
