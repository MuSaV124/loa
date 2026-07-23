import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const outputPath = path.resolve('public/class-benchmarks.json');
const statsUrl = 'https://loawa.com/stat/class-cores';
const curatedCores = {
  가디언나이트: ['노바 플레임', '라스트 스탠드', '피니셔'],
  건슬링어: ['무법지대', '불릿 무빙', '풀 매거진'],
  기공사: ['광류연파', '천류섬열풍', '파공나선'],
  기상술사: ['비연참', '우산의 춤', '휘몰아치기'],
  데모닉: ['오미너스', '제노사이드', '치명적인 할퀴기'],
  데빌헌터: ['광란의 해결사', '샷건 오버로드', '지배자의 탄환'],
  디스트로이어: ['그라비티 코어', '대지 부수기', '몰아치는 중력'],
  리퍼: ['갈증의 악몽', '치명적 악몽', '치명적 연계'],
  발키리: ['종언', '종언의 기사', '진정한 종언'],
  배틀마스터: ['극의귀원', '용류 강화', '초순환'],
  버서커: ['광란', '다크 파워', '어둠의 격류'],
  브레이커: ['권왕십이식', '충격 충전', '충전된 충격'],
  블래스터: ['세이프 존', '초토화', '포화 전차'],
  블레이드: ['블레이드 웨이브', '일섬', '죽음의 검기'],
  서머너: ['고대의 유산', '오쉬의 지원', '창세의 힘'],
  소서리스: ['반복된 종말', '종말의 시', '종말의 시작'],
  소울이터: ['망자의 발걸음', '빙의', '소울 코어'],
  스카우터: ['어썰트 타이탄', '코어 리액터 증폭', '타이탄 슈트'],
  스트라이커: ['뇌호', '벽뢰호각', '섬호뇌격'],
  슬레이어: ['격노폭발', '교차된 힘', '신중한 강타'],
  아르카나: ['노말 인핸스', '셔플 댄스', '스택 홀드'],
  워로드: ['광역 낙뢰', '번개폭풍', '천둥'],
  인파이터: ['대지 붕괴', '대지 파괴', '투지 강화'],
  차원술사: ['결합 강화', '컴바인 웨폰', '타임 키퍼'],
  창술사: ['맹룡 회도', '연가 창식', '청룡기'],
  호크아이: ['TA-09 피어싱 애로우', 'HSU-98 버드 스트라이크', 'HSU-04 자동 제어 스코프'],
  홀리나이트: ['신의 권능', '징벌의 시간', '참하는 검'],
  환수사: ['곰은 사람을 찢어', '센 곰', '필살 곰']
};

function normalize(value) {
  return String(value || '').replace(/\s+/g, '').replace(/[·:]/g, '').toLowerCase();
}

function newestDate(values) {
  return values
    .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '2026-07-22')
    .sort()
    .at(-1);
}

async function scrapeWeeklyCores(page) {
  await page.goto(statsUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForSelector('select', { timeout: 60_000 });
  await page.waitForFunction(() => {
    const select = document.querySelector('select');
    return select && select.options.length >= 2;
  }, null, { timeout: 60_000 });

  const dateSelect = page.locator('select').first();
  const dates = await dateSelect.locator('option').evaluateAll(options => options.map(option => option.value));
  const dataDate = newestDate(dates);
  if (!dataDate) throw new Error('7월 22일 이후 로아와 통계 기준일을 찾지 못했습니다.');
  await dateSelect.selectOption(dataDate);
  await page.locator('input[aria-label="전투력 최소값"]:visible').fill('4500');
  await page.locator('input[aria-label="전투력 최대값"]:visible').fill('5500');
  await page.locator('input[type="checkbox"]:visible').check();
  const [response] = await Promise.all([
    page.waitForResponse(candidate => candidate.url().includes('/v1/statistics/class-breakdown/class-cores?'), {
      timeout: 90_000
    }),
    page.getByRole('button', { name: '적용', exact: true }).click()
  ]);
  if (!response.ok()) throw new Error(`LOAWA API ${response.status()}`);
  const payload = await response.json();
  const rows = (payload?.data?.groups || []).map(group => ({
    className: group.label || group.key,
    items: (group.items || []).map(item => ({
      slot: item.slot,
      group: item.group,
      name: item.label,
      adoption: Number(item.pct || 0)
    }))
  }));

  if (rows.length < 20) throw new Error(`직업 통계 카드가 ${rows.length}개만 수집되어 기존 데이터를 유지합니다.`);
  return { dataDate, rows };
}

function selectPopularCores(row, previous) {
  const names = curatedCores[previous.className] || (previous.cores || []).map(core => core.name);
  return names.map((name, index) => {
    const match = row.items.find(item => normalize(item.name) === normalize(name));
    return {
      slot: match?.slot || ['해', '달', '별'][index],
      name,
      ...(match ? { adoption: match.adoption, group: match.group } : {})
    };
  });
}

async function main() {
  const previous = JSON.parse(await fs.readFile(outputPath, 'utf8'));
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  try {
    const page = await browser.newPage({
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
    });
    const scraped = await scrapeWeeklyCores(page);
    const byClass = new Map(scraped.rows.map(row => [normalize(row.className), row]));
    const classes = previous.classes.map(row => {
      const current = byClass.get(normalize(row.className));
      if (!current) return row;
      return { ...row, cores: selectPopularCores(current, row) };
    });
    const updated = {
      ...previous,
      updatedAt: new Date().toISOString(),
      popularSettingsDate: scraped.dataDate,
      classes
    };
    await fs.writeFile(outputPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
    console.log(`updated ${classes.length} dealer classes for ${scraped.dataDate}`);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
