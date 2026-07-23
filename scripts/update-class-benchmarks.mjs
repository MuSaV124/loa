import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { CLASS_BENCHMARK_CATALOG, CLASS_DISPLAY_ORDER } from './class-benchmark-catalog.mjs';

const outputPath = path.resolve('public/class-benchmarks.json');
const statsUrl = 'https://loawa.com/stat/class-cores';
const settingStatsUrl = 'https://loagg.com/stats';
const slotOrder = new Map([['해', 0], ['달', 1], ['별', 2]]);

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
  if (rows.length < 20) throw new Error(`직업 통계 카드가 ${rows.length}개만 수집되었습니다.`);
  return { dataDate, rows };
}

function parseSettingOption(text) {
  const match = String(text || '').trim().match(/^(.*?) \(([^()]*)\) \(([\d,]+)명\)$/);
  if (!match) return null;
  const coreNames = match[1].split('/').map(name => name.trim()).filter(Boolean);
  if (coreNames.length !== 3) return null;
  return {
    coreNames,
    evolution: match[2].trim(),
    sampleUsers: Number(match[3].replaceAll(',', ''))
  };
}

async function scrapePopularBuilds(context) {
  const indexPage = await context.newPage();
  await indexPage.goto(settingStatsUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await indexPage.waitForSelector('a[href^="/stats/setting/"]', { timeout: 60_000 });
  const links = await indexPage.locator('a[href^="/stats/setting/"]').evaluateAll(items => items.map(item => ({
    href: item.href,
    text: item.textContent.trim()
  })));
  await indexPage.close();

  const targets = CLASS_BENCHMARK_CATALOG.map(item => {
    const engraving = item.settingEngraving || item.engraving;
    const link = links.find(candidate => {
      const label = normalize(candidate.text);
      return label.includes(normalize(engraving));
    });
    return { item, link };
  }).filter(target => target.link);

  const results = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const target = targets[cursor++];
      const page = await context.newPage();
      try {
        await page.goto(target.link.href, { waitUntil: 'domcontentloaded', timeout: 90_000 });
        await page.waitForSelector('select option:nth-child(2)', { state: 'attached', timeout: 25_000 });
        const options = await page.locator('select').first().locator('option').allTextContents();
        const parsed = options.map(parseSettingOption).filter(Boolean).sort((a, b) => b.sampleUsers - a.sampleUsers)[0];
        if (parsed) {
          results.set(`${normalize(target.item.className)}:${normalize(target.item.engraving)}`, {
            ...parsed,
            sourceUrl: target.link.href
          });
        }
      } catch {
        // A missing page keeps the last verified representative setting.
      } finally {
        await page.close();
      }
    }
  }
  await Promise.all(Array.from({ length: 5 }, () => worker()));
  return results;
}

function resolveCores(row, catalogItem, previousBuild, popularBuild) {
  const previousByName = new Map((previousBuild?.cores || []).map(core => [normalize(core.name), core]));
  const coreNames = popularBuild?.coreNames || catalogItem.coreNames;
  const cores = coreNames.map(name => {
    const normalizedName = normalize(name);
    const exactMatch = row?.items?.find(item => normalize(item.name) === normalizedName);
    const partialMatch = normalizedName.length >= 4
      ? row?.items?.find(item => normalize(item.name).includes(normalizedName) || normalizedName.includes(normalize(item.name)))
      : null;
    const match = exactMatch || partialMatch;
    const previous = previousByName.get(normalize(name));
    return {
      slot: match?.slot || previous?.slot || '',
      name,
      adoption: match?.adoption ?? previous?.adoption ?? 0,
      group: match?.group || previous?.group || ''
    };
  });
  if (cores.length && (cores.length !== 3 || cores.some(core => !slotOrder.has(core.slot)))) {
    throw new Error(`${catalogItem.className} ${catalogItem.engraving}: 해/달/별 슬롯을 모두 확인하지 못했습니다.`);
  }
  return cores.sort((a, b) => slotOrder.get(a.slot) - slotOrder.get(b.slot));
}

function groupCatalog(scraped, previous, popularBuilds) {
  const byClass = new Map(scraped.rows.map(row => [normalize(row.className), row]));
  const previousBuilds = new Map();
  for (const previousClass of previous?.classes || []) {
    for (const previousBuild of previousClass.builds || []) {
      previousBuilds.set(`${normalize(previousClass.className)}:${normalize(previousBuild.engraving)}`, previousBuild);
    }
  }

  return CLASS_DISPLAY_ORDER.map(className => {
    const row = byClass.get(normalize(className));
    const builds = CLASS_BENCHMARK_CATALOG
      .filter(item => item.className === className)
      .map(item => {
        const previousBuild = previousBuilds.get(`${normalize(className)}:${normalize(item.engraving)}`);
        const popularBuild = popularBuilds.get(`${normalize(className)}:${normalize(item.engraving)}`);
        return {
          engraving: item.engraving,
          cores: resolveCores(row, item, previousBuild, popularBuild),
          evolution: popularBuild?.evolution || previousBuild?.evolution || item.evolution,
          ratio: item.ratio,
          ...(popularBuild?.sampleUsers ? { sampleUsers: popularBuild.sampleUsers } : previousBuild?.sampleUsers ? { sampleUsers: previousBuild.sampleUsers } : {}),
          ...(popularBuild?.sourceUrl ? { sourceUrl: popularBuild.sourceUrl } : previousBuild?.sourceUrl ? { sourceUrl: previousBuild.sourceUrl } : {}),
          ...(item.status ? { status: item.status } : {})
        };
      });
    return { className, builds };
  });
}

async function main() {
  const previous = JSON.parse(await fs.readFile(outputPath, 'utf8'));
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  try {
    const context = await browser.newContext({
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    const [scraped, popularBuilds] = await Promise.all([
      scrapeWeeklyCores(page),
      scrapePopularBuilds(context)
    ]);
    const classes = groupCatalog(scraped, previous, popularBuilds);
    const updated = {
      version: 2,
      updatedAt: new Date().toISOString(),
      popularSettingsDate: scraped.dataDate,
      ratioBasisDate: '2026-07-22',
      filters: {
        minCombatPower: 4500,
        maxCombatPower: 5500,
        representativeOnly: true
      },
      benchmark: {
        combatPower: 5000,
        lumerusHp: 100000000000
      },
      sources: [
        { label: 'LOAWA 직업별 아크그리드 통계', url: statsUrl },
        { label: 'LOAGG 직업각인별 대표 세팅 통계', url: settingStatsUrl },
        { label: '7월 22일 밸런스 패치 후 루메루스 배율 표본', url: 'https://www.inven.co.kr/board/lostark/6271/3927487' }
      ],
      excludedClasses: ['바드', '도화가'],
      classes
    };
    await fs.writeFile(outputPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
    console.log(`updated ${classes.length} dealer classes, ${classes.reduce((sum, row) => sum + row.builds.length, 0)} engravings and ${popularBuilds.size} popular settings for ${scraped.dataDate}`);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
