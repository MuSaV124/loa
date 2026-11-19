export const SHARD_POUCH_SIZES = Object.freeze({
  '운명의 파편 주머니(소)': 1000,
  '운명의 파편 주머니(중)': 2000,
  '운명의 파편 주머니(대)': 3000
});

// Item identities observed in the production market snapshot on 2026-10-04.
const MATERIAL_IDS = Object.freeze({
  '운명의 파편 주머니(소)': 66130141, '운명의 파편 주머니(중)': 66130142, '운명의 파편 주머니(대)': 66130143,
  '운명의 돌파석': 66110225, '위대한 운명의 돌파석': 66110226,
  '운명의 파괴석': 66102006, '운명의 파괴석 결정': 66102007,
  '운명의 수호석': 66102106, '운명의 수호석 결정': 66102107,
  '아비도스 융화제': 6861012, '상급 아비도스 융화제': 6861013,
  '빙하의 숨결': 66111132, '용암의 숨결': 66111131,
  '재봉술 : 업화 [11-14]': 66112546, '재봉술 : 업화 [15-18]': 66112552, '재봉술 : 업화 [19-20]': 66112554,
  '재봉술 : 전율 [12-15]': 66112564, '재봉술 : 전율 [16-19]': 66112565,
  '장인의 재봉술 : 1단계': 66112712, '장인의 재봉술 : 2단계': 66112714,
  '장인의 재봉술 : 3단계': 66112716, '장인의 재봉술 : 4단계': 66112718,
  '야금술 : 업화 [11-14]': 66112543, '야금술 : 업화 [15-18]': 66112551, '야금술 : 업화 [19-20]': 66112553,
  '야금술 : 전율 [12-15]': 66112561, '야금술 : 전율 [16-19]': 66112562,
  '장인의 야금술 : 1단계': 66112711, '장인의 야금술 : 2단계': 66112713,
  '장인의 야금술 : 3단계': 66112715, '장인의 야금술 : 4단계': 66112717,
  '질서의 젬 : 안정': 67400003, '질서의 젬 : 견고': 67400103, '질서의 젬 : 불변': 67400203,
  '혼돈의 젬 : 침식': 67410303, '혼돈의 젬 : 왜곡': 67410403, '혼돈의 젬 : 붕괴': 67410503
});

function materialKey(name) {
  return String(name || '').normalize('NFKC')
    .replace(/[‐‑–—−]/g, '-').replace(/[\s:()[\]]/g, '')
    .replace(/아비도스융화재료$/, '아비도스융화제')
    .replace(/^(장인의(?:재봉술|야금술))업화(?=\d단계$)/, '$1')
    .replace(/^(질서|혼돈)젬/, '$1의젬');
}

export function matchesMaterialName(actual, requested) {
  return Boolean(actual && requested && materialKey(actual) === materialKey(requested));
}

export function materialQuote(item, name = item?.requestedName || item?.name) {
  const id = Number(item?.id);
  const price = Number(item?.price);
  const bundleCount = Number(item?.bundleCount);
  if (item?.missing || item?.error || !matchesMaterialName(item?.name, name)
      || !Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(price) || price <= 0
      || (Object.hasOwn(MATERIAL_IDS, name) && MATERIAL_IDS[name] !== id)
      || !Number.isSafeInteger(bundleCount) || bundleCount <= 0) return null;
  const shardCount = SHARD_POUCH_SIZES[name] || 0;
  const unitPrice = price / bundleCount;
  const shardUnitPrice = shardCount ? unitPrice / shardCount : 0;
  return { ...item, id, price, bundleCount, unitPrice, shardCount, shardUnitPrice, effectiveUnitPrice: shardCount ? shardUnitPrice : unitPrice };
}

export function materialPurchaser(priceMap, name) {
  const direct = materialQuote(priceMap?.get(name), name);
  if (name !== '운명의 파편') {
    return direct ? {
      unitGold: direct.unitPrice,
      period: direct.bundleCount,
      periodGold: direct.price,
      periodicAfter: 0,
      cost: amount => Math.ceil(amount / direct.bundleCount) * direct.price
    } : null;
  }
  const pouches = Object.keys(SHARD_POUCH_SIZES).map(key => materialQuote(priceMap?.get(key), key)).filter(Boolean);
  if (!pouches.length) return null;
  const options = pouches.map(item => ({ size: item.shardCount * item.bundleCount / 1000, price: item.price }));
  const cheapest = options.reduce((best, option) => option.price * best.size < best.price * option.size ? option : best);
  // An optimal cover can replace any cheapest.size copies of another option with the cheapest option.
  const otherSizes = options.filter(option => option !== cheapest).reduce((sum, option) => sum + option.size, 0);
  const costByThousands = [0];
  return {
    unitGold: Math.min(...pouches.map(item => item.shardUnitPrice)),
    period: cheapest.size * 1000,
    periodGold: cheapest.price,
    periodicAfter: (cheapest.size - 1) * otherSizes * 1000,
    cost(amount) {
      const needed = Math.ceil(amount / 1000);
      for (let n = costByThousands.length; n <= needed; n += 1) {
        costByThousands[n] = Math.min(...options.map(option => option.price + costByThousands[Math.max(0, n - option.size)]));
      }
      return costByThousands[needed];
    }
  };
}
