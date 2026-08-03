import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractCombatSkillEffects } from '../public/skill-effects.js';
import { combatAnalyzerSkillShares, findCombatAnalyzerProfile } from '../public/combat-analyzer.js';
import { buildSkillCycleModel, evaluateEvolutionCooldown } from '../public/skill-cycle.js';

const API_BASE = process.env.LOA_SKILL_AUDIT_API_BASE || 'https://loa-beige.vercel.app';
const APP_VERSION = process.env.LOA_SKILL_AUDIT_APP_VERSION || '5.15.9';
const SUPPORT_ENGRAVINGS = new Set(['축복의 오라', '절실한 구원', '만개']);

const references = JSON.parse(await readFile(new URL('./combat-power-class-samples.json', import.meta.url), 'utf8'));
const analyzer = JSON.parse(await readFile(new URL('../public/combat-analyzer.json', import.meta.url), 'utf8'));

async function fetchCharacter(row) {
  const url = `${API_BASE}/api/character?name=${encodeURIComponent(row.referenceCharacter)}&appVersion=${encodeURIComponent(APP_VERSION)}`;
  const response = await fetch(url, { headers: { 'user-agent': 'LostArkCalculatorSkillCycleAudit/5.15.9' } });
  if (!response.ok) throw new Error(`${row.className} ${row.referenceCharacter}: HTTP ${response.status}`);
  const data = await response.json();
  if (!data?.ok) throw new Error(`${row.className} ${row.referenceCharacter}: ${data?.message || data?.error || '조회 실패'}`);
  return data;
}

function buildAuditRow(reference, data) {
  const snapshot = data.powerSnapshot;
  const skillEffects = extractCombatSkillEffects(data.skills || []);
  const support = SUPPORT_ENGRAVINGS.has(snapshot?.profile?.secondClass);
  const profile = findCombatAnalyzerProfile(analyzer, snapshot, skillEffects, { support });
  const shares = support
    ? Object.fromEntries(skillEffects.cycleItems.map(item => [item.name, 1]))
    : combatAnalyzerSkillShares(profile.value);
  const cycle = buildSkillCycleModel({
    skillEffects,
    snapshot,
    shares,
    identitySkills: analyzer.identitySkills || [],
    analyzerTag: profile.tag,
    analyzerMatch: profile.match
  });
  const node = evaluateEvolutionCooldown(cycle, 4);
  const deterministicLinks = cycle.gridCycleLinks.filter(link => !link.stochastic);
  return {
    className: snapshot.profile.className,
    secondClass: snapshot.profile.secondClass,
    referenceCharacter: reference.referenceCharacter,
    support,
    usedSkills: cycle.usedSkillCount,
    mappedSkills: cycle.mappedSkillCount,
    mappedSharePercent: cycle.mappedSharePercent,
    modeledSharePercent: cycle.modeledSharePercent,
    identityDriverSharePercent: cycle.identityDriverSharePercent,
    unmodeledShareNames: cycle.unmodeledShareNames,
    unmodeledSharePercent: cycle.unmodeledSharePercent,
    parsedLinks: cycle.gridCycleLinks.length,
    deterministicLinks: deterministicLinks.length,
    appliedLinks: Number(cycle.appliedCycleLinkCount || 0),
    unresolvedLinks: (cycle.unresolvedCycleLinks || []).map(link => `${link.sourceNames.join('/') || link.sourceSelector || '?'} → ${link.target}`),
    unknownChanceLinks: cycle.gridCycleLinks.filter(link => link.stochastic).length,
    gemCooldownMultiplier: cycle.gemCooldownMultiplier,
    optimizationMultiplier: node.multiplier,
    invalidCooldowns: cycle.items.filter(item => !Number.isFinite(item.effectiveCooldownSeconds) || item.effectiveCooldownSeconds <= 0).map(item => item.name)
  };
}

const rows = [];
for (let index = 0; index < references.rows.length; index += 5) {
  const batch = references.rows.slice(index, index + 5);
  const payloads = await Promise.all(batch.map(fetchCharacter));
  rows.push(...payloads.map((data, offset) => buildAuditRow(batch[offset], data)));
}

console.table(rows.map(row => ({
  직업: row.className,
  각인: row.secondClass,
  스킬: row.usedSkills,
  지분: `${row.modeledSharePercent.toFixed(1)}%`,
  게이지: `${row.identityDriverSharePercent.toFixed(1)}%`,
  연쇄: `${row.appliedLinks}/${row.deterministicLinks}`,
  미공개확률: row.unknownChanceLinks,
  보석배율: row.gemCooldownMultiplier.toFixed(5),
  최훈4배율: row.optimizationMultiplier.toFixed(5)
})));
for (const row of rows.filter(item => item.unmodeledSharePercent > 0.01)) {
  console.log(`${row.className} 미연결 ${row.unmodeledSharePercent.toFixed(1)}%: ${row.unmodeledShareNames.join(', ')}`);
}
for (const row of rows.filter(item => item.unresolvedLinks.length)) {
  console.log(`${row.className} 미적용 연쇄: ${row.unresolvedLinks.join(' | ')}`);
}
assert.equal(rows.length, 30, '전 직업 표본은 30개여야 한다.');
assert.equal(new Set(rows.map(row => row.className)).size, 30, '중복 없이 30개 직업을 조회해야 한다.');
for (const row of rows) {
  assert.ok(row.usedSkills > 0, `${row.className}: 현재 스킬트리 주기를 만들지 못했다.`);
  assert.deepEqual(row.invalidCooldowns, [], `${row.className}: 유효하지 않은 쿨타임이 있다.`);
  if (!row.support) assert.ok(row.modeledSharePercent > 0, `${row.className}: 전투분석 딜 지분과 현재 스킬을 연결하지 못했다.`);
  assert.ok(Math.abs(row.modeledSharePercent + row.unmodeledSharePercent - 100) < 0.11, `${row.className}: 전투분석 지분 분류 합계가 100%가 아니다.`);
  assert.ok(Number.isFinite(row.gemCooldownMultiplier) && row.gemCooldownMultiplier >= 1, `${row.className}: 보석 효율이 유효하지 않다.`);
  assert.ok(Number.isFinite(row.optimizationMultiplier) && row.optimizationMultiplier >= 1, `${row.className}: 최적화 훈련 효율이 유효하지 않다.`);
}
console.log(`live skill-cycle audit passed: ${rows.length} classes, ${rows.reduce((sum, row) => sum + row.usedSkills, 0)} equipped skills`);
