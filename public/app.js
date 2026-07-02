const form = document.querySelector('#searchForm');
const input = document.querySelector('#characterName');
const statusBox = document.querySelector('#status');
const characterCard = document.querySelector('#characterCard');
const recommendationBox = document.querySelector('#recommendation');
const equipmentBox = document.querySelector('#equipment');
const rawBox = document.querySelector('#raw');

function showStatus(message, isError = false) {
  statusBox.textContent = message;
  statusBox.classList.remove('hidden');
  statusBox.style.background = isError ? '#3f1d1d' : '#172554';
  statusBox.style.color = isError ? '#fecaca' : '#bfdbfe';
}

function hideStatus() {
  statusBox.classList.add('hidden');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));
}

function formatPercent(value) {
  const n = Number(value || 0);
  return `${n > 0 ? '+' : ''}${Number.isInteger(n) ? n : n.toFixed(2)}%`;
}

function renderCharacter(data) {
  const p = data.profile || {};
  document.querySelector('#characterImage').src = p.CharacterImage || '';
  document.querySelector('#characterTitle').textContent = `${p.CharacterName || data.characterName} / ${p.CharacterClassName || '-'}`;
  document.querySelector('#characterMeta').textContent = `아이템 레벨 ${p.ItemMaxLevel || p.ItemAvgLevel || '-'} · 서버 ${p.ServerName || '-'} · 원정대 ${p.ExpeditionLevel || '-'}`;
  characterCard.classList.remove('hidden');
}

function renderEffects(effects = {}) {
  const orderedKeys = [
    'evolutionDamage',
    'damageToEnemy',
    'additionalDamage',
    'critRate',
    'critDamage',
    'attackSpeed',
    'moveSpeed'
  ];

  const summaryCards = orderedKeys.map((key) => {
    const item = effects[key] || {};
    return `<div class="metric effect-metric"><b>${escapeHtml(item.label || key)}</b>${formatPercent(item.total || 0)}</div>`;
  }).join('');

  const detailRows = orderedKeys.flatMap((key) => {
    const item = effects[key] || {};
    return (item.hits || []).map((hit) => `
      <tr>
        <td>${escapeHtml(item.label)}</td>
        <td>${formatPercent(hit.value)}</td>
        <td>${escapeHtml(hit.area)}</td>
        <td>${escapeHtml(hit.source)}${hit.level ? ` Lv.${escapeHtml(hit.level)}` : ''}</td>
        <td>${escapeHtml(hit.text)}</td>
      </tr>
    `);
  }).join('');

  return `
    <h3>자동 추출 효과</h3>
    <div class="grid effects-grid">${summaryCards}</div>
    <details class="effect-details" open>
      <summary>추출 근거 보기</summary>
      <table>
        <thead><tr><th>효과</th><th>수치</th><th>구분</th><th>출처</th><th>문구</th></tr></thead>
        <tbody>${detailRows || '<tr><td colspan="5">추출된 효과 없음</td></tr>'}</tbody>
      </table>
    </details>
  `;
}

function renderRecommendation(data) {
  const r = data.recommendation || {};
  const a = r.autoInputs || {};
  const warnings = r.warnings || [];

  recommendationBox.innerHTML = `
    <h2>자동 추천 입력값</h2>
    <p><b>${escapeHtml(r.tierText || '추천 결과 없음')}</b></p>
    <div class="grid">
      <div class="metric"><b>직업</b>${escapeHtml(a.characterClass || '-')}</div>
      <div class="metric"><b>아이템 레벨</b>${escapeHtml(a.itemLevel || '-')}</div>
      <div class="metric"><b>치명</b>${escapeHtml(a.critical || 0)}</div>
      <div class="metric"><b>특화</b>${escapeHtml(a.specialization || 0)}</div>
      <div class="metric"><b>신속</b>${escapeHtml(a.swiftness || 0)}</div>
      <div class="metric"><b>진화</b>${escapeHtml(a.evolution || 0)}</div>
      <div class="metric"><b>깨달음</b>${escapeHtml(a.enlightenment || 0)}</div>
      <div class="metric"><b>도약</b>${escapeHtml(a.leap || 0)}</div>
    </div>
    ${renderEffects(a.effects)}
    ${warnings.map((w) => `<div class="warning">${escapeHtml(w)}</div>`).join('')}
    <p>${escapeHtml(r.note || '')}</p>
  `;
  recommendationBox.classList.remove('hidden');
}

function renderEquipment(data) {
  const rows = (data.equipmentSummary || []).map((item) => `
    <tr>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.grade)}</td>
      <td>${escapeHtml(item.quality ?? '-')}</td>
      <td>${escapeHtml(item.name)}</td>
    </tr>
  `).join('');

  equipmentBox.innerHTML = `
    <h2>장비 요약</h2>
    <table>
      <thead><tr><th>부위</th><th>등급</th><th>품질</th><th>이름</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">장비 정보 없음</td></tr>'}</tbody>
    </table>
  `;
  equipmentBox.classList.remove('hidden');
}

function renderRaw(data) {
  rawBox.innerHTML = `<h2>API 원본 확인용</h2><pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
  rawBox.classList.remove('hidden');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = input.value.trim();
  if (!name) return showStatus('캐릭터명을 입력해줘.', true);

  characterCard.classList.add('hidden');
  recommendationBox.classList.add('hidden');
  equipmentBox.classList.add('hidden');
  rawBox.classList.add('hidden');
  showStatus('캐릭터 정보를 불러오는 중...');

  try {
    const response = await fetch(`/api/character?name=${encodeURIComponent(name)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '조회 실패');

    hideStatus();
    renderCharacter(data);
    renderRecommendation(data);
    renderEquipment(data);
    renderRaw(data);
  } catch (error) {
    showStatus(error.message, true);
  }
});
