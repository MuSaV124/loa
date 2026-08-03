import { extractArkGridSkillEffects, extractArkPassiveSkillEffects } from '../public/passive-skill-effects.js';
import { combatAnalyzerSkillShares, findCombatAnalyzerProfile } from '../public/combat-analyzer.js';
import { readFile } from 'node:fs/promises';

const names = [
  'BARBER', '키리냐누', '솬남자', '오묘한대검', '솬황', 'St김수환', '기사브', '박짱룡',
  '불주먹몽이', '유성실화', '벤츠CLS', '세덩이', 'ZI존대게', '블래스터를아십니까', '쌔끈머신',
  '미젤로오레올린', '방댕이토실토실', '천재마법사토리', '캬르카나', '루왁커피', '수슉수슉수슈슉',
  '쥬모', 'BURF', '샤뽐', 'KIRA', '랑우', '박룡녀', '쥬쥬', '너의작은도화지', '무사브'
];
const baseUrl = process.env.LOA_APP_URL || 'https://loa-beige.vercel.app';
const verboseName = process.env.LOA_AUDIT_VERBOSE || '';
const analyzer = JSON.parse(await readFile(new URL('../public/combat-analyzer.json', import.meta.url), 'utf8'));
const failures = [];
let parsedRuleCount = 0;
let unresolvedCount = 0;
let ambiguousTargetCount = 0;
let duplicateCritCount = 0;
let globalLeapCritCount = 0;
let arkGridRuleCount = 0;
let suspiciousArkGridGlobalCount = 0;

function normalized(value) {
  return String(value || '').replace(/\s+/g, '').replace(/[·:'"“”‘’]/g, '').trim().toLowerCase();
}

for (const name of names) {
  try {
    const response = await fetch(`${baseUrl}/api/character?name=${encodeURIComponent(name)}`, {
      headers: { 'user-agent': 'LostArkCalculatorPassiveScopeAudit/5.15.8' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const effects = (data?.arkPassive?.Effects || []).map((effect, index) => ({
      index,
      name: effect?.Name || '',
      level: Number(effect?.Level || 0),
      description: effect?.Description || '',
      tooltip: effect?.Tooltip || effect?.ToolTip || '',
      raw: effect
    }));
    const profile = findCombatAnalyzerProfile(analyzer, data?.powerSnapshot, data?.skillEffects, { support: false });
    const shareNames = Object.keys(combatAnalyzerSkillShares(profile?.value));
    const parsed = extractArkPassiveSkillEffects(effects, {
      skillItems: data?.skillEffects?.items || [],
      shareNames,
      identitySkills: analyzer?.identitySkills || []
    });
    const arkGridParsed = extractArkGridSkillEffects(data?.arkGridEffects?.items || [], {
      skillItems: data?.skillEffects?.items || [],
      shareNames,
      identitySkills: analyzer?.identitySkills || []
    });
    parsedRuleCount += parsed.rules.length;
    arkGridRuleCount += arkGridParsed.rules.length;
    unresolvedCount += parsed.unresolved.length + arkGridParsed.unresolved.length;
    console.log(`${data?.profile?.CharacterClassName || '-'}\t${name}\t패시브 규칙 ${parsed.rules.length}\t그리드 규칙 ${arkGridParsed.rules.length}\t미분류 ${parsed.unresolved.length + arkGridParsed.unresolved.length}`);
    for (const rule of parsed.rules.filter(row => row.scope === 'skill')) {
      const keys = rule.targets.map(normalized).filter(Boolean);
      const ambiguous = keys.some((key, index) => keys.some((other, otherIndex) => index !== otherIndex && key !== other && other.includes(key)));
      if (ambiguous) {
        ambiguousTargetCount += 1;
        console.log(`  대상 중첩: [${rule.category}] ${rule.nodeName} - ${rule.targets.join(', ')}`);
      }
    }
    for (const row of parsed.items.filter(row => row.category === '도약' && row.scope === 'global' && Number(row.effects?.critRate || 0) > 0)) {
      globalLeapCritCount += 1;
      console.log(`  도약 치적 전역 오분류: ${row.nodeName} - ${row.effects.critRate}%`);
    }
    for (const row of arkGridParsed.items.filter(row => row.scope === 'global' && /스킬|상태|태세|변신|효과[^.!?]{0,30}동안/i.test(row.text))) {
      suspiciousArkGridGlobalCount += 1;
      console.log(`  아크그리드 전역 의심: ${row.nodeName} - ${row.text}`);
    }
    for (const target of [...new Set(parsed.rules.filter(row => row.scope === 'skill').flatMap(row => row.targets || []))]) {
      const matching = parsed.rules.filter(row => row.scope === 'skill' && row.targets.some(name => normalized(name) === normalized(target)) && Number(row.effects?.critRate || 0) > 0);
      const semantic = new Set(matching.map(row => `${normalized(row.text)}|${Number(row.effects?.critRate || 0)}`));
      if (matching.length > semantic.size) {
        duplicateCritCount += 1;
        console.log(`  치적 중복: ${target} - ${matching.map(row => `${row.nodeName} ${row.effects.critRate}%`).join(', ')}`);
      }
    }
    if (name === verboseName) {
      for (const row of parsed.items) console.log(`  ${row.scope}: ${row.targets.join(', ') || row.selector || '전체'} - ${row.nodeName} - ${JSON.stringify(row.effects)}`);
      for (const row of arkGridParsed.items) console.log(`  grid ${row.scope}: ${row.targets.join(', ') || row.selector || '전체'} - ${row.nodeName} - ${JSON.stringify(row.effects)}`);
    }
    for (const row of parsed.unresolved) console.log(`  미분류: [${row.category}] ${row.nodeName} - ${row.text}`);
    for (const row of arkGridParsed.unresolved) console.log(`  그리드 미분류: ${row.nodeName} - ${row.text}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
  }
}

console.log(`\npassive rules: ${parsedRuleCount}, ark grid rules: ${arkGridRuleCount}, unresolved: ${unresolvedCount}, suspicious ark grid globals: ${suspiciousArkGridGlobalCount}, ambiguous targets: ${ambiguousTargetCount}, duplicate crit: ${duplicateCritCount}, global leap crit: ${globalLeapCritCount}, failures: ${failures.length}`);
if (failures.length || suspiciousArkGridGlobalCount || ambiguousTargetCount || duplicateCritCount || globalLeapCritCount) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
