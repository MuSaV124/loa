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
  arkPassive: { Title: '테스트 전직', Effects: [
    { Name: '뭉툭한 가시', Level: 2, Description: '', Tooltip: '' },
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
  await page.getByPlaceholder('캐릭터명 입력').fill('스킬표본');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByRole('heading', { name: /스킬표본/ }).waitFor();
  await page.locator('.advancedInputDetails').evaluate(element => { element.open = true; });

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
  const baseline = Number((await page.locator('#currentScore .apiBaselineRow > div').first().locator('b').innerText()).replace('%', ''));
  const manaFurnace = page.locator('.nodeCard[data-name="마나 용광로"] [data-action="minus"]');
  await manaFurnace.click();
  await manaFurnace.click();
  const stable = page.locator('.nodeCard[data-name="안정된 관리자"] [data-action="plus"]');
  await stable.click();
  await stable.click();
  await page.locator('#evolutionRecalculateButton').click();
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
  await page.locator('.advancedInputDetails').evaluate(element => { element.open = true; });
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
  await page.locator('.advancedInputDetails').evaluate(element => { element.open = true; });
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
  const bestRecommendation = await page.locator('#recommendList .comboRow.best').innerText();
  const topRows = page.locator('#recommendList .comboRow');
  const topValues = await topRows.locator('.rowMetric:first-child b').allTextContents();
  assert.equal(topValues.length, 5);
  const numericValues = topValues.map(Number);
  assert.ok(numericValues.every(value => Number.isFinite(value) && value > 0));
  assert.deepEqual(numericValues, [...numericValues].sort((a, b) => b - a));
  assert.deepEqual(await topRows.locator('.nodePill').allTextContents(), [
    '마나 용광로 Lv.2', '뭉툭한 가시 Lv.2', '마나 용광로 Lv.2', '뭉툭한 가시 Lv.2', '마나 용광로 Lv.2'
  ]);
  assert.doesNotMatch(await topRows.allTextContents().then(rows => rows.join(' ')), /감점|치적 95%|실전 추천값/);
  if (process.env.LOA_REPORT_TOP5 === '1') {
    console.log(JSON.stringify(await topRows.evaluateAll(rows => rows.map(row => ({
      build: Array.from(row.querySelectorAll('.tierLine strong'), value => value.textContent),
      value: row.querySelector('.rowMetric b').textContent
    }))), null, 2));
  }
  assert.match(bestRecommendation, /끝마/, `황제 카드 수급을 반영한 1순위에 끝마가 포함되어야 합니다: ${bestRecommendation}`);
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
    apiVersion: '6.0.0',
    profile: { ...characterResponse.profile, CharacterName: '다중치명표본', Stats: [] },
    arkPassive: { Effects: [{ Name: '입식 타격가', Level: 2 }] },
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
      { name: '치적 치피 기술', level: 14, currentTree: true, effects: { critRate: 20, critDamage: 100 } }
    ] }
  };
  await page.route('**/api/character**', route => route.fulfill({ json: fixture }));
  await page.route('**/api/market-prices?**', route => route.fulfill({
    json: { ok: true, items: [{ name: '표본 시세', price: 1000 }], lowest: { price: 1000 }, rows: [] }
  }));
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('캐릭터명 입력').fill('다중치명표본');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByRole('heading', { name: /다중치명표본/ }).waitFor();
  await page.locator('.advancedInputDetails').evaluate(element => { element.open = true; });
  await page.locator('#extraCritRate').fill('219.6');
  await page.locator('#extraCritDamage').fill('148.9');
  await page.locator('#noManaMainSkill').check();
  await page.locator('#excludeCooldown').check();
  await page.locator('#evolutionRecalculateButton').click();

  // The two skills have equal test weight. At 220% and 240% only the second
  // and third tiers occur. Enumerate their outcomes independently of the app.
  const expected = ({ crit = 0, evo = 0, keen = 0, mastery = 0, blunt = false, critHit = 1 } = {}) => {
    const skills = [[220 + crit, 3.5 + keen], [240 + crit, 4.5 + keen]];
    return skills.reduce((sum, [rate, damage]) => {
      const second = damage * critHit + damage - 1;
      const third = second + damage - 1;
      const thirdChance = (rate - 200) / 100;
      const multiplier = blunt ? 0.2 + 0.8 * damage * critHit : second * (1 - thirdChance) + third * thirdChance;
      const evolution = 1 + (evo + (blunt ? 1.4 * (rate - 80) : 0)) / 100;
      return sum + multiplier * evolution * (1 + mastery / 100) * 1.18 / 2;
    }, 0);
  };
  const currentScore = page.locator('#currentScore .apiBaselineRow > div').nth(1).locator('b');
  const normal = expected({ evo: 21 });
  assert.equal(await currentScore.innerText(), normal.toFixed(4));
  const keenValues = await page.locator('#keenEfficiency .keenCard strong').allTextContents();
  assert.deepEqual(keenValues, [0.44, 0.52].map(keen =>
    `${((0.98 * expected({ evo: 21, keen }) / normal - 1) * 100).toFixed(2)}%`
  ));

  // Fixed fixture with cooldown and mana nodes excluded. Compute all 36
  // eligible combinations before comparing the first five rendered rows.
  const tier2 = [
    { label: '한돌 Lv.3', evo: 30, crit: 0 },
    { label: '예감 Lv.1|한돌 Lv.2', evo: 25, crit: 4 },
    { label: '예감 Lv.2|한돌 Lv.1', evo: 20, crit: 8 }
  ];
  const tier4 = [
    { label: '회심 + 달인', evo: 0, crit: 7, mastery: 8.5, critHit: 1.12 },
    { label: '회심 + 분쇄', evo: 20, crit: 0, mastery: 0, critHit: 1.12 },
    { label: '달인 + 분쇄', evo: 20, crit: 7, mastery: 8.5, critHit: 1 }
  ];
  const tier5 = [
    { label: '뭉툭한 가시 Lv.2', evo: 19, blunt: true },
    { label: '음속 돌파 Lv.2', evo: 2.8 },
    { label: '인파이팅 Lv.2', evo: 18 },
    { label: '입식 타격가 Lv.2', evo: 21 }
  ];
  const candidates = tier2.flatMap(a => tier4.flatMap(b => tier5.map(c => ({
    nodes: [a.label, b.label, c.label],
    value: expected({ crit: a.crit + b.crit, evo: a.evo + b.evo + c.evo, mastery: b.mastery, blunt: c.blunt, critHit: b.critHit })
  }))));
  assert.equal(candidates.length, 36);
  const top = candidates.sort((a, b) => b.value - a.value).slice(0, 5);
  const rows = await page.locator('#recommendList .comboRow').evaluateAll(items => items.map(row => ({
    nodes: [
      [...row.querySelectorAll('.chipWrap b')].map(chip => chip.textContent).join('|'),
      row.querySelector('.tierLine:nth-child(2) strong').textContent,
      row.querySelector('.nodePill').textContent
    ],
    value: row.querySelector('.rowMetric b').textContent,
    note: row.querySelector('.practicalNote')?.textContent || '',
    stages: row.querySelector('.rowMetric small').textContent
  })));
  assert.deepEqual(rows.map(({ nodes, value }) => ({ nodes, value })), top.map(({ nodes, value }) => ({ nodes, value: value.toFixed(4) })));
  const normalRows = rows.filter(row => !row.nodes[2].includes('뭉툭한 가시'));
  const bluntRows = rows.filter(row => row.nodes[2].includes('뭉툭한 가시'));
  assert.ok(normalRows.length > 0 && bluntRows.length > 0);
  for (const row of normalRows) assert.match(row.stages, /2중 확정 · 3중/);
  for (const row of bluntRows) assert.match(row.stages, /다중 치명 0\.00%/);
  for (const row of rows) {
    if (row.nodes[1].includes('회심') && !row.nodes[2].includes('뭉툭한 가시')) {
      assert.match(row.note, /치명타 적중 주피 중첩 미검증/);
    }
  }

  const criticalMaster = page.locator('.nodeCard[data-name="회심"]');
  await criticalMaster.locator('[data-action="plus"]').click();
  await page.locator('#evolutionRecalculateButton').click();
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
  assert.equal(await currentScore.innerText(), expected({ evo: 19, blunt: true }).toFixed(4));

  // Reproduce the TOP5 using the actual controls and compare each in A/B.
  // On mobile replay the highest-scoring candidate and both gear changes.
  assert.deepEqual(top[0].nodes, ['예감 Lv.2|한돌 Lv.1', '회심 + 달인', '뭉툭한 가시 Lv.2']);
  const metrics = page.locator('#specScenarioOutput .specScenarioMetrics > div');
  const scenarioGain = metrics.nth(1).locator('strong');
  const percent = value => `+${((value / normal - 1) * 100).toFixed(2)}%`;
  const replay = viewport.width > 600 ? [...top].reverse() : [top[0]];
  const fullName = { 예감: '예리한 감각', 한돌: '한계 돌파' };
  for (const [index, candidate] of replay.entries()) {
    if (index) await page.locator('#simulatorBackButton').click();
    const labels = [...candidate.nodes[0].split('|'), ...candidate.nodes[1].split(' + '), candidate.nodes[2]];
    const levels = new Map(labels.map(label => {
      const [name, level] = label.split(' Lv.');
      return [fullName[name] || name, Number(level || 1)];
    }));
    const active = new Map(await page.locator('.nodeCard.selected').evaluateAll(nodes =>
      nodes.map(node => [node.dataset.name, Number(node.querySelector('.nodeControls b').textContent.replace('Lv.', ''))])
    ));
    const clickNode = (name, action) => page.locator(`.nodeCard[data-name="${name}"] [data-action="${action}"]`).click();
    for (const [name, level] of active) {
      for (let step = level; step > (levels.get(name) || 0); step -= 1) await clickNode(name, 'minus');
    }
    for (const [name, level] of levels) {
      for (let step = active.get(name) || 0; step < level; step += 1) await clickNode(name, 'plus');
    }
    await page.locator('#evolutionRecalculateButton').click();
    await page.locator('#simulatorJumpButton').click();
    const comparison = page.locator('.specScenarioPanel');
    if (await comparison.getAttribute('open') == null) await comparison.locator('summary').click();
    assert.equal(await scenarioGain.innerText(), percent(candidate.value));
  }

  const upgrade = page.locator('.specEfficiencyRow').filter({ hasText: '하하 → 상상' });
  await upgrade.locator('.specScenarioPick > span').click();
  assert.equal(await upgrade.getByRole('checkbox', { name: /표본 반지.*B 비교에 적용/ }).isChecked(), true);
  assert.equal(await metrics.nth(2).locator('strong').innerText(), '256.15%');
  const ringScore = expected({ crit: 15 + 1.15, evo: 39, keen: 0.029, mastery: 8.5, blunt: true, critHit: 1.12 });
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

try {
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
  console.log('skill effect UI tests passed');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  if (!chromeDebugLogExisted) await unlink(chromeDebugLog).catch(() => {});
}
