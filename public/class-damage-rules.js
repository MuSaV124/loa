// Distinct OpenAPI SkillType values observed in the 30-class armory sample.
export const SKILL_TYPE = Object.freeze({ regular: 0, hyperSkill: 1, awakening: 100, hyperAwakening: 101 });

// Scope conditions from the 2026-11-19 hotfix, notice 13601.
export const GLAIVIER_EVOLUTION_CORE = Object.freeze({
  name: '진화의 끝',
  skill: '적룡포',
  tripod: '진화하는 창술'
});

export function classCoreClauseAvailable(nodeName, clause, skillItems) {
  const rule = GLAIVIER_EVOLUTION_CORE;
  if (nodeName !== rule.name || !clause.includes(rule.tripod)) return true;
  return skillItems.some(skill => skill.name === rule.skill
    && skill.selectedTripods?.some(tripod => tripod.name === rule.tripod));
}

// Notice 13598 specifies a strike or a strike-dependent value in these
// tripods. The armory has no within-skill damage share for those strikes.
const PARTIAL_HIT_CRIT_TRIPODS = new Set([
  '진 용출권/작렬하는 주먹',
  '철량추/지면 강타',
  '절룡세/급소 강타',
  '사형 집행/급소 타격',
  '네이팜탄/급소 포격',
  '어퍼 슬래쉬/강력한 회오리',
  '댄싱 오브 스파인플라워/치명적인 꽃'
]);

export function tripodCritCoversPartialHits(skillName, tripodName) {
  return PARTIAL_HIT_CRIT_TRIPODS.has(`${skillName}/${tripodName}`);
}

export function classScopedDamageTargets(nodeName, clause) {
  if (nodeName === '중력 수련' && /중력\s*가중\s*모드\s*기본\s*공격과\s*볼텍스\s*그래비티/.test(clause)) {
    return ['중력 가중 모드 기본 공격', '볼텍스 그래비티'];
  }
  return null;
}
