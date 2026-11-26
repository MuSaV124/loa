import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const [archivePath, beforeRoot, output, scope] = process.argv.slice(2);
if (!archivePath || !beforeRoot || !output) throw new Error('Pass Armory archive, baseline Git worktree and output JSON.');
const archive = JSON.parse(await readFile(archivePath, 'utf8'));
const full = scope === '--all';
const samples = archive.samples.filter(row => row.raw?.ArmoryProfile && row.classExpected === row.className
  && (full || row.skills?.some(skill => skill.Name === '마리포사')));
assert.equal(samples.length, full ? 99 : 4);
const chrome = process.env.PLAYWRIGHT_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const executablePath = await access(chrome).then(() => chrome).catch(() => undefined);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-gpu'] });
const origin = 'http://mana-top5.local';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

async function replay(root) {
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
        body += '\n globalThis.manaAppAudit = { state, applyCharacterData, loadCombatAnalyzer, prepareSkillScoring };';
      }
      await route.fulfill({ body, contentType: mime[extname(file)] + '; charset=utf-8' });
    });
    await page.goto(origin);
    await page.waitForFunction(() => Boolean(globalThis.manaAppAudit?.state.evolution));
    await page.evaluate(() => globalThis.manaAppAudit.loadCombatAnalyzer());
    const results = [];
    for (const [ordinal, sample] of samples.entries()) {
      const data = parseCharacterArmory(sample.raw, { arkGrid: { data: sample.arkGrid }, combatSkills: { data: sample.skills } });
      for (const controlled of full || ordinal ? [false] : [false, true]) {
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
          const pack = row => [row.entries.map(entry => [entry.name, entry.level]), +row.recValue.toFixed(8)];
          const { ranks } = globalThis.manaRankAudit;
          return { class: data.powerSnapshot.profile.className, build: data.powerSnapshot.profile.secondClass, controlled,
            top: ranks.theoretical.slice(0, 5).map(pack),
            candidates: ranks.counts.theoretical, mariposaWeighted: audit.prepareSkillScoring().units.some(unit => unit.name === '마리포사' && unit.weight > 0),
            manaFlag: audit.state.skillEffects.items.find(item => item.name === '마리포사')?.manaUsageKnown };
        }, { data, controlled });
        if (controlled) assert.equal(row.mariposaWeighted, true);
        results.push(row);
      }
    }
    return results;
  } finally {
    await page.close();
  }
}

try {
  const [before, after] = await Promise.all([replay(beforeRoot), replay('.')]);
  const cases = before.map((a, i) => ({ case: `S${i + 1}`, before: a, after: after[i], topChanged: JSON.stringify(a.top) !== JSON.stringify(after[i].top) }));
  if (full) assert.deepEqual(after, before, 'All 99 theory rankings and candidate counts must stay unchanged');
  else assert.ok(cases.every(row => !row.before.manaFlag && row.after.manaFlag));
  await writeFile(output, JSON.stringify({ cases }, null, 2) + '\n');
  console.log(full ? `Full theoretical comparison passed (${cases.length} characters)`
    : JSON.stringify(cases.map(row => [row.case, row.after.build, row.after.controlled, row.topChanged, row.before.candidates, row.after.candidates])));
} finally {
  await browser.close();
}
