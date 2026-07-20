import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const API_INPUT = resolve(process.env.LOA_REFERENCE_API_INPUT || 'tmp/all-reference-class-snapshots-2026-07-20.json');
const LOPEC_INPUT = resolve(process.env.LOA_REFERENCE_LOPEC_INPUT || 'tmp/lopec-reference-honing-deltas-2026-07-20.json');
const OUTPUT = resolve(process.env.LOA_REFERENCE_SAMPLE_OUTPUT || 'scripts/combat-power-reference-honing-samples.json');
const MODEL_OUTPUT = resolve(process.env.LOA_MODEL_OUTPUT || 'public/combat-power-model.json');
const MAX_BASELINE_ERROR = Number(process.env.LOA_MAX_BASELINE_ERROR || 0.1);

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function nameKey(value) {
  return normalize(value).toLocaleLowerCase('ko-KR');
}

function arkGridSignature(snapshot) {
  return (snapshot?.arkGrid?.slots || []).map(slot => [
    normalize(slot?.name),
    normalize(slot?.grade).replace(/\s*코어$/, ''),
    Number(slot?.point || 0)
  ].join(':')).join('|');
}

function slotFromLabel(label) {
  const text = normalize(label);
  if (/투구|머리|모자/.test(text)) return 'head';
  if (/견갑|어깨/.test(text)) return 'shoulder';
  if (/상의/.test(text)) return 'top';
  if (/하의/.test(text)) return 'bottom';
  if (/장갑/.test(text)) return 'gloves';
  if (/무기/.test(text)) return 'weapon';
  return text ? 'weapon' : '';
}

const apiPayload = JSON.parse(await readFile(API_INPUT, 'utf8'));
const lopecPayload = JSON.parse(await readFile(LOPEC_INPUT, 'utf8'));
const apiByName = new Map((apiPayload.rows || []).filter(row => row?.ok).map(row => [nameKey(row.name), row]));
const rejected = [];
const rows = [];

for (const lopec of lopecPayload.rows || []) {
  const api = apiByName.get(nameKey(lopec.name));
  if (!api) {
    rejected.push({ name: lopec.name, reason: 'official API snapshot missing' });
    continue;
  }
  const baselineError = Number((Number(lopec.baseline || 0) - Number(api.combatPower || 0)).toFixed(2));
  if (Math.abs(baselineError) > MAX_BASELINE_ERROR) {
    rejected.push({ name: lopec.name, reason: 'Lopec and official API baseline mismatch', baselineError });
    continue;
  }
  const signature = arkGridSignature(api);
  if (!signature) {
    rejected.push({ name: lopec.name, reason: 'Ark Grid signature missing' });
    continue;
  }
  for (const transition of lopec.rows || []) {
    const slot = slotFromLabel(transition.label);
    if (!slot || !(Number(transition.delta) > 0) || !(Number(transition.percent) > 0)) continue;
    const lowerPower = Number(transition.lowerPower);
    const delta = Number(transition.delta);
    rows.push({
      className: api.className,
      secondClass: api.secondClass,
      referenceCharacter: api.name,
      arkGridSignature: signature,
      slot,
      from: Number(transition.from),
      to: Number(transition.to),
      lowerPower,
      upperPower: Number(transition.upperPower),
      delta,
      percent: Number(((delta / lowerPower) * 100).toFixed(9)),
      apiCombatPower: Number(api.combatPower),
      baselineError,
      confidence: 'class-sampled',
      basis: 'Official API baseline matched to Lopec before-after simulator sample'
    });
  }
}

const output = {
  updatedAt: new Date().toISOString(),
  source: {
    officialApi: apiPayload.apiBase || 'https://loa-beige.vercel.app',
    lopec: 'https://lopec.kr/character/simulator/{character}'
  },
  maxBaselineError: MAX_BASELINE_ERROR,
  referenceCharacters: [...new Set(rows.map(row => row.referenceCharacter))].length,
  transitionSamples: rows.length,
  rejected,
  rows
};

const runtimeRows = rows.map(row => ({
  className: row.className,
  secondClass: row.secondClass,
  referenceCharacter: row.referenceCharacter,
  arkGridSignature: row.arkGridSignature,
  slot: row.slot,
  from: row.from,
  to: row.to,
  percent: row.percent,
  confidence: row.confidence,
  basis: row.basis
}));

await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

const model = JSON.parse(await readFile(MODEL_OUTPUT, 'utf8'));
model.createdAt = new Date().toISOString();
model.upgradeDelta ||= {};
model.upgradeDelta.normalHoning ||= {};
model.upgradeDelta.normalHoning.scopedSamples = runtimeRows;
for (const row of Object.values(model.upgradeDelta.normalHoning.percentByClassSpecSlotLevel || {})) {
  if (row && typeof row === 'object') row.basis = 'Lopec same-class slot/range before-after sample; second class and Ark Grid are audit metadata only.';
}
delete model.upgradeDelta.normalHoning.weaponPercent;
delete model.upgradeDelta.normalHoning.armorPercent;
delete model.upgradeDelta.normalHoning.percentDefaults;
delete model.upgradeDelta.normalHoning.classFallbacks;
model.upgradeDelta.normalHoning.coverage = `${rows.length} class/slot/range samples; second class and Ark Grid are not runtime matching conditions`;
model.upgradeDelta.normalHoning.confidence = 'unverified';
model.upgradeDelta.normalHoning.basis = 'Same-class slot/range samples use the median percent. Cross-class fallback is disabled.';
model.upgradeDelta.normalHoning.matchPolicy = 'className + slot + from + to';
model.validation ||= {};
model.validation.honing ||= {};
model.validation.honing.referenceCharacters = output.referenceCharacters;
model.validation.honing.scopedTransitionSamples = rows.length;
model.validation.honing.rejectedReferences = rejected;
await writeFile(MODEL_OUTPUT, `${JSON.stringify(model, null, 2)}\n`, 'utf8');

console.log(`saved ${OUTPUT}`);
console.log(`updated ${MODEL_OUTPUT}`);
console.log(`accepted ${output.referenceCharacters} characters / ${rows.length} transitions; rejected ${rejected.length}`);
