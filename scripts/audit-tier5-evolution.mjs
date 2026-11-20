import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { expectedHitDamage } from '../public/damage-math.js';
import { calculateSonicBreakEvolutionDamage, maintainedEvolutionDamage } from '../public/evolution-math.js';
import { manaFurnaceDamage } from '../public/mana-recommendation.js';
import { parseSkillEffectText } from '../public/skill-effects.js';
import { combatAnalyzerGemFactors } from '../public/combat-analyzer.js';
import { supportContributionModel } from '../public/support-power.js';
import { parseAccessoryText, parseEquipmentSnapshotItem } from '../api/character.js';

const publicPath = fileURLToPath(new URL('../public/', import.meta.url));
const db = JSON.parse(await readFile(resolve(publicPath, 'data/evolution.json'), 'utf8'));
const tier5 = db.nodes.filter(node => node.tier === 5);
const blunt = tier5.find(node => node.name === '뭉툭한 가시');
const rates = [0, 50, 80, 90, 100, 110, 120, 140, 150, 180, 200, 220, 250, 300, 350, 400];
const damages = [200, 250, 300, 350, 400, 450, 500, 550, 600, 700, 800];
const evolution = [0, 25, 50, 100];
const conditions = {
  lowSpeedNoMana: { attackSpeed: 100, moveSpeed: 100, baseManaCost: 0 },
  mixedSpeedMana: { attackSpeed: 145, moveSpeed: 150, baseManaCost: 300 },
  highSpeedMana: { attackSpeed: 155, moveSpeed: 155, baseManaCost: 480 }
};
const rounded = value => value == null ? null : +value.toFixed(8);
const equal = (a, b) => Math.abs(a - b) <= 1e-9;

function singleHit(node, level, critRate, critDamage, commonEvolution, condition) {
  const effect = node.levels?.[level] || {};
  const cost = condition.baseManaCost;
  const sonic = effect.sonicBreak ? calculateSonicBreakEvolutionDamage(condition.attackSpeed, condition.moveSpeed, effect.sonicBreak) : 0;
  const furnace = manaFurnaceDamage(effect.manaFurnace, { manaUsageKnown: true, usesMana: cost > 0, manaCost: cost });
  const directEvolution = maintainedEvolutionDamage(effect) + sonic + furnace.damage;
  if (node.name === '입식 타격가') assert.equal(directEvolution, level === 1 ? 10.5 : 21);
  if (node.name === '인파이팅') assert.equal(directEvolution, level === 1 ? 9 : 18);
  const result = expectedHitDamage({ ...effect, critRate, critDamage, evolutionDamage: commonEvolution + directEvolution });
  const appliedRate = node === blunt ? Math.min(critRate, 80) : critRate;
  const converted = node === blunt ? Math.max(0, critRate - 80) * (level === 1 ? 1.2 : 1.4) : 0;
  const expected = (1 + appliedRate / 100 * (critDamage / 100 - 1)) * (1 + (commonEvolution + directEvolution + converted) / 100);
  assert.ok(equal(result.value, expected), node.name);
  return {
    directEvolution, result, critDamage,
    additionalMaxManaCostPercent: cost > 0 ? effect.manaFurnace?.maxManaCostPercent || 0 : 0,
    brand: effect.standingStriker || effect.manaFurnace || node.name === '안정된 관리자' ? 10 * level : 0,
    identityGain: node.name === '안정된 관리자' ? -3 * level : 0,
    multiIncrement: node === blunt ? 0 : Math.max(0, critRate / 100 - 1) * (critDamage / 100 - 1)
  };
}

// Difference on each interval is affine while holding the other stat and effects constant.
function strictWins(delta, bounds) {
  const ranges = [];
  for (let i = 1; i < bounds.length; i++) {
    const x = bounds[i - 1], y = bounds[i], a = delta(x), b = delta(y);
    if (a <= 1e-9 && b <= 1e-9) continue;
    const cross = x + (y - x) * a / (a - b);
    const from = a > 1e-9 ? x : cross;
    const to = b > 1e-9 ? y : cross;
    const last = ranges.at(-1);
    if (last && equal(last.to, from) && delta(from) > 1e-9) {
      last.to = to;
      last.includeTo = b > 1e-9;
    } else ranges.push({ from, to, includeFrom: a > 1e-9, includeTo: b > 1e-9 });
  }
  return ranges.map(range => ({ ...range, from: rounded(range.from), to: rounded(range.to) }));
}

function runGrid() {
  const rows = [];
  const crossovers = [];
  const winners = {};
  const sample = [];
  for (const [conditionName, condition] of Object.entries(conditions)) {
    winners[conditionName] = {};
    for (const level of [1, 2]) for (const evo of evolution) {
      for (const critRate of rates) for (const critDamage of damages) {
        const ranked = tier5.map(node => ({ node, ...singleHit(node, level, critRate, critDamage, evo, condition) }))
          .sort((a, b) => b.result.value - a.result.value);
        let rank = 1;
        for (const [i, item] of ranked.entries()) {
          const { node, result, directEvolution, additionalMaxManaCostPercent, multiIncrement, brand, identityGain } = item;
          if (i && !equal(result.value, ranked[i - 1].result.value)) rank = i + 1;
          if (level === 2 && rank === 1) winners[conditionName][node.name] = (winners[conditionName][node.name] || 0) + 1;
          rows.push([conditionName, critRate, critDamage, evo, node.name, level, result.effectiveCritRate, critDamage,
            result.critical.guaranteedTiers, rounded(result.critical.nextTierChance * 100), rounded(result.critical.multiCritChance * 100),
            rounded(multiIncrement), rounded(directEvolution), rounded(result.convertedEvolutionDamage),
            rounded(result.evo), additionalMaxManaCostPercent, brand, identityGain, rounded(result.value), rank]);
        }
        if (level === 2 && evo === 25 && (([80, 100, 120, 220, 400].includes(critRate) && critDamage === 250) || (critRate === 400 && critDamage === 800))) {
          sample.push({ condition: conditionName, critRate, critDamage, evo,
            values: Object.fromEntries(ranked.map(item => [item.node.name, rounded(item.result.value)])) });
        }
      }
      for (const node of tier5.filter(node => node !== blunt)) {
        const delta = (rate, damage) => singleHit(node, level, rate, damage, evo, condition).result.value
          - singleHit(blunt, level, rate, damage, evo, condition).result.value;
        crossovers.push({ condition: conditionName, level, commonEvolution: evo, node: node.name,
          critRateByCritDamage: Object.fromEntries(damages.map(dmg => [dmg, strictWins(rate => delta(rate, dmg), [0, 80, 400])])),
          critDamageByCritRate: Object.fromEntries(rates.map(rate => [rate, strictWins(dmg => delta(rate, dmg), [200, 800])])) });
      }
    }
  }
  assert.equal(rows.length, 704 * tier5.length * 2 * Object.keys(conditions).length);
  return {
    axes: { rates, damages, evolution }, conditions, winners, sample, crossovers,
    columns: ['조건', '원시 치적%', '입력 치피%', '공통 진피%p', '노드', '레벨', '최종 치적%', '최종 치피%',
      '보장 치명 단계', '다음 단계 확률%', '2중 이상 확률%', '다중 치명 추가 배율', '기본 및 조건부 노드 진피%p',
      '뭉가 전환 진피%p', '총 진피%p', '마나 스킬 추가 최대 MP 소모%', '파티 낙인력%p(피해표 미합산)',
      '아이덴티티 획득% 변화(피해표 미합산)', '기대 피해 배율', '동레벨 순위'],
    rows
  };
}

const scenarios = [
  { key: '저치적·저치피', crit: 45, critDamage: 200, speed: 135, extraEvolution: 25, stacks: 2, uptime: 100, mana: 2200, tick: 170 },
  { key: '고치적·저치피', crit: 140, critDamage: 200, speed: 140, extraEvolution: 25, stacks: 3, uptime: 100, mana: 2200, tick: 170 },
  { key: '저치적·고치피', crit: 65, critDamage: 550, speed: 155, extraEvolution: 25, stacks: 3, uptime: 90, mana: 2200, tick: 170 },
  { key: '고치적·고치피', crit: 220, critDamage: 600, speed: 155, extraEvolution: 75, stacks: 3, uptime: 90, mana: 2200, tick: 170 },
  { key: '확정 치명 보유', crit: 105, critDamage: 260, speed: 140, extraEvolution: 25, stacks: 3, uptime: 100, mana: 2200, tick: 170, forced: true },
  { key: '마나 부족', crit: 90, critDamage: 250, speed: 145, extraEvolution: 25, stacks: 3, uptime: 90, mana: 1300, tick: 98, highCost: true },
  { key: '마나 충분', crit: 90, critDamage: 250, speed: 145, extraEvolution: 25, stacks: 3, uptime: 90, mana: 3600, tick: 250, highCost: true },
  { key: '비마나 특수 자원', crit: 92, critDamage: 275, speed: 150, extraEvolution: 25, stacks: 3, uptime: 100, special: true },
  { key: '고마나·저속·회복 충분', crit: 70, critDamage: 550, speed: 135, extraEvolution: 50, stacks: 3, uptime: 80, mana: 3600, tick: 250, highCost: true },
  { key: '입타 중첩 유지', crit: 55, critDamage: 350, speed: 135, extraEvolution: 25, stacks: 6, uptime: 50, mana: 2200, tick: 170 },
  { key: '방향성 혼합·일격', crit: 74, critDamage: 260, speed: 145, extraEvolution: 25, stacks: 3, uptime: 95, mana: 2200, tick: 170, directional: true }
];

const supportKeys = ['none', 'bard', 'artist', 'paladin', 'valkyrie'];
const fixtureSkills = [
  { name: '기준 기술', share: .50, cooldown: 7, first: 0, cost: 490, crit: 0, critDamage: 0 },
  { name: '기준 기술 강화', share: .35, cooldown: 10, first: 1, cost: 440, crit: 18, critDamage: 60 },
  { name: '비마나 기술', share: .15, cooldown: 15, first: 2, cost: 0, crit: 5, critDamage: 20 }
];

function makeCharacter(fixture) {
  const className = fixture.forced ? '창술사' : fixture.special ? '인파이터' : '워로드';
  const stats = fixture.mana ? [{ Type: '최대 마나', Value: String(fixture.mana) }] : [];
  const items = fixtureSkills.map((skill, i) => {
    const cost = fixture.special ? 0 : fixture.highCost ? skill.cost : Math.round(skill.cost * .8);
    return { name: skill.name, level: 14, currentTree: true, cooldownEligible: true, baseCooldownSeconds: skill.cooldown,
      manaUsageKnown: true, usesMana: cost > 0, manaCost: cost, effects: {
        critRate: skill.crit, critDamage: skill.critDamage, ...(fixture.forced && i === 1 ? { forcedCrit: true, critRateToDamage: .6 } : {})
      } };
  });
  return { profile: { CharacterName: fixture.key, CharacterClassName: className, Stats: stats, ItemAvgLevel: '1700' },
    arkPassive: { Title: '5티어 검증 전직', Points: [{ Name: '진화', Value: 140 }], Effects: [
      { Name: '특화', Level: 30 }, { Name: '신속', Level: 10 }, { Name: fixture.directional ? '일격' : '타이밍 지배', Level: 2 }
    ] }, powerSnapshot: {
      profile: { name: fixture.key, className, secondClass: '5티어 검증 전직', stats: [] },
      equipment: { combat: [], accessories: [] }, gems: { items: [] }, effects: {}
    }, skillEffects: { items, cycleItems: items, calculableItems: items },
    skills: items.map((item, i) => ({ Name: item.name, Tooltip: JSON.stringify({
      Element_004: { type: 'MultiTextBox', value: item.usesMana ? `마나 ${item.manaCost} 소모|` : '기력 20 소모|' },
      Element_005: { type: 'SingleTextBox', value: i === 1 ? '공격 타입 : 백 어택' : '적에게 피해를 준다.' }
    }) })) };
}

async function runBrowserAudit() {
  const damageGroups = process.argv.includes('--damage-groups');
  const chromePath = process.env.PLAYWRIGHT_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const executablePath = await access(chromePath).then(() => chromePath).catch(() => undefined);
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-gpu'] });
  const mime = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css' };
  const origin = 'http://tier5-audit.local';
  const capturePoint = 'const top = shown.slice(0, 5);';
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, json: {} });
      if (url.pathname === '/combat-analyzer.json') return route.fulfill({ json: {
        fallbackBuilds: { '5티어 검증 전직': Object.fromEntries(fixtureSkills.map(skill => [skill.name, skill.share])) }
      } });
      const file = resolve(publicPath, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      try {
        assert.ok(file.startsWith(publicPath));
        let body = await readFile(file);
        if (url.pathname === '/app.js') {
          const source = body.toString('utf8');
          assert.ok(source.includes(capturePoint));
          body = source.replace(capturePoint, capturePoint + '\n globalThis.tier5Capture = { candidates, ranks, top, manaInput };')
            + '\n globalThis.tier5Audit = { state, loadCombatAnalyzer, applyCharacterData, calculateAndRender, statsWithSelection, selectionWithoutTiers, getNode, expectedHitDamage, support: SUPPORT_MANA };';
        }
        await route.fulfill({ body, contentType: (mime[extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
      } catch (error) {
        await route.fulfill({ status: 404, body: String(error) });
      }
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => globalThis.tier5Audit?.state?.evolution);
    await page.evaluate(() => globalThis.tier5Audit.loadCombatAnalyzer().then(Boolean));
    if (damageGroups) {
      const fixture = scenarios[0];
      const data = makeCharacter(fixture);
      const effects = parseSkillEffectText('공격이 치명타로 적중 시 적에게 주는 피해가 10% 증가한다.');
      for (const field of ['items', 'cycleItems', 'calculableItems']) {
        data.skillEffects[field][0].effects = effects;
      }
      const bracelet = parseAccessoryText('백어택 스킬이 적에게 주는 피해가 3% 증가한다.', '팔찌', '고대');
      data.braceletEffects = { enemyDamage: bracelet.enemyDamage, items: [{ type: '팔찌', effects: bracelet }] };
      const weapon = parseEquipmentSnapshotItem({ Type: '무기', Tooltip: '추가 피해 +30.00%' });
      const recommendation = await page.evaluate(({ data, weapon }) => {
        const audit = globalThis.tier5Audit;
        audit.applyCharacterData(data);
        const put = (id, value) => { document.getElementById(id).value = String(value); };
        put('manaRecommendationMode', 'theory');
        put('extraCritRate', 45);
        put('extraEvolutionDamage', 25);
        audit.calculateAndRender();
        const { candidates, ranks } = globalThis.tier5Capture;
        const label = c => [...c.tier2Entries.map(e => `${e.name}${e.level}`), '/', ...c.fourNames, '/', `${c.fiveName}${c.fiveLevel}`].join(' ');
        const rank = new Map(ranks.theoretical.map((c, i) => [label(c), i + 1]));
        const top = ranks.theoretical[0];
        const selection = audit.selectionWithoutTiers(audit.state.selected, [2, 4, 5]);
        for (const e of top.tier2Entries) selection[e.name] = { level: e.level };
        for (const name of top.fourNames) selection[name] = { level: top.fourLevel };
        selection[top.fiveName] = { level: top.fiveLevel };
        audit.state.bracelet = { items: [] };
        const withoutBracelet = audit.statsWithSelection(selection).result;
        const ratioBySkill = top.calc.result.skillExperiment.items.map((row, i) =>
          [row.name, row.value / withoutBracelet.skillExperiment.items[i].value]);
        audit.state.bracelet = data.braceletEffects;
        audit.state.powerSnapshot.equipment.combat.push(weapon);
        const withQuality = audit.statsWithSelection(selection).result.value;
        const details = c => ({
          evolution: c.calc.result.evo, converted: c.calc.result.convertedEvolutionDamage,
          multiContribution: c.calc.result.multiCritContribution, alternate: c.calc.result.alternateValue
        });
        return {
          candidateCount: candidates.length,
          top: ranks.theoretical.slice(0, 5).map(c => [label(c), c.recValue]),
          candidates: Object.fromEntries(candidates.map(c => [label(c), [rank.get(label(c)), c.recValue]])),
          topDetails: ranks.theoretical.slice(0, 5).map(c => [label(c), details(c)]),
          alternateTop: ranks.theoreticalAlternate.slice(0, 5).map(c => [label(c), c.calc.result.alternateValue]),
          bestByNode: Object.fromEntries([...new Set(candidates.map(c => c.fiveName))].map(name => {
            const c = ranks.theoretical.find(row => row.fiveName === name);
            return [name, { build: label(c), rank: rank.get(label(c)), value: c.recValue, ...details(c) }];
          })),
          ratioBySkill, withQuality
        };
      }, { data, weapon });
      assert.equal(recommendation.candidateCount, 558);
      assert.equal(recommendation.top.length, 5);
      assert.deepEqual(recommendation.ratioBySkill.map(([name, ratio]) => [name, rounded(ratio)]),
        [['기준 기술', 1], ['기준 기술 강화', 1.03], ['비마나 기술', 1]]);
      const profile = { tag: '감사', value: { '기준 기술': 100 } };
      const pair = [1, 2].map(level => ({ skill: '기준 기술', name: '겁화의 보석', kind: 'damage', level, tier: 4 }));
      const gems = combatAnalyzerGemFactors({}, { gems: { items: pair } }, {}, { profile });
      const support = supportContributionModel({ profile: { className: '바드', secondClass: '절실한 구원' },
        gems: { items: [{ skillName: '세레나데 스킬', name: '겁화의 보석', kind: 'damage', level: 10, tier: 4 }] } });
      return { effects, bracelet, gemDamage: gems.damageFactor, support: {
        fullBuffPower: support?.fullBuffPower, allyDamageBonus: support?.detail.allyDamageBonus
      }, ...recommendation };
    }
    const results = [];
    for (const fixture of scenarios) {
      const data = makeCharacter(fixture);
      const result = await page.evaluate(({ fixture, data, fixtureSkills, supportKeys }) => {
        const audit = globalThis.tier5Audit;
        const field = id => document.getElementById(id);
        const put = (id, value) => { field(id).value = String(value); };
        audit.applyCharacterData(data);
        field('manaShortageClass').checked = false;
        field('noManaMainSkill').checked = false;
        field('excludeCooldown').checked = false;
        put('manaRecommendationMode', 'theory');
        put('extraCritRate', fixture.crit);
        put('extraCritDamage', fixture.critDamage - 200);
        const speedBeforeTier3 = 114 + 500 / 58.21;
        put('extraAttackSpeed', fixture.speed - speedBeforeTier3);
        put('extraMoveSpeed', fixture.speed - speedBeforeTier3);
        put('extraEvolutionDamage', fixture.extraEvolution);
        audit.calculateAndRender();
        const { candidates, ranks } = globalThis.tier5Capture;
        const n = value => value == null || !Number.isFinite(value) ? null : +value.toFixed(8);
        const label = c => [...c.tier2Entries.map(e => `${e.name}${e.level}`), '/', ...c.fourNames, '/', `${c.fiveName}${c.fiveLevel}`].join(' ');
        const select = c => {
          const s = audit.selectionWithoutTiers(audit.state.selected, [2, 4, 5]);
          for (const e of c.tier2Entries) s[e.name] = { level: e.level };
          for (const name of c.fourNames) s[name] = { level: c.fourLevel };
          s[c.fiveName] = { level: c.fiveLevel };
          return s;
        };
        const flags = c => {
          const r = c.calc.result;
          return [r.critHitStackingUnverified && '회심 등 치명 적중 주피 중첩', r.manaDamageUnverified && '마나 피해 입력',
            r.skillExperiment.items.some(row => row.share > 0 && (row.critInteractionUnverified || row.partialCritRuleUnmodeled)) && '특수 치명 우선순위',
            c.fiveName === '안정된 관리자' && '아이덴티티 획득 감소의 딜 영향 미검증'].filter(Boolean);
        };
        const pack = c => ({ build: label(c), node: c.fiveName, value: n(c.recValue), flags: flags(c),
          alternateValue: n(c.calc.result.alternateValue), evolution: n(c.calc.result.evo),
          multiContribution: n(c.calc.result.multiCritContribution), converted: n(c.calc.result.convertedEvolutionDamage) });
        const theory = ranks.theoretical.slice(0, 5).map(pack);
        const theoryB = ranks.theoreticalAlternate.slice(0, 5).map(pack);
        const controlsTop = [...document.querySelectorAll('#recommendList .comboRow .rowMetric:first-child b')].map(el => Number(el.textContent));
        const buildDetails = c => {
          const selection = select(c);
          const noTier5 = audit.statsWithSelection(audit.selectionWithoutTiers(selection, [5]));
          const skills = c.calc.result.skillExperiment.items.filter(row => row.share > 0).map(row => {
            const onCrit = (c.calc.stats.critHitDamageSources || []).reduce((factor, source) => factor * (1 + source.value / 100), 1)
              * (1 + (row.effects.critHitDamage || 0) / 100);
            const critOff = audit.expectedHitDamage({ critRate: 100, critDamage: row.critDamage, critHitDamage: (onCrit - 1) * 100 }).critical.multiplier;
            const multi = !row.guaranteedCrit && c.calc.stats.critCap == null
              ? Math.max(0, row.rawCritRate / 100 - 1) * (row.critDamage / 100 - 1) : 0;
            return { name: row.name, share: row.share, rate: n(row.rawCritRate),
              effectiveRate: row.guaranteedCrit && c.calc.stats.critCap == null ? 100 : n(row.effectiveCritRate),
              critDamage: n(row.critDamage), value: n(row.value), multiIncrement: n(multi),
              multiContribution: n(row.share * row.value * (multi ? multi / (critOff + multi) : 0)),
              forced: row.guaranteedCrit, converted: n(row.convertedEvolutionDamage) };
          });
          return { ...pack(c), noTier5: n(noTier5.result.value), withTier5: n(c.recValue), skills };
        };
        const bestByNode = Object.fromEntries([...new Set(candidates.map(c => c.fiveName))].map(name =>
          [name, buildDetails(ranks.theoretical.find(c => c.fiveName === name))]));
        const directionalProbe = fixture.directional
          ? Object.fromEntries(['뭉툭한 가시', '인파이팅'].map(name =>
            [name, bestByNode[name].skills.map(row => [row.name, row.critDamage])])) : null;
        const tier2Trade = Object.fromEntries(['뭉툭한 가시', '입식 타격가', '음속 돌파', '마나 용광로'].map(name => {
          const c = ranks.theoretical.find(row => row.fiveName === name);
          const base = audit.selectionWithoutTiers(select(c), [2]);
          const pureDamage = audit.statsWithSelection({ ...base, '한계 돌파': { level: 3 } }).result.value;
          const addedCrit = audit.statsWithSelection({ ...base, '한계 돌파': { level: 2 }, '예리한 감각': { level: 1 } }).result.value;
          return [name, { tier4: c.fourNames, pureDamage: n(pureDamage), addedCrit: n(addedCrit), changePercent: n((addedCrit / pureDamage - 1) * 100) }];
        }));
        const points = candidates.map(c => Object.entries(select(c)).reduce((total, [name, entry]) =>
          total + audit.getNode(name).costPerLevel * entry.level, 0));
        const maintained = candidates.filter(c => ['입식 타격가', '인파이팅'].includes(c.fiveName)).map(c => {
          const common = audit.statsWithSelection(audit.selectionWithoutTiers(select(c), [5]));
          return [c.fiveName, n(c.calc.result.evo - common.result.evo)];
        });
        const mana = {};
        if (!fixture.special) {
          field('manaShortageClass').checked = true;
          put('manaRecommendationMode', 'auto');
          for (const support of supportKeys) {
            put('manaSupport', support);
            put('manaDuration', 45);
            put('manaMax', fixture.mana);
            put('manaStart', fixture.mana);
            put('manaRecovery', fixture.tick);
            put('manaFirstRecovery', 1);
            put('manaRecoveryInterval', 1);
            put('manaCostReductions', 'product');
            const costs = audit.state.skillEffects.items;
            const rotation = field('manaRotation');
            delete rotation.dataset.manaSource;
            rotation.value = fixtureSkills.map((s, i) => [s.name, s.first, s.cooldown, costs[i].manaCost].join(' | ')).join('\n');
            put('manaExtraRecovery', '');
            put('manaSupportUptime', 100);
            put('manaSupportTimes', support === 'artist' ? '3,33' : support === 'none' ? '' : '0,30');
            const profile = audit.support[support];
            put('manaSupportRestore', support === 'none' ? '' : support === 'artist'
              ? fixture.mana * profile.percent / 100 : fixture.tick * (1 + profile.percent / 100));
            audit.calculateAndRender();
            const capture = globalThis.tier5Capture;
            const evaluated = capture.ranks.evaluated;
            const describe = c => ({ ...pack(c), manaValue: n(c.mana?.value), manaValueB: n(c.mana?.alternateValue),
              quality: c.mana?.quality, assumptions: c.mana?.assumptions, firstShortage: n(c.mana?.firstShortage),
              delayedSkills: c.mana?.delayedSkills || [] });
            const oldFirst = [...evaluated].sort((a, b) => Number(a.mana.firstShortage != null) - Number(b.mana.firstShortage != null)
              || b.mana.value - a.mana.value || a.theoryRank - b.theoryRank)[0];
            const counts = c => {
              if (!c) return null;
              const scenario = capture.manaInput.scenario;
              const key = JSON.stringify([c.calc.stats.cooldownReduction || 0, c.calc.stats.manaSkillCooldownReduction || 0,
                (c.calc.stats.manaFurnace?.maxManaCostPercent ?? 0) / 100, c.calc.stats.manaCostReductions || []]);
              const castResult = scenario?.castResults.get(key);
              return castResult && [...castResult.byName].map(([name, skill]) =>
                ({ name: skill.name, casts: skill.casts, planned: castResult.reference.get(name) }));
            };
            const top = evaluated.slice(0, 5);
            const topB = capture.ranks.evaluatedAlternate.slice(0, 5);
            const fixed = capture.candidates.find(c => c.fiveName === '마나 용광로' && c.fourNames.join('|') === '달인|분쇄'
              && c.tier2Entries.length === 1 && c.tier2Entries[0].name === '한계 돌파');
            mana[support] = {
              evaluated: evaluated.length, modeLabel: field('manaRecommendationStatus').textContent,
              top: top.map(describe), topB: topB.map(describe),
              visibleAlternate: field('manaSensitivity').textContent,
              winnerCasts: counts(top[0]), oldFirst: oldFirst && describe(oldFirst),
              fixedFurnace: fixed && { ...describe(fixed), casts: counts(fixed), reason: fixed.mana?.reason },
              all: capture.candidates.map(c => [label(c), n(c.mana?.value), n(c.mana?.firstShortage), c.mana?.reason || null])
            };
          }
        }
        return { key: fixture.key, case: fixture, controlsTop, candidateCount: candidates.length, directionalProbe,
          pointTotals: [...new Set(points)], theory, theoryB, bestByNode, tier2Trade, maintained, mana, all: candidates.map(pack) };
      }, { fixture, data, fixtureSkills, supportKeys });
      assert.equal(result.theory.length, 5);
      assert.equal(Object.keys(result.bestByNode).length, 6);
      assert.deepEqual(result.pointTotals, [140]);
      assert.ok(result.maintained.every(([name, value]) => value === (name === '입식 타격가' ? 21 : 18)));
      assert.ok(result.all.filter(c => c.node === '뭉툭한 가시').every(c => c.multiContribution === 0 && c.value === c.alternateValue));
      assert.deepEqual(result.bestByNode['뭉툭한 가시'].skills.map(({ name, share }) => ({ name, share })),
        fixtureSkills.map(({ name, share }) => ({ name, share })));
      if (fixture.directional) for (const rows of Object.values(result.directionalProbe)) {
        assert.deepEqual(rows, [[fixtureSkills[0].name, 260], [fixtureSkills[1].name, 352], [fixtureSkills[2].name, 280]]);
      }
      assert.deepEqual(result.controlsTop, result.theory.map(r => +r.value.toFixed(4)));
      if (!fixture.special) for (const support of supportKeys) {
        const probe = result.mana[support];
        const rows = probe.top;
        assert.equal(rows.length, 5, `${fixture.key} / ${support}`);
        assert.ok(rows.every((row, i) => i === 0 || rows[i - 1].manaValue >= row.manaValue));
        assert.ok(probe.topB.every((row, i) => i === 0 || probe.topB[i - 1].manaValueB >= row.manaValueB));
        if (probe.topB.some((row, i) => row.build !== rows[i].build)) {
          assert.match(probe.modeLabel, /TOP5 변경/);
          assert.match(probe.visibleAlternate, /회심 B 가정 TOP5/);
        }
      }
      results.push(result);
    }
    const pointCheck = await page.evaluate(data => [120, 125, 140].map(points => {
      const audit = globalThis.tier5Audit;
      data.arkPassive.Points[0].Value = points;
      document.getElementById('manaShortageClass').checked = false;
      document.getElementById('manaRecommendationMode').value = 'theory';
      audit.applyCharacterData(data);
      const { candidates } = globalThis.tier5Capture;
      return [points, candidates.length, [...new Set(candidates.map(c => c.fiveLevel))]];
    }), makeCharacter(scenarios[0]));
    assert.deepEqual(pointCheck, [[120, 0, []], [125, 558, [1]], [140, 558, [2]]]);
    return { kind: '가정 기반 모의 캐릭터 및 서포터 회복', fixtureSkills, duration: 45, pointCheck, results };
  } finally {
    await browser.close();
  }
}

if (process.argv.includes('--damage-groups')) {
  const result = await runBrowserAudit();
  const path = process.argv[2] !== '--damage-groups' ? process.argv[2] : null;
  if (path) await writeFile(resolve(path), JSON.stringify(result) + '\n');
  const { candidates, ...summary } = result;
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

const grid = runGrid();
const combos = await runBrowserAudit();
const output = resolve(process.argv[2] || 'docs/tier5-maintained-audit-data.json');
await writeFile(output, JSON.stringify({ grid, combos }) + '\n');
console.log(JSON.stringify({
  output, gridRows: grid.rows.length, winners: grid.winners,
  results: combos.results.map(row => ({
    sample: row.key, candidates: row.candidateCount, theoryA: row.theory, theoryB: row.theoryB,
    manaTop1: Object.fromEntries(Object.entries(row.mana).map(([k, r]) => [k, r.top[0]])),
    manaOrderChanges: Object.entries(row.mana).filter(([, r]) => r.top[0]?.build !== r.oldFirst?.build).map(([k]) => k),
    manaCriticalScopeChanges: Object.entries(row.mana).filter(([, r]) =>
      r.top.some((candidate, i) => candidate.build !== r.topB[i]?.build)).map(([k]) => k)
  }))
}, null, 2));
