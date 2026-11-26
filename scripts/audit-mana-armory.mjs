import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCharacterManaProfile, skillManaCostProfile } from '../public/mana-character.js';
import { extractCombatSkillEffects } from '../public/skill-effects.js';
import { evaluateManaRotation, prepareManaScenario } from '../public/mana-recommendation.js';

const [archivePath, baselinePublic, outputDir] = process.argv.slice(2);
if (!archivePath || !baselinePublic || !outputDir) {
  throw new Error('node scripts/audit-mana-armory.mjs <armory archive JSON> <baseline public directory> <output directory>');
}
const archive = JSON.parse(await readFile(archivePath, 'utf8'));
const baseline = await import(pathToFileURL(resolve(baselinePublic, 'mana-character.js')));
const clean = value => String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
const number = value => Number(value.replaceAll(',', ''));
const csv = values => values.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',');
const parse = value => {
  try { return JSON.parse(value); } catch { return null; }
};

// Inspect only the first structured current-level header field, independently of the application parser.
function currentHeader(raw) {
  const value = parse(raw.Tooltip)?.Element_004?.value;
  return typeof value === 'string' ? clean(value.split('|')[0]) : '';
}

function checkHeader(header) {
  const entries = header.split(/,\s+(?!\d)/).flatMap(clause => {
    const m = clause.match(/^(마나|기력|충격|내공|배터리|버블|엠버레스의 기운|환수의 기운|영혼석|소켓)(?:\s+에너지)?\s+([\d,]+|모두)\s+(소모|생성|획득|잠금)$/);
    return m ? [{ resource: m[1], cost: m[3] === '소모' && m[2] !== '모두' ? number(m[2]) : null }] : [];
  });
  const mp = entries.find(entry => entry.resource === '마나');
  return { cost: mp?.cost ?? (entries.length && !mp ? 0 : null), resources: entries.map(entry => entry.resource) };
}

function tooltipDescriptions(tooltip) {
  const root = typeof tooltip === 'string' ? parse(tooltip) : tooltip;
  if (!root || typeof root !== 'object') return [clean(tooltip)];
  return Object.values(root).flatMap(value => typeof value === 'object' ? tooltipDescriptions(value) : typeof value === 'string' ? [clean(value)] : []);
}

function recordEffect(sample, skill, data, kind, modifier) {
  const descriptions = tooltipDescriptions(data.Tooltip ?? data.ToolTip ?? data.Description);
  const relevant = descriptions.filter(value => /마나|전투\s*자원\s*(?:자연\s*)?회복/.test(value));
  if (!relevant.length && !/마나|단죄|심판|속행/.test(data.Name || '')) return;
  const details = relevant.length ? relevant : descriptions;
  const name = clean(data.Name || data.Description);
  const signature = [sample.className, skill, name, data.Level ?? '', data.Grade ?? '', kind, ...details].join('\u0000');
  const effect = effectRows.get(signature) ?? { count: 0, className: sample.className, skill, name, level: data.Level, grade: data.Grade, kind,
    terms: [...new Set(details.flatMap(description => [...description.matchAll(/(?:마나|전투\s*자원|재사용 대기시간)[^.?!]{0,35}?([\d.]+)\s*(%|초)/g)].map(m => m[0])))].join(' / '),
    modifier };
  effect.count++;
  effectRows.set(signature, effect);
}

function checkSingleCost(raw) {
  const interval = 10;
  const cost = raw.cost;
  const skill = { name: raw.name, first: 0, interval, cost, fixedInterval: true };
  const knownSkill = { name: raw.name, currentTree: true, manaUsageKnown: true, usesMana: raw.usesMana };
  const { scenario, reason } = prepareManaScenario({ strict: true, analysisOnly: true, duration: 30, maxMana: Math.max(cost * 2, 1),
    startMana: cost * 2, recoveryMana: 0, skills: [skill] }, [], [knownSkill]);
  assert.ok(scenario, reason);
  const result = evaluateManaRotation(scenario);
  // Two full costs consume exactly the starting reserve. The third planned cast fails unless cost is zero.
  assert.equal(result.endMana, 0);
  assert.equal(result.firstShortage, cost > 0 ? 20 : null);
  assert.equal(result.skillCasts[0].casts, cost > 0 ? 2 : 3);
  assert.equal(result.consumedMana, cost * 2);
}

function checkEquippedCosts(actors) {
  const duration = 60;
  const casts = actors.map(actor => Math.ceil((duration - 1e-8) / actor.interval));
  const capacity = actors.reduce((total, actor, i) => total + actor.cost * casts[i], 0);
  const { scenario, reason } = prepareManaScenario({ strict: true, analysisOnly: true, duration,
    maxMana: Math.max(1, capacity), startMana: capacity, recoveryMana: 0, skills: actors }, [], actors);
  assert.ok(scenario, reason);
  const result = evaluateManaRotation(scenario);
  assert.equal(result.firstShortage, null);
  assert.deepEqual(result.skillCasts.map(actor => actor.casts), casts);
  assert.ok(Math.abs(result.endMana) < 1e-8);
  assert.ok(Math.abs(result.consumedMana - capacity) < 1e-8);
}

const excluded = archive.samples.filter(row => !row.raw?.ArmoryProfile || !row.skills?.length || row.classExpected !== row.className);
const samples = archive.samples.filter(row => !excluded.includes(row));
const classes = new Map();
const builds = new Map();
const effectRows = new Map();
const skillRows = [];
const totalsByType = new Map();
let isolatedChecks = 0;
let checkedHeaders = 0;
let noHeader = 0;
let maxCount = 0;
let changed = 0;
let checkedEquipped = 0;
let scope = 0;
for (const sample of samples) {
  const id = `A${String(++scope).padStart(2, '0')}`;
  const rawProfile = sample.raw.ArmoryProfile;
  const skillItems = extractCombatSkillEffects(sample.skills).items;
  const profile = buildCharacterManaProfile(rawProfile, { profile: { secondClass: sample.build } }, sample.skills, skillItems);
  if (profile.maxMana != null) maxCount++;
  const classInfo = classes.get(sample.className) ?? { resource: profile.resource, skills: new Set(), mana: false, samples: 0 };
  classInfo.samples++;
  classInfo.mana ||= profile.observedMana;
  classes.set(sample.className, classInfo);
  const buildKey = `${sample.className}/${sample.build}`;
  const build = builds.get(buildKey) ?? { samples: 0, states: [0, 0, 0], selected: 0, before: 0, after: 0, demand: [], mp: false, resource: profile.kind };
  build.samples++;
  const rawEffects = [
    ['각인', sample.raw.ArmoryEngraving?.ArkPassiveEffects], ['아크 패시브', sample.raw.ArkPassive?.Effects],
    ['아크 그리드', sample.arkGrid?.Slots], ['아크 그리드 효과', sample.arkGrid?.Effects],
    ['장비·팔찌', sample.raw.ArmoryEquipment]
  ];
  for (const [kind, effects] of rawEffects) for (const effect of effects ?? []) recordEffect(sample, '', effect, kind);
  let knownRate = 0;
  let rateSamples = 0;
  const equipped = [];
  for (const [index, raw] of sample.skills.entries()) {
    const item = skillItems[index];
    assert.equal(item.name, raw.Name);
    const header = currentHeader(raw);
    const check = checkHeader(header);
    const before = baseline.skillManaCostProfile(raw);
    const after = skillManaCostProfile(raw);
    if (check.cost != null) {
      checkedHeaders++;
      assert.equal(after.baseCost, check.cost, `${sample.className} ${raw.Name}: ${header}`);
      for (const resource of check.resources) if (resource !== '마나') classInfo.skills.add(resource);
    } else {
      noHeader++;
    }
    const known = after.baseCost != null;
    const exact = after.preEvolutionCost != null;
    if (before.preEvolutionCost !== after.preEvolutionCost) changed++;
    assert.ok(known || !exact);
    if (known && after.baseCost > 0 && after.modifiers.length === 1 && after.modifiers[0].percent != null) {
      const discount = after.modifiers[0].percent;
      assert.ok(Math.abs(after.preEvolutionCost - (after.baseCost + after.baseCost * discount / 100)) < 1e-9);
    }
    const type = totalsByType.get(raw.SkillType) ?? [0, 0, 0];
    const state = known ? Number(after.baseCost === 0) : 2;
    type[state]++;
    totalsByType.set(raw.SkillType, type);
    if (item.currentTree) {
      build.states[state]++;
      build.selected++;
      build.before += Number(before.preEvolutionCost != null);
      build.after += Number(exact);
      build.mp ||= after.baseCost > 0;
      if (exact && item.baseCooldownSeconds > 0 && after.preEvolutionCost > 0) {
        knownRate += after.preEvolutionCost / item.baseCooldownSeconds;
        rateSamples++;
      }
      if (exact && item.baseCooldownSeconds > 0 && raw.SkillType < 100) {
        equipped.push({ name: raw.Name, first: 0, interval: item.baseCooldownSeconds, cost: after.preEvolutionCost,
          usesMana: after.baseCost > 0, manaUsageKnown: true, currentTree: true, fixedInterval: true });
      }
    }
    if (exact) {
      checkSingleCost({ name: raw.Name, cost: after.preEvolutionCost, usesMana: after.baseCost > 0 });
      isolatedChecks++;
    }
    const tripods = (raw.Tripods || []).filter(tripod => tripod.IsSelected === true);
    skillRows.push(csv([id, sample.className, sample.build, raw.Name, raw.Level, raw.SkillType, raw.Type,
      item.currentTree, item.baseCooldownSeconds, check.resources.join('·'), check.cost, after.baseCost, before.preEvolutionCost, after.preEvolutionCost,
      raw.Rune?.Name, raw.Rune?.Grade, tripods.map(t => `${t.Name}${t.Level ? ` Lv.${t.Level}` : ''}`).join(' / '),
      after.modifiers.map(row => `${row.source} ${row.percent ?? 'UNKNOWN'}`).join(' / '),
      check.cost == null ? 'UNKNOWN' : 'TOOLTIP_MATCH', 'UNKNOWN']));
    for (const data of [...tripods, raw.Rune].filter(Boolean)) recordEffect(sample, raw.Name, data, data === raw.Rune ? '룬' : '선택 트라이포드',
      after.modifiers.find(row => row.source === data.Name || row.source === `${data.Name} 룬`));
  }
  if (rateSamples) build.demand.push(knownRate);
  if (equipped.length) {
    checkEquippedCosts(equipped);
    checkedEquipped++;
    build.checks = (build.checks ?? 0) + 1;
  }
  builds.set(buildKey, build);
}

assert.equal(samples.length, 99);
assert.equal(classes.size, 30);
assert.equal(builds.size, 60);
const sorted = map => [...map.entries()].sort(([left], [right]) => left.localeCompare(right, 'ko'));
const range = values => values.length ? `${Math.min(...values).toFixed(2)}–${Math.max(...values).toFixed(2)}` : '—';
const lines = [
  '# 30직업·60빌드 마나 표본 재검산', '',
  `공식 Armory 캡처 ${archive.retrievedAt}. 대상 ${samples.length}개, 제외 ${excluded.length}개(장착 자료 누락 또는 조회 직업 불일치). 캐릭터 이름은 표본 번호로 대체했다.`, '',
  `스킬 행 ${skillRows.length}건. 현재 레벨 헤더만 사용하는 독립 파서에서 기본 비용·대체 자원을 ${checkedHeaders}건 일치 확인했고, 직접 판독 범위 밖 ${noHeader}건은 별도 기록했다. 시전 비용이 계산된 ${isolatedChecks}건은 격리된 3회 시전 모델로 재검산했다. 기준 커밋 대비 진화 적용 전 비용 변화 ${changed}건. 관련 장착 효과 ${effectRows.size}개 문구 조합 수집. API 최대 마나 확인 ${maxCount}/${samples.length}. 자연 회복량·틱·게임 내 시전 기록은 캡처에 없다.`, '',
  `비용과 기본 쿨이 확인된 장착 추정 스킬만으로 ${checkedEquipped}개 캐릭터의 60초 타임라인을 추가 검산했다. 회복 0, 시작 MP를 60초 계획의 총 비용으로 고정해 각 스킬의 시전 수와 종료 잔량을 확인했다.`, '',
  '| 공식 SkillType | 마나 비용 | 대체 자원·무료 | 자원 UNKNOWN |', '|---:|---:|---:|---:|',
  ...[...totalsByType].sort(([a], [b]) => a - b).map(([type, states]) => `| ${type} | ${states.join(' | ')} |`), '',
  '## 직업별 자원', '',
  '| 직업 | 표본 | 마나 사용 스킬 툴팁 | 대체 자원 헤더 | 직업 상태 분류 | 최대 MP·회복 및 실전 지속력 |', '|---|---:|---|---|---|---|',
  ...sorted(classes).map(([name, row]) => `| ${name} | ${row.samples} | ${row.mana ? '관측' : '미관측'} | ${[...row.skills].join('·') || '미확인'} | ${row.resource} | ${row.mana ? 'UNKNOWN' : '별도 자원 또는 UNKNOWN'} |`), '',
  '## 빌드별 마나 요구량', '',
  '장착 추정은 레벨·선택 트라이포드·장착 룬을 사용한다. 표의 MP/초는 조회된 장착 추정 스킬 중 비용과 기본 쿨을 읽은 행의 `비용 ÷ 기본 쿨`을 더한 범위다. 시전 잠금, 신속, 보석, 진화, 상태 전환, 회복을 포함하지 않는다. N/A는 마나 없는 별도 직업 자원 분류와 일치하는 빌드다. 다른 빌드의 지속 시간과 기대 피해는 UNKNOWN이다.', '',
  '| 직업 / 빌드 | 캐릭터 | 마나 / 비마나 / 미확인 | 진화 전 비용 산출 전 → 후 / 추정 장착 | 부분 MP/초 | 60초 모델 검산 | 실전 지속력 |', '|---|---:|---:|---:|---:|---:|---|',
  ...sorted(builds).map(([key, row]) => `| ${key.replace('/', ' / ')} | ${row.samples} | ${row.states.join(' / ')} | ${row.before} → ${row.after} / ${row.selected} | ${range(row.demand)} | ${row.checks ?? 0}/${row.samples} | ${!row.mp && row.resource === 'special' ? 'N/A' : 'UNKNOWN'} |`), ''
];
await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(join(outputDir, 'mana-armory-builds.md'), lines.join('\n')),
  writeFile(join(outputDir, 'mana-armory-skills.csv'), ['표본,직업,빌드,스킬,스킬레벨,SkillType,조작유형,장착추정,기본쿨초,독립자원,독립기본MP,엔진기본MP,이전진화전MP,현재진화전MP,룬,룬등급,선택트라이포드,소모효과,독립대조,게임실측', ...skillRows].join('\n') + '\n'),
  writeFile(join(outputDir, 'mana-armory-effects.csv'), ['직업,스킬,효과명,선택레벨,등급,종류,표본수,관련수치,비용변경퍼센트',
    ...[...effectRows.values()].map(row => csv([row.className, row.skill, row.name, row.level, row.grade, row.kind, row.count, row.terms,
      row.modifier ? row.modifier.percent ?? 'UNKNOWN' : 'N/A']))].join('\n') + '\n')
]);
console.log(`${samples.length} samples, ${classes.size} classes, ${builds.size} builds, ${skillRows.length} skills, ${checkedHeaders} independent header matches, ${isolatedChecks} independent simulations`);
