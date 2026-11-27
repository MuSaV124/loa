import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import { parseCharacterArmory } from '../api/character.js';
import { buildCharacterSetup, renderCharacterSetup } from '../public/character-setup.js';

const [archivePath, beforeRoot, screenshotPath] = process.argv.slice(2);
if (!archivePath || !beforeRoot || !screenshotPath) throw new Error('Pass the archived Armory samples, baseline worktree and screenshot folder.');
const archive = JSON.parse(await readFile(archivePath, 'utf8'));
const captured = archive.samples.filter(row => row.raw?.ArmoryProfile && row.classExpected === row.className);
assert.equal(captured.length, 99);
assert.equal(new Set(captured.map(row => row.className)).size, 30);
const parsed = captured.map(row => parseCharacterArmory(row.raw, { arkGrid: { data: row.arkGrid }, combatSkills: { data: row.skills } }));
assert.equal(new Set(parsed.map(row => row.profile.CharacterClassName + '/' + row.arkPassive?.Title)).size, 60);
const counts = { characters: parsed.length, gear: 0, accessories: 0, gems: 0, engravings: 0, cores: 0, gridGems: 0, cards: 0, avatars: 0 };
for (const data of parsed) {
  const setup = buildCharacterSetup(data);
  const assertRaw = (rows, raw, type) => assert.deepEqual(rows.filter(row => row.item).map(row => row.item.name).sort(),
    (raw ?? []).filter(row => type.has(row.Type)).map(row => row.Name).sort());
  assertRaw(setup.gear, data.raw.ArmoryEquipment, new Set(['무기', '투구', '머리장식', '상의', '하의', '장갑', '어깨', '견갑', '완갑']));
  assertRaw(setup.accessories, data.raw.ArmoryEquipment, new Set(['목걸이', '귀걸이', '반지', '팔찌', '어빌리티 스톤']));
  for (const { slot, item } of setup.gear.filter(row => row.item)) {
    const raw = data.raw.ArmoryEquipment.find(row => row.Name === item.name);
    assert.equal(item.grade, raw.Grade, slot);
    const rawHoning = raw.Name.match(/^\+(\d+)/)?.[1];
    if (rawHoning) assert.equal(String(item.honing), rawHoning, slot);
  }
  assert.equal(setup.gems.length, data.raw.ArmoryGem?.Gems?.length ?? 0);
  for (const effect of data.raw.ArmoryGem?.Effects?.Skills ?? []) {
    const gem = setup.gems.find(row => row.skill === effect.Name && row.texts.some(line => /%/.test(line)));
    if ((Array.isArray(effect.Description) ? effect.Description.join(' ') : effect.Description ?? '').includes('%')) {
      assert.ok(gem, `Missing official gem percentage for ${effect.Name}`);
    }
  }
  assert.equal(setup.engravings.length, data.raw.ArmoryEngraving?.ArkPassiveEffects?.length ?? data.equippedEngravings.length);
  assert.equal(setup.grid.length, (data.arkGrid?.Slots ?? []).filter(row => row.Name || row.Tooltip).length);
  assert.equal(setup.cards.length, data.raw.ArmoryCard?.Cards?.length ?? 0);
  assert.equal(setup.avatars.length, data.avatarEffects.count);
  counts.gear += setup.gear.filter(row => row.item).length;
  counts.accessories += setup.accessories.filter(row => row.item).length;
  counts.gems += setup.gems.length;
  counts.engravings += setup.engravings.length;
  counts.cores += setup.grid.length;
  counts.gridGems += setup.grid.reduce((n, row) => n + row.gems.length, 0);
  counts.cards += setup.cards.length;
  counts.avatars += setup.avatars.length;
  const out = { innerHTML: '' };
  renderCharacterSetup(out, data);
  assert.equal((out.innerHTML.match(/<section class="panel setupCard/g) ?? []).length, 8);
}
console.log(JSON.stringify(counts));

const output = resolve(screenshotPath);
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'coverage.json'), JSON.stringify(counts, null, 2) + '\n');
const display = parsed.find(data => data.powerSnapshot.equipment.combat.some(item => item.advancedHoningLevel > 0)
  && data.powerSnapshot.gems.summary.total === 11 && data.arkGrid?.Slots?.length === 6) ?? parsed[0];
const other = parsed.find(data => data.profile.CharacterClassName !== display.profile.CharacterClassName);
const freshName = '신규검색검증';
const missingName = '부분응답검증';
const emptyName = '미착용검증';
const errorName = '오류응답검증';
const withName = (data, name, changes = {}) => ({ ...data, ...changes, profile: { ...data.profile, CharacterName: name } });
const missing = withName(other, missingName, { raw: undefined, equipment: undefined, powerSnapshot: undefined,
  gems: undefined, arkGrid: undefined, cardEffects: undefined, avatarEffects: undefined });
const empty = withName(parseCharacterArmory({ ArmoryProfile: other.profile, ArmoryEquipment: [], ArmoryGem: { Gems: [] }, ArkPassive: other.arkPassive }), emptyName);
const mainName = display.profile.CharacterName;
const refreshed = withName(display, mainName, { raw: { ...display.raw, ArmoryEquipment: display.raw.ArmoryEquipment.map(item =>
  item.Type === '무기' ? { ...item, Name: '+19 갱신 확인 무기' } : item) } });
const fixtures = new Map([[mainName, display], [freshName, withName(other, freshName)], [missingName, missing], [emptyName, empty]]);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const chrome = process.env.PLAYWRIGHT_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const executablePath = await access(chrome).then(() => chrome).catch(() => undefined);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-gpu'] });
const widths = [1920, 1366, 820, 390, 360];
const origin = 'http://character-setup.local';
const route = name => origin + '/character/' + encodeURIComponent(name);

async function open(root) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 1100 }, deviceScaleFactor: 1 });
  const errors = [];
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  const publicRoot = resolve(root, 'public');
  await page.route('**/*', async request => {
    const url = new URL(request.request().url());
    if (url.origin !== origin) {
      if (url.hostname === 'cdn-lostark.game.onstove.com') {
        try { return await request.continue(); } catch { return; }
      }
      return request.abort();
    }
    if (url.pathname === '/api/character') {
      const name = url.searchParams.get('name');
      const force = url.searchParams.has('force');
      requests.push({ name, force });
      const data = force && name === mainName ? refreshed : fixtures.get(name);
      return request.fulfill({ status: data ? 200 : 404, json: data ?? { error: '장비 검증용 API 오류' } });
    }
    if (url.pathname.startsWith('/api/')) return request.fulfill({ status: 200, json: { ok: true, items: [] } });
    const path = url.pathname === '/' || url.pathname.startsWith('/character/') ? '/index.html' : decodeURIComponent(url.pathname);
    const file = resolve(publicRoot, '.' + path);
    if (!file.startsWith(publicRoot + sep)) return request.abort();
    try {
      return await request.fulfill({ body: await readFile(file), contentType: (mime[extname(file)] || 'application/octet-stream') +
        (['.html', '.js', '.json', '.css'].includes(extname(file)) ? '; charset=utf-8' : '') });
    } catch { return request.fulfill({ status: 404, body: '' }); }
  });
  return { page, errors, requests };
}

try {
  for (const [tag, root] of [['before', beforeRoot], ['after', '.']]) {
    const { page, errors, requests } = await open(root);
    await page.goto(route(mainName), { waitUntil: 'domcontentloaded' });
    await page.locator('#keenPanel').waitFor({ state: 'visible', timeout: 60000 });
    const setup = page.locator('#characterSetupPanel');
    if (tag === 'after') await setup.waitFor({ timeout: 60000 });
    if (tag === 'before') assert.equal(await setup.count(), 0);
    await page.evaluate(async () => {
      const visible = [...document.querySelectorAll('img[loading="lazy"]')].filter(image => image.getClientRects().length);
      visible.forEach(image => { image.loading = 'eager'; });
      await Promise.race([Promise.allSettled(visible.map(image => image.decode())), new Promise(resolve => setTimeout(resolve, 4000))]);
    });
    for (const width of widths) {
      await page.setViewportSize({ width, height: 1200 });
      if (tag === 'after') {
        const fits = await setup.evaluate(element => ({
          cssColumns: getComputedStyle(element.querySelector('.setupGearGrid')).gridTemplateColumns.split(/\s+/).length,
          fit: [element, ...element.querySelectorAll('.setupCard, .setupRow, .setupIcon, summary')].every(node => {
            const rect = node.getBoundingClientRect();
            return rect.width === 0 || (rect.left >= 0 && rect.right <= document.documentElement.clientWidth + 1
              && node.scrollWidth <= node.clientWidth + 2);
          }),
          horizontal: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
          nextToKeen: Math.abs(element.getBoundingClientRect().top - document.querySelector('#keenPanel').getBoundingClientRect().bottom) <= 16
        }));
        assert.deepEqual(fits, { cssColumns: width > 760 ? 2 : 1, fit: true, horizontal: true, nextToKeen: true }, `${width}px`);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: resolve(output, `${tag}-${width}.png`), animations: 'disabled', fullPage: true, timeout: 45000 });
    }
    if (tag === 'before') { await page.close(); continue; }
    assert.equal(requests.filter(row => row.name === mainName).length, 1);
    await setup.getByText('상세 옵션', { exact: true }).first().click();
    assert.ok(await setup.locator('details[open]').first().isVisible());
    assert.ok((await setup.getByText('상급 재련', { exact: false }).count()) > 0);
    assert.match(await setup.textContent(), /재사용 대기시간.*% 감소|피해.*% 증가/s);
    await setup.getByText('활성 효과 및 장착 젬', { exact: true }).first().click();
    assert.ok(await setup.getByText('젬 옵션', { exact: true }).first().isVisible());
    await page.evaluate(() => {
      const key = 'loa-character-cache-v2';
      const value = JSON.parse(localStorage.getItem(key));
      const [entry] = Object.values(value);
      entry.savedAt = Date.now() - 12 * 60 * 60 * 1000;
      localStorage.setItem(key, JSON.stringify(value));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await setup.waitFor({ timeout: 60000 });
    assert.equal(requests.filter(row => row.name === mainName).length, 1, 'cached search triggered duplicate API');
    assert.ok(await setup.getByText('상세 옵션', { exact: true }).first().isVisible());
    await page.locator('#characterRefreshButton').click({ timeout: 60000 });
    await setup.getByText('+19 갱신 확인 무기', { exact: true }).waitFor({ timeout: 60000 });
    assert.equal(requests.filter(row => row.name === mainName && row.force).length, 1);
    await page.evaluate(() => {
      const key = 'loa-character-cache-v2';
      const value = JSON.parse(localStorage.getItem(key));
      for (const entry of Object.values(value)) delete entry.data.characterSetup;
      localStorage.setItem(key, JSON.stringify(value));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await setup.waitFor({ timeout: 60000 });
    assert.ok(await setup.locator('.setupGearGrid strong').first().isVisible());
    assert.equal(requests.filter(row => row.name === mainName).length, 2, 'legacy cache triggered duplicate API');
    await page.locator('#characterName').fill(freshName);
    await page.locator('#searchButton').click({ timeout: 60000 });
    await page.locator('#characterCard').getByText(freshName, { exact: false }).waitFor({ timeout: 60000 });
    assert.equal(requests.filter(row => row.name === freshName).length, 1);
    assert.equal(await setup.getByText('+19 갱신 확인 무기', { exact: true }).count(), 0);
    for (const name of [missingName, emptyName]) {
      await page.goto(route(name), { waitUntil: 'domcontentloaded' });
      await setup.waitFor({ timeout: 60000 });
      assert.equal(await setup.locator('.setupGearGrid strong').count(), 0);
      assert.ok(await page.locator('#keenPanel').isVisible());
    }
    await page.goto(route(errorName), { waitUntil: 'domcontentloaded' });
    await page.getByText('장비 검증용 API 오류', { exact: true }).waitFor({ timeout: 60000 });
    assert.equal(await setup.isVisible(), false);
    assert.equal(await page.locator('#characterRetryButton').isVisible(), true);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Character setup display, layout, details, new, cache, refresh, partial, empty and error paths passed');
} finally {
  await browser.close();
}
