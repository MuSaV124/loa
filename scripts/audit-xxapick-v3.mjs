import assert from 'node:assert/strict';
import { access, appendFile, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname } from 'node:path';
import { chromium } from 'playwright';
import { getTransformedRoutes } from '@vercel/routing-utils';
import { parseCharacterArmory } from '../api/character.js';
import { pagePath } from '../public/page-route.js';

const [armoryFile, marketFile, output, mode = 'both'] = process.argv.slice(2);
assert.ok(armoryFile && marketFile && output, 'Usage: node scripts/audit-xxapick-v3.mjs <armories> <market> <output> [both|ui|builds|armory]');
assert.ok(['both', 'ui', 'builds', 'armory'].includes(mode), 'Unknown audit mode');
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const archive = await readJson(armoryFile);
const market = await readJson(marketFile);
const fixtures = new Map();
const excluded = [];
for (const row of archive.samples) {
  if (!row.raw || !row.skills?.length) {
    excluded.push(row.name);
    continue;
  }
  const data = parseCharacterArmory(row.raw, { arkGrid: { data: row.arkGrid }, combatSkills: { data: row.skills } });
  const { className, secondClass } = data.powerSnapshot.profile;
  if (!className || !secondClass) excluded.push(row.name);
  else fixtures.set(data.profile.CharacterName, { data, build: `${className} / ${secondClass}` });
}
const catalog = await readJson(new URL('../docs/class-damage-audit-results.json', import.meta.url));
assert.deepEqual([...new Set([...fixtures.values()].map(row => row.build))].sort(), catalog.cases.map(row =>
  `${row.className} / ${row.className === '데빌헌터' && row.build === '강화 무기' ? '전술 탄환' : row.build}`).sort());
assert.equal(fixtures.size, 99);

const armoryChecks = [...fixtures.values()].map(({ data, build }) => {
  auditArmoryData(data);
  return { build, skills: data.skills.length, gems: data.powerSnapshot.gems.items.length,
    gridSlots: data.powerSnapshot.arkGrid.slots?.length ?? 0, worn: data.powerSnapshot.coverage };
});
if (mode === 'armory') {
  await writeFile(output, JSON.stringify({ sampleCount: fixtures.size, excluded, armoryChecks }, null, 2) + '\n');
  console.log(JSON.stringify({ samples: fixtures.size, builds: new Set(armoryChecks.map(row => row.build)).size }));
  process.exit(0);
}

const source = new URL('../public/', import.meta.url);
const { routes, error } = getTransformedRoutes(await readJson(new URL('../vercel.json', import.meta.url)));
assert.equal(error, null);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };
const staticFiles = new Map();
const probe = `
window.__xxapickAudit = () => {
  const model = prepareSkillScoring();
  const base = statsWithSelection(state.apiSelected, undefined, { ...model, cooldownExcluded: true, cooldownCache: new Map() });
  const equipped = statsWithSelection(state.apiSelected, undefined, model);
  const result = equipped.result;
  return {
    name: state.powerSnapshot.profile.name, support: isSupportPowerSnapshot(state.powerSnapshot),
    theory: base.result.value, equipped: result.value, critRate: result.critRate, critDamage: result.critDamage,
    scopedEngravings: equipped.stats.scopedEngravings, style: currentAttackStyle(model.units),
    skillRows: result.skillExperiment.items.map(r => [r.name, r.share, r.value, r.rawCritRate, r.critDamage, r.attack.source, r.attack.direction]),
    cycles: state.skillCycle.items.map(r => [r.name, r.baseCooldownSeconds, r.effectiveCooldownSeconds]),
    grid: state.powerSnapshot.arkGrid, mana: state.manaCharacter,
    estimates: state.powerCostEstimates.map(row => ({ category: row.category, available: row.available, metric: specEfficiencyMetric(row),
      percent: specEfficiencyPercent(row), gold: row.expectedCost?.expectedGold ?? null, complete: row.expectedCost?.complete ?? null,
      expectedAttempts: row.expectedCost?.expectedAttempts ?? null, reason: specEfficiencyReason(row) })),
    market: ['gem', 'engraving', 'material', 'crystal'].map(section => marketSectionData(section)?.updatedAt ?? null)
  };
};
window.__xxapickAuditReady = () => state.powerCostEstimates.some(row => row.category === 'gem');
window.__xxapickAuditNavigate = name => navigatePage({ page: 'nodes', name, mode: 'theory' });`;
const tracedApp = await readFile(new URL('app.js', source), 'utf8') + probe;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const matched = routes.find(route => route.src && new RegExp(route.src).test(url.pathname));
    const path = matched?.dest || (url.pathname === '/' ? '/index.html' : url.pathname);
    const file = new URL('.' + decodeURIComponent(path), source);
    if (!file.href.startsWith(source.href)) throw new Error('Invalid asset path');
    const type = types[extname(file.pathname)] || 'application/octet-stream';
    if (!staticFiles.has(file.href)) staticFiles.set(file.href, await readFile(file));
    const body = staticFiles.get(file.href);
    res.writeHead(200, { 'Content-Type': type });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(await readFile(new URL('404.html', source)));
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const installedChrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const executablePath = process.env.PLAYWRIGHT_CHROME_PATH || await access(installedChrome).then(() => installedChrome, () => undefined);
const browser = await chromium.launch({ executablePath, headless: true });

async function instrument(page, { traces = false } = {}) {
  const log = { requests: {}, errors: [], consoleErrors: [], network: [], characterFailures: new Map(), marketFailures: new Set(), avatarFailedParts: new Set() };
  page.on('pageerror', failure => log.errors.push(failure.message));
  page.on('console', message => { if (message.type() === 'error') log.consoleErrors.push(message.text()); });
  page.on('response', response => {
    if (response.url().startsWith(origin) && response.status() >= 400) log.network.push([response.status(), new URL(response.url()).pathname]);
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      if (route.request().resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' });
      return route.fulfill({ status: 204 });
    }
    if (traces && url.pathname === '/app.js') {
      return route.fulfill({ contentType: 'text/javascript', body: tracedApp });
    }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const name = url.searchParams.get('name');
    const modeName = url.searchParams.get('mode');
    const forced = url.searchParams.get('force') === '1';
    const key = [url.pathname, modeName || name, forced && 'force'].filter(Boolean).join('/');
    log.requests[key] = (log.requests[key] || 0) + 1;
    if (url.pathname === '/api/character') {
      if (log.characterFailures.get(name) > 0) {
        log.characterFailures.set(name, log.characterFailures.get(name) - 1);
        return route.fulfill({ status: 503, json: { error: '격리 캐릭터 API 오류' } });
      }
      const fixture = fixtures.get(name)?.data;
      return fixture ? route.fulfill({ json: fixture }) : route.fulfill({ status: 404, json: { error: '격리 표본 없음' } });
    }
    if (forced && log.marketFailures.has(modeName ?? url.pathname)) return route.fulfill({ status: 503, json: { error: '격리 시세 API 오류' } });
    if (url.pathname === '/api/lostark-news') return route.fulfill({ json: { ok: true, featured: { title: '격리 공식 공지 표본', url: 'https://lostark.game.onstove.com/News/Notice/Views/13606' } } });
    if (url.pathname === '/api/market-snapshot') return route.fulfill({ json: market });
    if (url.pathname === '/api/crystal-price') return route.fulfill({ json: market.sections.crystal });
    if (url.pathname === '/api/legend-avatars') {
      const part = url.searchParams.get('part');
      if (forced && log.avatarFailedParts.has(part)) return route.fulfill({ status: 503, json: { error: '격리 아바타 시세 API 오류' } });
      return route.fulfill({ json: { ok: true, scanned: 1, item: { name: part, price: 12000, tradeRemainCount: 3 } } });
    }
    const section = { gemList: 'gem', engravingList: 'engraving', t4Materials: 'material' }[modeName];
    if (section) return route.fulfill({ json: market.sections[section] });
    if (modeName === 'accessory') {
      if (!url.searchParams.get('role') && url.searchParams.get('combo') === 'reverseHighMid') {
        return route.fulfill({ json: { ok: true, items: [], accessoryDebug: { filterStats: { quality: 1 } } } });
      }
      const item = { name: '격리 장신구', price: 25000, quality: 96, pheonCost: 43, tradeRemainCount: 3 };
      return route.fulfill({ json: { ok: true, lowest: item, items: [item], debug: { responseItems: 1 } } });
    }
    return route.fulfill({ status: 501, json: { error: '테스트에서 정의하지 않은 API 요청' } });
  });
  return log;
}

const near = (actual, expected, delta = 1e-8) => assert.ok(Math.abs(actual - expected) <= delta, `${actual} vs ${expected}`);
const waitRanks = page => page.locator('#recommendList:not([aria-busy])').waitFor({ state: 'attached', timeout: 240000 });
const byId = (page, id) => page.locator(`#${id}`);
const simulatorPath = name => pagePath({ page: 'simulator', name });
const powerRow = page => page.locator('#specEfficiencyTable .specEfficiencyRow');
const text = (page, id) => byId(page, id).innerText();
const goto = (page, path) => page.goto(origin + path, { waitUntil: 'domcontentloaded', timeout: 120000 });
const scopedName = [...fixtures].find(([, { data }]) => data.raw.ArmoryEngraving?.ArkPassiveEffects?.some(item => item.Name === '기습의 대가' || item.Name === '결투의 대가'))[0];
const supportName = [...fixtures].find(([, row]) => /절실한 구원|만개|축복의 오라|해방자/.test(row.build))[0];

function auditArmoryData(data) {
  const parsedNumber = value => Number(String(value).replaceAll(',', ''));
  const snapshot = data.powerSnapshot;
  const rawProfile = data.raw.ArmoryProfile;
  assert.equal(snapshot.profile.name, rawProfile.CharacterName);
  assert.equal(snapshot.profile.server, rawProfile.ServerName);
  assert.equal(snapshot.profile.className, rawProfile.CharacterClassName);
  assert.equal(snapshot.profile.secondClass, data.raw.ArkPassive.Title);
  assert.equal(snapshot.profile.itemAvgLevel, parsedNumber(rawProfile.ItemAvgLevel));
  if (rawProfile.CombatPower) assert.equal(snapshot.accuracyTarget.officialCombatPower, parsedNumber(rawProfile.CombatPower));
  assert.deepEqual(snapshot.profile.stats.map(row => [row.type, row.value]), rawProfile.Stats.map(row => [row.Type, parsedNumber(row.Value)]));
  const wornTypes = new Set(['무기', '투구', '상의', '하의', '장갑', '어깨', '완갑']);
  assert.deepEqual(snapshot.equipment.combat.map(row => row.type).sort(), data.raw.ArmoryEquipment.filter(row => wornTypes.has(row.Type)).map(row => row.Type).sort());
  assert.deepEqual(snapshot.equipment.accessories.map(row => row.type).sort(), data.raw.ArmoryEquipment.filter(row => /목걸이|귀걸이|반지/.test(row.Type)).map(row => row.Type).sort());
  assert.equal(snapshot.gems.items.length, data.raw.ArmoryGem?.Gems?.length ?? 0);
  assert.equal(Boolean(snapshot.equipment.bracelet), data.raw.ArmoryEquipment.some(row => row.Type === '팔찌'));
  assert.equal(Boolean(snapshot.equipment.abilityStone), data.raw.ArmoryEquipment.some(row => row.Type === '어빌리티 스톤'));
  for (const gem of data.raw.ArmoryGem?.Gems || []) {
    const slot = snapshot.gems.items.find(row => row.slot === gem.Slot);
    assert.ok(slot, `Missing gem slot ${gem.Slot}`);
    if (gem.Level != null) assert.equal(slot.level, Number(gem.Level));
  }
}

function auditBuildData(fixture, payload) {
  assert.equal(payload.name, fixture.data.profile.CharacterName);
  assert.ok(payload.theory > 0 && Number.isFinite(payload.theory));
  assert.ok(payload.equipped > 0 && Number.isFinite(payload.equipped));
  const shares = payload.skillRows.reduce((sum, row) => sum + row[1], 0);
  if (shares) near(shares, 1);
  for (const [, weight, value, crit, critDamage] of payload.skillRows) {
    assert.ok([weight, value, crit, critDamage].every(Number.isFinite));
    assert.ok(weight >= 0 && value >= 0);
  }
  for (const [, base, effective] of payload.cycles) assert.ok(base > 0 && effective > 0 && Number.isFinite(effective));
  for (const row of payload.estimates.filter(row => row.available)) assert.ok(row.gold > 0 && row.complete !== false && row.percent > 0, JSON.stringify(row));
}

async function runBuilds() {
  const results = [];
  const jobs = [...fixtures];
  const firstPerBuild = [...new Map(jobs.map(entry => [entry[1].build, entry])).values()];
  const firstNames = new Set(firstPerBuild.map(([name]) => name));
  jobs.splice(0, jobs.length, ...firstPerBuild, ...jobs.filter(([name]) => !firstNames.has(name)));
  if (process.env.XXAPICK_AUDIT_CHARACTER) jobs.splice(0, jobs.length, ...jobs.filter(([name]) => name === process.env.XXAPICK_AUDIT_CHARACTER));
  assert.ok(jobs.length > 0, 'No armory matched XXAPICK_AUDIT_CHARACTER');
  const checkpointFile = `${output}.ndjson`;
  await writeFile(checkpointFile, '');
  let checkpoint = Promise.resolve();
  const concurrency = Math.max(1, Math.min(jobs.length, 6, Number(process.env.XXAPICK_AUDIT_WORKERS) || 3));
  await Promise.all(Array.from({ length: concurrency }, async () => {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    page.setDefaultTimeout(60000);
    const log = await instrument(page, { traces: true });
    try {
      await goto(page, '/');
      await page.waitForFunction(() => typeof window.__xxapickAuditNavigate === 'function');
      while (jobs.length) {
        const [name, fixture] = jobs.shift();
        const errors = [];
        const started = Date.now();
        const result = { name, build: fixture.build, errors };
        try {
          await page.evaluate(name => window.__xxapickAuditNavigate(name), name);
          await page.locator('#characterCard:not(.hidden)').waitFor();
          await waitRanks(page);
          result.rankRows = await page.locator('#recommendList .comboRow .rowMetric:first-child b').allTextContents();
          assert.ok(result.rankRows.length <= 5);
          const ranks = result.rankRows.map(value => Number(value.replace('%', '')));
          for (const [index, value] of ranks.entries()) if (index && Number.isFinite(value) && Number.isFinite(ranks[index - 1])) {
            assert.ok(value <= ranks[index - 1], `TOP5 order ${ranks.join(', ')}`);
          }
          const before = await page.evaluate(() => window.__xxapickAudit());
          const output = await text(page, 'currentScore');
          if (!before.support && !output.includes('미검증')) assert.ok(output.includes(before.theory.toFixed(4)), output);
          await byId(page, 'characterCombatLink').click();
          assert.equal(await page.locator('#combatSkillCycle .skillCycleRow:not(.skillCycleHeader)').count(), before.cycles.length);
          await byId(page, 'siteSimulatorLink').click();
          await byId(page, 'powerSnapshotPanel').waitFor();
          await page.locator('#specScenarioOutput .specScenarioMetrics').waitFor({ state: 'attached' });
          await page.waitForFunction(() => window.__xxapickAuditReady(), null, { timeout: 60000 });
          const payload = await page.evaluate(() => window.__xxapickAudit());
          assert.deepEqual(payload.skillRows, before.skillRows);
          near(payload.theory, before.theory);
          auditBuildData(fixture, payload);
          const scenario = await byId(page, 'specScenarioOutput').textContent();
          assert.match(scenario, /기대 피해 변화|복합 파티 기여/);
          assert.ok(scenario.includes(`${payload.critRate.toFixed(2)}%`));
          result.cards = { accessory: fixture.data.powerSnapshot.equipment.accessories.length, gems: fixture.data.powerSnapshot.gems.items.length,
            engraving: fixture.data.engravingEffects.items.length, grid: payload.grid.slots?.length ?? 0, skills: payload.skillRows.length,
            cooldown: payload.cycles.length, mana: payload.mana?.mpMax ?? null, support: payload.support ? 'ESTIMATED' : 'N/A' };
          result.calculations = { theory: payload.theory, equipped: payload.equipped, critRate: payload.critRate, critDamage: payload.critDamage,
            estimates: payload.estimates, market: payload.market, style: payload.style };
        } catch (failure) {
          errors.push(failure.message);
        }
        errors.push(...log.errors.splice(0));
        result.elapsedMs = Date.now() - started;
        results.push(result);
        checkpoint = checkpoint.then(() => appendFile(checkpointFile, JSON.stringify(result) + '\n'));
        await checkpoint;
        if (results.length % 10 === 0 || errors.length) console.log(JSON.stringify({ finished: results.length, name, errors }));
      }
    } finally {
      await page.close();
    }
  }));
  return results.sort((a, b) => a.build.localeCompare(b.build, 'ko') || a.name.localeCompare(b.name, 'ko'));
}

async function viewportAudit(width) {
  const mobile = width <= 390;
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: mobile, hasTouch: mobile });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(120000);
  const log = await instrument(page, { traces: true });
  const checks = {};
  const panelWidths = {};
  const times = {};
  async function check(id, action) {
    try { await action(); checks[id] = 'PASS'; }
    catch (failure) { checks[id] = `${failure.message}\n${failure.stack?.split('\n').find(line => /audit-xxapick-v3.mjs:\d+/.test(line)) ?? ''}`; }
  }
  async function layout(id) {
    const metrics = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
    panelWidths[id] = metrics;
    assert.ok(metrics.content <= metrics.viewport, `${id} overflow ${JSON.stringify(metrics)}`);
  }
  const click = id => byId(page, id).click();
  const option = (id, value) => byId(page, id).selectOption(value);
  const search = async name => {
    await byId(page, 'characterName').fill(name);
    await click('searchButton');
    await page.waitForFunction(name => decodeURIComponent(location.pathname).split('/').includes(name)
      || new URLSearchParams(location.search).get('character') === name, name, { timeout: 60000 });
  };
  const open = async selector => {
    const details = page.locator(selector).first();
    const summary = details.locator(':scope > summary');
    if (await details.getAttribute('open') === null) await summary.click();
    await page.locator(`${selector}:visible[open]`).first().waitFor({ state: 'attached' });
    return summary;
  };
  let initialCharacter;
  try {
    await check('H01 H02 H03', async () => {
      assert.equal((await goto(page, '/')).status(), 200);
      assert.equal(await page.locator('.pickTool').count(), 4);
      await layout('home');
      await page.getByText('격리 공식 공지 표본', { exact: true }).waitFor({ state: 'attached' });
      await page.locator('[data-home-search="character"]').click();
      await byId(page, 'characterName').press('Escape');
      await page.locator('[data-home-search="nodes"]').click();
      await search(scopedName);
      assert.match(new URL(page.url()).pathname, /\/nodes$/);
      await waitRanks(page);
      initialCharacter = await page.evaluate(() => window.__xxapickAudit());
      assert.equal(log.requests[`/api/character/${scopedName}`], 1);
      assert.equal(log.requests['/api/market-prices/accessory'] ?? 0, 0);
    });
    await check('C01 C02 C03 C04 C05', async () => {
      await click('characterOverviewLink');
      await layout('character');
      await open('#sourceSummary .sourceGroup');
      assert.ok(await page.locator('#sourceSummary .enlightenmentDetails summary').count() >= 2);
      for (const summary of await page.locator('#sourceSummary .enlightenmentDetails summary').all()) await summary.click();
      assert.match(await text(page, 'keenEfficiency'), /전설|유물/);
      await click('copyCharacterLink');
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), page.url());
    });
    await check('N01 N02 N03 N05 N08', async () => {
      await click('characterNodesLink');
      await layout('nodes');
      await option('manaRecommendationMode', 'theory');
      await waitRanks(page);
      const beforeScore = await text(page, 'sourceSummary');
      await open('#inputPanel details');
      await byId(page, 'extraCritRate').fill('15.5');
      const firstCard = page.locator('.nodeCard').first();
      await firstCard.focus();
      await page.locator('#nodeTooltip.visible').waitFor({ timeout: 4000 });
      const tooltip = await byId(page, 'nodeTooltip').boundingBox();
      assert.ok(tooltip && tooltip.x >= 0 && tooltip.x + tooltip.width <= width + 1);
      await firstCard.click();
      assert.equal(await text(page, 'sourceSummary'), beforeScore);
      const started = Date.now();
      await click('evolutionRecalculateButton');
      await waitRanks(page);
      times.nodeRecalculateMs = Date.now() - started;
      assert.notEqual(await text(page, 'sourceSummary'), beforeScore);
      await open('#recommendAdvanced');
      await byId(page, 'singleHitMainSkill').check();
      const rows = page.locator('#recommendList .comboRow');
      assert.ok(await rows.count() > 0 && await rows.count() <= 5);
      const detail = await open('#recommendList .comboRow details');
      await detail.click();
      await click('resetViewButton');
      assert.equal(await byId(page, 'evolutionRecalculateButton').isEnabled(), true);
      await layout('nodes-expanded');
    });
    await check('N04 N06 N07 B01', async () => {
      await click('characterCombatLink');
      await byId(page, 'combatPanel').waitFor();
      await layout('combat');
      await open('#manaScenarioPanel');
      await option('manaSupport', 'bard');
      await byId(page, 'manaShortageClass').check();
      await byId(page, 'manaMax').fill('3400');
      await click('applyManaScenario');
      await waitRanks(page);
      assert.match(await text(page, 'manaSupportSummary'), /천상의 연주/);
      assert.ok(await page.locator('#combatSkillCycle .skillCycleRow').count() > 1);
      assert.match(await text(page, 'currentScore'), /API/);
      if (await byId(page, 'directionRatePanel').isVisible()) {
        await open('#directionRatePanel');
        for (const input of await page.locator('#directionRateInputs input').all()) await input.fill('40');
        await page.locator('#combatRecalculateSlot button').click();
        await waitRanks(page);
      }
      await layout('combat-expanded');
    });
    await check('S01 S02 S03 S04 S05 S06 S07 S08 S09 S10 S11 S12 S14 S15 S16 S17', async () => {
      await click('siteSimulatorLink');
      await byId(page, 'powerSnapshotPanel').waitFor();
      await powerRow(page).first().waitFor({ timeout: 40000 });
      await layout('simulator');
      for (const category of ['normalHoning', 'advancedHoning', 'accessory', 'gem', 'engraving', 'all']) {
        await page.locator(`[data-spec-filter="${category}"]`).click();
        if (category !== 'all') assert.ok((await powerRow(page).evaluateAll(rows => rows.map(row => row.dataset.category))).every(value => value === category));
      }
      const more = byId(page, 'specCandidateMoreButton');
      if (await more.isVisible()) {
        await more.click();
        assert.equal(await more.getAttribute('aria-expanded'), 'true');
      }
      await page.locator('[data-planner-mode="budget"]').click();
      await byId(page, 'specPlannerBudgetInput').fill('550000');
      await byId(page, 'specPlannerBudgetInput').press('Tab');
      assert.equal(await byId(page, 'specPlannerBudgetInput').inputValue(), '550000');
      await page.locator('[data-planner-mode="target"]').click();
      await byId(page, 'specPlannerTargetInput').fill('8500');
      await open('.specScenarioPanel');
      const candidate = page.locator('label.specScenarioPick:visible').first();
      if (await candidate.isVisible()) {
        await candidate.click();
        assert.match(await text(page, 'specScenarioOutput'), /B 적용:/);
      }
      await click('specScenarioSaveButton');
      await click('specScenarioShareButton');
      assert.match(await page.evaluate(() => navigator.clipboard.readText()), /\/simulator\?scenario=/);
      await click('specScenarioClearButton');
      await click('specScenarioRestoreButton');
      await open('.powerBuildPanel');
      await open('#powerSnapshotPanel details.simulatorFold:has(> summary h3:text-is("장착 보석"))');
      await open('#powerSnapshotPanel .skillCyclePanel');
      await open('.powerCostPrep');
      await byId(page, 'crystalGoldPer100Input').fill('3000');
      await byId(page, 'pheonCrystalPerOneInput').fill('8');
      assert.match(await text(page, 'pheonGoldPerOneText'), /240/);
      const owned = page.locator('.ownedMaterialInput').first();
      await owned.fill('5');
      await owned.press('Tab');
      await option('armguardFromStage', '16');
      await option('armguardToStage', '17');
      await page.locator('label:has([name="armguardBreathMode"][value="none"])').click();
      assert.equal(await page.locator('[name="armguardBreathMode"][value="none"]').isChecked(), true);
      await page.locator('#armguardCostResult .armguardCostSummary').waitFor({ timeout: 40000 });
      assert.match(await text(page, 'armguardCostResult'), /16\s*→\s*\+?17/);
      await open('.simulatorMethodNote');
      await layout('simulator-expanded');
      await click('simulatorBackButton');
      await page.waitForURL(/\/character\//);
      assert.ok(new URL(page.url()).pathname.startsWith('/character/'));
    });
    await check('M01 M02 M03 M04 M05 M06 M07', async () => {
      await page.locator('[data-tab="market"]').click();
      await layout('market');
      await option('accPartSelect', 'ring');
      await option('accComboSelect', 'highMid');
      await click('accSearchButton');
      await page.locator('#accMarketResult').getByText('격리 장신구', { exact: false }).first().waitFor();
      await option('accComboSelect', 'reverseHighMid');
      await click('accSearchButton');
      const marketDebug = await open('#accMarketResult details');
      await marketDebug.click();
      for (const [category, result] of [['gem', 'gemMarketResult'], ['engraving', 'engravingMarketResult'], ['material', 'materialMarketResult'], ['crystal', 'crystalMarketResult'], ['avatar', 'avatarResult']]) {
        await page.locator(`[data-market-tab="${category}"]`).click();
        await byId(page, result).waitFor();
        await layout(category);
        if (category === 'avatar') {
          await page.locator('[data-avatar-job]').first().click();
          await page.getByText('머리/상의/하의/무기 모두 확인됨').waitFor();
          assert.match(await text(page, result), /48,000/);
          log.avatarFailedParts.add('무기');
          await click('avatarRefreshButton');
          await page.getByText(/이전 가격 무기/).waitFor();
          assert.match(await text(page, result), /48,000/);
          await click('avatarSearchAllButton');
        }
      }
    });
    await check('M04 M05 M06 M07 refresh failure', async () => {
      await goto(page, '/market?category=gem');
      await page.clock.setFixedTime(new Date(Date.now() + 11 * 60 * 1000));
      for (const [category, button, card, apiMode] of [
        ['gem', 'gemListButton', '.gemPriceCell', 'gemList'],
        ['engraving', 'engravingListButton', '#engravingMarketResult .marketRuleHint', 'engravingList'],
        ['material', 'materialListButton', '.materialPriceCard', 't4Materials'],
        ['crystal', 'crystalListButton', '.crystalExchangeCard', '/api/crystal-price']
      ]) {
        await page.locator(`[data-market-tab="${category}"]`).click();
        const result = page.locator(card).first();
        await result.waitFor();
        const before = await result.textContent();
        log.marketFailures.add(apiMode);
        const response = page.waitForResponse(response => response.url().includes('force=1') && response.status() === 503);
        await click(button);
        await response;
        await page.getByText(/갱신 실패/).filter({ visible: true }).first().waitFor();
        assert.equal(await result.textContent(), before);
      }
    });
    await check('R01', async () => {
      await page.locator('[data-tab="ratio"]').click();
      await page.locator('#ratioTable .ratioRoleGroup').first().waitFor();
      await layout('ratios');
      await byId(page, 'ratioSearchInput').fill('격리 없는 결과');
      assert.match(await text(page, 'ratioTable'), /검색 조건/);
      await byId(page, 'ratioSearchInput').fill('브레이커');
      assert.match(await text(page, 'ratioTable'), /브레이커/);
    });
    await check('H04 C04 reload', async () => {
      const path = pagePath({ page: 'nodes', name: scopedName, mode: 'theory' });
      await goto(page, path);
      await byId(page, 'characterCard').waitFor();
      await waitRanks(page);
      const initial = initialCharacter ?? await page.evaluate(() => window.__xxapickAudit());
      await click('characterCombatLink');
      await page.waitForURL(/\/combat/);
      await page.goBack();
      await page.waitForURL(origin + path);
      await page.goForward();
      await page.waitForURL(/\/combat/);
      await page.reload();
      await byId(page, 'characterCard').waitFor();
      await waitRanks(page);
      const restored = await page.evaluate(() => window.__xxapickAudit());
      assert.deepEqual(restored.scopedEngravings, initial.scopedEngravings);
      near(restored.theory, initial.theory);
      const missing = await goto(page, '/audit-missing-page');
      assert.equal(missing.status(), 404);
      await page.getByRole('link', { name: '메인으로 이동' }).click();
      await byId(page, 'homePanel').waitFor();
    });
    await check('H02 S13 character switch', async () => {
      log.characterFailures.set(supportName, 2);
      await goto(page, simulatorPath(supportName));
      await byId(page, 'characterRetryButton').waitFor();
      assert.match(await text(page, 'message'), /격리 캐릭터 API 오류/);
      await click('characterRetryButton');
      await byId(page, 'powerSnapshotPanel').waitFor();
      await open('.supportPowerPanel');
      await layout('support-simulator');
      await click('simulatorBackButton');
      await page.waitForURL(/\/character\//);
      await search(scopedName);
      await click('siteSimulatorLink');
      await byId(page, 'powerSnapshotPanel').waitFor();
      assert.equal(await page.locator('.supportPowerPanel').count(), 0);
      assert.equal(await page.evaluate(() => window.__xxapickAudit().name), scopedName);
    });
  } finally {
    await context.close();
  }
  return { width, checks, panelWidths, times, requests: log.requests, errors: log.errors, consoleErrors: log.consoleErrors, network: log.network };
}

try {
  const widths = process.env.XXAPICK_AUDIT_WIDTH ? [Number(process.env.XXAPICK_AUDIT_WIDTH)] : [1920, 1366, 820, 390, 360];
  const result = { origin: 'local Vercel routes, isolated archived Armory and market responses', sampleCount: fixtures.size, excluded, marketAt: market.sectionUpdatedAt, armoryChecks };
  if (mode !== 'builds') result.ui = await Promise.all(widths.map(async width => {
    const evidence = await viewportAudit(width);
    console.log(JSON.stringify({ width, checks: Object.fromEntries(Object.entries(evidence.checks).map(([key, value]) => [key, value.split('\n')[0]])), errors: evidence.errors }));
    return evidence;
  }));
  if (mode !== 'ui') result.builds = await runBuilds();
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  if (result.ui?.some(row => row.errors.length || Object.values(row.checks).some(value => value !== 'PASS'))
    || result.builds?.some(row => row.errors.length)) process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
