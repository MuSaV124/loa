import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const API_BASE = process.env.LOA_SAMPLE_API_BASE || 'https://loa-beige.vercel.app';
const OUTPUT = resolve(process.env.LOA_SAMPLE_OUTPUT || 'tmp/combat-samples.json');
const RANK_INPUT = process.env.LOA_RANK_INPUT ? resolve(process.env.LOA_RANK_INPUT) : '';

const referenceName = (process.env.LOA_REFERENCE_NAME || '').trim();
const defaultSampleNames = [
  '최이들', '월명BB', '페스', '오르띠뚜', '실링상자', '나우보리', '액션쾌감브레이커',
  '행무띠', '권따닝', '권시안', '날개달린곰', '로우프', '쬬꼬댱', '과격한자식',
  '맞짱깔까', '묵직한주먹민재', '크림류', '호협지', '수라쒸', '공쥬먹'
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loadNames() {
  const explicit = (process.env.SAMPLE_NAMES || '')
    .split(',')
    .map(name => name.trim())
    .filter(Boolean);

  if (explicit.length) return explicit;

  if (RANK_INPUT) {
    const payload = JSON.parse(await readFile(RANK_INPUT, 'utf8'));
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    return rows.map(row => row?.name).filter(Boolean);
  }

  return defaultSampleNames;
}

function equipmentKey(item) {
  const type = String(item?.type || '');
  if (type.includes('무기')) return 'weapon';
  if (type.includes('투구') || type.includes('머리')) return 'head';
  if (type.includes('견갑') || type.includes('어깨')) return 'shoulder';
  if (type.includes('상의')) return 'top';
  if (type.includes('하의')) return 'bottom';
  if (type.includes('장갑')) return 'gloves';
  return type || 'unknown';
}

function average(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function summarizeSnapshot(data) {
  const snapshot = data?.powerSnapshot || {};
  const profile = snapshot.profile || {};
  const equipment = snapshot.equipment || {};
  const combat = Array.isArray(equipment.combat) ? equipment.combat : [];
  const accessories = Array.isArray(equipment.accessories) ? equipment.accessories : [];
  const gear = {};

  for (const item of combat) {
    gear[equipmentKey(item)] = {
      type: item.type,
      name: item.name,
      honingLevel: item.honingLevel ?? null,
      advancedHoningLevel: item.advancedHoningLevel ?? null,
      advancedHoningExcluded: Boolean(item.advancedHoningExcluded),
      itemLevel: item.itemLevel ?? null,
      quality: item.quality ?? null
    };
  }

  const gems = snapshot.gems || {};
  const gemItems = Array.isArray(gems.items) ? gems.items : [];
  const damageGems = gemItems.filter(gem => gem.kind === 'damage');
  const cooldownGems = gemItems.filter(gem => gem.kind === 'cooldown');
  const arkGrid = Array.isArray(snapshot.arkGrid?.gemSummary) ? snapshot.arkGrid.gemSummary : [];
  const arkGridLevels = arkGrid.map(row => Number(row?.value)).filter(Number.isFinite);

  return {
    ok: true,
    name: profile.name || data?.profile?.CharacterName || '',
    className: profile.className || data?.profile?.CharacterClassName || '',
    server: profile.server || data?.profile?.ServerName || '',
    itemAvgLevel: profile.itemAvgLevel ?? null,
    combatPower: profile.combatPower ?? null,
    gear,
    gearSummary: {
      totalHoning: average(Object.values(gear).map(item => item.honingLevel)),
      armorHoning: average(Object.entries(gear).filter(([key]) => key !== 'weapon').map(([, item]) => item.honingLevel)),
      weaponHoning: gear.weapon?.honingLevel ?? null,
      armorQuality: average(Object.entries(gear).filter(([key]) => key !== 'weapon').map(([, item]) => item.quality)),
      weaponQuality: gear.weapon?.quality ?? null
    },
    accessories: {
      count: accessories.length,
      averageQuality: average(accessories.map(item => item.quality))
    },
    gemSummary: {
      total: gemItems.length,
      damage: damageGems.length,
      cooldown: cooldownGems.length,
      averageLevel: gems.summary?.averageLevel ?? average(gemItems.map(gem => gem.level)),
      damageAverageLevel: average(damageGems.map(gem => gem.level)),
      cooldownAverageLevel: average(cooldownGems.map(gem => gem.level))
    },
    arkGrid: {
      gemSummary: arkGrid,
      total: arkGridLevels.reduce((sum, value) => sum + value, 0),
      average: average(arkGridLevels)
    },
    effects: {
      accessory: data?.accessoryEffects || {},
      bracelet: data?.braceletEffects || {},
      abilityStone: data?.abilityStoneEffects || {},
      engraving: data?.engravingEffects || {},
      arkGrid: data?.arkGridEffects || {}
    },
    coverage: snapshot.coverage || {}
  };
}

async function fetchCharacter(name) {
  const url = `${API_BASE}/api/character?name=${encodeURIComponent(name)}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false || data?.error) {
    return { ok: false, name, status: res.status, error: data?.error || data?.message || `HTTP ${res.status}` };
  }
  return summarizeSnapshot(data);
}

async function main() {
  const sampleNames = await loadNames();
  const names = [...new Set([referenceName, ...sampleNames].map(name => name.trim()).filter(Boolean))];
  if (!names.length) {
    throw new Error('No sample names. Set SAMPLE_NAMES, LOA_RANK_INPUT, or LOA_REFERENCE_NAME.');
  }
  const rows = [];

  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    process.stdout.write(`[${i + 1}/${names.length}] ${name} ... `);
    try {
      const row = await fetchCharacter(name);
      rows.push(row);
      console.log(row.ok ? `${row.className || '-'} ${row.combatPower ?? '-'}` : `FAIL ${row.error}`);
    } catch (error) {
      rows.push({ ok: false, name, error: error?.message || String(error) });
      console.log(`FAIL ${error?.message || String(error)}`);
    }
    await sleep(Number(process.env.LOA_SAMPLE_DELAY_MS || 350));
  }

  const reference = referenceName ? rows.find(row => row.name === referenceName) || null : null;
  const sameClass = reference?.className ? rows.filter(row => row.ok && row.className === reference.className) : [];
  const payload = {
    collectedAt: new Date().toISOString(),
    apiBase: API_BASE,
    rankInput: RANK_INPUT || null,
    referenceName,
    total: rows.length,
    success: rows.filter(row => row.ok).length,
    failed: rows.filter(row => !row.ok).length,
    reference,
    sameClassCount: sameClass.length,
    rows
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`saved ${OUTPUT}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
