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
