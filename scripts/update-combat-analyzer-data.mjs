import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const simulatorUrl = 'https://lopec.kr/character/simulator/%EB%AC%B4%EC%82%AC%EB%B8%8C';
const outputPath = path.resolve('public/combat-analyzer.json');

function absoluteUrl(value) {
  return new URL(value, simulatorUrl).href;
}

function extractBalancedExpression(source, start) {
  const opening = source[start];
  const closingByOpening = { '[': ']', '{': '}', '(': ')' };
  const closing = closingByOpening[opening];
  if (!closing) throw new Error(`지원하지 않는 리터럴 시작 문자: ${opening}`);
  const stack = [closing];
  let quote = '';
  let escaped = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (closingByOpening[char]) stack.push(closingByOpening[char]);
    else if (char === stack.at(-1)) {
      stack.pop();
      if (!stack.length) return source.slice(start, index + 1);
    }
  }
  throw new Error('전투분석 리터럴의 닫는 괄호를 찾지 못했습니다.');
}

function exportVariable(moduleSource, exportName) {
  const match = moduleSource.match(new RegExp(`(?:^|[,\\{])${exportName}:\\(\\)=>\\s*([A-Za-z_$][\\w$]*)`));
  if (!match) throw new Error(`${exportName} export 변수를 찾지 못했습니다.`);
  return match[1];
}

function variableLiteral(moduleSource, variableName) {
  const escaped = variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:\\blet\\s+|[,;])${escaped}\\s*=`, 'g');
  let found = null;
  while ((found = match.exec(moduleSource))) {
    let start = found.index + found[0].length;
    while (/\\s/.test(moduleSource[start] || '')) start += 1;
    if (moduleSource[start] === '[' || moduleSource[start] === '{') {
      return extractBalancedExpression(moduleSource, start);
    }
  }
  throw new Error(`${variableName} 데이터 리터럴을 찾지 못했습니다.`);
}

function copyPlainData(value, seen = new Set()) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (typeof value !== 'object' || seen.has(value)) throw new Error('리터럴에 순수 데이터가 아닌 값이 포함되어 있습니다.');
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result = Array.isArray(value) ? [] : Object.create(null);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (key === 'length' && Array.isArray(value)) continue;
    if (!('value' in descriptor) || typeof descriptor.value === 'function') {
      throw new Error('리터럴에 실행 가능한 접근자 또는 함수가 포함되어 있습니다.');
    }
    result[key] = copyPlainData(descriptor.value, seen);
  }
  seen.delete(value);
  return result;
}

function evaluateDataLiteral(literal) {
  if (/\b(?:function|class|import|export|require|process|globalThis|constructor|prototype|__proto__|eval|Function)\b|=>/u.test(literal)) {
    throw new Error('리터럴에 허용하지 않는 실행 구문이 포함되어 있습니다.');
  }
  const sandbox = Object.create(null);
  const value = vm.runInNewContext(`(${literal})`, sandbox, {
    timeout: 1000,
    contextCodeGeneration: { strings: false, wasm: false }
  });
  return copyPlainData(value);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 LostArkCalculatorDataUpdater/5.10.0' }
  });
  if (!response.ok) throw new Error(`${url} 응답 ${response.status}`);
  return response.text();
}

async function main() {
  const html = await fetchText(simulatorUrl);
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+\.js[^"']*)["']/g)].map(match => absoluteUrl(match[1]));
  if (!scripts.length) throw new Error('Lopec 시뮬레이터 스크립트를 찾지 못했습니다.');

  let sourceUrl = '';
  let moduleSource = '';
  for (const url of scripts) {
    const source = await fetchText(url);
    const moduleIndex = source.indexOf('67781:');
    if (moduleIndex < 0 || !source.includes('WR:()=>', moduleIndex)) continue;
    sourceUrl = url;
    moduleSource = source.slice(moduleIndex);
    break;
  }
  if (!moduleSource) throw new Error('Lopec 전투분석 데이터 모듈을 찾지 못했습니다.');

  const presetVariable = exportVariable(moduleSource, 'WR');
  const fallbackVariable = exportVariable(moduleSource, 'xV');
  const identityVariable = exportVariable(moduleSource, 'j1');
  const presets = evaluateDataLiteral(variableLiteral(moduleSource, presetVariable));
  const fallbackBuilds = evaluateDataLiteral(variableLiteral(moduleSource, fallbackVariable));
  const identitySkillMap = evaluateDataLiteral(variableLiteral(moduleSource, identityVariable));

  if (!Array.isArray(presets) || presets.length < 300) throw new Error(`전투분석 프로필 검증 실패: ${presets?.length || 0}개`);
  if (Object.keys(fallbackBuilds || {}).length < 100) throw new Error('직업각인 기본 전투분석 데이터가 부족합니다.');
  if (Object.keys(identitySkillMap || {}).length < 20) throw new Error('아이덴티티 스킬 매핑 데이터가 부족합니다.');

  const output = {
    version: 1,
    updatedAt: new Date().toISOString(),
    sources: [
      { label: 'Lopec 캐릭터 시뮬레이터 전투분석 프로필', url: simulatorUrl },
      { label: 'Lost Ark Open API 캐릭터 아크그리드·보석·전투 스킬', url: 'https://developer-lostark.game.onstove.com/changelog' }
    ],
    sourceAsset: sourceUrl,
    gemTables: {
      legacyDamage: [3, 6, 9, 12, 15, 18, 21, 24, 30, 40],
      tier4Damage: [8, 12, 16, 20, 24, 28, 32, 36, 40, 44],
      legacyCooldown: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
      tier4Cooldown: [6, 8, 10, 12, 14, 16, 18, 20, 22, 24]
    },
    presets,
    fallbackBuilds,
    identitySkills: [...new Set(Object.values(identitySkillMap).filter(Boolean))]
  };
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`updated ${presets.length} combat profiles, ${Object.keys(fallbackBuilds).length} fallback builds and ${output.identitySkills.length} identity skills`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
