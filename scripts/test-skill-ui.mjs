import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { access, readFile, unlink } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { getTransformedRoutes } from '@vercel/routing-utils';
import { evolutionAllocations } from '../public/evolution-math.js';
import { pagePath } from '../public/page-route.js';
import { encodeSpecScenario } from '../public/spec-planner.js';

const evolution = JSON.parse(await readFile(new URL('../public/data/evolution.json', import.meta.url), 'utf8'));
const fixedTier1 = [{ Name: '특화', Level: 30 }, { Name: '인내', Level: 10 }];
const evolutionPoints = Value => [{ Name: '진화', Value }];
const waitForRecommendations = page => page.locator('#recommendList:not([aria-busy])').waitFor({ state: 'attached', timeout: 60000 });
const openNodeRecommendation = page => page.locator('#characterNodesLink').click();

const vercelConfig = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const publicRoot = join(process.cwd(), vercelConfig.outputDirectory);
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
const { routes: vercelRoutes, error: routeError } = getTransformedRoutes(vercelConfig);
assert.equal(routeError, null);

const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    const route = vercelRoutes.find(route => route.src && new RegExp(route.src).test(pathname));
    const output = route?.dest ? new URL(pathname.replace(new RegExp(route.src), route.dest), 'http://localhost').pathname : pathname;
    if (output.startsWith('/api/')) throw new Error('test API requires a fixture');
    const filePath = join(publicRoot, output === '/' ? 'index.html' : decodeURIComponent(output.slice(1)));
    const underRoot = relative(publicRoot, filePath);
    if (!underRoot || underRoot === '..' || underRoot.startsWith('..' + sep)) throw new Error('invalid path');
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': contentTypes['.html'] });
    res.end(await readFile(join(publicRoot, '404.html')));
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
  apiVersion: '6.1.7',
  profile: {
    CharacterName: '스킬표본', CharacterClassName: '브레이커', ServerName: '아브렐슈드',
    ItemAvgLevel: '1,700.00', CombatPower: '5,000.00', CharacterImage: '',
    Stats: [{ Type: '치명', Value: '1500' }, { Type: '신속', Value: '900' }]
  },
  arkPassive: { Title: '테스트 전직', Points: evolutionPoints(115), Effects: [
    ...fixedTier1,
    { Name: '뭉툭한 가시', Level: 2, Description: '', Tooltip: '' },
    { Name: '깨달음', Level: 2, Description: '깨달음 4티어 치명의 기록 Lv.2' },
    {
      Name: '도약', Level: 1, Description: '도약 2티어 표본 강화 Lv.1',
      ToolTip: JSON.stringify({
        Element_000: { type: 'NameTagBox', value: '표본 강화' },
        Element_002: { type: 'MultiTextBox', value: '표본 기술 스킬의 치명타 피해가 20.0% 증가한다.' }
      })
    }
  ] },
  accessoryEffects: { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] },
  braceletEffects: { critRate: 0, critDamage: 0, critHitDamage: 0, enemyDamage: 0, additionalDamage: 0, items: [] },
  abilityStoneEffects: { attackPower: 0, effects: {}, engravings: [], items: [] },
  engravingEffects: { effects: {}, items: [], adrenaline: { adopted: false, level: 0, critRate: 0, attackPower: 0 } },
  arkGridEffects: {
    critRate: 0, critDamage: 0, attackSpeed: 0, moveSpeed: 0, enemyDamage: 1, additionalDamage: 0,
    items: [{
      name: '질서의 별 코어 : 표본', point: 20,
      activeTexts: ['적에게 주는 피해량이 1.0% 증가한다.', '표본 기술의 피해량이 10.0% 증가한다.']
    }]
  },
  skillEffects: { items: [skillItem, higherCritDamageSkillItem, baselineSkillItem], cycleItems: [skillItem, higherCritDamageSkillItem, baselineSkillItem], calculableItems: [skillItem, higherCritDamageSkillItem], selectedTripodCount: 3, conditionalTripodCount: 1, cooldownTripodCount: 1, stochasticCooldownCount: 0, usedSkillCount: 3 },
  powerSnapshot: {
    profile: { className: '브레이커', secondClass: '테스트 전직', combatPower: 5000, stats: [{ type: '신속', value: 900 }] },
    equipment: { combat: [], accessories: [] }, gems: { items: [], summary: {} }, arkGrid: { slots: [] }, effects: { arkGrid: { items: [] } }, coverage: {}
  }
};

async function verifyViewport(viewport) {
  const page = await browser.newPage({ viewport });
  await page.route('**/api/character**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(characterResponse) }));
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.version').textContent(), 'Version 6.1.7');
  await page.getByPlaceholder('캐릭터명 입력').fill('스킬표본');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByRole('heading', { name: /스킬표본/ }).waitFor();
  await openNodeRecommendation(page);
  assert.equal(await page.locator('.nodeCard[data-name="치명"].selected').count(), 0);
  await page.locator('.advancedInputPanel .advancedInputDetails').evaluate(element => { element.open = true; });

  await page.locator('#skillEffectPreview').getByText('현재 스킬트리 자동 반영').waitFor();
  const preview = await page.locator('#skillEffectPreview').innerText();
  assert.match(preview, /현재 트리 3개 · 계산 지분 100\.0%/);
  assert.match(preview, /트라이포드 효과 3개 · 깨달음·도약 1개 · 아크그리드 1개/);
  assert.match(preview, /아크그리드 · 표본 기술 · 스킬 피해 \+10%/);
  assert.match(preview, /표본 강화/);
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
  assert.match(source, /표시 치적·치피는 주력기의 각 최댓값/);
  assert.match(source, /치적 기준 스킬/);
  assert.match(source, /캐릭터 공통 치적/);
  assert.match(source, /스킬별 지분 합산/);
  assert.match(source, /뭉가 전환/, '확정 치명 +100%가 뭉가 초과 치적 전환에 사용되어야 한다.');
  const critDamageGroup = page.locator('.sourceGroup').filter({ hasText: '치명타 피해' });
  const critDamageText = await critDamageGroup.locator('.sourceGroupBody').textContent();
  assert.doesNotMatch(critDamageText, /스킬 · 표본 기술[\s\S]*원효과 \+180\.00% · 딜 지분/);
  assert.match(critDamageText, /기준 스킬 · 상위 치피 기술[\s\S]*최대 치피 \+210\.00% · 딜 지분 가중 없음/);
  const critDamageTotal = Number((await critDamageGroup.locator('summary em').innerText()).replace(/[^\d.-]/g, ''));
  assert.ok(critDamageTotal >= 410, `주력기 최대 치피가 계산 요약에 포함되어야 합니다: ${critDamageTotal}`);
  const keenText = await page.locator('#keenEfficiency').innerText();
  assert.match(keenText, /스킬별 치적·치피 재계산/);
  assert.match(keenText, /전설 예둔[\s\S]*유물 예둔/);
  const skillGainText = await page.locator('.sourceGroup').filter({ hasText: '스킬 효과 실험값' }).locator('summary em').innerText();
  const skillGain = Number(skillGainText.replace(/[^\d.-]/g, ''));
  assert.ok(Number.isFinite(skillGain) && skillGain > 0, `스킬 효과가 최종 기대값에 반영되지 않았습니다: ${skillGainText}`);

  const initialSummary = await page.locator('#sourceSummary').textContent();
  const selectedNode = page.locator('.nodeCard.selected').first();
  const initialLevel = await selectedNode.locator('.nodeControls b').textContent();
  await selectedNode.locator('[data-action="minus"]').click();
  const changedLevel = await page.locator('.nodeCard.selected').first().locator('.nodeControls b').textContent();
  assert.notEqual(changedLevel, initialLevel, '노드 선택은 계산 대기 중에도 즉시 변경되어야 합니다.');
  assert.equal(await page.locator('#sourceSummary').textContent(), initialSummary, '재계산 전에는 계산 결과가 변경되면 안 됩니다.');
  assert.equal(await page.locator('#evolutionRecalculateButton').evaluate(button => button.classList.contains('pending')), true, '노드 변경 후 재계산 필요 상태가 표시되어야 합니다.');
  assert.equal(await page.locator('#evolutionRecalculateNotice').isVisible(), true, '설정 변경 후 재계산 안내가 보여야 합니다.');

  await page.locator('#extraCritRate').fill('7');
  assert.equal(await page.locator('#sourceSummary').textContent(), initialSummary, '추가 효과 입력도 재계산 전에는 결과에 적용되면 안 됩니다.');
  await page.locator('#evolutionRecalculateButton').click();

  await waitForRecommendations(page);
  assert.equal(await page.locator('#evolutionRecalculateButton').evaluate(button => button.classList.contains('pending')), false, '재계산 후 대기 상태가 해제되어야 합니다.');
  assert.equal(await page.locator('#evolutionRecalculateNotice').isVisible(), false, '재계산 후 설정 변경 안내가 사라져야 합니다.');
  assert.notEqual(await page.locator('#sourceSummary').textContent(), initialSummary, '재계산 버튼은 현재 노드와 추가 효과를 결과에 적용해야 합니다.');

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
    arkPassive: { Title: '절실한 구원', Points: evolutionPoints(140), Effects: [
      ...fixedTier1,
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
  await openNodeRecommendation(page);
  await waitForRecommendations(page);
  assert.equal(await page.locator('#recommendList .comboRow').count(), 0);
  await page.locator('#manaRecommendationMode').selectOption('theory');
  const recommendation = await page.locator('#recommendPanel').innerText();
  assert.match(recommendation, /서포터 진화 노드/);
  assert.match(recommendation, /축복의 여신/);
  assert.match(recommendation, /종합 파티 기여/);
  assert.match(recommendation, /공증 가동률/);
  assert.match(recommendation, /현재 스킬 주기에서 파티 버프 기여도/);
  const baseline = Number((await page.locator('#currentScore .apiBaselineRow > div').first().locator('b').innerText()).replace('%', ''));
  const manaFurnace = page.locator('.nodeCard[data-name="마나 용광로"] [data-action="minus"]');
  await manaFurnace.click();
  await manaFurnace.click();
  const stable = page.locator('.nodeCard[data-name="안정된 관리자"] [data-action="plus"]');
  await stable.click();
  await stable.click();
  await page.locator('#evolutionRecalculateButton').click();

  await waitForRecommendations(page);
  const changed = Number((await page.locator('#currentScore .apiBaselineRow > div').nth(1).locator('b').innerText()).replace('%', ''));
  assert.ok(changed < baseline);
  await page.locator('#simulatorJumpButton').click();
  await page.locator('.specScenarioPanel summary').click();
  assert.match(await page.locator('.supportPowerPanel summary').innerText(), new RegExp(`종합 ${changed.toFixed(2)}%`));
  const supportMetric = page.locator('#specScenarioOutput .specScenarioMetrics > div').nth(1);
  assert.match(await supportMetric.innerText(), /복합 파티 기여/);
  const combined = Number((await supportMetric.locator('strong').innerText()).replace('%', ''));
  const expected = (((1 + changed / 100) / (1 + baseline / 100)) ** 0.6 - 1) * 100;
  assert.ok(Math.abs(combined - expected) < 0.015, `${combined} != ${expected}`);
  await page.close();
}

async function verifyScopedBreakerCrit() {
  const skill = (name, critRate = 0) => ({
    name, icon: '', level: 14, type: '일반', skillType: 0, currentTree: true, baseCooldownSeconds: 20,
    cooldown: { flatSeconds: 0, percentReduction: 0 },
    effects: { critRate, critDamage: 0, critHitDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0, attackSpeed: 0, moveSpeed: 0, skillDamage: 0 },
    selectedTripods: critRate ? [{ name: '한계 돌파', conditional: false, guaranteedCrit: false }] : []
  });
  const passive = (category, nodeName, text) => ({
    Name: category,
    Description: `${category} 2티어 ${nodeName} Lv.1`,
    ToolTip: JSON.stringify({
      Element_000: { type: 'NameTagBox', value: nodeName },
      Element_002: { type: 'MultiTextBox', value: text }
    })
  });
  const skills = [skill('파천섬광', 15), skill('천기심권', 15), skill('성운멸쇄권')];
  const response = {
    ...characterResponse,
    profile: { ...characterResponse.profile, CharacterName: '권왕표본', Stats: [{ Type: '치명', Value: '2235' }, { Type: '신속', Value: '0' }] },
    arkPassive: { Title: '권왕파천무', Effects: [
      passive('깨달음', '권왕파천무', "'권왕십이식 : 낙화' 스킬의 치명타 적중률이 15.0% 증가한다."),
      passive('깨달음', '권왕십이식 : 풍랑', "'권왕십이식 : 풍랑' 스킬의 치명타 적중률이 15.0% 증가한다."),
      passive('도약', '충격 폭발', '성운멸쇄권 스킬 시전 시 치명타 적중률이 20.0% 증가한다.')
    ] },
    skillEffects: { items: skills, cycleItems: skills, calculableItems: skills.filter(row => row.effects.critRate), selectedTripodCount: 2, conditionalTripodCount: 0, cooldownTripodCount: 0, stochasticCooldownCount: 0, usedSkillCount: 3 },
    powerSnapshot: {
      ...characterResponse.powerSnapshot,
      profile: { className: '브레이커', secondClass: '권왕파천무', combatPower: 5000, stats: [{ type: '신속', value: 0 }] },
      arkGrid: { slots: [{ name: '파천경', point: 14 }, { name: '충격 충전', point: 14 }, { name: '파천 돌파', point: 14 }] }
    }
  };
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route('**/api/character**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }));
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('캐릭터명 입력').fill('권왕표본');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByRole('heading', { name: /권왕표본/ }).waitFor();
  await openNodeRecommendation(page);
  await page.locator('.advancedInputPanel .advancedInputDetails').evaluate(element => { element.open = true; });
  const scope = await page.locator('.skillCritScope').innerText();
  assert.match(scope, /치적 기준 스킬\s*성운멸쇄권/);
  assert.match(scope, /캐릭터 공통 치적\s*79\.99%/);
  assert.match(scope, /성운멸쇄권[\s\S]*99\.99%/);
  assert.match(scope, /성운멸쇄권[\s\S]*치적 \+20%/);
  assert.match(scope, /파천섬광[\s\S]*94\.99%/);
  assert.match(scope, /권왕십이식 : 낙화[\s\S]*94\.99%/);
  assert.match(scope, /권왕십이식 : 풍랑[\s\S]*94\.99%/);
  assert.doesNotMatch(scope, /권왕십이식 : 낙화[\s\S]*109\.99%/, '낙화와 풍랑의 15% 치적을 합산하면 안 된다.');
  assert.doesNotMatch(scope, /성운멸쇄권[\s\S]*114\.99%/, '다른 스킬의 15% 치적이 성운멸쇄권에 중복되면 안 된다.');
  assert.doesNotMatch(scope, /딜 지분|깨달음|도약|아크그리드/, '치적 스킬 요약에는 최종 추가 효과만 표시해야 한다.');
  const dimensions = await page.locator('.skillCritScope').evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  assert.ok(dimensions.scrollWidth <= dimensions.clientWidth, `치적 스킬 카드가 가로로 잘리면 안 됩니다: ${JSON.stringify(dimensions)}`);
  await page.close();
}

async function verifyBaseSkillSelfBuff() {
  const damageSkill = {
    name: '맹룡열파', icon: '', level: 14, type: '일반', skillType: 0, currentTree: true, baseCooldownSeconds: 24,
    cooldown: { flatSeconds: 0, percentReduction: 0 },
    effects: { critRate: 0, critDamage: 10, critHitDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0, attackSpeed: 0, moveSpeed: 0, skillDamage: 0 },
    selectedTripods: [{ name: '치명타 피해 표본' }]
  };
  const response = {
    ...characterResponse,
    profile: { ...characterResponse.profile, CharacterName: '창술표본', CharacterClassName: '창술사', Stats: [{ Type: '치명', Value: '0' }, { Type: '신속', Value: '0' }] },
    arkPassive: { Title: '절정', Effects: [] },
    arkGridEffects: { critRate: 0, critDamage: 0, attackSpeed: 0, moveSpeed: 0, enemyDamage: 0, additionalDamage: 0, items: [] },
    skillEffects: {
      items: [damageSkill], cycleItems: [damageSkill], calculableItems: [damageSkill],
      globalBuffEffects: { critRate: 20, critDamage: 0, critHitDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0, attackSpeed: 0, moveSpeed: 0, skillDamage: 0 },
      globalBuffItems: [{ name: '청룡진', effects: { critRate: 20 } }],
      selectedTripodCount: 1, conditionalTripodCount: 0, cooldownTripodCount: 0, stochasticCooldownCount: 0, usedSkillCount: 1
    },
    powerSnapshot: {
      ...characterResponse.powerSnapshot,
      profile: { className: '창술사', secondClass: '절정', combatPower: 5000, stats: [{ type: '신속', value: 0 }] },
      arkGrid: { slots: [] }
    }
  };
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route('**/api/character**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }));
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('캐릭터명 입력').fill('창술표본');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByRole('heading', { name: /창술표본/ }).waitFor();
  await openNodeRecommendation(page);
  await page.locator('.advancedInputPanel .advancedInputDetails').evaluate(element => { element.open = true; });
  const preview = await page.locator('#skillEffectPreview').innerText();
  assert.match(preview, /기본 자버프 1개/);
  assert.match(preview, /청룡진[\s\S]*전역 자버프 · 치적 \+20%/);
  const critGroup = page.locator('.sourceGroup').filter({ hasText: '치명타 확률' });
  const critText = await critGroup.locator('.sourceGroupBody').textContent();
  assert.match(critText, /스킬 기본 자버프[\s\S]*\+20\.00%/);
  const scope = await page.locator('.skillCritScope').innerText();
  assert.match(scope, /캐릭터 공통 치적\s*20\.00%/);
  await page.close();
}

async function verifyArcanaCardExpectation() {
  const arcanaSkills = [
    {
      name: '스트림 오브 엣지', level: 14, type: '스택트', skillType: 0, currentTree: true, usesMana: true, manaCost: 569, manaUsageKnown: true, baseCooldownSeconds: 24,
      cooldown: { flatSeconds: 0, percentReduction: 0 },
      effects: { critRate: 27.6, critDamage: 0, critHitDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0, attackSpeed: 0, moveSpeed: 0, skillDamage: 0 },
      selectedTripods: [{ name: '다크니스 엣지', conditional: true, effects: { critRate: 27.6 } }]
    },
    {
      name: '다크 리저렉션', level: 14, type: '일반', skillType: 0, currentTree: true, usesMana: true, manaCost: 603, manaUsageKnown: true, baseCooldownSeconds: 24,
      cooldown: { flatSeconds: 0, percentReduction: 0 },
      effects: { critRate: 0, critDamage: 0, critHitDamage: 0, additionalDamage: 0, enemyDamage: 0, attackPower: 0, attackSpeed: 0, moveSpeed: 0, skillDamage: 0 },
      selectedTripods: [{ name: '분노의 일격', conditional: false, effects: {} }]
    }
  ];
  const response = {
    ...characterResponse,
    profile: { ...characterResponse.profile, CharacterName: '아르카나표본', CharacterClassName: '아르카나' },
    arkPassive: { ...characterResponse.arkPassive, Title: '황제의 칙령', Effects: [
      ...characterResponse.arkPassive.Effects,
      { Name: '끝없는 마나', Level: 2 },
      { Name: '최적화 훈련', Level: 1 },
      { Name: '무한한 마력', Level: 2 }
    ] },
    skillEffects: { items: arcanaSkills, cycleItems: arcanaSkills, calculableItems: arcanaSkills.slice(0, 1), selectedTripodCount: 2, conditionalTripodCount: 1, cooldownTripodCount: 0, stochasticCooldownCount: 0, usedSkillCount: 2 },
    powerSnapshot: {
      ...characterResponse.powerSnapshot,
      profile: { ...characterResponse.powerSnapshot.profile, className: '아르카나', secondClass: '황제의 칙령' }
    }
  };
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route('**/api/character**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }));
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('캐릭터명 입력').fill('아르카나표본');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByRole('heading', { name: /아르카나표본/ }).waitFor();
  await openNodeRecommendation(page);
  await page.locator('.advancedInputPanel .advancedInputDetails').evaluate(element => { element.open = true; });
  await page.locator('#evolutionRecalculateButton').click();

  await waitForRecommendations(page);

  const note = page.locator('#arcanaIdentityNote');
  await note.getByText('아르카나 카드·스킬 기대값 적용').waitFor();
  const noteText = await note.innerText();
  assert.match(noteText, /황제의 칙령 · 황제\+또황 33\.0% · 실전 41\.6장\/분/);
  assert.match(noteText, /도태 7\.00%\/17\.65% · 재상 5\.65%\/32\.41% · 제후 6\.40%\/16\.26%/);
  assert.match(noteText, /3분 딜타임 약 124\.8장·도태 8\.7장·재상 7\.1장·제후 8\.0장/);
  assert.match(noteText, /도태의 치적 \+20%·치피 \+50%/);
  assert.match(noteText, /재상 치적 \+20%·제후 일반 스킬 피해 \+50%/);
  assert.match(noteText, /다크니스 엣지 최대 중첩 치적 \+27\.6%/);
  assert.doesNotMatch(noteText, /급소 노출/);
  assert.match(noteText, /카드 보유·사용 타이밍/);
  const source = await page.locator('#sourceSummary').textContent();
  assert.match(source, /아르카나 카드 기대값/);
  assert.match(source, /황제 실전 41\.6장\/분/);
  assert.match(source, /황제\+또황 33\.0%/);
  assert.match(source, /도태 7\.00%\/17\.65%/);
  assert.match(source, /재상 5\.65%\/32\.41%/);
  assert.match(source, /제후 6\.40%\/16\.26%/);
  assert.match(source, /드로우 41\.6장\/분/);
  assert.match(source, /3분 약 124\.8장\/도태 8\.7장\/재상 7\.1장\/제후 8\.0장/);
  assert.doesNotMatch(source, /급소 노출/);
  const arcanaCritDamage = await page.locator('.sourceGroup').filter({ hasText: '치명타 피해' }).locator('.sourceGroupBody').textContent();
  assert.match(arcanaCritDamage, /아르카나 · 도태 카드/);
  assert.match(arcanaCritDamage, /발동 중 치피 \+50% · 기대 가동률/);
  const arcanaKeen = await page.locator('#keenEfficiency').innerText();
  assert.match(arcanaKeen, /스킬별 치적·치피 재계산/);
  assert.match(arcanaKeen, /도태\/재상 기대 가동률 포함/);
  await waitForRecommendations(page);
  await page.locator('#manaRecommendationMode').selectOption('theory');
  const bestRecommendation = await page.locator('#recommendList .comboRow.best').innerText();
  const topRows = page.locator('#recommendList .comboRow');
  const topValues = await topRows.locator('.rowMetric:first-child b').allTextContents();
  assert.equal(topValues.length, 5);
  const numericValues = topValues.map(Number);
  assert.ok(numericValues.every(value => Number.isFinite(value) && value > 0));
  assert.deepEqual(numericValues, [...numericValues].sort((a, b) => b - a));
  assert.equal(await topRows.locator('.tierLine:nth-child(2)').count(), 5);
  const details = topRows.first().locator('.comboDetails');
  assert.equal(await details.getAttribute('open'), null);
  await details.getByText('상세 계산 보기').click();
  assert.match(await details.innerText(), /치적.*치피.*진피/s);
  await details.getByText('상세 계산 보기').press('Enter');
  assert.equal(await details.getAttribute('open'), null);
  await page.locator('#manaRecommendationMode').selectOption('unverified');
  assert.match(await page.locator('#manaRecommendationStatus').textContent(), /미검증 후보/);
  await page.locator('#manaRecommendationMode').selectOption('theory');
  assert.doesNotMatch(await topRows.allTextContents().then(rows => rows.join(' ')), /감점|치적 95%|실전 추천값/);
  if (process.env.LOA_REPORT_TOP5 === '1') {
    console.log(JSON.stringify(await topRows.evaluateAll(rows => rows.map(row => ({
      build: Array.from(row.querySelectorAll('.tierLine strong'), value => value.textContent),
      value: row.querySelector('.rowMetric b').textContent
    }))), null, 2));
  }
  assert.match(bestRecommendation, /끝없는 마나|무한한 마력/);
  const skillScope = await page.locator('.skillCritScope').innerText();
  assert.match(skillScope, /다크 리저렉션/);
  assert.match(skillScope, /치적 \+27\.6%/);
  assert.doesNotMatch(skillScope, /스트림 오브 엣지|다크니스 엣지|딜 지분|깨달음|도약|아크그리드/);
  const dimensions = await note.evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  assert.ok(dimensions.scrollWidth <= dimensions.clientWidth, `아르카나 안내가 가로로 잘리면 안 됩니다: ${JSON.stringify(dimensions)}`);
  await page.close();
}

async function verifyHighCritRecommendation(viewport = { width: 1440, height: 1000 }) {
  const page = await browser.newPage({ viewport });
  const ring = { type: '반지', name: '시뮬레이터 표본 반지', effects: {
    critRate: 0.4, critDamage: 1.1, optionGrades: { critRate: '하', critDamage: '하' }
  } };
  const accessory = { critRate: 0.4, critDamage: 1.1, items: [ring] };
  const engraving = {
    effects: { enemyDamage: 18 },
    items: [{ name: '원한', grade: '유물', bookLevel: 0, nextBookLevel: 1, effects: { enemyDamage: 18 }, deltaEffects: { enemyDamage: 0.75 } }],
    adrenaline: { adopted: false }
  };
  const fixture = {
    ok: true,
    apiVersion: '6.1.7',
    profile: { ...characterResponse.profile, CharacterName: '다중치명표본', Stats: [] },
    arkPassive: { Points: evolutionPoints(140), Effects: [...fixedTier1, { Name: '입식 타격가', Level: 2 }] },
    accessoryEffects: accessory,
    engravingEffects: engraving,
    powerSnapshot: {
      profile: { name: '다중치명표본', className: '브레이커', secondClass: '검증용 직업각인', combatPower: 5000 },
      effects: { accessory, engraving },
      equipment: { combat: [], accessories: [] },
      gems: { items: [] }
    },
    skillEffects: { items: [
      { name: '기본 기술', level: 14, currentTree: true, effects: {} },
      { name: '기본 기술 강화', level: 14, currentTree: true, effects: { critRate: 20, critDamage: 100 } }
    ] }
  };
  await page.route('**/combat-analyzer.json', route => route.fulfill({ json: {
    fallbackBuilds: { '검증용 직업각인': { '기본 기술': 0.5, '기본 기술 강화': 0.5 } }
  } }));
  await page.route('**/api/character**', route => route.fulfill({ json: fixture }));
  await page.route('**/api/market-prices?**', route => route.fulfill({
    json: { ok: true, items: [{ name: '표본 시세', price: 1000 }], lowest: { price: 1000 }, rows: [] }
  }));
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('캐릭터명 입력').fill('다중치명표본');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByRole('heading', { name: /다중치명표본/ }).waitFor();
  await openNodeRecommendation(page);
  await page.locator('.advancedInputPanel .advancedInputDetails').evaluate(element => { element.open = true; });
  await page.locator('#extraCritRate').fill('219.6');
  await page.locator('#extraCritDamage').fill('148.9');
  await page.locator('#recommendAdvanced summary').click();
  await page.locator('#noManaMainSkill').check();
  await page.locator('#excludeCooldown').check();
  await page.locator('#evolutionRecalculateButton').click();

  await waitForRecommendations(page);

  // The two skills have equal test weight. At 220% and 240% only the second
  // and third tiers occur. Enumerate their outcomes independently of the app.
  await page.locator('#manaRecommendationMode').selectOption('theory');
  const expected = ({ crit = 0, evo = 0, keen = 0, mastery = 0, blunt = 0, critHit = 1 } = {}) => {
    const skills = [[220 + crit, 3.5 + keen], [240 + crit, 4.5 + keen]];
    return skills.reduce((sum, [rate, damage]) => {
      const second = damage * critHit + damage - 1;
      const third = second + damage - 1;
      const thirdChance = (rate - 200) / 100;
      const multiplier = blunt ? 0.2 + 0.8 * damage * critHit : second * (1 - thirdChance) + third * thirdChance;
      const evolution = 1 + (evo + (blunt ? blunt * (rate - 80) : 0)) / 100;
      return sum + multiplier * evolution * (1 + mastery / 100) * 1.18 / 2;
    }, 0);
  };
  const currentScore = page.locator('#currentScore .apiBaselineRow > div').nth(1).locator('b');
  assert.equal(await page.locator('#standingStacks, #inFightingUptime').count(), 0);
  const normal = expected({ evo: 21 });
  if (process.env.LOA_REPORT_TOP5 === '1' && viewport.width > 600) {
    const highCritTop = await page.locator('#recommendList .comboRow').evaluateAll(items => items.map(row => ({
      nodes: [...row.querySelectorAll('.tierLine strong')].map(label => label.textContent).join(' / '),
      value: row.querySelector('.rowMetric b').textContent
    })));
    console.log(JSON.stringify({ highCritCurrent: await currentScore.innerText(), highCritTop }, null, 2));
  }
  assert.equal(await currentScore.innerText(), normal.toFixed(4));
  const keenValues = await page.locator('#keenEfficiency .keenCard strong').allTextContents();
  assert.deepEqual(keenValues, [0.44, 0.52].map(keen =>
    `${((0.98 * expected({ evo: 21, keen }) / normal - 1) * 100).toFixed(2)}%`
  ));

  const nodesWithoutCooldown = evolution.nodes.filter(node => !Object.values(node.levels).some(
    effect => effect.cooldownReduction || effect.manaSkillCooldownReduction
  ));
  const candidates = [...evolutionAllocations(nodesWithoutCooldown, [{ points: 40 }], 140)].map(entries => {
    const input = { crit: 0, evo: 0, mastery: 0, blunt: 0, critHit: 1 };
    const attack = 114 + 4 * (entries.find(e => e.name === '파괴 전차')?.level || 0);
    for (const { name, level } of entries) {
      const effect = evolution.nodes.find(node => node.name === name).levels[level] || {};
      input.crit += effect.critRate || 0;
      input.evo += effect.evolutionDamage || 0;
      input.mastery += effect.additionalDamage || 0;
      if (name === '회심') input.critHit = 1.12;
      if (name === '뭉툭한 가시') input.blunt = level === 1 ? 1.2 : 1.4;
      if (name === '음속 돌파') input.evo += (attack - 100 + 14) * .05 * level;
      if (name === '입식 타격가') input.evo += 4.5 * level;
      if (name === '인파이팅') input.evo += 9 * level;
    }
    return {
      nodes: [2, 3, 4, 5].map(tier => entries.filter(e => e.tier === tier).map(e => `${e.name} Lv.${e.level}`).join('|')),
      input, value: expected(input)
    };
  });
  const top = candidates.sort((a, b) => b.value - a.value).slice(0, 5);
  const rows = await page.locator('#recommendList .comboRow').evaluateAll(items => items.map(row => ({
    nodes: [...row.querySelectorAll('.tierLine strong')].map(tier => [...tier.querySelectorAll('b')].map(chip => chip.textContent).join('|')),
    value: row.querySelector('.rowMetric b').textContent,
    note: row.querySelector('.practicalNote')?.textContent || '',
    stages: row.querySelector('.comboCritical').textContent
  })));
  assert.deepEqual(rows.map(row => Number(row.value)), top.map(row => Number(row.value.toFixed(4))));
  const byNodes = new Map(candidates.map(row => [row.nodes.join('/'), row.value.toFixed(4)]));
  for (const row of rows) {
    assert.equal(row.value, byNodes.get(row.nodes.join('/')));
    if (row.nodes[3].includes('뭉툭한 가시')) assert.match(row.stages, /다중 치명 0\.00%/);
    else assert.match(row.stages, /2중 확정 · 3중/);
    if (row.nodes[2].includes('회심') && !row.nodes[3].includes('뭉툭한 가시')) {
      assert.match(row.note, /치명타 적중 주피 중첩 미검증/);
      assert.match(row.note, /이론 A \d+\.\d{4} \/ B \d+\.\d{4}/);
    }
  }
  const details = page.locator('#recommendList .comboDetails').first();
  assert.equal(await details.getAttribute('open'), null);
  await details.locator('summary').click();
  const width = await details.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
  assert.ok(width.scroll <= width.width + 1);
  await details.locator('summary').click();

  const criticalMaster = page.locator('.nodeCard[data-name="회심"]');
  await criticalMaster.locator('[data-action="plus"]').click();
  await page.locator('#evolutionRecalculateButton').click();

  await waitForRecommendations(page);
  assert.match(await page.locator('#sourceSummary').textContent(), /치명타 적중 시 피해 증가의 중첩은 미검증/);
  assert.match(await page.locator('#keenEfficiency').innerText(), /치명타 적중 주피 중첩 미검증/);
  await criticalMaster.locator('[data-action="minus"]').click();

  const standUp = page.locator('.nodeCard[data-name="입식 타격가"] [data-action="minus"]');
  await standUp.click();
  await standUp.click();
  const blunt = page.locator('.nodeCard[data-name="뭉툭한 가시"] [data-action="plus"]');
  await blunt.click();
  await blunt.click();
  await page.locator('#evolutionRecalculateButton').click();

  await waitForRecommendations(page);
  assert.equal(await currentScore.innerText(), expected({ evo: 19, blunt: 1.4 }).toFixed(4));
  const evolutionSummary = page.locator('#sourceSummary .sourceGroup').filter({ has: page.getByText('진피', { exact: true }) });
  assert.equal(await evolutionSummary.locator('.sourceLine').filter({ hasText: '뭉가 전환' }).locator('b').textContent(), '+210.00%');
  assert.equal(await evolutionSummary.locator('summary em').textContent(), '+229.00%');

  // Reproduce the TOP5 using the actual controls and compare each in A/B.
  // On mobile replay the highest-scoring candidate and both gear changes.
  const metrics = page.locator('#specScenarioOutput .specScenarioMetrics > div');
  const scenarioGain = metrics.nth(1).locator('strong');
  const percent = value => `+${((value / normal - 1) * 100).toFixed(2)}%`;
  const replay = viewport.width > 600 ? [...top].reverse() : [top[0]];
  for (const [index, candidate] of replay.entries()) {
    if (index) await page.locator('#simulatorBackButton').click();
    const labels = candidate.nodes.flatMap(tier => tier.split('|')).filter(Boolean);
    const levels = new Map(labels.map(label => {
      const [name, level] = label.split(' Lv.');
      return [name, Number(level)];
    }));
    const active = new Map(await page.locator('.nodeCard.selected').evaluateAll(nodes =>
      nodes.map(node => [node.dataset.name, Number(node.querySelector('.nodeControls b').textContent.replace('Lv.', ''))])
    ));
    const clickNode = (name, action) => page.locator(`.nodeCard[data-name="${name}"] [data-action="${action}"]`).click();
    for (const [name, level] of [...active].reverse()) {
      if (fixedTier1.some(node => node.Name === name)) continue;
      for (let step = level; step > (levels.get(name) || 0); step -= 1) await clickNode(name, 'minus');
    }
    for (const [name, level] of levels) {
      for (let step = active.get(name) || 0; step < level; step += 1) await clickNode(name, 'plus');
    }
    await page.locator('#evolutionRecalculateButton').click();

    await waitForRecommendations(page);
    await page.locator('#simulatorJumpButton').click();
    const comparison = page.locator('.specScenarioPanel');
    if (await comparison.getAttribute('open') == null) await comparison.locator('summary').click();
    assert.equal(await scenarioGain.innerText(), percent(candidate.value));
  }

  const upgrade = page.locator('.specEfficiencyRow').filter({ hasText: '하하 → 상상' });
  await upgrade.locator('.specScenarioPick > span').click();
  assert.equal(await upgrade.getByRole('checkbox', { name: /표본 반지.*B 비교에 적용/ }).isChecked(), true);
  assert.equal(await metrics.nth(2).locator('strong').innerText(), `${(240 + top[0].input.crit + 1.15).toFixed(2)}%`);
  const ringScore = expected({ ...top[0].input, crit: top[0].input.crit + 1.15, keen: 0.029 });
  assert.equal(await scenarioGain.innerText(), percent(ringScore));
  const changedPower = Number((await metrics.nth(0).locator('strong').innerText()).replaceAll(',', ''));
  assert.ok(changedPower > 5000);
  const oldHybrid = percent(top[0].value * changedPower / 5000);
  assert.notEqual(await scenarioGain.innerText(), oldHybrid);
  await page.locator('.specEfficiencyRow[data-category="engraving"]').filter({ hasText: '원한' })
    .locator('.specScenarioPick > span').click();
  assert.equal(await scenarioGain.innerText(), percent(ringScore * 1.1875 / 1.18));
  if (process.env.LOA_REPORT_SIMULATION === '1') {
    console.log(`ring A/B old ${oldHybrid}, new ${percent(ringScore)}, ring + engraving ${percent(ringScore * 1.1875 / 1.18)}`);
  }
  const size = await page.locator('#specScenarioOutput').evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth }));
  assert.ok(size.scroll <= size.width + 1);
  await page.close();
}

async function verifyHoningMarketRefresh(viewport) {
  const page = await browser.newPage({ viewport });
  const now = new Date();
  await page.clock.install({ time: now });
  let refreshes = 0;
  let directQueries = 0;
  const updatedAt = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const priceItems = [
    ['운명의 파편 주머니(대)', 66130143, 200, 1], ['운명의 파괴석 결정', 66102007, 800, 100],
    ['운명의 수호석 결정', 66102107, 150, 100], ['위대한 운명의 돌파석', 66110226, 30, 1],
    ['상급 아비도스 융화제', 6861013, 240, 1], ['용암의 숨결', 66111131, 450, 1],
    ['빙하의 숨결', 66111132, 440, 1]
  ];
  const response = structuredClone(characterResponse);
  response.powerSnapshot.profile.baseAttackPower = 190000;
  response.powerSnapshot.equipment.combat = [
    { type: '무기', name: '표본 무기', weaponPower: 170000, honingLevel: 25, grade: '고대' },
    { type: '완갑', name: '표본 완갑', honingLevel: 15, grade: '유물' }
  ];
  await page.route('**/api/character**', route => route.fulfill({ json: response }));
  await page.route('**/api/market-prices?**', route => {
    if (new URL(route.request().url()).searchParams.get('mode') === 't4Materials') directQueries += 1;
    return route.fulfill({ status: 503, json: { ok: false } });
  });
  await page.route('**/api/market-snapshot', route => {
    refreshes += 1;
    const fresh = refreshes > 1;
    const stamp = fresh ? new Date(now.getTime() + 60 * 1000).toISOString() : updatedAt;
    const items = priceItems.map(([name, id, price, bundleCount]) => ({
      name, id, bundleCount, price: fresh && id === 6861013 ? price * 4 : price
    }));
    return route.fulfill({ json: { ok: true, updatedAt: stamp, sections: {
      material: { ok: true, updatedAt: stamp, items },
      gem: { ok: true, updatedAt: stamp, rows: [{ level: 10 }] },
      engraving: { ok: true, updatedAt: stamp, items: [{ name: '표본', price: 5 }] },
      crystal: { ok: true, updatedAt: stamp, crystalGoldPer100: 3900 }
    } } });
  });
  try {
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
    await page.getByPlaceholder('캐릭터명 입력').fill('스킬표본');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await page.locator('#simulatorJumpButton').click();
    const costs = page.locator('.powerCostPrep');
    await costs.evaluate(element => { element.open = true; });
    const status = costs.locator('[data-material-quote-status]');
    await status.getByText(/오래된 캐시.*갱신 실패/).waitFor();
    assert.equal(directQueries, 1);
    await page.locator('#armguardFromStage').selectOption('15');
    await page.locator('#armguardToStage').selectOption('16');
    await page.locator('input[name="armguardBreathMode"][value="none"]').evaluate(element => element.click());
    const ranked = page.locator('.specEfficiencyRow[data-efficiency-metric="전투력"]').filter({ hasText: '표본 완갑' });
    await ranked.waitFor({ state: 'attached' });
    assert.match(await ranked.textContent(), /10만G당/);
    const rankCost = ranked.locator('.specEfficiencyExpected b');
    const panelCost = page.locator('.armguardCostSummary > div').nth(1).locator('strong');
    const before = [await rankCost.textContent(), await panelCost.textContent()];
    await page.clock.fastForward(5 * 60 * 1000 + 1000);
    await page.waitForFunction(() => {
      const labels = [...document.querySelectorAll('[data-material-quote-status]')];
      return labels.length && labels.every(el => /KST/.test(el.textContent) && !/오래된|갱신 실패/.test(el.textContent));
    });
    assert.equal(refreshes, 2);
    assert.equal(directQueries, 1);
    assert.notEqual(await rankCost.textContent(), before[0]);
    assert.notEqual(await panelCost.textContent(), before[1]);
    const after = await panelCost.textContent();
    await page.locator('#armguardToStage').selectOption('17');
    await page.locator('#armguardToStage').selectOption('16');
    assert.equal(await panelCost.textContent(), after);
    if (viewport.width > 600) {
      const workerCreated = page.waitForEvent('worker', { predicate: worker => worker.url().includes('honing-cost-worker.js') });
      await page.locator('input[aria-label="운명의 파편 보유 귀속 수량"]').fill('2200000');
      await page.locator('input[aria-label="운명의 파편 보유 귀속 수량"]').press('Tab');
      await page.locator('#armguardToStage').selectOption('19');
      await workerCreated;
      await panelCost.waitFor();
      assert.match(await panelCost.textContent(), /G$/);
    }
    const panel = await costs.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
    assert.ok(panel.scroll <= panel.width + 1);
  } finally {
    await page.close();
  }
}

async function verifyManaRecommendation(viewport, critBonus, analyzerMatched = false) {
  const page = await browser.newPage({ viewport });
  const fixture = structuredClone(characterResponse);
  fixture.profile.CharacterName = '마나표본';
  fixture.profile.CharacterClassName = '워로드';
  fixture.profile.Stats = analyzerMatched ? [{ Type: '최대 마나', Value: '665' }] : [{ Type: '최대 마나', Value: '100' }];
  fixture.powerSnapshot.profile.className = '워로드';
  fixture.arkPassive.Effects = [
    ...fixedTier1,
    { Name: '마나 용광로', Level: 2 },
    { Name: '금단의 주문', Level: 2 }
  ];
  const sampleSkills = [
    { ...baselineSkillItem, name: '마나 기술 A', effects: { critRate: 15 }, usesMana: true, manaUsageKnown: true, manaCost: 999, cooldownEligible: true },
    { ...baselineSkillItem, name: '마나 기술 B', effects: {}, usesMana: true, manaUsageKnown: true, manaCost: 999, cooldownEligible: true }
  ];
  const costs = analyzerMatched ? [90, 70] : [200, 80];
  if (analyzerMatched) {
    for (const skill of sampleSkills) skill.baseCooldownSeconds = 4;
    fixture.powerSnapshot.profile.stats = [];
    await page.route('**/combat-analyzer.json', route => route.fulfill({ json: {
      fallbackBuilds: { '테스트 전직': { '마나 기술 A': 0.75, '마나 기술 B': 0.25 } }
    } }));
  }
  fixture.skills = sampleSkills.map((skill, index) => ({ Name: skill.name, Tooltip: JSON.stringify({
    Element_004: { type: 'MultiTextBox', value: `마나 ${costs[index]} 소모|` },
    Element_011: { type: 'SingleTextBox', value: '마나 999 소모' }
  }) }));
  fixture.skillEffects = { items: sampleSkills, cycleItems: sampleSkills, calculableItems: sampleSkills, usedSkillCount: 2 };
  await page.route('**/api/character**', route => route.fulfill({ json: fixture }));
  try {
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
    await page.getByPlaceholder('캐릭터명 입력').fill('마나표본');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await page.getByRole('heading', { name: /마나표본/ }).waitFor();
    await openNodeRecommendation(page);
    await page.locator('.advancedInputPanel .advancedInputDetails').evaluate(element => { element.open = true; });
    await page.locator('#evolutionRecalculateButton').click();

    await waitForRecommendations(page);
    const status = page.locator('#manaRecommendationStatus');
    const rows = page.locator('#recommendList .comboRow');
    const mode = page.locator('#manaRecommendationMode');
    assert.equal(await page.locator('#manaDuration').inputValue(), '300');
    assert.match(await page.locator('#recommendList').innerText(), /300초 실측 검증을 통과한 후보가 없습니다/);
    assert.equal(await rows.count(), 0);
    assert.match(await status.textContent(), /300초 실측 검증 0개/);
    await mode.selectOption('theory');
    assert.equal(await rows.count(), 5);
    assert.match(await status.textContent(), /이론상 기대 피해 순위/);
    if (analyzerMatched) {
      await mode.selectOption('estimate');
      assert.equal(await rows.count(), 0);
      assert.match(await status.textContent(), /300초 추정 검증 · 마나 통과 0개/);
      await page.locator('#manaSupport').selectOption('artist');
      await waitForRecommendations(page);
      assert.match(await status.textContent(), /도화가/);
      await mode.selectOption('auto');
      assert.equal(await rows.count(), 0);
      return;
    }
    assert.match(await page.locator('#manaAutoStatus').textContent(), /공식 스킬 비용 2\/2.*공식 API 최대 마나 100/);
    assert.equal(await page.locator('#manaRecovery').inputValue(), '');
    const panel = page.locator('#manaScenarioPanel');
    assert.equal(await panel.evaluate(element => element.open), false);
    await panel.locator('summary').first().click();
    const set = (id, value) => page.locator(`#${id}`).fill(String(value));
    await set('extraCritRate', critBonus);
    for (const [id, value] of Object.entries({ manaMax: 100, manaStart: 100, manaRecovery: 100, manaFirstRecovery: 1, manaRecoveryInterval: 1 })) {
      await set(id, value);
    }
    await set('manaRotation', '마나 기술 A | 0 | 4 | 40 | 0.25 | 0.1\n마나 기술 B | 1 | 6 | 20 | 0.25');
    await page.locator('#manaCostReductions').selectOption('product');
    await mode.selectOption('auto');
    const apply = async () => {
      await page.locator('#applyManaScenario').click();
      await waitForRecommendations(page);
    };
    await apply();
    assert.equal(await rows.count(), 0);
    await mode.selectOption('estimate');
    assert.equal(await rows.count(), 5);
    for (const row of await rows.all()) {
      assert.match(await row.innerText(), /300초 마나 안정/);
      assert.equal(await row.locator('.comboDetails').getAttribute('open'), null);
      assert.match(await row.locator('.comboDetails').textContent(), /300초 최소 잔여 마나.*마나 부족 0회.*시전 누락 0회/s);
    }
    const best = rows.first().locator('.comboDetails');
    await best.getByText('상세 계산 보기').click();
    assert.match(await best.innerText(), /서포터 없음.*300초 총 기대 피해/);
    assert.match(await best.innerText(), /마나 사이클 추정.*후딜 0.10초/s);
    const width = await best.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
    assert.ok(width.scroll <= width.width + 1);
    await set('manaRecovery', 0);
    await apply();
    assert.equal(await rows.count(), 0);
    await mode.selectOption('shortage');
    assert.equal(await rows.count(), 5);
    assert.match(await rows.first().textContent(), /마나 부족 [1-9]\d*회.*시전 누락 [1-9]\d*회.*부족\)/s);
    assert.match(await rows.first().innerText(), /이론 기대 피해 배율/);
    await page.locator('#manaSupport').selectOption('artist');
    await waitForRecommendations(page);
    assert.match(await status.textContent(), /실제 적용 시각/);
    await set('manaSupportTimes', '3,33,63,93,123,153,183,213,243,273');
    await set('manaSupportRestore', 25);
    await apply();
    assert.match(await rows.first().textContent(), /추가 회복 [1-9].*도화가/s);
    await mode.selectOption('auto');
    assert.equal(await rows.count(), 0);
  } finally {
    await page.close();
  }
}

const routingOrigin = `http://127.0.0.1:${port}`;
const routingCharacterA = '경로 표본 +%#?';
const routingCharacterB = '다른표본';
const routingCharacterSlow = '느린표본';
const routingCharacterRetry = '재시도표본';
const routingCharacterMissing = '없는표본';

async function mockRouteCharacters(context, requests, waitForSlow) {
  await context.route('**/api/character?**', async route => {
    const name = new URL(route.request().url()).searchParams.get('name');
    requests.set(name, (requests.get(name) || 0) + 1);
    if (name === routingCharacterMissing || (name === routingCharacterRetry && requests.get(name) === 1)) {
      return route.fulfill({ status: 404, json: { error: '캐릭터를 찾을 수 없습니다.' } });
    }
    if (name === routingCharacterSlow) await waitForSlow;
    const fixture = structuredClone(characterResponse);
    fixture.profile.CharacterName = name;
    fixture.powerSnapshot.profile.name = name;
    return route.fulfill({ json: fixture });
  });
}

async function expectPath(page, path) {
  await page.waitForURL(routingOrigin + path);
  assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, path);
}

async function expectCharacter(page, name) {
  const heading = page.locator('#characterCard h2');
  await heading.waitFor();
  assert.ok((await heading.innerText()).startsWith(name + ' / '));
}

async function submitRouteSearch(page, name) {
  await page.locator('#characterName').fill(name);
  await page.locator('#searchButton').click();
}

async function verifyBrowserRouting({ mobile = false } = {}) {
  const context = await browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
    : { viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const requests = new Map();
  await mockRouteCharacters(context, requests);
  try {
    await page.goto(routingOrigin);
    await submitRouteSearch(page, routingCharacterA);
    const overview = pagePath({ page: 'character', name: routingCharacterA });
    await expectPath(page, overview);
    await expectCharacter(page, routingCharacterA);
    assert.equal(await page.locator('#recommendPanel').isVisible(), false);
    await openNodeRecommendation(page);
    const nodes = pagePath({ page: 'nodes', name: routingCharacterA });
    await expectPath(page, nodes);
    await page.locator('#manaSupport').selectOption('bard');
    await waitForRecommendations(page);
    await page.locator('#manaRecommendationMode').selectOption('theory');
    const filters = { support: 'bard', mode: 'theory' };
    const filteredNodes = pagePath({ page: 'nodes', name: routingCharacterA, ...filters });
    await expectPath(page, filteredNodes);
    const metrics = page.locator('#recommendList .rowMetrics');
    const expectedMetrics = await metrics.allTextContents();
    assert.equal(expectedMetrics.length, 5);
    const details = page.locator('#recommendList .comboDetails').first();
    await details.locator('summary').click();
    assert.equal(await details.getAttribute('open'), '');
    if (!mobile) {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.locator('#copyCharacterLink').click();
      await page.getByText('링크를 복사했습니다.').waitFor();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      assert.equal(copied, routingOrigin + filteredNodes);
      const sharingContext = await browser.newContext();
      try {
        const shareRequests = new Map();
        await mockRouteCharacters(sharingContext, shareRequests);
        const share = await sharingContext.newPage();
        assert.equal((await share.goto(copied)).status(), 200);
        await expectCharacter(share, routingCharacterA);
        await waitForRecommendations(share);
        assert.equal(await share.locator('#manaSupport').inputValue(), 'bard');
        assert.deepEqual(await share.locator('#recommendList .rowMetrics').allTextContents(), expectedMetrics);
        assert.deepEqual([...shareRequests], [[routingCharacterA, 1]]);
      } finally {
        await sharingContext.close();
      }
    }
    const combat = pagePath({ page: 'combat', name: routingCharacterA, ...filters });
    await page.locator('#characterCombatLink').click();
    await expectPath(page, combat);
    await page.locator('#combatPanel').getByRole('heading', { name: '300초 전투 분석' }).waitFor();
    assert.equal(await page.locator('#evolutionPanel').isVisible(), false);
    assert.deepEqual(await metrics.allTextContents(), expectedMetrics);
    assert.equal(await details.getAttribute('open'), '');
    assert.equal(context.pages().length, 1);
    await page.goBack();
    await expectPath(page, filteredNodes);
    assert.equal(await page.locator('#evolutionPanel').isVisible(), true);
    assert.equal(await details.getAttribute('open'), '');
    await page.goBack();
    await expectPath(page, overview);
    await page.goBack();
    await expectPath(page, '/');
    assert.equal(await page.locator('#characterCard').isVisible(), false);
    await page.goForward();
    await expectPath(page, overview);
    await expectCharacter(page, routingCharacterA);
    await page.goForward();
    await expectPath(page, filteredNodes);
    await waitForRecommendations(page);
    assert.deepEqual(await metrics.allTextContents(), expectedMetrics);
    await page.goForward();
    await expectPath(page, combat);
    assert.equal(await page.locator('#combatPanel').isVisible(), true);
    assert.deepEqual([...requests], [[routingCharacterA, 1]]);

    if (mobile) {
      const width = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      assert.ok(width[0] <= width[1] + 1);
      return;
    }
    await page.goBack();
    await expectPath(page, filteredNodes);
    assert.equal((await page.reload()).status(), 200);
    await expectPath(page, filteredNodes);
    await expectCharacter(page, routingCharacterA);
    await waitForRecommendations(page);
    assert.deepEqual(await metrics.allTextContents(), expectedMetrics);
    assert.equal(requests.get(routingCharacterA), 1, 'Reload uses the compatible character cache');
    await page.goBack();
    await expectPath(page, overview);
    await expectCharacter(page, routingCharacterA);
    await submitRouteSearch(page, routingCharacterB);
    await expectPath(page, pagePath({ page: 'character', name: routingCharacterB }));
    await expectCharacter(page, routingCharacterB);
    await page.goBack();
    await expectPath(page, overview);
    await expectCharacter(page, routingCharacterA);
    await page.goForward();
    await expectCharacter(page, routingCharacterB);
    assert.deepEqual([...requests], [[routingCharacterA, 1], [routingCharacterB, 1]]);

    await page.locator('#siteSimulatorLink').click();
    const simulator = pagePath({ page: 'simulator', name: routingCharacterB });
    await expectPath(page, simulator);
    await page.locator('#powerSnapshotPanel').getByRole('heading', { name: '스펙업 효율 시뮬레이터' }).waitFor();
    await page.locator('[data-planner-mode="budget"]').click();
    const budget = page.locator('#specPlannerBudgetInput');
    await budget.fill('550000');
    await budget.press('Tab');
    await page.locator('[data-tab="calculator"]').click();
    await expectPath(page, '/');
    await page.goBack();
    await expectPath(page, simulator);
    assert.equal(await budget.inputValue(), '550000');
    assert.equal(requests.get(routingCharacterB), 1);
    await page.locator('#simulatorBackButton').click();
    await expectCharacter(page, routingCharacterB);
  } finally {
    await context.close();
  }
}

async function verifyDirectRoutesAndRequestRace() {
  const context = await browser.newContext();
  const requests = new Map();
  let releaseSlow;
  const held = new Promise(resolve => { releaseSlow = resolve; });
  await mockRouteCharacters(context, requests, held);
  const page = await context.newPage();
  try {
    assert.equal((await page.goto(routingOrigin + '/simulator')).status(), 200);
    await page.locator('#simulatorLanding').getByRole('heading').waitFor();
    await submitRouteSearch(page, routingCharacterB);
    await expectPath(page, pagePath({ page: 'simulator', name: routingCharacterB }));
    await page.locator('#powerSnapshotPanel').waitFor();
    const oldScenario = encodeSpecScenario({ version: 1, characterName: routingCharacterB, plannerMode: 'budget', plannerBudget: 123000 });
    await page.goto(routingOrigin + '/?scenario=' + oldScenario);
    await expectPath(page, pagePath({ page: 'simulator', name: routingCharacterB, scenario: oldScenario }));
    await page.locator('#specPlannerBudgetInput').waitFor();
    assert.equal(await page.locator('#specPlannerBudgetInput').inputValue(), '123000');

    const malformed = '/character/%E0%A4%A/nodes';
    await page.goto(routingOrigin + malformed);
    await page.locator('#routeNotFound').waitFor();
    for (const unavailable of ['/character/' + encodeURIComponent(routingCharacterB) + '/stats', '/invalid-route']) {
      assert.equal((await page.goto(routingOrigin + unavailable)).status(), 404);
      await page.getByRole('heading', { name: '페이지를 찾을 수 없습니다' }).waitFor();
      assert.equal(await page.locator('#characterNav').isVisible(), false);
    }
    const missing = pagePath({ page: 'character', name: routingCharacterMissing });
    await page.goto(routingOrigin + missing);
    await page.locator('#characterRetryButton').waitFor();
    assert.match(await page.locator('#message').innerText(), /캐릭터를 찾을 수 없습니다/);
    const retry = pagePath({ page: 'character', name: routingCharacterRetry });
    await page.goto(routingOrigin + retry);
    await page.locator('#characterRetryButton').click();
    await expectCharacter(page, routingCharacterRetry);
    assert.equal(requests.get(routingCharacterRetry), 2);

    const slow = pagePath({ page: 'nodes', name: routingCharacterSlow });
    await page.goto(routingOrigin + slow);
    await page.getByText('캐릭터 정보를 불러오는 중입니다.').waitFor();
    await page.locator('#characterCombatLink').click();
    const slowCombat = pagePath({ page: 'combat', name: routingCharacterSlow });
    await expectPath(page, slowCombat);
    await page.goBack();
    await expectPath(page, slow);
    await page.locator('[data-tab="calculator"]').click();
    await expectPath(page, '/');
    const slowResponse = page.waitForResponse(response => response.url().includes(encodeURIComponent(routingCharacterSlow)));
    releaseSlow();
    await slowResponse;
    assert.equal(await page.locator('#characterCard').isVisible(), false, 'A late response cannot take over the home page');
    await page.goBack();
    await expectPath(page, slow);
    await expectCharacter(page, routingCharacterSlow);
    assert.equal(requests.get(routingCharacterSlow), 1);
    assert.equal(requests.get(routingCharacterB), 1);

    await page.locator('[data-tab="market"]').click();
    await expectPath(page, '/market');
    await page.locator('[data-market-tab="gem"]').click();
    await expectPath(page, '/market?category=gem');
    await page.locator('[data-tab="ratio"]').click();
    await expectPath(page, '/ratios');
    await page.goBack();
    await expectPath(page, '/market?category=gem');
    assert.equal(await page.locator('#marketGemPanel').isVisible(), true);
  } finally {
    releaseSlow();
    await context.close();
  }
}

try {
  if (!process.argv.includes('--routing-only')) {
    await verifyViewport({ width: 1440, height: 1000 });
    await verifyViewport({ width: 390, height: 844 });
    await verifyScopedBreakerCrit();
    await verifyBaseSkillSelfBuff();
    await verifyArcanaCardExpectation();
    await verifyHighCritRecommendation();
    await verifyHighCritRecommendation({ width: 390, height: 844 });
    await verifySupportRecommendation();
    await verifyHoningMarketRefresh({ width: 1440, height: 1000 });
    await verifyHoningMarketRefresh({ width: 390, height: 844 });
    await verifyManaRecommendation({ width: 1440, height: 1000 }, 150);
    await verifyManaRecommendation({ width: 390, height: 844 }, 35);
    await verifyManaRecommendation({ width: 1440, height: 1000 }, 150, true);
    await verifyManaRecommendation({ width: 390, height: 844 }, 150, true);
    console.log('skill effect UI tests passed');
  }
  await verifyBrowserRouting();
  await verifyBrowserRouting({ mobile: true });
  await verifyDirectRoutesAndRequestRace();
  console.log('desktop and mobile URL routing, sharing, history and request races passed');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  if (!chromeDebugLogExisted) await unlink(chromeDebugLog).catch(() => {});
}
