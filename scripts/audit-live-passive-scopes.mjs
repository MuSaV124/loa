import { extractArkPassiveSkillEffects } from '../public/passive-skill-effects.js';
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

for (const name of names) {
  try {
    const response = await fetch(`${baseUrl}/api/character?name=${encodeURIComponent(name)}`, {
      headers: { 'user-agent': 'LostArkCalculatorPassiveScopeAudit/5.15.0' }
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
    const parsed = extractArkPassiveSkillEffects(effects, {
      skillItems: data?.skillEffects?.items || [],
      identitySkills: analyzer?.identitySkills || []
    });
    parsedRuleCount += parsed.rules.length;
    unresolvedCount += parsed.unresolved.length;
    console.log(`${data?.profile?.CharacterClassName || '-'}\t${name}\t규칙 ${parsed.rules.length}\t전역 ${parsed.items.length - parsed.rules.length}\t미분류 ${parsed.unresolved.length}`);
    if (name === verboseName) {
      for (const row of parsed.items) console.log(`  ${row.scope}: ${row.targets.join(', ') || row.selector || '전체'} - ${row.nodeName} - ${JSON.stringify(row.effects)}`);
    }
    for (const row of parsed.unresolved) console.log(`  미분류: [${row.category}] ${row.nodeName} - ${row.text}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
  }
}

console.log(`\nparsed rules: ${parsedRuleCount}, unresolved: ${unresolvedCount}, failures: ${failures.length}`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
