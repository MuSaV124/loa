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

function nodeLabel(node) {
  const level = node.level ? ` Lv.${node.level}` : '';
  return `${node.name || '-'}${level}`;
}

function renderNodeGroup(title, nodes) {
  const list = Array.isArray(nodes) ? nodes : [];
  if (!list.length) {
    return `
      <div class="nodeGroup">
        <h3>${escapeHtml(title)}</h3>
        <p class="empty">추출된 노드 없음</p>
      </div>
    `;
  }

  return `
    <div class="nodeGroup">
      <h3>${escapeHtml(title)}</h3>
      <ul class="nodeList">
        ${list.map((node) => `
          <li>
            <strong>${escapeHtml(nodeLabel(node))}</strong>
            ${node.description ? `<span>${escapeHtml(node.description)}</span>` : ''}
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

function renderExtractResult(data) {
  const nodes = data.selectedNodes || {};
  const unknown = Array.isArray(nodes.unknown) ? nodes.unknown : [];
  extractCard.innerHTML = `
    <h2>선택 노드 확인</h2>
    <div class="nodeGrid">
      ${renderNodeGroup('진화', nodes.evolution)}
      ${renderNodeGroup('깨달음', nodes.enlightenment)}
      ${renderNodeGroup('도약', nodes.leap)}
    </div>
    ${unknown.length ? `
      <div class="nodeGroup unknownGroup">
        <h3>분류 필요</h3>
        <ul class="nodeList">
          ${unknown.map((node) => `
            <li>
              <strong>${escapeHtml(nodeLabel(node))}</strong>
              ${node.description ? `<span>${escapeHtml(node.description)}</span>` : ''}
            </li>
          `).join('')}
        </ul>
      </div>
    ` : ''}
    <p class="note">v1.0.9: 계산 전 단계입니다. 현재 선택된 진화/깨달음/도약 노드명과 레벨을 먼저 확인합니다.</p>
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
