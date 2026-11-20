import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { parseCharacterArmory } from '../api/character.js';
import { CLASS_BENCHMARK_CATALOG } from './class-benchmark-catalog.mjs';
import { combatAnalyzerSkillShares, normalizeCombatAnalyzerText } from '../public/combat-analyzer.js';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const readJSON = async url => JSON.parse(await readFile(url, 'utf8'));
const roster = await readJSON(new URL('./class-audit-roster.json', import.meta.url));
const analyzer = await readJSON(resolve(root, 'combat-analyzer.json'));
const output = process.argv[2];
const snapshotPath = process.argv[3];
if (!output) throw new Error('Provide an output path for the recommendation audit.');
assert.equal(roster.rows.length, 30);
assert.deepEqual([...new Set(CLASS_BENCHMARK_CATALOG.map(row => row.className))].sort(),
  roster.rows.map(row => row.className).sort());

const supportAttacks = {
  바드: ['천상의 연주', '음파 진동', '사운드 쇼크'],
  도화가: ['묵법 : 해그리기', '묵법 : 해우물', '묵법 : 난치기'],
  홀리나이트: ['신의 분노', '천상의 축복', '빛의 충격'],
  발키리: ['숭고한 맹세', '숭고한 도약', '진리의 륜']
};

// Single-level tooltips transcribed from notices 13598 and 13601. The rest
// of these characters (including their damage shares) are synthetic.
const patchPassives = [
  ['소서리스', '환류', '환류 강화', '각성기를 제외한 모든 스킬의 피해량이 52.0% 증가한다.'],
  ['슬레이어', '처단자', '격분', '폭주 중 적에게 주는 치명타 피해가 57.0% 증가한다.'],
  ['스카우터', '아르데타인의 기술', '코어 인챈트', '치명타 적중률이 9.0% 증가하고 적에게 주는 피해가 17.0% 증가한다.'],
  ['버서커', '광전사의 비기', '광전사의 비기', '적에게 주는 피해가 7.0% 증가한다.'],
  ['브레이커', '수라의 길', '무아지경', '적에게 주는 피해량이 18.0% 증가한다.'],
  ['아르카나', '황후의 은총', '황후의 속삭임', '루인 스킬의 피해량이 25.0% 증가한다. 일반 스킬과 스택트 스킬의 재사용 대기시간이 6.0% 감소한다.'],
  ['기상술사', '이슬비', '맑은 날', '여우비가 활성화되어 있는 동안 기상 스킬의 피해량이 42.0% 증가한다.']
];
const probes = [
  ['인파이터', '극의: 체술', '진 용출권', '작렬하는 주먹', '내려찍는 추가 공격의 치명타 적중률이 80.0% 증가하고, 치명타 피해가 100.0% 증가한다.'],
  ['데빌헌터', '강화 무기', '사형 집행', '급소 타격', '어퍼킥의 치명타 적중률이 80.0% 증가하고 치명타 피해가 150.0% 증가한다.'],
  ['블래스터', '포격 강화', '네이팜탄', '급소 포격', '폭발 공격의 치명타 적중률이 80.0% 증가한다.'],
  ['창술사', '절정', '굉열파', '파괴하는 창', '공격이 항상 치명타로 적중하며 모든 치명타 발생 확률 1%당 피해량이 0.6% 증가한다. 치명타 피해가 60.0% 증가한다.'],
  ['블레이드', '버스트', '어퍼 슬래쉬', '강력한 회오리', '두 번째 공격의 회오리의 치명타 적중률이 80.0% 증가한다.']
];

function makeSample(build, index) {
  const { className, engraving, role } = build;
  const reference = Object.entries(analyzer.fallbackBuilds || {}).find(([name]) =>
    normalizeCombatAnalyzerText(name) === normalizeCombatAnalyzerText(engraving))?.[1];
  const rankingSkills = Object.entries(combatAnalyzerSkillShares(reference))
    .filter(([, share]) => Number(share) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 3).map(([name]) => name);
  const probe = probes.find(row => row[0] === className && row[1] === engraving);
  const names = role === 'support' ? supportAttacks[className]
    : [...new Set([probe?.[2], ...rankingSkills, '감사 보조 기술', '감사 비교 기술', '감사 기준 기술'].filter(Boolean))].slice(0, 3);
  const special = ['인파이터', '브레이커', '스카우터', '블래스터'].includes(className);
  const skills = names.map((name, i) => {
    const kind = className === '아르카나' && engraving === '황후의 은총' && i === 0 ? '루인'
      : className === '기상술사' && engraving === '이슬비' && i === 0 ? '기상' : '일반';
    return {
      Name: name, Level: 14, SkillType: 0,
      Tooltip: JSON.stringify({
        Element_001: { type: 'SingleTextBox', value: `[${kind} 스킬]` },
        Element_003: { type: 'SingleTextBox', value: `재사용 대기시간 ${[10, 16, 24][i]}초` },
        Element_004: { type: 'MultiTextBox', value: special ? '기력 20 소모|' : `마나 ${[380, 330, 240][i]} 소모|` },
        Element_005: { type: 'SingleTextBox', value: i === 1 ? '공격 타입 : 백 어택' : '적에게 피해를 준다.' }
      }),
      Tripods: i === 0 && probe ? [{ Name: probe[3], IsSelected: true, Tooltip: probe[4] }] : []
    };
  });
  if (engraving === '환류') {
    skills[2] = { Name: '종말의 부름', Level: 1, SkillType: 100,
      Tooltip: JSON.stringify({ Element_001: { type: 'SingleTextBox', value: '[각성기]' } }) };
  }
  const effects = [
    { Name: '진화', Description: '진화 1티어 특화 Lv.30' },
    { Name: '진화', Description: '진화 1티어 신속 Lv.10' },
    { Name: '진화', Description: `진화 3티어 ${role === 'support' ? '정열의 춤사위' : '타이밍 지배'} Lv.2` }
  ];
  for (const [, , name, text] of patchPassives.filter(row => row[0] === className && row[1] === engraving)) {
    effects.push({
      Name: '깨달음', Description: `깨달음 4티어 ${name} Lv.3`,
      ToolTip: JSON.stringify({ Element_000: { type: 'NameTagBox', value: name }, Element_002: { type: 'MultiTextBox', value: text } })
    });
  }
  const shares = Object.fromEntries(skills.map(({ Name }, i) => [Name, [50, 35, 15][i]]));
  const raw = {
    ArmoryProfile: { CharacterName: `감사표본${index + 1}`, CharacterClassName: className, ItemAvgLevel: '1700',
      Stats: [{ Type: '최대 마나', Value: '2400' }, { Type: '신속', Value: '500' }] },
    ArkPassive: { Title: engraving, Points: [{ Name: '진화', Value: 140 }], Effects: effects }
  };
  return { kind: 'synthetic', className, role, shares, raw, skills };
}

const live = snapshotPath ? (await readJSON(resolve(snapshotPath))).samples : [];
const fetched = live.filter(row => row.raw);
const mismatches = fetched.filter(row => row.raw.ArmoryProfile?.CharacterClassName !== row.className);
const current = fetched.filter(row => !mismatches.includes(row));
const samples = [...CLASS_BENCHMARK_CATALOG.map(makeSample), ...current.map(row => ({ ...row, kind: 'api-replay' }))];
const server = 'http://class-audit.local';
const mime = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css' };
const chrome = process.env.PLAYWRIGHT_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const executablePath = await access(chrome).then(() => chrome).catch(() => undefined);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-gpu'] });
const results = [];
try {
  const page = await browser.newPage();
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== server) return route.abort();
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, json: {} });
    const file = resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(root)) return route.abort();
    let body;
    try { body = await readFile(file); } catch { return route.fulfill({ status: 404, body: '' }); }
    if (url.pathname === '/app.js') {
      const marker = 'const top = shown.slice(0, 5);';
      assert.ok(body.toString('utf8').includes(marker));
      body = body.toString('utf8').replace(marker, marker + '\n globalThis.auditTop = { candidates, ranks, top, manaInput };')
        + '\n globalThis.auditClass = { state, applyCharacterData, loadCombatAnalyzer, refreshSkillCycleModel, refreshPassiveSkillEffects, calculateAndRender };';
    }
    await route.fulfill({ body, contentType: (mime[extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
  });
  await page.goto(server, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(globalThis.auditClass?.state.evolution));
  await page.evaluate(async () => { globalThis.auditAnalyzer = await globalThis.auditClass.loadCombatAnalyzer(); });
  for (const sample of samples) {
    const data = parseCharacterArmory(sample.raw, {
      arkGrid: { data: sample.arkGrid, error: sample.arkGridError },
      combatSkills: { data: sample.skills, error: sample.skillEffectsError }
    });
    const row = await page.evaluate(({ data, kind, shares }) => {
      const audit = globalThis.auditClass;
      const field = id => document.getElementById(id);
      if (kind === 'synthetic') audit.state.combatAnalyzer = {
        fallbackBuilds: { [data.arkPassive.Title]: shares }, identitySkills: []
      };
      if (kind === 'api-replay') audit.state.combatAnalyzer = globalThis.auditAnalyzer;
      field('manaRecommendationMode').value = 'auto';
      field('manaSupport').value = 'none';
      field('extraCritRate').value = kind === 'synthetic' ? '85' : '0';
      field('extraCritDamage').value = kind === 'synthetic' ? '50' : '0';
      audit.applyCharacterData(data);
      audit.calculateAndRender();
      const { top, ranks, candidates, manaInput } = globalThis.auditTop;
      const n = value => Number.isFinite(value) ? +value.toFixed(8) : null;
      const pack = candidate => ({
        tier2: candidate.tier2Entries.map(e => [e.name, e.level]),
        tier4: candidate.fourNames, tier5: [candidate.fiveName, candidate.fiveLevel],
        value: n(candidate.recValue), alternate: candidate.supportModel ? null : n(candidate.calc.result.alternateValue),
        mana: n(candidate.mana?.value), manaAlternate: n(candidate.mana?.alternateValue), quality: candidate.mana?.quality,
        multiCrit: candidate.supportModel ? null : n(candidate.calc.result.multiCritContribution)
      });
      const winner = top[0];
      return {
        className: data.profile.CharacterClassName,
        build: data.powerSnapshot.profile.secondClass,
        support: Boolean(winner?.supportModel),
        points: audit.state.evolutionPointBudget,
        skillCount: audit.state.skillEffects.items.length,
        selectedTripodCount: audit.state.skillEffects.selectedTripodCount,
        cycleShare: n(audit.state.skillCycle?.modeledSharePercent),
        shares: audit.state.skillCycle?.shareSource || null,
        shareMatch: audit.state.skillCycle?.analyzerMatch || null,
        unmodeledShares: audit.state.skillCycle?.unmodeledShareNames || [],
        skillTypes: [...new Set(data.skills.map(skill => skill.SkillType))],
        missingSkillResponse: Boolean(data.skillEffectsError),
        missingGridResponse: Boolean(data.arkGridError),
        partialHitTripods: audit.state.skillEffects.items.flatMap(skill =>
          skill.selectedTripods.filter(tripod => tripod.partialCritRuleUnmodeled).map(tripod => [skill.name, tripod.name])),
        passiveRuleCount: audit.state.passiveSkillEffects.rules.length,
        gridRuleCount: audit.state.arkGridSkillEffects.rules.length,
        unresolved: [...audit.state.passiveSkillEffects.unresolved, ...audit.state.arkGridSkillEffects.unresolved]
          .map(row => [row.nodeName, row.text]),
        count: candidates.length, nodes: [...new Set(candidates.map(c => c.fiveName))],
        recommendationBasis: field('manaRecommendationStatus').textContent,
        manaReason: manaInput?.reason ?? null,
        top: top.map(pack), theory: ranks.theoretical.slice(0, 5).map(pack),
        theoryB: ranks.theoreticalAlternate.slice(0, 5).map(pack),
        skills: (winner?.calc.result.skillExperiment?.items || []).filter(r => r.share > 0).map(r => ({
          name: r.name, share: r.share, effects: r.effects, value: n(r.value)
        })),
        rankValid: ranks.theoretical.every((c, i, list) => !i || list[i - 1].recValue >= c.recValue),
        manaRankValid: ranks.evaluated.every((c, i, list) => !i || list[i - 1].mana.value >= c.mana.value)
      };
    }, { data, kind: sample.kind, shares: sample.shares });
    assert.equal(row.className, sample.className, sample.name || sample.className);
    assert.ok(row.rankValid && row.manaRankValid, sample.className);
    if (sample.kind === 'synthetic') {
      assert.ok(row.top.length && row.skillCount === 3, sample.className);
      assert.equal(row.support, sample.role === 'support', sample.className);
      assert.equal(row.nodes.length, row.support ? 3 : 6, sample.className);
    }
    results.push({ kind: sample.kind, ...(sample.name ? { character: sample.name, sourceVersion: sample.apiVersion } : {}), ...row });
  }
} finally {
  await browser.close();
}
await writeFile(resolve(output), JSON.stringify({ asOf: roster.asOf, roster: roster.rows, results,
  failedRequests: live.filter(row => row.error).map(({ name, className, error }) => ({ name, className, error })),
  mismatches: mismatches.map(row => ({ name: row.name, expected: row.className, actual: row.raw.ArmoryProfile?.CharacterClassName }))
}, null, 2) + '\n');
console.log(JSON.stringify({ classes: new Set(results.map(r => r.className)).size, builds: results.length,
  synthetic: results.filter(r => r.kind === 'synthetic').length, candidates: results.reduce((sum, r) => sum + r.count, 0) }));
