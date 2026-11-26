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

export function renderManaDemand(output, { skills, demand, max, recovery, basis, reason, recoveryComparisons, furnaceSelected, timelinePending }) {
  const label = basis === 'cooldown' ? '쿨타임 기준 최대 시전 가정' : '입력 시전 계획';
  const byName = new Map(demand?.rows.map(skill => [skill.name, skill]));
  const rated = demand?.rows.some(row => row.casts > 0 && row.final != null);
  const rate = value => Number.isFinite(value) ? `${format(value)} MP/초` : 'UNKNOWN';
  const known = rated ? `${rate(demand.knownPerSecond)} · ${format(demand.knownPerSecond * 60)} MP/분` : 'UNKNOWN';
  const target = demand?.complete ? demand.knownPerSecond : null;
  const additional = target != null && max > 0 && Number.isFinite(recovery?.perSecond)
    ? Math.max(0, target - recovery.perSecond) / max * 100 : null;
  const metrics = [
    [demand?.complete ? '계획 소모' : '확인 범위 소모', known],
    ['수지 균형 최소 회복', rate(target)],
    ['추가 회복 필요율', additional == null ? 'UNKNOWN' : `최대 MP의 ${format(additional)}%/초`],
    ['예정 회복', rate(recovery?.perSecond)]
  ];
  if (furnaceSelected) {
    metrics.push(['용광로 미적용 소모', rate(demand?.beforeComplete ? demand.beforePerSecond : null)],
      ['용광로 추가 소모', Number.isFinite(demand?.furnacePercentPerSecond)
        ? `최대 MP의 ${format(demand.furnacePercentPerSecond)}%/초` : 'UNKNOWN']);
  }
  const options = (profile, focus) => {
    const matches = (profile.modifiers ?? []).filter(modifier => modifier.source.startsWith('집중 룬') === focus);
    if (!Number.isFinite(profile.baseCost) || matches.length > 1 || matches.some(modifier => modifier.percent == null)) return '—';
    const names = matches.map(modifier => modifier.source).join(', ');
    return `${format(profile.baseCost * (1 + (matches[0]?.percent ?? 0) / 100))}${names ? `<small>${escape(names)}</small>` : ''}`;
  };
  const rows = skills.map(skill => {
    const planned = byName.get(skill.name);
    return `<tr><th scope="row">${escape(skill.name)}${skill.reason ? `<small>${escape(skill.reason)}</small>` : ''}</th>
      <td>${format(skill.baseCost)}</td><td>${options(skill, true)}</td><td>${options(skill, false)}</td>
      <td>${format(skill.preEvolutionCost)}</td><td>${format(planned?.before)}</td><td>${format(planned?.extra)}</td>
      <td>${format(planned?.final)}</td><td>${format(planned?.casts)}</td></tr>`;
  }).join('');
  const comparisons = (recoveryComparisons ?? []).map(row => `<li>${escape(row.name)} · ${escape(rate(row.perSecond))}${row.reason ? ` · ${escape(row.reason)}` : ''}</li>`).join('');
  output.innerHTML = `<h3 tabindex="-1">스킬 소모량과 회복 필요량</h3><p class="hint">${label}. 수지 균형은 평균 소모량을 맞추는 회복량입니다. 순간 마나 부족은 시간 분석에서 확인합니다.</p>
    <div class="manaTimelineMetrics">${metrics.map(([name, value]) => `<div><span>${name}</span><b>${value}</b></div>`).join('')}</div>
    ${reason && timelinePending ? `<p class="hint">${escape(reason)}</p>` : ''}
    ${recovery?.reason ? `<p class="hint">회복 비교 · ${escape(recovery.reason)}</p>` : ''}
    ${demand?.unscheduled.length ? `<p class="hint">간격 미확인 또는 시전 계획에서 제외 · ${escape(demand.unscheduled.join(', '))}</p>` : ''}
    ${comparisons ? `<ul class="hint">${comparisons}</ul>` : ''}
    ${rows ? `<details><summary>스킬별 비용 단계</summary>
      <p class="hint">집중과 트라이포드 열은 기본 MP에 각 효과를 따로 적용한 값입니다. 두 효과의 중첩은 확인된 값이 필요합니다.${furnaceSelected ? ' 용광로 추가는 감소 뒤 합산하는 A 가정입니다.' : ''} —는 미확인 또는 계획 미포함입니다.</p>
      <div class="manaTimelineTable" tabindex="0" role="region" aria-label="스킬별 비용 단계"><table><thead><tr>
      <th scope="col">스킬</th><th scope="col">기본 MP</th><th scope="col">집중만 적용</th><th scope="col">트라이포드만 적용</th>
      <th scope="col">툴팁 진화 전</th><th scope="col">진화 적용 후</th><th scope="col">용광로 추가</th><th scope="col">최종 MP</th><th scope="col">계획 시전</th>
      </tr></thead><tbody>${rows}</tbody></table></div></details>` : ''}`;
}

export function renderManaSensitivity(output, rows) {
  const details = document.createElement('details');
  details.innerHTML = `<summary>최대 MP·자연 회복률 민감도</summary>
    <p class="hint">최대 MP ±10%, 자연 회복률 ±0.5%p/초에서 같은 계획을 재생합니다. 시작 MP 비율을 유지하고 직접 입력한 고정 회복량은 유지합니다.</p>
    <div class="manaTimelineTable" tabindex="0" role="region" aria-label="마나 지속력 민감도"><table><thead><tr>
    <th scope="col">최대 MP</th><th scope="col">회복률/초</th><th scope="col">예정 수지/초</th><th scope="col">첫 부족(초)</th><th scope="col">종료 MP</th>
    </tr></thead><tbody>${rows.map(({ maxMana, rate, result, reason }) => `<tr><th scope="row">${format(maxMana)}</th><td>${format(rate)}%</td>
      ${result && !result.reason && !result.partialInputs ? `<td>${format(result.netPerSecond)}</td><td>${result.firstShortage == null ? '없음' : format(result.firstShortage)}</td><td>${format(result.endMana)}</td>`
        : `<td colspan="3">${escape(reason || result?.reason || '시전 조건 일부 미확인')}</td>`}</tr>`).join('')}</tbody></table></div>`;
  output.append(details);
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
  const furnaceRows = result.skillCasts.filter(skill => skill.furnaceOrder).map(({ name, furnaceOrder }) =>
    `<tr><th scope="row">${escape(name)}</th><td>${format(furnaceOrder.a)}</td><td>${format(furnaceOrder.b)}</td><td>${format(furnaceOrder.c)}</td></tr>`).join('');
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
      ${furnaceSelected ? '<p class="hint">기존 시간 모델은 감소 뒤 추가하는 A 가정입니다. 게임의 중첩 순서와 반올림은 UNKNOWN입니다.</p>' : ''}
      <div class="manaTimelineTable" tabindex="0" role="region" aria-label="스킬별 마나 산출 근거"><table><thead><tr>
      <th scope="col">스킬 / 간격 근거</th><th scope="col">툴팁 기본 MP</th><th scope="col">툴팁 진화 전 산출</th>
      <th scope="col">사용한 진화 전 MP</th><th scope="col">입력 − 툴팁 산출</th><th scope="col">진화 절감 MP</th>
      <th scope="col">용광로 추가 MP</th><th scope="col">최종 모델 MP</th></tr></thead><tbody>${costs}</tbody></table></div>
      ${furnaceRows ? `<div class="manaTimelineTable" tabindex="0" role="region" aria-label="마나 용광로 순서 가정 비교"><table><thead><tr>
        <th scope="col">용광로 비교 (1회 MP)</th><th scope="col">A 감소 후 추가</th><th scope="col">B 추가 후 감소</th><th scope="col">C 단계별 반올림</th>
      </tr></thead><tbody>${furnaceRows}</tbody></table></div><p class="hint">B는 현재 기본 MP 대비 입력한 비용의 비율이 추가량에도 적용된다고 가정합니다. C는 진화 전 비용과 각 적용 단계, 별도 추가량을 가장 가까운 정수로 반올림하는 가정입니다.</p>` : ''}
    </details>
    ${comparisonRows ? `<div class="manaTimelineTable" tabindex="0" role="region" aria-label="마나 효과 비교"><table><thead><tr>
    <th scope="col">시나리오 변경</th><th scope="col">소모/초</th><th scope="col">회복/초</th><th scope="col">첫 부족</th>
    <th scope="col">종료 MP</th><th scope="col">기대 피해 지수</th></tr></thead><tbody>${comparisonRows}</tbody></table></div>` : ''}`;
  const canvas = output.querySelector('canvas');
  const observer = new ResizeObserver(() => drawManaTrace(canvas, result));
  observer.observe(canvas);
  charts.set(output, observer);
}
