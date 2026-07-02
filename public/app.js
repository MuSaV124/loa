const VERSION = '1.2.0';

const $ = (id) => document.getElementById(id);

const state = {
  evolutionDb: null,
  enlightenmentDb: null,
  leapDb: null
};

const GROUPS = {
  '진화': [1, 2, 3, 4, 5],
  '깨달음': [1, 2, 3, 4],
  '도약': [1, 2]
};

function setMessage(text) {
  const el = $('message');
  if (!text) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.classList.remove('hidden');
  el.textContent = text;
}

function getStat(profile, type) {
  const stats = profile?.Stats || [];
  const found = stats.find(s => s.Type === type);
  return found?.Value ?? '-';
}

function item(label, value) {
  return `<div class="cell"><b>${label}</b><span>${value ?? '-'}</span></div>`;
}

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function stripHtml(v) {
  return String(v ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function readEffects(arkPassive) {
  const effects = Array.isArray(arkPassive?.Effects) ? arkPassive.Effects : [];
  return effects
    .map((e, index) => ({
      index,
      name: e?.Name || '',
      level: Number(e?.Level || 0),
      description: stripHtml(e?.Description || ''),
      tooltip: stripHtml(e?.Tooltip || '')
    }))
    .filter(e => e.name);
}

function buildNameIndex(db) {
  const map = new Map();
  if (!db?.tiers) return map;
  for (const [tier, names] of Object.entries(db.tiers)) {
    for (const name of names || []) {
      map.set(name, Number(tier));
    }
  }
  return map;
}

function isLikelyEvolution(effect) {
  return state.evolutionIndex?.has(effect.name);
}

function isLikelyEnlightenment(effect) {
  if (state.enlightenmentIndex?.has(effect.name)) return true;
  // 깨달음은 직업각인/직업 특화 노드가 많아서 v1.2.0에서는 DB 미구축 시 확정 분류하지 않는다.
  return false;
}

function isLikelyLeap(effect) {
  if (state.leapIndex?.has(effect.name)) return true;
  return false;
}

function classifyEffects(effects) {
  const result = {
    '진화': { 1: [], 2: [], 3: [], 4: [], 5: [], unknown: [] },
    '깨달음': { 1: [], 2: [], 3: [], 4: [], unknown: [] },
    '도약': { 1: [], 2: [], unknown: [] }
  };

  for (const effect of effects) {
    if (isLikelyEvolution(effect)) {
      const tier = state.evolutionIndex.get(effect.name);
      result['진화'][tier].push(effect);
      continue;
    }

    if (isLikelyEnlightenment(effect)) {
      const tier = state.enlightenmentIndex.get(effect.name);
      result['깨달음'][tier].push(effect);
      continue;
    }

    if (isLikelyLeap(effect)) {
      const tier = state.leapIndex.get(effect.name);
      result['도약'][tier].push(effect);
      continue;
    }

    // v1.2.0: 미분류는 별도 표시 대신 각 그룹 unknown에 넣지 않고 하단 안내만 둔다.
  }

  return result;
}

function renderCharacter(profile) {
  const el = $('characterCard');
  const image = profile?.CharacterImage || '';
  const name = profile?.CharacterName || '-';
  const klass = profile?.CharacterClassName || '-';
  const server = profile?.ServerName || '-';
  const ilvl = profile?.ItemAvgLevel || '-';
  const combatPower = profile?.CombatPower || '-';

  el.innerHTML = `
    ${image ? `<img src="${escapeHtml(image)}" alt="" />` : ''}
    <div>
      <h2>${escapeHtml(name)} / ${escapeHtml(klass)}</h2>
      <p>서버 ${escapeHtml(server)} · 아이템 레벨 ${escapeHtml(ilvl)} · 전투력 ${escapeHtml(combatPower)}</p>
    </div>
  `;
  el.classList.remove('hidden');
}

function renderStats(profile, arkPassive) {
  const points = Array.isArray(arkPassive?.Points) ? arkPassive.Points : [];
  const point = (name) => points.find(p => p.Name === name)?.Value ?? '-';

  $('statGrid').innerHTML = [
    item('직업', profile?.CharacterClassName),
    item('아이템 레벨', profile?.ItemAvgLevel),
    item('서버', profile?.ServerName),
    item('치명', getStat(profile, '치명')),
    item('신속', getStat(profile, '신속')),
    item('특화', getStat(profile, '특화')),
    item('진화', point('진화')),
    item('깨달음', point('깨달음')),
    item('도약', point('도약'))
  ].join('');

  $('resultPanel').classList.remove('hidden');
}

function renderTierGroups(classified) {
  const html = Object.entries(GROUPS).map(([group, tiers]) => {
    const tierHtml = tiers.map(tier => {
      const nodes = classified[group]?.[tier] || [];
      const nodeHtml = nodes.length
        ? nodes.map(n => `<div class="node">${escapeHtml(n.name)} Lv.${escapeHtml(n.level || '-')}</div>`).join('')
        : `<div class="empty">-</div>`;

      return `<div class="tier"><h4>${tier}티어</h4>${nodeHtml}</div>`;
    }).join('');

    return `
      <div class="groupBox" data-group="${group}">
        <h3>${group}</h3>
        <div class="tiers">${tierHtml}</div>
      </div>
    `;
  }).join('');

  $('tierGroups').innerHTML = html;
  $('tierPanel').classList.remove('hidden');
}

async function loadDb() {
  try {
    const [evolution, enlightenment, leap] = await Promise.all([
      fetch('/data/evolution.json').then(r => r.json()),
      fetch('/data/enlightenment-breaker-sura.json').then(r => r.json()),
      fetch('/data/leap-breaker.json').then(r => r.json())
    ]);

    state.evolutionDb = evolution;
    state.enlightenmentDb = enlightenment;
    state.leapDb = leap;
    state.evolutionIndex = buildNameIndex(evolution);
    state.enlightenmentIndex = buildNameIndex(enlightenment);
    state.leapIndex = buildNameIndex(leap);

    $('evolutionDbStatus').textContent = `${state.evolutionIndex.size}개 노드 매핑`;
  } catch (error) {
    $('evolutionDbStatus').textContent = 'DB 로드 실패';
    console.error(error);
  }
}

async function searchCharacter(name) {
  const button = $('searchButton');
  button.disabled = true;
  button.textContent = '검색...';
  setMessage('');

  try {
    const res = await fetch(`/api/character?name=${encodeURIComponent(name)}`);
    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.error || data.message || '검색 실패');
    }

    const profile = data.profile;
    const arkPassive = data.arkPassive;

    renderCharacter(profile);
    renderStats(profile, arkPassive);

    const effects = readEffects(arkPassive);
    const classified = classifyEffects(effects);
    renderTierGroups(classified);
  } catch (error) {
    setMessage(error.message);
  } finally {
    button.disabled = false;
    button.textContent = '검색';
  }
}

$('searchForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('characterName').value.trim();
  if (!name) return setMessage('캐릭터명을 입력하세요.');
  searchCharacter(name);
});

await loadDb();