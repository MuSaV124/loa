const form = document.querySelector('#searchForm');
const input = document.querySelector('#characterName');
const searchButton = document.querySelector('#searchButton');
const statusBox = document.querySelector('#status');
const characterCard = document.querySelector('#characterCard');
const summaryCard = document.querySelector('#summaryCard');
const extractCard = document.querySelector('#extractCard');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));
}

function showStatus(message, isError = false) {
  statusBox.textContent = message;
  statusBox.classList.remove('hidden');
  statusBox.classList.toggle('error', isError);
}

function hideStatus() { statusBox.classList.add('hidden'); }
function hideCards() {
  characterCard.classList.add('hidden');
  summaryCard.classList.add('hidden');
  extractCard.classList.add('hidden');
}

function setLoading(isLoading) {
  searchButton.disabled = isLoading;
  searchButton.textContent = isLoading ? '검색...' : '검색';
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`서버가 JSON이 아닌 응답을 보냈습니다. HTTP ${response.status}. 내용: ${text.slice(0, 160)}`);
  }
}

function renderCharacter(data) {
  const p = data.profile || {};
  document.querySelector('#characterImage').src = p.CharacterImage || '';
  document.querySelector('#characterTitle').textContent = `${p.CharacterName || data.characterName || '-'} / ${p.CharacterClassName || '-'}`;
  document.querySelector('#characterMeta').textContent = `서버 ${p.ServerName || '-'} · 아이템 레벨 ${p.ItemMaxLevel || p.ItemAvgLevel || '-'} · 원정대 ${p.ExpeditionLevel || '-'}`;
  characterCard.classList.remove('hidden');
}

function renderSummary(data) {
  const s = data.summary || {};
  const stats = s.stats || {};
  const ark = s.arkPoints || {};
  const errors = data.apiErrors || {};

  summaryCard.innerHTML = `
    <h2>검색 결과 확인</h2>
    <div class="grid">
      <div class="metric"><b>직업</b>${escapeHtml(s.characterClass || '-')}</div>
      <div class="metric"><b>아이템 레벨</b>${escapeHtml(s.itemLevel || '-')}</div>
      <div class="metric"><b>서버</b>${escapeHtml(s.serverName || '-')}</div>
      <div class="metric"><b>치명</b>${escapeHtml(stats.crit || 0)}</div>
      <div class="metric"><b>신속</b>${escapeHtml(stats.swiftness || 0)}</div>
      <div class="metric"><b>특화</b>${escapeHtml(stats.specialization || 0)}</div>
      <div class="metric"><b>진화</b>${escapeHtml(ark.evolution || 0)}</div>
      <div class="metric"><b>깨달음</b>${escapeHtml(ark.enlightenment || 0)}</div>
      <div class="metric"><b>도약</b>${escapeHtml(ark.leap || 0)}</div>
    </div>
    ${errors.arkpassive ? `<div class="warning">아크패시브 조회 경고: ${escapeHtml(errors.arkpassive)}</div>` : ''}
  `;
  summaryCard.classList.remove('hidden');
}

function renderPoints(points) {
  const list = Array.isArray(points) ? points : [];
  if (!list.length) return '<p class="empty">Points 데이터 없음</p>';
  return `<div class="tableLike">${list.map((item) => `
    <div class="row"><b>${escapeHtml(item.Name || item.Type || '-')}</b><span>${escapeHtml(item.Value ?? item.Point ?? item.Amount ?? '-')}</span><code>${escapeHtml(JSON.stringify(item))}</code></div>
  `).join('')}</div>`;
}

function renderLikelyObjects(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return '<p class="empty">노드 후보로 보이는 객체 없음</p>';
  return `<div class="analysisList">${list.slice(0, 60).map((row) => `
    <details class="analysisItem">
      <summary>${escapeHtml(row.path)} ${row.name ? `· ${escapeHtml(row.name)}` : ''}</summary>
      <div class="analysisBody">
        <p><b>Keys</b> ${escapeHtml((row.keys || []).join(', '))}</p>
        <p><b>Name</b> ${escapeHtml(row.name || '-')}</p>
        <p><b>Level</b> ${escapeHtml(row.level ?? '-')}</p>
        <p><b>Sample</b> ${escapeHtml(row.sample || '-')}</p>
      </div>
    </details>
  `).join('')}</div>`;
}

function renderFieldPaths(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return '<p class="empty">필드 경로 없음</p>';
  return `<div class="pathTable">
    ${list.slice(0, 120).map((row) => `
      <div class="pathRow">
        <code>${escapeHtml(row.path)}</code>
        <span>${escapeHtml(row.type)}</span>
        <p>${escapeHtml(row.sample || '')}</p>
      </div>
    `).join('')}
  </div>`;
}

function renderExtractResult(data) {
  const analysis = data.analysis || {};
  extractCard.innerHTML = `
    <h2>Open API 분석기</h2>
    <p class="note">${escapeHtml(analysis.message || 'ArkPassive 구조를 확인합니다.')}</p>

    <div class="analysisGrid">
      <div class="analysisBox">
        <h3>Root Keys</h3>
        <p>${escapeHtml((analysis.rootKeys || []).join(', ') || '-')}</p>
      </div>
      <div class="analysisBox">
        <h3>ArkPassive Points</h3>
        ${renderPoints(analysis.points)}
      </div>
    </div>

    <details class="bigDetails" open>
      <summary>노드 후보 객체</summary>
      ${renderLikelyObjects(analysis.likelyNodeObjects)}
    </details>

    <details class="bigDetails">
      <summary>필드 경로 전체 보기</summary>
      ${renderFieldPaths(analysis.fieldPaths)}
    </details>

    <details class="bigDetails">
      <summary>ArkPassive 원본 미리보기</summary>
      <pre class="rawPreview">${escapeHtml(analysis.rawPreview || '원본 없음')}</pre>
    </details>

    <p class="note">v1.1.0: 이 화면에서 실제 노드명/레벨이 어느 필드에 있는지 확인한 뒤 다음 버전에서 파서를 확정합니다.</p>
  `;
  extractCard.classList.remove('hidden');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = input.value.trim();
  if (!name) return showStatus('캐릭터명을 입력해줘.', true);

  hideCards();
  setLoading(true);
  showStatus('캐릭터 정보를 불러오는 중...');

  try {
    const response = await fetch(`/api/character?name=${encodeURIComponent(name)}`);
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || `조회 실패: HTTP ${response.status}`);

    hideStatus();
    renderCharacter(data);
    renderSummary(data);
    renderExtractResult(data);
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    setLoading(false);
  }
});
