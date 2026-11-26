const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });
const format = value => Number.isFinite(value) ? number.format(value) : '—';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const charts = new WeakMap();

export function clearManaTimelineGraph(output) {
  charts.get(output)?.disconnect();
  charts.delete(output);
}

function drawManaTrace(canvas, result) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const { clientWidth: width, clientHeight: height } = canvas;
  if (!width || !height) return;
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const left = 48;
  const top = 14;
  const bottom = height - 30;
  const x = time => left + (width - left - 24) * time / result.duration;
  const y = mana => bottom - (bottom - top) * mana / result.maxMana;
  for (const [windows, color] of [[result.downtime, 'rgba(148, 163, 184, .15)'], [result.shortages, 'rgba(251, 146, 60, .22)']]) {
    context.fillStyle = color;
    for (const { start, end } of windows) context.fillRect(x(start), top, Math.max(2, x(end) - x(start)), bottom - top);
  }
  context.font = '12px system-ui, sans-serif';
  context.fillStyle = '#c0ccdb';
  context.strokeStyle = '#384658';
  for (const mana of [0, result.maxMana / 2, result.maxMana]) {
    context.beginPath();
    context.moveTo(left, y(mana));
    context.lineTo(x(result.duration), y(mana));
    context.stroke();
    context.fillText(format(mana), 4, y(mana) + 5, left - 8);
  }
  context.textAlign = 'center';
  for (let step = 0; step <= 4; step++) {
    const time = result.duration * step / 4;
    context.fillText(`${format(time)}초`, x(time), height - 8, 47);
  }
  context.strokeStyle = '#60c6f5';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x(0), y(result.startMana));
  let previous = result.startMana;
  for (const { time, mana } of result.trace) {
    context.lineTo(x(time), y(previous));
    context.lineTo(x(time), y(mana));
    previous = mana;
  }
  context.stroke();
}

export function renderManaTimeline(output, result, damage, comparisons, unscheduled, furnaceSelected) {
  clearManaTimelineGraph(output);
  const time = value => Number.isFinite(value) ? `${format(value)}초` : '없음';
  const metrics = [
    ['최대 마나', format(result.maxMana)], ['계획 소모 / 초', format(result.demandPerSecond)],
    ['예정 회복 / 초', format(result.recoveryPerSecond)], ['예정 순증감 / 초', format(result.netPerSecond)],
    ['평균 수지의 고갈 예상', result.partialInputs ? 'UNKNOWN' : time(result.averageDepletion)],
    [result.partialInputs ? '입력 범위 첫 부족' : '첫 마나 부족', time(result.firstShortage)],
    ['마나 부족 횟수', format(result.shortages.length)], ['마나 부족 누적 시간', time(result.shortageTime)],
    ['종료 마나', format(result.endMana)], ['미시전 횟수', format(result.lostCasts)]
  ];
  const rows = result.skillCasts.map(skill => `<tr><th scope="row">${escape(skill.name)}</th><td>${format(skill.cost)}</td>
    <td>${format(skill.interval)}</td><td>${format(skill.actualInterval)}</td><td>${format(skill.spentPerSecond)}</td>
    <td>${skill.casts} / ${skill.plannedCasts}</td><td>${skill.delayed}</td></tr>`).join('');
  const costs = result.skillCasts.map(skill => {
    const difference = Number.isFinite(skill.tooltipPreEvolutionCost) && skill.costSource === '사용자 입력'
      ? skill.costBeforeEvolution - skill.tooltipPreEvolutionCost : null;
    return `<tr><th scope="row">${escape(skill.name)}<small>${escape(skill.intervalSource || 'UNKNOWN')}</small></th>
      <td>${format(skill.baseManaCost)}</td><td>${format(skill.tooltipPreEvolutionCost)}</td>
      <td>${format(skill.costBeforeEvolution)}<small>${escape(skill.costSource || 'UNKNOWN')}</small></td>
      <td>${format(difference)}</td><td>${format(skill.reduction)}</td><td>${format(skill.furnaceExtra)}</td><td>${format(skill.cost)}</td></tr>`;
  }).join('');
  const comparisonRows = comparisons.filter(comparison => comparison && (comparison.result || comparison.detail)).map(comparison => {
    const compared = comparison.result;
    const detail = [comparison.detail, compared?.reason].filter(Boolean).join(' · ');
    const available = compared && !compared.reason;
    return `<tr><th scope="row">${escape(comparison.label)}${detail ? `<small>${escape(detail)}</small>` : ''}</th>
      <td>${available ? format(compared.demandPerSecond) : '—'}</td><td>${available ? format(compared.recoveryPerSecond) : '—'}</td>
      <td>${available ? time(compared.firstShortage) : '—'}</td><td>${available ? format(compared.endMana) : '—'}</td>
      <td>${format(comparison.damage?.actual)}</td></tr>`;
  }).join('');
  const damageSummary = damage.reason ? escape(`피해 비교 미확인 · ${damage.reason}`)
    : `기대 피해 지수 (동일 시전 계획) · 마나 제한 없음 ${format(damage.ideal)} · 마나 제약 적용 ${format(damage.actual)} · 손실률 ${format(damage.lossPercent)}%`
      + (Math.abs(damage.lossPercentAlternate - damage.lossPercent) > 1e-6
        ? ` · 대체 피해 가정 ${format(damage.idealAlternate)} → ${format(damage.actualAlternate)}, 손실률 ${format(damage.lossPercentAlternate)}%` : '');
  const recovery = result.recoverySummary;
  output.innerHTML = `<div class="manaTimelineMetrics">${metrics.map(([label, value]) =>
    `<div><span>${label}</span><b>${value}</b></div>`).join('')}</div>
    ${unscheduled.length ? `<p class="hint">시전 입력에서 제외된 장착 스킬 · ${escape(unscheduled.join(', '))}</p>` : ''}
    <canvas width="720" height="200" role="img" aria-label="${format(result.duration)}초 마나 잔량. 시작 ${format(result.startMana)}, 종료 ${format(result.endMana)}, 첫 부족 ${time(result.firstShortage)}."></canvas>
    <p class="hint">파랑은 마나 잔량, 주황은 마나 부족, 회색은 딜 중지 구간입니다.</p>
    <details><summary>회복 상세</summary>
      <p class="hint">자연 회복 예정 ${format(result.naturalRecovery)} MP · 기존 회복 틱 ${recovery.ticks}회, 회복 증가 틱 ${recovery.boostedTicks}회 · 즉시 회복 ${recovery.instantEvents}회 ${format(recovery.instantAmount)} MP · 최대 마나 제한 후 유효 회복 ${format(result.effectiveRecovery)} MP (자연 ${format(result.effectiveNatural)} MP)</p>
      ${recovery.windows.length ? `<ul>${recovery.windows.map(window => `<li>${time(window.start)} ~ ${time(Math.min(window.end, result.duration))} · 회복 1회량 ${format(window.amount)} MP</li>`).join('')}</ul>` : ''}
    </details>
    <p class="hint">${damageSummary}</p>
    ${result.unavailable.length ? `<details><summary>계획 조건과 충돌한 시전 기록 ${result.unavailable.length}개</summary><ul>
      ${result.unavailable.map(row => `<li>${time(row.time)} · ${escape(row.skill)} · ${escape(row.reason)}</li>`).join('')}</ul></details>` : ''}
    <div class="manaTimelineTable" tabindex="0" role="region" aria-label="스킬별 마나 지속력"><table><thead><tr>
    <th scope="col">스킬</th><th scope="col">1회 MP</th><th scope="col">설정 간격(초)</th><th scope="col">시뮬레이션 간격(초)</th>
    <th scope="col">계획 MP/초</th><th scope="col">실행 / 계획</th><th scope="col">지연</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${result.shortages.length ? `<details><summary>마나 부족 구간 ${result.shortages.length}개</summary><ul>
      ${result.shortages.map(row => `<li>${time(row.start)} ~ ${time(row.end)} · ${escape(row.skill)} · 부족 ${format(row.deficit)} MP</li>`).join('')}</ul></details>` : ''}
    <details><summary>스킬 비용 산출과 입력 비교</summary>
      ${furnaceSelected ? '<p class="hint">용광로 추가 MP는 소모 감소 뒤에 합산하는 가정값입니다. 게임의 중첩 순서와 반올림은 UNKNOWN입니다.</p>' : ''}
      <div class="manaTimelineTable" tabindex="0" role="region" aria-label="스킬별 마나 산출 근거"><table><thead><tr>
      <th scope="col">스킬 / 간격 근거</th><th scope="col">툴팁 기본 MP</th><th scope="col">툴팁 진화 전 산출</th>
      <th scope="col">사용한 진화 전 MP</th><th scope="col">입력 − 툴팁 산출</th><th scope="col">진화 절감 MP</th>
      <th scope="col">용광로 추가 MP</th><th scope="col">최종 모델 MP</th></tr></thead><tbody>${costs}</tbody></table></div>
    </details>
    ${comparisonRows ? `<div class="manaTimelineTable" tabindex="0" role="region" aria-label="마나 효과 비교"><table><thead><tr>
    <th scope="col">시나리오 변경</th><th scope="col">소모/초</th><th scope="col">회복/초</th><th scope="col">첫 부족</th>
    <th scope="col">종료 MP</th><th scope="col">기대 피해 지수</th></tr></thead><tbody>${comparisonRows}</tbody></table></div>` : ''}`;
  const canvas = output.querySelector('canvas');
  const observer = new ResizeObserver(() => drawManaTrace(canvas, result));
  observer.observe(canvas);
  charts.set(output, observer);
}
