/**
 * v1.2.0 Inven ArkPassive DB generator scaffold
 *
 * 목적:
 * - 인벤 아크패시브 DB 페이지에서 노드명을 티어별 JSON으로 변환하기 위한 스크립트 골격.
 * - 실제 인벤 HTML/CSS 구조는 변경될 수 있으므로, 첫 실행 후 selector를 보정해야 합니다.
 *
 * 사용:
 *   npm run generate:inven
 */
import fs from 'node:fs/promises';
import * as cheerio from 'cheerio';

const PAGES = [
  {
    type: 'evolution',
    group: '진화',
    url: 'https://lostark.inven.co.kr/datainfo/arkpassive/?code=313',
    output: 'public/data/evolution.generated.json'
  }
];

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 LOSTARK node calculator data generator',
      'Accept': 'text/html,application/xhtml+xml'
    }
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

function extractCandidateNodes(html) {
  const $ = cheerio.load(html);
  const candidates = [];

  $('[title], img[alt], a, button, .tooltip, .skill, .node').each((_, el) => {
    const node = $(el);
    const name = clean(node.attr('title') || node.attr('alt') || node.text());
    if (!name) return;
    if (name.length > 30) return;
    candidates.push(name);
  });

  return [...new Set(candidates)];
}

for (const page of PAGES) {
  try {
    const html = await fetchHtml(page.url);
    const candidates = extractCandidateNodes(html);

    const result = {
      meta: {
        generatedAt: new Date().toISOString(),
        source: page.url,
        group: page.group,
        note: '자동 후보 추출 결과입니다. 티어 배치는 수동 검수 후 사용하세요.'
      },
      candidates,
      tiers: {
        '1': [],
        '2': [],
        '3': [],
        '4': [],
        '5': []
      }
    };

    await fs.writeFile(page.output, JSON.stringify(result, null, 2), 'utf8');
    console.log(`Generated ${page.output}: ${candidates.length} candidates`);
  } catch (error) {
    console.error(`Failed ${page.url}:`, error.message);
  }
}