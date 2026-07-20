import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  arkGridSignature,
  calibrationScopeMatches,
  classSpecArkGridMatches,
  classSpecSlotLevelKey,
  confidenceTier,
  findClassHoningSample
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
assert.equal(classSpecArkGridMatches({ className: '브레이커', secondClass: '수라의 길', arkGridSignature: '그림자 주먹:전설:20' }, snapshot), true);
assert.equal(classSpecArkGridMatches({ className: '브레이커', secondClass: '권왕파천무', arkGridSignature: '그림자 주먹:전설:20' }, snapshot), false);
assert.equal(classSpecArkGridMatches({ className: '브레이커', secondClass: '수라의 길' }, snapshot), false);
assert.ok(confidenceTier('verified') < confidenceTier('class-sampled'));
assert.ok(confidenceTier('class-sampled') < confidenceTier('estimated'));

const samples = JSON.parse(await readFile(new URL('./combat-power-class-samples.json', import.meta.url), 'utf8'));
const referenceSamples = JSON.parse(await readFile(new URL('./combat-power-reference-honing-samples.json', import.meta.url), 'utf8'));
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

assert.equal(referenceSamples.referenceCharacters, 41);
assert.equal(referenceSamples.transitionSamples, 227);
assert.equal(referenceSamples.rejected.length, 1);
assert.equal(model.upgradeDelta.normalHoning.scopedSamples.length, referenceSamples.rows.length);
assert.equal(model.upgradeDelta.normalHoning.percentDefaults, undefined);
assert.equal(model.upgradeDelta.normalHoning.classFallbacks, undefined);

const requiredSlots = ['head', 'shoulder', 'top', 'bottom', 'gloves', 'weapon'];
const slotsByClass = new Map();
for (const row of referenceSamples.rows) {
  assert.ok(row.className);
  assert.ok(row.secondClass);
  assert.ok(row.referenceCharacter);
  assert.ok(row.arkGridSignature);
  assert.ok(requiredSlots.includes(row.slot));
  assert.equal(Number((row.upperPower - row.lowerPower).toFixed(2)), row.delta);
  assert.ok(Math.abs((row.delta / row.lowerPower) * 100 - row.percent) < 0.00001);
  if (!slotsByClass.has(row.className)) slotsByClass.set(row.className, new Set());
  slotsByClass.get(row.className).add(row.slot);
}
assert.equal(slotsByClass.size, 27);
for (const slots of slotsByClass.values()) {
  assert.deepEqual([...slots].sort(), [...requiredSlots].sort());
}

const valkyrieRows = referenceSamples.rows.filter(row => row.referenceCharacter === '키리냐누');
const valkyrieSignature = valkyrieRows[0].arkGridSignature;
const valkyrieSnapshot = {
  profile: { name: '키리냐누', className: '발키리', secondClass: '해방자' },
  arkGrid: {
    slots: valkyrieSignature.split('|').map(value => {
      const [name, grade, point] = value.split(':');
      return { name, grade, point: Number(point) };
    })
  }
};
for (const row of valkyrieRows) {
  const match = findClassHoningSample(
    model.upgradeDelta.normalHoning.scopedSamples,
    valkyrieSnapshot,
    row.slot,
    row.from,
    row.to
  );
  assert.ok(match, `missing Valkyrie class sample for ${row.slot}`);
}

const differentValkyrieBuild = {
  profile: { name: '다른발키리', className: '발키리', secondClass: '빛의 수호자' },
  arkGrid: { slots: [{ name: '다른 코어', grade: '전설', point: 1 }] }
};
const valkyrieHead = valkyrieRows.find(row => row.slot === 'head');
assert.ok(findClassHoningSample(
  model.upgradeDelta.normalHoning.scopedSamples,
  differentValkyrieBuild,
  valkyrieHead.slot,
  valkyrieHead.from,
  valkyrieHead.to
));
assert.ok(Math.abs(findClassHoningSample([
  { className: '발키리', slot: 'head', from: 21, to: 22, percent: 0.2 },
  { className: '발키리', slot: 'head', from: 21, to: 22, percent: 0.4 }
], differentValkyrieBuild, 'head', 21, 22).percent - 0.3) < 1e-12);
assert.equal(findClassHoningSample([
  { className: '워로드', slot: 'head', from: 21, to: 22, percent: 0.2 }
], differentValkyrieBuild, 'head', 21, 22), null);

console.log('combat power calibration tests passed');
