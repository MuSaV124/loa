import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const [archivePath, beforeRoot, output, scope] = process.argv.slice(2);
if (!archivePath || !beforeRoot || !output) throw new Error('Pass Armory archive, baseline Git worktree and output JSON.');
const archive = JSON.parse(await readFile(archivePath, 'utf8'));
const full = scope === '--all';
const inputs = scope === '--inputs';
const representative = scope === '--representative';
const batch = archive.samples.filter(row => row.raw?.ArmoryProfile && row.classExpected === row.className);
const samples = inputs || full ? batch : representative
  ? [...new Map(batch.map(row => [row.className, row])).values()].filter(row => ['서머너', '바드', '리퍼'].includes(row.className))
  : batch.filter(row => row.skills?.some(skill => skill.Name === '마리포사'));
assert.equal(samples.length, inputs || full ? 99 : representative ? 3 : 4);
const hash = value => createHash('sha256').update(value).digest('hex');
if (inputs) {
  const appSource = async root => {
    const app = await readFile(resolve(root, 'public/app.js'), 'utf8');
    const first = app.indexOf('async function calculateAndRender()');
    const end = app.indexOf('\nasync function ', first + 1);
    assert.ok(first >= 0 && end > first);
    return app.slice(first, end).replaceAll('\r\n', '\n');
  };
  assert.equal(await appSource(beforeRoot), await appSource('.'), 'Candidate evaluator changed');
  const engineSource = async root => (await readFile(resolve(root, 'public/mana-recommendation.js'), 'utf8'))
    .split('export function rankManaCandidates')[1].replaceAll('\r\n', '\n');
  assert.equal(await engineSource(beforeRoot), await engineSource('.'), 'Theory ranking changed');
}
const chrome = process.env.PLAYWRIGHT_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const executablePath = await access(chrome).then(() => chrome).catch(() => undefined);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-gpu'] });
const origin = 'http://mana-top5.local';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

async function replay(root, subset = samples) {
  const page = await browser.newPage();
  const publicRoot = resolve(root, 'public');
  const { parseCharacterArmory } = await import(pathToFileURL(resolve(root, 'api/character.js')));
  try {
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      const file = resolve(publicRoot, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(publicRoot + sep) || !Object.hasOwn(mime, extname(file))) return route.fulfill({ status: 404, body: '' });
      let body;
      try { body = await readFile(file, 'utf8'); } catch { return route.fulfill({ status: 404, body: '' }); }
      if (url.pathname === '/app.js') {
        const marker = 'const top = shown.slice(0, 5);';
        assert.ok(body.includes(marker));
        body = body.replace(marker, `${marker}\n globalThis.manaRankAudit = { top, ranks };`);
        if (inputs) {
          const allocation = 'const allocations = evolutionAllocations(nodes, fixed.map(row => ({ points: cost(row) })), pointBudget);';
          assert.ok(body.includes(allocation));
          body = body.replace(allocation, `globalThis.manaRankAudit = { inputs: {
            nodes, fixedCosts: fixed.map(cost), pointBudget, baseStats, theoryModel, excludeCooldown,
            supportMode, supportContext, supportSnapshot: supportMode ? { ...state.powerSnapshot, version: undefined } : null,
            rates, apiBase, fixedSelection, manaScenario: manaInput?.scenario ?? null
          } }; return;\n${allocation}`);
        }
        body += '\n globalThis.manaAppAudit = { state, applyCharacterData, loadCombatAnalyzer, prepareSkillScoring };';
      }
      await route.fulfill({ body, contentType: mime[extname(file)] + '; charset=utf-8' });
    });
    await page.goto(origin);
    await page.waitForFunction(() => Boolean(globalThis.manaAppAudit?.state.evolution));
    await page.evaluate(() => globalThis.manaAppAudit.loadCombatAnalyzer());
    const results = [];
    for (const [ordinal, sample] of subset.entries()) {
      const data = parseCharacterArmory(sample.raw, { arkGrid: { data: sample.arkGrid }, combatSkills: { data: sample.skills } });
      for (const controlled of inputs || representative || full || ordinal ? [false] : [false, true]) {
        const row = await page.evaluate(async ({ data, controlled }) => {
          const audit = globalThis.manaAppAudit;
          document.getElementById('manaRecommendationMode').value = 'theory';
          // Use the real tooltip with an explicitly controlled, non-game damage allocation.
          await audit.applyCharacterData(data, controlled ? () => {
            const target = audit.state.skillEffects.items.find(item => item.usesMana && item.currentTree).name;
            audit.state.skillCycle = { ...audit.state.skillCycle, shareRows: [
              { name: '마리포사', share: 25, targetNames: ['마리포사'] },
              { name: target, share: 75, targetNames: [target] }
            ] };
          } : undefined);
          if (globalThis.manaRankAudit.inputs) return JSON.stringify(globalThis.manaRankAudit.inputs, (_, value) =>
            value instanceof Map ? [...value.entries()] : value instanceof Set ? [...value] : value);
          const pack = row => [row.entries.map(entry => [entry.name, entry.level]), +row.recValue.toFixed(8)];
          const { ranks } = globalThis.manaRankAudit;
          return { class: data.powerSnapshot.profile.className, build: data.powerSnapshot.profile.secondClass, controlled,
            top: ranks.theoretical.slice(0, 5).map(pack),
            candidates: ranks.counts.theoretical, mariposaWeighted: audit.prepareSkillScoring().units.some(unit => unit.name === '마리포사' && unit.weight > 0),
            manaFlag: audit.state.skillEffects.items.find(item => item.name === '마리포사')?.manaUsageKnown };
        }, { data, controlled });
        if (controlled) assert.equal(row.mariposaWeighted, true);
        results.push(inputs ? { class: sample.className, build: data.powerSnapshot.profile.secondClass, hash: hash(row) } : row);
      }
      if (full && (ordinal + 1) % 10 === 0) console.log(`${root} ${ordinal + 1}/${subset.length}`);
    }
    return results;
  } finally {
    await page.close();
  }
}

async function replayAll(root) {
  const workers = full ? Math.min(8, Math.max(1, Number(process.env.MANA_REPLAY_WORKERS) || 1)) : 1;
  const size = Math.ceil(samples.length / workers);
  const subsets = Array.from({ length: workers }, (_, i) => samples.slice(i * size, (i + 1) * size));
  return (await Promise.all(subsets.filter(subset => subset.length).map(subset => replay(root, subset)))).flat();
}

try {
  const [before, after] = await Promise.all([replayAll(beforeRoot), replayAll('.')]);
  const cases = before.map((a, i) => ({ case: `S${i + 1}`, before: a, after: after[i],
    ...(inputs ? { matching: a.hash === after[i].hash } : { topChanged: JSON.stringify(a.top) !== JSON.stringify(after[i].top) }) }));
  if (inputs || representative || full) {
    const differences = cases.filter(row => inputs ? !row.matching : JSON.stringify(row.before) !== JSON.stringify(row.after));
    assert.equal(differences.length, 0, `Theoretical inputs/results changed in ${differences.map(row => `${row.case} ${row.after.class}`).join(', ')}`);
  }
  else assert.ok(cases.every(row => !row.before.manaFlag && row.after.manaFlag));
  await writeFile(output, JSON.stringify({ mode: scope ?? 'mariposa', cases }, null, 2) + '\n');
  console.log(inputs ? `Theory evaluator and inputs match (${cases.length} characters)` : full || representative ? `Theoretical result replay passed (${cases.length} characters)`
    : JSON.stringify(cases.map(row => [row.case, row.after.build, row.after.controlled, row.topChanged, row.before.candidates, row.after.candidates])));
} finally {
  await browser.close();
}
