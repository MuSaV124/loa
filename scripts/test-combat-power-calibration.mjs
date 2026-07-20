import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  arkGridSignature,
  calibrationScopeMatches,
  classSpecSlotLevelKey,
  confidenceTier
} from '../public/combat-power-calibration.js';

const snapshot = {
  profile: { name: '무사브', className: '브레이커', secondClass: '수라의 길' },
  arkGrid: { slots: [{ side: '질서', symbol: '해', name: '그림자 주먹', grade: '전설 코어', point: 20 }] }
};

assert.equal(classSpecSlotLevelKey(snapshot, 'head', 24, 25), '브레이커||수라의 길||head:24:25');
assert.equal(arkGridSignature(snapshot), '그림자 주먹:전설:20');
assert.equal(calibrationScopeMatches({ scope: { className: '브레이커', secondClass: '수라의 길' } }, snapshot), true);
assert.equal(calibrationScopeMatches({ scope: { className: '브레이커', secondClass: '권왕파천무' } }, snapshot), false);
assert.equal(calibrationScopeMatches({ scope: { referenceCharacter: '무사브' } }, snapshot), true);
assert.equal(calibrationScopeMatches({ scope: { arkGridSignature: '그림자 주먹:전설:20' } }, snapshot), true);
assert.equal(calibrationScopeMatches({ scope: { arkGridSignature: '그림자 주먹:고대:20' } }, snapshot), false);
assert.equal(calibrationScopeMatches({ percent: 0.2 }, snapshot), false);
assert.ok(confidenceTier('verified') < confidenceTier('class-sampled'));
assert.ok(confidenceTier('class-sampled') < confidenceTier('estimated'));

const samples = JSON.parse(await readFile(new URL('./combat-power-class-samples.json', import.meta.url), 'utf8'));
const model = JSON.parse(await readFile(new URL('../public/combat-power-model.json', import.meta.url), 'utf8'));
const sampleKeys = samples.rows.map(row => `${row.className}||${row.secondClass}||${row.slot}:${row.from}:${row.to}`);
assert.equal(samples.rows.length, 30);
assert.equal(new Set(sampleKeys).size, samples.rows.length);
assert.equal(Object.keys(model.upgradeDelta.normalHoning.percentByClassSpecSlotLevel).length, samples.rows.length);
for (const row of samples.rows) {
  assert.ok(row.arkGridSignature);
  assert.equal(Number((row.upperPower - row.lowerPower).toFixed(2)), row.delta);
  assert.ok(Math.abs((row.delta / row.lowerPower) * 100 - row.percent) < 0.000001);
  const key = `${row.className}||${row.secondClass}||${row.slot}:${row.from}:${row.to}`;
  assert.equal(model.upgradeDelta.normalHoning.percentByClassSpecSlotLevel[key].arkGridSignature, row.arkGridSignature);
}

console.log('combat power calibration tests passed');
