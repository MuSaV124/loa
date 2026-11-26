import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readMaximumMana, skillManaCostProfile } from '../public/mana-character.js';
import { manaFurnaceDamage } from '../public/mana-recommendation.js';
import { parseSkillManaUsage } from '../public/skill-effects.js';

const [archivePath, schemaPath, outputDir] = process.argv.slice(2);
if (!archivePath || !schemaPath || !outputDir) {
  throw new Error('node scripts/audit-mana-verification.mjs <armory archive> <official Swagger schema> <output directory>');
}
const read = async file => JSON.parse(await readFile(file, 'utf8'));
const [archive, schema] = await Promise.all([read(archivePath), read(schemaPath)]);
const evolution = await read(new URL('../public/data/evolution.json', import.meta.url));
const furnace = evolution.nodes.find(node => node.name === '마나 용광로').levels[2].manaFurnace;
const plain = value => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
const csv = values => values.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',');
function json(value) {
  try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; }
}
function collect(value) {
  if (typeof value === 'string') return [plain(value)];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(collect);
}
const manaWords = /(?:마나\s*(?:의|를|을|(?:자연\s*)?회복|소모|소비|증가)|최대\s*마나|전투\s*자원\s*(?:자연\s*)?회복)/;
const supportNames = new Set(['바드', '도화가', '홀리나이트', '발키리']);
const specialNames = new Set(['기공사', '인파이터', '브레이커']);
const awakeningName = new Map([[100, '각성기 비용 행 생략'], [101, '초각성기 비용 행 생략']]);
const skillRows = [];
const unresolved = [];
const effects = new Map();
const builds = new Map();
const profileStats = new Set();
const reasons = new Map();
const samples = archive.samples.filter(row => row.raw?.ArmoryProfile && row.skills?.length && row.classExpected === row.className);
const recordEffect = (scope, kind, name, level, selected, cooldown, value) => {
  for (const text of new Set(collect(json(value) || value))) {
    const runeTrigger = kind === '룬' && / · (?:단죄|심판)$/.test(name) && /스킬 적중 시/.test(text);
    if ((!manaWords.test(text) && !runeTrigger) || (kind === '스킬' && /^마나\s+[\d,]+\s+소모(?:\||,|$)/.test(text))) continue;
    const key = [scope, kind, name, level, selected, cooldown, text].join('\0');
    const row = effects.get(key) || { fields: [scope, kind, name, level, selected, cooldown, text], count: 0 };
    row.count++;
    effects.set(key, row);
  }
};

for (const [index, sample] of samples.entries()) {
  const id = `A${String(index + 1).padStart(2, '0')}`;
  const raw = sample.raw;
  const p = raw.ArmoryProfile;
  const max = readMaximumMana(p);
  p.Stats?.forEach(stat => profileStats.add(stat.Type));
  const row = builds.get(`${sample.className} / ${sample.build}`) || { className: sample.className, count: 0, levels: new Set(),
    max: [], costs: 0, alternate: 0, unknown: 0, rechecked: 0 };
  row.count++;
  row.levels.add(p.CharacterLevel);
  if (max.value != null) row.max.push(max.value);
  builds.set(`${sample.className} / ${sample.build}`, row);
  for (const [order, skill] of sample.skills.entries()) {
    const firstParser = parseSkillManaUsage(skill.Tooltip);
    const current = skillManaCostProfile(skill);
    const tooltip = json(skill.Tooltip);
    const header = tooltip?.Element_004;
    const cooldown = plain(tooltip?.Element_001?.value?.leftText);
    const tooltipId = `${id}-${String(order + 1).padStart(2, '0')}`;
    const basic = [tooltipId, sample.className, sample.build, skill.Name, skill.Level, skill.SkillType, cooldown];
    if (current.baseCost == null) row.unknown++;
    else if (current.baseCost > 0) row.costs++;
    else row.alternate++;
    if (!firstParser.manaUsageKnown) {
      row.rechecked++;
      const rawText = plain(header?.value);
      const laterCostRow = Object.entries(tooltip || {}).slice(5).some(([, box]) => typeof box?.value === 'string' && /^마나\s+[\d,]+\s*소모/.test(plain(box.value)));
      assert.equal(laterCostRow, false, tooltipId);
      let reason;
      if (current.alternativeResource) {
        assert.equal(header?.type, 'MultiTextBox');
        assert.match(rawText, /^정령의 구슬 1 소모\|?$/);
        reason = '명시 대체 자원 · 정령의 구슬';
      } else if (awakeningName.has(skill.SkillType)) reason = awakeningName.get(skill.SkillType);
      else if (sample.className === '리퍼') reason = '리퍼 비용 행 생략 · 페르소나/혼돈과 구분';
      else if ((sample.className === '블래스터' && /^포격\s*:/.test(skill.Name)) || /악마화\s*상태|하이퍼\s*싱크\s*상태/.test(rawText)) {
        reason = '상태·아이덴티티 조건 표기 · MP 비용 행 생략';
      } else if (/(?:내공|배터리|엠버레스의 기운).{0,15}(?:회복|충전)/.test(rawText)) {
        reason = '대체 자원 회복·충전 문구 · MP 비용 행 생략';
      } else reason = header ? '스킬 설명으로 바로 이어짐 · MP 비용 행 생략' : '현재 레벨 툴팁 구조 누락';
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
      unresolved.push(csv([...basic, header?.type, reason, laterCostRow ? '있음' : '없음', current.baseCost ?? 'UNKNOWN',
        current.alternativeResource ? '공식 툴팁' : 'UNKNOWN', '게임 내 미측정']));
    }
    const freeWithModifier = current.baseCost > 0 && current.preEvolutionCost === 0;
    const known = current.baseCost != null;
    const damage = manaFurnaceDamage(furnace, { manaUsageKnown: known, usesMana: current.baseCost > 0,
      manaCost: current.baseCost, freeManaSkill: freeWithModifier });
    if (damage.known && current.baseCost > 0) {
      assert.equal(damage.damage, current.baseCost >= 480 ? 24 : current.baseCost / 20);
    }
    const eligibility = !known || freeWithModifier || current.preEvolutionCost == null ? 'UNKNOWN' : current.baseCost === 0 ? '비마나' : '마나 스킬 · 툴팁 조건';
    skillRows.push(csv([...basic, current.baseCost ?? 'UNKNOWN', current.preEvolutionCost ?? 'UNKNOWN',
      current.source === 'official-api' ? '공식 툴팁' : 'UNKNOWN', eligibility, damage.known ? damage.damage : 'UNKNOWN',
      eligibility === '비마나' ? '해당 없음' : eligibility === 'UNKNOWN' ? 'UNKNOWN' : '최대 MP × 2%', 'UNKNOWN']));
    const liveDescription = [];
    for (const box of Object.values(tooltip || {})) {
      if (box?.type === 'BlinkLineStart') break;
      if (['MultiTextBox', 'SingleTextBox'].includes(box?.type)) liveDescription.push(box.value);
    }
    recordEffect(sample.className, '스킬', skill.Name, skill.Level, '현재 레벨', cooldown, liveDescription);
    for (const tripod of skill.Tripods || []) recordEffect(sample.className, '트라이포드', `${skill.Name} · ${tripod.Name}`, tripod.Level,
      tripod.IsSelected ? '장착' : '비장착', cooldown, tripod.Tooltip);
    if (skill.Rune) recordEffect(sample.className, '룬', `${skill.Name} · ${skill.Rune.Name}`, skill.Rune.Grade, '장착', cooldown, skill.Rune.Tooltip);
  }
  for (const [kind, group] of [['각인', raw.ArmoryEngraving?.ArkPassiveEffects], ['장비·팔찌', raw.ArmoryEquipment],
    ['아크 패시브', raw.ArkPassive?.Effects], ['아크 그리드', sample.arkGrid?.Slots], ['아크 그리드 효과', sample.arkGrid?.Effects]]) {
    for (const effect of group || []) recordEffect(sample.className, kind, plain(effect.Name || effect.Description), effect.Level || effect.Grade, '장착', '',
      effect.Tooltip || effect.ToolTip || effect.Description);
  }
}

assert.equal(samples.length, 99);
assert.equal(builds.size, 60);
assert.equal(unresolved.length, 583);
assert.equal(reasons.get('명시 대체 자원 · 정령의 구슬'), 4);
const schemaDefinitions = schema.definitions;
const sort = map => [...map].sort(([a], [b]) => a.localeCompare(b, 'ko'));
const md = ['# 60빌드 최대 마나·자연 회복·스킬 증거', '',
  `한국 Armory 보관 시각 ${archive.retrievedAt}, 캐릭터 ${samples.length}개, 스킬 행 ${skillRows.length}개. 공식 Swagger ${schema.info.version}.`, '',
  `- 프로필 스키마 ${Object.keys(schemaDefinitions.ArmoryProfile.properties).join(', ')}`,
  `- 능력치 스키마 ${Object.keys(schemaDefinitions.Stat.properties).join(', ')}. 실제 능력치 유형 ${[...profileStats].join(', ')}.`,
  `- 상세 엔드포인트 ${Object.keys(schema.paths).find(path => path.endsWith('/profiles'))}와 통합 응답을 같은 스키마와 대조했다.`, '',
  '표의 자연 회복, 틱과 고갈 시간은 포털 캡처에 없다. 표에서 특수 자원만 확인되는 기공사·브레이커·인파이터의 MP 분석은 N/A다.', '',
  '| 직업 / 빌드 | 표본 | 전투 레벨 | 최대 MP·자연 회복량·틱 | MP / 대체·무료 / UNKNOWN | 재분류한 기존 UNKNOWN |',
  '|---|---:|---|---|---:|---:|',
  ...sort(builds).map(([name, row]) => `| ${name} | ${row.count} | ${[...row.levels].join(', ')} | ${specialNames.has(row.className) ? 'N/A' : `${row.max.join(', ') || 'UNKNOWN'} / UNKNOWN / UNKNOWN`} | ${row.costs} / ${row.alternate} / ${row.unknown} | ${row.rechecked} |`), '',
  '## 기존 583개 행 재분류', '', '| 사유 | 행 |', '|---|---:|', ...sort(reasons).map(([reason, count]) => `| ${reason} | ${count} |`), ''
];
const orderedEffects = [...effects.values()].sort((a, b) => Number(supportNames.has(b.fields[0])) - Number(supportNames.has(a.fields[0]))
  || a.fields.slice(0, 3).join(' ').localeCompare(b.fields.slice(0, 3).join(' '), 'ko'));
await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(join(outputDir, 'builds.md'), md.join('\n')),
  writeFile(join(outputDir, 'unresolved-583.csv'), ['표본행,직업,빌드,스킬,스킬레벨,SkillType,기본쿨,현재비용위치유형,사유,후속정형마나비용행,판정MP,근거,실측', ...unresolved].join('\n') + '\n'),
  writeFile(join(outputDir, 'skill-furnace.csv'), ['표본행,직업,빌드,스킬,스킬레벨,SkillType,기본쿨,기본MP,진화전MP,근거,용광로적용,레벨2진피%p,추가비용모델,최종MP실측', ...skillRows].join('\n') + '\n'),
  writeFile(join(outputDir, 'recovery-effects.csv'), ['직업,출처,효과·기술명,레벨·등급,장착,기본쿨,공식툴팁근거,표본수',
    ...orderedEffects.map(row => csv([...row.fields, row.count]))].join('\n') + '\n')
]);
console.log(`${samples.length} samples, ${builds.size} builds, ${unresolved.length} reclassified, ${skillRows.length} furnace rows, ${effects.size} effect lines; ${[...reasons].map(([key, value]) => `${key}=${value}`).join(', ')}`);
