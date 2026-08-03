/**
 * 전체 테스트 러너
 *
 * `npm test`로 브라우저가 필요 없는 테스트를 모두 실행합니다.
 * Playwright와 Chrome이 필요한 UI 테스트는 `npm run test:ui`로 따로 실행합니다.
 *
 * 실패한 스위트가 있어도 나머지를 계속 실행한 뒤 마지막에 함께 보고합니다.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SUITES = [
  'test-evolution-math.mjs',
  'test-advanced-honing-math.mjs',
  'test-armguard-honing.mjs',
  'test-armguard-power.mjs',
  'test-gem-math.mjs',
  'test-combat-analyzer.mjs',
  'test-dealer-simulator-audit.mjs',
  'test-support-power.mjs',
  'test-combat-power-calibration.mjs',
  'test-engraving-math.mjs',
  'test-class-benchmark.mjs',
  'test-cache-policy.mjs',
  'test-market-cache.mjs',
  'test-spec-planner.mjs',
  'test-skill-effects.mjs',
  'test-passive-skill-effects.mjs',
  'test-skill-cycle.mjs',
  'test-card-effects.mjs',
  'test-avatar-effects.mjs'
];

const failed = [];

for (const suite of SUITES) {
  console.log(`\n> ${suite}`);
  const scriptPath = fileURLToPath(new URL(suite, import.meta.url));
  const { status } = spawnSync(process.execPath, [scriptPath], { stdio: 'inherit' });
  if (status !== 0) failed.push(suite);
}

console.log(`\n${SUITES.length - failed.length}/${SUITES.length} suites passed`);

if (failed.length > 0) {
  console.error(`failed: ${failed.join(', ')}`);
  process.exit(1);
}
