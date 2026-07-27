import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { access, readFile, unlink } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const publicRoot = join(process.cwd(), 'public');
const chromeDebugLog = join(process.cwd(), 'debug.log');
let chromeDebugLogExisted = true;
try { await access(chromeDebugLog); } catch { chromeDebugLogExisted = false; }
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = normalize(join(publicRoot, relative));
    if (!filePath.startsWith(publicRoot)) throw new Error('invalid path');
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end('{}');
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
process.env.CHROME_LOG_FILE = join(tmpdir(), 'loa-skill-ui-chrome.log');
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });

const skillItem = {
  name: '표본 기술', icon: '', level: 14, type: '일반', skillType: 1,
  effects: {
    critRate: 10, critDamage: 40, critHitDamage: 5, additionalDamage: 12,
    enemyDamage: 8, attackPower: 6, attackSpeed: 4, moveSpeed: 3, skillDamage: 30
  },
  selectedTripods: []
};
const characterResponse = {
  ok: true,
  apiVersion: '5.9.1',
  profile: {
    CharacterName: '스킬표본', CharacterClassName: '브레이커', ServerName: '아브렐슈드',
    ItemAvgLevel: '1,700.00', CombatPower: '5,000.00', CharacterImage: '',
    Stats: [{ Type: '치명', Value: '1500' }, { Type: '신속', Value: '900' }]
  },
  arkPassive: { Title: '수라의 길', Effects: [] },
  accessoryEffects: { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] },
  braceletEffects: { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] },
  abilityStoneEffects: { attackPower: 0, effects: {}, engravings: [], items: [] },
  engravingEffects: { effects: {}, items: [], adrenaline: { adopted: false, level: 0, critRate: 0, attackPower: 0 } },
  arkGridEffects: { critRate: 0, critDamage: 0, attackSpeed: 0, moveSpeed: 0, enemyDamage: 0, additionalDamage: 0, items: [] },
  skillEffects: { items: [skillItem], calculableItems: [skillItem], selectedTripodCount: 3, ignoredCooldownCount: 1 },
  powerSnapshot: null
};

async function verifyViewport(viewport) {
  const page = await browser.newPage({ viewport });
  await page.route('**/api/character**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(characterResponse) }));
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('캐릭터명 입력').fill('스킬표본');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByRole('heading', { name: /스킬표본/ }).waitFor();
  await page.locator('.advancedInputDetails').evaluate(element => { element.open = true; });

  const select = page.getByLabel('대표 스킬 효과');
  await select.selectOption({ label: '표본 기술 Lv.14' });
  await page.locator('#skillEffectPreview').getByText('치적 +10%').waitFor();
  const preview = await page.locator('#skillEffectPreview').innerText();
  assert.match(preview, /치피 \+40%/);
  assert.match(preview, /스킬 피해 \+30%/);
  assert.doesNotMatch(preview, /쿨감|재사용 대기시간/);

  const source = await page.locator('#sourceSummary').textContent();
  assert.match(source, /스킬 · 표본 기술/);
  assert.match(source, /스킬 피해/);
  const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(layout.scrollWidth <= layout.width + 1, `${viewport.width}px 화면에서 가로 넘침: ${layout.scrollWidth} > ${layout.width}`);
  const screenshot = await page.screenshot({ fullPage: true });
  assert.ok(screenshot.length > 10000, '브라우저 화면이 비어 있습니다.');
  await page.close();
}

try {
  await verifyViewport({ width: 1440, height: 1000 });
  await verifyViewport({ width: 390, height: 844 });
  console.log('skill effect UI tests passed');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  if (!chromeDebugLogExisted) await unlink(chromeDebugLog).catch(() => {});
}
