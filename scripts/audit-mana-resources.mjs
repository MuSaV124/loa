import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { extractCombatSkillEffects, parseSkillManaUsage } from '../public/skill-effects.js';
import { manaSkillScope, skillManaCostProfile } from '../public/mana-character.js';
import { manaFurnaceDamage } from '../public/mana-recommendation.js';

const [archivePath, previousCsv, beforeRoot, outputDir] = process.argv.slice(2);
if (!archivePath || !previousCsv || !beforeRoot || !outputDir) throw new Error('Pass archive, old CSV, baseline worktree and output directory.');
const [archive, csvText] = await Promise.all([readFile(archivePath, 'utf8').then(JSON.parse), readFile(previousCsv, 'utf8')]);
const { parseSkillManaUsage: oldTheory } = await import(pathToFileURL(resolve(beforeRoot, 'public/skill-effects.js')));
const { skillManaCostProfile: oldTime } = await import(pathToFileURL(resolve(beforeRoot, 'public/mana-character.js')));
const rows = csvText.trimEnd().split(/\r?\n/).slice(1).map(line => [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(match => match[1].replaceAll('""', '"')));
assert.ok(rows.every(row => row.length === 13));
const csv = row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',');
const unknown = rows.filter(row => row[10] === 'UNKNOWN');
const awakening = unknown.filter(row => Number(row[5]) >= 100);
const open = unknown.filter(row => Number(row[5]) < 100);
const key = row => JSON.stringify([row[1], row[3], row[5]]);
const unique = list => new Set(list.map(key)).size;
assert.deepEqual([rows.length, unknown.length, new Set(unknown.map(row => JSON.stringify([key(row), row[4]]))).size,
  unique(unknown), awakening.length, unique(awakening), open.length, unique(open)], [583, 579, 220, 189, 394, 120, 185, 69]);
const unknownById = new Map(unknown.map(row => [row[0], row]));
const sourceById = new Map(rows.map(row => [row[0], row]));

const samples = archive.samples.filter(row => row.raw?.ArmoryProfile && row.skills?.length && row.classExpected === row.className);
const classCounts = new Map();
const buildCounts = new Map();
const groups = new Map();
const flags = [];
const duplicateNames = [];
const iconOwners = new Map();
const extraUnknown = [];
let changedFlags = 0;
let baselineCandidates = 0;
let baselineCosts = 0;
const furnace = { damagePerTenMana: 0.5, maxEvolutionDamage: 24 };
const count = (map, group, isPlan, cost, scope) => {
  const totals = map.get(group) ?? { all: 0, eligible: 0, base: 0, pre: 0, unknownPlan: 0, conditional: 0 };
  totals.all++;
  if (scope.conditional) totals.conditional++;
  if (isPlan) {
    totals.eligible++;
    totals.base += Number(cost.baseCost != null);
    totals.pre += Number(cost.preEvolutionCost != null);
    totals.unknownPlan += Number(cost.preEvolutionCost == null);
  }
  map.set(group, totals);
};
for (const [i, sample] of samples.entries()) {
  const { className, build } = sample;
  const sampleId = `A${String(i + 1).padStart(2, '0')}`;
  const items = extractCombatSkillEffects(sample.skills).items;
  const names = new Set();
  assert.equal(items.length, sample.skills.length);
  for (const [index, raw] of sample.skills.entries()) {
    const id = `${sampleId}-${String(index + 1).padStart(2, '0')}`;
    const item = items[index];
    assert.equal(item.name, raw.Name);
    if (names.has(raw.Name)) duplicateNames.push(id);
    names.add(raw.Name);
    const signature = key([id, className, build, raw.Name, raw.Level, String(raw.SkillType)]);
    if (raw.Icon) {
      const owners = iconOwners.get(raw.Icon) ?? new Set();
      owners.add(signature);
      iconOwners.set(raw.Icon, owners);
    }
    const scope = manaSkillScope(item);
    const oldFlag = oldTheory(raw.Tooltip);
    const oldCost = oldTime(raw);
    if (item.currentTree) {
      baselineCandidates++;
      baselineCosts += Number(oldCost.preEvolutionCost != null);
    }
    const cost = skillManaCostProfile(raw);
    const parsed = parseSkillManaUsage(raw.Tooltip);
    assert.equal(parsed.manaUsageKnown, cost.baseCost != null, id);
    assert.equal(parsed.manaUsageKnown, item.manaUsageKnown, id);
    if (parsed.manaUsageKnown) assert.equal(parsed.usesMana, cost.baseCost > 0, id);
    const prevRow = sourceById.get(id);
    assert.equal(oldFlag.manaUsageKnown, !prevRow, id);
    if (prevRow) assert.deepEqual([className, build, raw.Name, raw.Level, raw.SkillType], [prevRow[1], prevRow[2], prevRow[3], +prevRow[4], +prevRow[5]], id);
    const affected = oldFlag.manaUsageKnown !== parsed.manaUsageKnown;
    if (affected) {
      assert.equal(raw.Name, '마리포사');
      assert.equal(oldCost.baseCost, 0);
      assert.equal(parsed.usesMana, false);
      changedFlags++;
    }
    const uncertainModifier = cost.baseCost > 0 && (cost.preEvolutionCost == null || cost.preEvolutionCost === 0);
    if (uncertainModifier) extraUnknown.push([id, className, build, raw.Name, cost.reason ?? '무료 효과와 용광로 적용 범위 모호']);
    const damage = manaFurnaceDamage(furnace, { ...parsed, freeManaSkill: cost.baseCost > 0 && cost.preEvolutionCost === 0 });
    if (damage.known && parsed.usesMana) assert.equal(damage.damage, Math.min(24, parsed.manaCost / 20));
    count(classCounts, className, scope.automatic, cost, scope);
    count(buildCounts, `${className} / ${build}`, scope.automatic, cost, scope);
    const flag = value => value.manaUsageKnown ? value.usesMana ? 'MP' : '비마나' : 'UNKNOWN';
    flags.push(csv([id, className, build, raw.Name, raw.Level, raw.SkillType, scope.phase, scope.equippedEvidence,
      scope.linked, scope.automatic, flag(oldFlag), oldCost.baseCost ?? 'UNKNOWN', flag(parsed), cost.baseCost ?? 'UNKNOWN',
      cost.preEvolutionCost ?? 'UNKNOWN', uncertainModifier || !parsed.manaUsageKnown ? 'UNKNOWN' : parsed.usesMana ? 'MP 적용' : '비마나 제외',
      damage.known ? damage.damage : 'UNKNOWN', '게임 미실측']));
    if (unknownById.has(id)) {
      assert.equal(cost.baseCost, null, id);
      const group = groups.get(signature) ?? { className, name: raw.Name, type: raw.SkillType, phases: new Set(), levels: new Set(),
        reasons: new Set(), icons: new Set(), count: 0, plan: 0 };
      group.phases.add(scope.phase);
      group.levels.add(raw.Level);
      group.reasons.add(unknownById.get(id)[9]);
      group.icons.add(raw.Icon || '');
      group.count++;
      group.plan += Number(scope.automatic);
      groups.set(signature, group);
    }
  }
}
assert.equal(samples.length, 99);
assert.equal(classCounts.size, 30);
assert.equal(buildCounts.size, 60);
assert.equal(flags.length, 2394);
assert.equal(changedFlags, 4);
assert.equal(extraUnknown.length, 2);
const byAttack = new Map([['일반·특수', []], ['각성기·초각성기', []]]);
const unknownGroupRows = [...groups.values()].sort((a, b) => (a.className + a.name).localeCompare(b.className + b.name, 'ko'));
for (const group of unknownGroupRows) byAttack.get(group.type >= 100 ? '각성기·초각성기' : '일반·특수').push(group);
const verifiedIconCount = unknownGroupRows.filter(group => group.icons.size === 1 && [...group.icons].every(icon => iconOwners.get(icon)?.size === 1)).length;
const groupLine = group => csv([group.className, group.name, group.type, [...group.phases].join(' / '), [...group.levels].join(' / '),
  group.count, group.plan, [...group.reasons].join(' / '), 'UNKNOWN', 'UNKNOWN']);
const headers = '직업,스킬,SkillType,분류,보관레벨,행,자동계획장착추정행,사유,MP비용,용광로적용';
const table = map => [...map].sort(([a], [b]) => a.localeCompare(b, 'ko')).map(([name, v]) => `| ${name} | ${v.all} | ${v.conditional} | ${v.eligible} | ${v.base} | ${v.pre} | ${v.unknownPlan} |`);
const total = [...classCounts.values()].reduce((acc, value) => Object.fromEntries(Object.keys(value).map(key => [key, acc[key] + value[key]])),
  { all: 0, eligible: 0, base: 0, pre: 0, unknownPlan: 0, conditional: 0 });
const header = ['| 대상 | 전체 | 상태·각성 등 | 자동 계획 장착 추정 | 기본 MP 판독 | 진화 전 비용 산출 | 진화 전 비용 미확정 |', '|---|---:|---:|---:|---:|---:|---:|'];
const text = ['# 99캐릭터 마나 플래그·장착 추정 대조', '',
  `아카이브 ${archive.retrievedAt}. 30직업, 60빌드, ${flags.length}행. 공식 스킬 상세의 ID·슬롯 장착 필드가 없어 직업·스킬명·유형을 사용했다. 레벨을 키에 넣을 때 220개, 제외할 때 189개였다. 스킬 아이콘으로 보조 대조 시 UNKNOWN 189개 중 ${verifiedIconCount}개 키가 보관 자료 안에서 고유한 아이콘으로 일치했다. 캐릭터 내부 동명 행 ${duplicateNames.length}개. 아이콘은 공식 ID 대용으로 사용하지 않았다.`, '',
  `표의 자동 계획은 레벨·룬·트라이포드로 장착을 추정한 뒤 상태·각성·아이덴티티 등을 별도 취급한다. 진화 전 비용 산출 ${total.pre}/${total.eligible} (${(100 * total.pre / total.eligible).toFixed(1)}%). 시전 기록에서 확인된 슬롯 점유나 실측 수치는 없다.`, '',
  `기준의 상태 미분리 계획은 ${baselineCosts}/${baselineCandidates} (${(100 * baselineCosts / baselineCandidates).toFixed(1)}%)였다. 이번 비율 변화에는 자동 계획 범위의 정정이 반영됐다.`, '',
  '| 기존 비용 UNKNOWN 외 용광로 조건 | 기술 | 사유 |', '|---|---|---|',
  ...extraUnknown.map(([id, cls, build, name, reason]) => `| ${id} ${cls} / ${build} | ${name} | ${reason} |`), '',
  '## 직업별', '', ...header, ...table(classCounts), '', '## 빌드별', '', ...header, ...table(buildCounts), ''
].join('\n');
await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(join(outputDir, 'equipped-coverage.md'), text),
  writeFile(join(outputDir, 'unknown-69.csv'), [headers, ...byAttack.get('일반·특수').map(groupLine)].join('\n') + '\n'),
  writeFile(join(outputDir, 'awakening-120.csv'), [headers, ...byAttack.get('각성기·초각성기').map(groupLine)].join('\n') + '\n'),
  writeFile(join(outputDir, 'mana-flags.csv'), ['표본행,직업,빌드,스킬,레벨,SkillType,분류,장착상태,추가입력여부,자동계획대상,이전이론플래그,이전시간기본비용,현재공통플래그,현재기본비용,진화전비용,용광로비용범위,용광로진피모델,게임실측', ...flags].join('\n') + '\n')
]);
console.log({ total, baselineCandidates, baselineCosts, changedFlags, verifiedIconCount, duplicates: duplicateNames.length, extraUnknown });
