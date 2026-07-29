import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const systemChromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const chromePath = process.env.PLAYWRIGHT_CHROME_PATH || await access(systemChromePath).then(() => systemChromePath).catch(() => '');
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-gpu'],
  ...(chromePath ? { executablePath: chromePath } : {})
});
const css = await readFile(new URL('../public/style.css', import.meta.url), 'utf8');

function simulatorMarkup({ mobile }) {
  return `<!doctype html>
  <html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
  <body class="simulatorMode calculatorReady">
    <main class="wrap">
      <section id="powerSnapshotPanel" class="panel powerSnapshotPanel simulatorPanel">
        <div class="sectionHead">
          <div><h2>스펙업 효율 시뮬레이터</h2><p class="hint">현재 빌드의 전투력 상승량과 실시간 비용을 비교합니다.</p></div>
          <button class="simulatorBackButton" type="button">계산기로 돌아가기</button>
        </div>
        <div class="powerSnapshotView">
          <div class="powerSnapshotColumns">
            <div class="powerSnapshotBlock powerEfficiencyPanel">
              <div class="powerCostHead"><div><h3>스펙업 효율 순위</h3><p>전투력 상승률과 기대 골드를 비교합니다.</p></div></div>
              <section class="specPlannerPanel">
                <div class="specWorkspaceHead"><div><h4>목표 스펙업 경로</h4><p>효율이 좋은 다음 단계부터 계산합니다.</p></div><div class="specPlannerMode"><button>목표 전투력</button><button>예산</button></div></div>
                <div class="specPlannerInputs"><label><span>목표 전투력</span><input value="5547" /></label></div>
                <div class="specPlannerResultHead"><div><b>목표 달성 경로</b><small>목표 5,547 달성</small></div><div><strong>2,305,800G</strong><small>총 누적 골드</small></div><div><strong>0</strong><small>총 실링</small></div><div><strong>+128.55</strong><small>전투력 증가</small></div></div>
                <div class="specPlannerSteps"><div class="specPlannerStep"><span>1</span><div><b>진 파공권 겁화</b><small>Lv.8 → Lv.9</small></div><div><b>768,000G</b><small>개별 비용</small></div><div><b>768,000G</b><small>누적 사용 골드</small></div><div><b>5,488.97</b><small>예상 전투력</small></div></div></div>
              </section>
              <details class="specScenarioPanel"${mobile ? '' : ' open'}>
                <summary class="specScenarioSummary"><span><b>A/B 비교</b><small>현재 세팅과 선택한 후보를 비교합니다.</small></span></summary>
                <div class="specScenarioActions"><button>B 저장</button><button>불러오기</button><button>공유 링크</button><button>선택 해제</button></div>
                <div class="specScenarioMetrics"><div><span>공식 전투력</span><b>5,446.12</b><i>→</i><strong>5,488.97</strong></div><div><span>공격/이동 속도</span><b>125.97 / 125.97</b><i>→</i><strong>130.00 / 130.00</strong></div></div>
              </details>
              <div class="combatPowerCoverage"><div><span>브레이커 · 수라의 길</span><b>동일 직업 표본 있음</b></div></div>
              <div class="specEfficiencyToolbar"><button>전체</button><button>일반 재련</button><button>상급 재련</button><button>악세</button><button>보석</button><button>각인</button></div>
              <div class="specEfficiencyTable">
                <div class="specEfficiencyHeader"><span>스펙업 목표</span><span>효율</span><span>비용</span><span>비용/효율</span></div>
                <div class="specEfficiencyRow confidence-estimated">
                  <div class="specEfficiencyTarget"><label class="specScenarioPick"><input type="checkbox" aria-label="파천섬광 겁화 B 비교에 적용" /><span>B</span></label><span class="specEfficiencyRank">1</span><span></span><div><div class="specEfficiencyTargetTitle"><b>보석</b><em class="confidencePill estimated">추정</em></div><span>파천섬광 겁화 8→9레벨</span></div></div>
                  <div class="specEfficiencyStep"><b>0.790%</b><span>전투력 약 +42.85</span></div>
                  <div class="specEfficiencyExpected"><b>76.8만</b><span>기대 비용</span></div>
                  <div class="specEfficiencyCost"><b>97.2만</b><span>1% 상승당</span></div>
                  <div class="specEfficiencyDetail">Lv.8 → Lv.9 · 최저가 기준 · 추정 전투력</div>
                </div>
              </div>
            </div>
            <div class="powerSnapshotBlock powerCostPrep">
              <section class="armguardCostPanel" aria-labelledby="armguardCostTitle">
                <div class="armguardCostHeader">
                  <div><h4 id="armguardCostTitle">완갑 재련 기대비용</h4><p>장비 성장과 장인의 기운 천장을 포함한 구간별 평균 비용입니다.</p></div>
                  <div class="armguardRangeControls">
                    <label><span>현재 단계</span><select><option>0강</option></select></label><i>→</i>
                    <label><span>목표 단계</span><select><option>25강</option></select></label>
                  </div>
                </div>
                <div class="armguardCostResult">
                  <div class="armguardCostSummary">
                    <div><span>0→25강 기대 골드</span><strong>12,345,678G</strong><small>거래 9,000,000G · 재련 3,345,678G</small></div>
                    <div><span>기대 실링</span><strong>123,456,789</strong><small>성장과 재련 시도 합계</small></div>
                    <div><span>기대 재련 횟수</span><strong>321.5회</strong><small>25개 단계 합산</small></div>
                    <div><span>장기백 기준 횟수</span><strong>999회</strong><small>단계별 천장 합산</small></div>
                  </div>
                  <div class="armguardMaterialList">
                    ${['운명의 파편', '운명의 파괴석 결정', '운명의 수호석 결정', '운명의 돌파석', '상급 아비도스 융화제'].map(name => `<div class="armguardMaterialRow"><span>${name}</span><b>1,234,567</b><small>구매 1,234,567 · 99,999G</small></div>`).join('')}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>
    </main>
  </body></html>`;
}

async function verifyViewport(viewport) {
  const mobile = viewport.width <= 760;
  const page = await browser.newPage({ viewport });
  await page.setContent(simulatorMarkup({ mobile }));
  await page.addStyleTag({ content: css });

  const panel = page.locator('.powerEfficiencyPanel');
  const widths = await panel.evaluate(element => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
    children: Array.from(element.children).map(child => ({ className: child.className, client: child.clientWidth, scroll: child.scrollWidth }))
  }));
  assert.ok(widths.scroll <= widths.client + 1, `${viewport.width}px 시뮬레이터가 잘립니다: ${JSON.stringify(widths)}`);
  const armguardPanel = page.locator('.armguardCostPanel');
  const armguardFits = await armguardPanel.evaluate(element => element.scrollWidth <= element.clientWidth + 1);
  assert.ok(armguardFits, `${viewport.width}px 완갑 기대비용 패널이 잘립니다.`);

  if (mobile) {
    const rowColumns = await page.locator('.specEfficiencyRow').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    assert.equal(rowColumns, 1, '모바일 효율 행은 한 열로 배치되어야 합니다.');
    assert.equal(await page.locator('.specScenarioPanel').getAttribute('open'), null, '모바일 A/B 비교는 기본으로 접혀야 합니다.');
    await page.locator('.specScenarioPanel summary').click();
    const scenarioFits = await page.locator('.specScenarioMetrics').evaluate(element => element.scrollWidth <= element.clientWidth + 1);
    assert.ok(scenarioFits, '모바일 A/B 비교값이 화면 안에 표시되어야 합니다.');
    const toolbarRows = await page.locator('.specEfficiencyToolbar').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    assert.equal(toolbarRows, 3, '모바일 스펙업 필터는 3열이어야 합니다.');
    const armguardSummaryColumns = await page.locator('.armguardCostSummary').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    assert.equal(armguardSummaryColumns, 2, '모바일 완갑 요약은 2열이어야 합니다.');
  }

  const scenarioName = await page.locator('.specScenarioPick input').getAttribute('aria-label');
  assert.match(scenarioName || '', /파천섬광 겁화/, 'B 체크박스가 비교 후보 이름을 포함해야 합니다.');
  await page.close();
}

try {
  await verifyViewport({ width: 1440, height: 1000 });
  await verifyViewport({ width: 390, height: 844 });
  console.log('simulator UI tests passed');
} finally {
  await browser.close();
}
