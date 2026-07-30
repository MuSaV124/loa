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
const systemChromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const chromePath = process.env.PLAYWRIGHT_CHROME_PATH || await access(systemChromePath).then(() => systemChromePath).catch(() => '');
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-gpu'],
  ...(chromePath ? { executablePath: chromePath } : {})
});

const skillItem = {
  name: '표본 기술', icon: '', level: 14, type: '일반', skillType: 1,
  baseCooldownSeconds: 20, currentTree: true, cooldown: { flatSeconds: 2, percentReduction: 0 },
  effects: {
    critRate: 100, critDamage: 160, critHitDamage: 5, additionalDamage: 12,
    enemyDamage: 8, attackPower: 6, attackSpeed: 4, moveSpeed: 3, skillDamage: 30
  },
  conditional: true,
  guaranteedCrit: true,
  timedSpeedEffects: { attackSpeed: 4, moveSpeed: 3 },
  selectedTripods: [{ tier: 3, slot: 0, name: '조건부 확정 치명', conditional: true, guaranteedCrit: true }]
};
const higherCritDamageSkillItem = {
  name: '상위 치피 기술', icon: '', level: 14, type: '일반', skillType: 1,
  baseCooldownSeconds: 16, currentTree: true, cooldown: { flatSeconds: 0, percentReduction: 0 },
  effects: {
    critRate: 0, critDamage: 210, critHitDamage: 0, additionalDamage: 0,
    enemyDamage: 0, attackPower: 0, attackSpeed: 0, moveSpeed: 0, skillDamage: 0
  },
  conditional: false,
  guaranteedCrit: false,
  selectedTripods: [{ tier: 2, slot: 1, name: '상위 치명타 피해' }]
};
const baselineSkillItem = {
  name: '기본 기술', icon: '', level: 12, type: '일반', skillType: 1,
  baseCooldownSeconds: 12, currentTree: true, cooldown: { flatSeconds: 0, percentReduction: 0 },
  effects: {
    critRate: 0, critDamage: 0, critHitDamage: 0, additionalDamage: 0,
    enemyDamage: 0, attackPower: 0, attackSpeed: 0, moveSpeed: 0, skillDamage: 0
  },
  conditional: false,
  guaranteedCrit: false,
  selectedTripods: [{ tier: 1, slot: 0, name: '일반 트라이포드' }]
};
const characterResponse = {
  ok: true,
  apiVersion: '5.9.12',
  profile: {
    CharacterName: '스킬표본', CharacterClassName: '브레이커', ServerName: '아브렐슈드',
    ItemAvgLevel: '1,700.00', CombatPower: '5,000.00', CharacterImage: '',
    Stats: [{ Type: '치명', Value: '1500' }, { Type: '신속', Value: '900' }]
  },
  arkPassive: { Title: '수라의 길', Effects: [{ Name: '뭉툭한 가시', Level: 2, Description: '', Tooltip: '' }] },
  accessoryEffects: { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] },
  braceletEffects: { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] },
  abilityStoneEffects: { attackPower: 0, effects: {}, engravings: [], items: [] },
  engravingEffects: { effects: {}, items: [], adrenaline: { adopted: false, level: 0, critRate: 0, attackPower: 0 } },
  arkGridEffects: { critRate: 0, critDamage: 0, attackSpeed: 0, moveSpeed: 0, enemyDamage: 0, additionalDamage: 0, items: [] },
  skillEffects: { items: [skillItem, higherCritDamageSkillItem, baselineSkillItem], cycleItems: [skillItem, higherCritDamageSkillItem, baselineSkillItem], calculableItems: [skillItem, higherCritDamageSkillItem], selectedTripodCount: 3, conditionalTripodCount: 1, cooldownTripodCount: 1, stochasticCooldownCount: 0, usedSkillCount: 3 },
  powerSnapshot: {
    profile: { className: '브레이커', secondClass: '수라의 길', combatPower: 5000, stats: [{ type: '신속', value: 900 }] },
    equipment: { combat: [], accessories: [] }, gems: { items: [], summary: {} }, arkGrid: { slots: [] }, effects: { arkGrid: { items: [] } }, coverage: {}
  }
};

async function verifyViewport(viewport) {
  const page = await browser.newPage({ viewport });
  await page.route('**/api/character**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(characterResponse) }));
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('캐릭터명 입력').fill('스킬표본');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByRole('heading', { name: /스킬표본/ }).waitFor();
  await page.locator('.advancedInputDetails').evaluate(element => { element.open = true; });

  await page.locator('#skillEffectPreview').getByText('현재 스킬트리 자동 반영').waitFor();
  const preview = await page.locator('#skillEffectPreview').innerText();
  assert.match(preview, /현재 트리 3개 · 효과값 2개/);
  assert.match(preview, /추천 적용 기준값/);
  assert.match(preview, /확정 치명/);
  assert.match(preview, /조건 충족/);
  assert.match(preview, /치적 \+100%/);
  assert.match(preview, /치피 \+160%/);
  assert.match(preview, /치피 \+210%/);
  assert.match(preview, /스킬 피해 \+30%/);
  assert.match(preview, /쿨 트포 1개/);
  assert.match(preview, /기본 20.0초 → 장착효과/);

  const source = await page.locator('#sourceSummary').textContent();
  assert.match(source, /스킬 효과 실험값/);
  assert.match(source, /표본 기술/);
  assert.match(source, /0보다 큰 증가 수치 중 최솟값/);
  assert.match(source, /확인된 증가 수치 중 최대치/);
  assert.match(source, /추천 적용 기준값/);
  assert.match(source, /뭉가 전환/, '확정 치명 +100%가 뭉가 초과 치적 전환에 사용되어야 한다.');
  const critDamageTotal = await page.locator('.sourceGroup').filter({ hasText: '치명타 피해' }).locator('summary em').innerText();
  assert.equal(critDamageTotal, '+360.00%', `기본 치피 200%에 스킬 최소치 160%가 적용되어야 합니다: ${critDamageTotal}`);
  const skillGainText = await page.locator('.sourceGroup').filter({ hasText: '스킬 효과 실험값' }).locator('summary em').innerText();
  const skillGain = Number(skillGainText.replace(/[^\d.-]/g, ''));
  assert.ok(Number.isFinite(skillGain) && skillGain > 0, `스킬 효과가 최종 기대값에 반영되지 않았습니다: ${skillGainText}`);
  const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(layout.scrollWidth <= layout.width + 1, `${viewport.width}px 화면에서 가로 넘침: ${layout.scrollWidth} > ${layout.width}`);
  const screenshot = await page.screenshot({ fullPage: true });
  assert.ok(screenshot.length > 10000, '브라우저 화면이 비어 있습니다.');
  await page.close();
}

async function verifySupportRecommendation() {
  const supportSkill = (name, baseCooldownSeconds, flatSeconds) => ({
    name, icon: '', level: 14, type: '일반', skillType: 0, currentTree: true, baseCooldownSeconds,
    cooldown: { flatSeconds, percentReduction: 0 }, effects: {
      critRate: 0, critDamage: 0, critHitDamage: 0, additionalDamage: 0, enemyDamage: 0,
      attackPower: 0, attackSpeed: 0, moveSpeed: 0, skillDamage: 0
    },
    selectedTripods: [{ name: flatSeconds ? '빠른 준비' : '지원 효과' }]
  });
  const supportSkills = [supportSkill('천상의 연주', 30, 6), supportSkill('음파 진동', 24, 0)];
  const response = {
    ...characterResponse,
    profile: { ...characterResponse.profile, CharacterName: '서폿표본', CharacterClassName: '바드', Stats: [{ Type: '신속', Value: '1800' }, { Type: '특화', Value: '600' }] },
    arkPassive: { Title: '절실한 구원', Effects: [
      { Name: '축복의 여신', Level: 3 }, { Name: '정열의 춤사위', Level: 2 },
      { Name: '선각자', Level: 1 }, { Name: '진군', Level: 1 }, { Name: '마나 용광로', Level: 2 }
    ] },
    skillEffects: { items: supportSkills, cycleItems: supportSkills, calculableItems: [], selectedTripodCount: 2, conditionalTripodCount: 0, cooldownTripodCount: 1, stochasticCooldownCount: 0, usedSkillCount: 2 },
    powerSnapshot: {
      profile: { className: '바드', secondClass: '절실한 구원', combatPower: 5000, stats: [{ type: '공격력', value: 170000 }, { type: '신속', value: 1800 }, { type: '특화', value: 600 }] },
      equipment: { combat: [], accessories: [] },
      gems: { items: [
        { skillName: '천상의 연주', kind: 'cooldown', level: 8, attackBonus: true, valid: true },
        { skillName: '음파 진동', kind: 'cooldown', level: 8, attackBonus: true, valid: true }
      ], summary: {} },
      arkGrid: { slots: [] }, effects: { accessory: { items: [] }, bracelet: { items: [] }, arkGrid: { items: [] } }, coverage: {}
    }
  };
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route('**/api/character**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }));
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('캐릭터명 입력').fill('서폿표본');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByRole('heading', { name: /서폿표본/ }).waitFor();
  const recommendation = await page.locator('#recommendPanel').innerText();
  assert.match(recommendation, /서포터 진화 노드/);
  assert.match(recommendation, /축복의 여신/);
  assert.match(recommendation, /종합 파티 기여/);
  assert.match(recommendation, /공증 가동률/);
  assert.match(recommendation, /현재 스킬 주기·파티 기여 기준/);
  await page.close();
}

try {
  await verifyViewport({ width: 1440, height: 1000 });
  await verifyViewport({ width: 390, height: 844 });
  await verifySupportRecommendation();
  console.log('skill effect UI tests passed');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  if (!chromeDebugLogExisted) await unlink(chromeDebugLog).catch(() => {});
}
