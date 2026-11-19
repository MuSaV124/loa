import { calculateHoningMaterialCost } from './honing-cost.js';

self.onmessage = ({ data: { stages, prices, options } }) => {
  try {
    self.postMessage({ cost: calculateHoningMaterialCost(stages, prices, options) });
  } catch {
    self.postMessage({ error: '완갑 기대 비용을 계산하지 못했습니다.' });
  }
};
