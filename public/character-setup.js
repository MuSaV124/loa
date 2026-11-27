const gearOrder = ['무기', '투구', '상의', '하의', '장갑', '어깨', '완갑'];
const accessoryOrder = ['목걸이', '귀걸이', '귀걸이', '반지', '반지', '팔찌', '어빌리티 스톤'];
const aliases = { 머리장식: '투구', 견갑: '어깨' };
const passives = ['진화', '깨달음', '도약'];
const combatStats = new Set(['치명', '특화', '신속', '제압', '인내', '숙련']);
const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 4 });
const array = value => Array.isArray(value) ? value.filter(Boolean) : [];
const numeric = value => value != null && value !== '' && Number.isFinite(Number(value));
const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const clean = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&').replace(/\|+/g, ' ').replace(/\s+/g, ' ').trim() : '';
const lines = value => (typeof value === 'string' ? value : '').split(/<br\s*\/?\s*>|\|\||\r?\n/gi).map(clean).filter(Boolean);
const percent = value => `${number.format(value)}%`;

function descriptions(value) {
  if (typeof value === 'string' && value.startsWith('[')) {
    try { value = JSON.parse(value); } catch { /* Keep the tooltip text. */ }
  }
  return (Array.isArray(value) ? value : [value]).flatMap(lines);
}

function tooltipElements(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return []; }
  }
  return value && typeof value === 'object' ? Object.values(value).filter(Boolean) : [];
}

function itemTooltip(value) {
  const elements = tooltipElements(value);
  const title = elements.find(row => row.type === 'ItemTitle')?.value;
  const name = clean(elements.find(row => row.type === 'NameTagBox')?.value);
  const blocks = elements.filter(row => row.type === 'ItemPartBox').map(row => ({
    name: clean(row.value?.Element_000), lines: lines(row.value?.Element_001)
  })).filter(row => row.name && row.lines.length);
  return { title, name, blocks, texts: elements.filter(row => row.type === 'MultiTextBox').flatMap(row => lines(row.value)) };
}

function itemRow(raw, parsed = {}) {
  const tip = itemTooltip(raw?.Tooltip);
  const name = clean(raw?.Name) || parsed.name || tip.name;
  const quality = raw?.Quality ?? tip.title?.qualityValue ?? parsed.quality;
  const advancedLine = tip.blocks.find(row => /상급\s*재련/.test(row.name))?.lines.join(' ');
  return { name, type: raw?.Type || parsed.type, grade: raw?.Grade || parsed.grade, icon: raw?.Icon || parsed.icon || tip.title?.slotData?.iconPath,
    itemLevel: parsed.itemLevel ?? raw?.ItemLevel,
    quality: numeric(quality) && Number(quality) >= 0 ? Number(quality) : quality === -1 ? '해당 없음' : null,
    honing: parsed.honingLevel ?? raw?.HoningLevel ?? name.match(/^\+(\d+)/)?.[1],
    advanced: advancedLine?.match(/(\d+)\s*단계/)?.[1] ?? parsed.advancedHoningLevel ?? raw?.AdvancedHoningLevel,
    advancedExcluded: parsed.advancedHoningExcluded, qualityDamage: parsed.qualityAdditionalDamage,
    blocks: tip.blocks };
}

function fillSlots(order, items) {
  const used = new Set();
  return order.map(type => {
    const index = items.findIndex((item, position) => !used.has(position) && (aliases[item.type] || item.type) === type);
    if (index >= 0) used.add(index);
    return { slot: type, item: items[index] ?? null };
  });
}

export function buildCharacterSetup(data) {
  const raw = data.raw ?? {};
  const snapshot = data.powerSnapshot ?? {};
  const rawGear = raw.ArmoryEquipment ?? raw.Equipment ?? data.equipment;
  const equipment = snapshot.equipment ?? {};
  const parsed = array(equipment.all);
  const fallback = parsed.length ? parsed : [...array(equipment.combat), ...array(equipment.accessories), equipment.bracelet, equipment.abilityStone].filter(Boolean);
  const gear = array(rawGear).length ? array(rawGear).map((item, index) => itemRow(item, parsed[index]?.type === item.Type ? parsed[index] : undefined))
    : fallback.map(item => itemRow(null, item));
  const saved = data.characterSetup?.version === 1 ? data.characterSetup : {};
  const effects = snapshot.effects ?? {};
  const gemData = raw.ArmoryGem ?? raw.Gems ?? data.gems;
  const gemItems = Array.isArray(gemData) ? gemData : gemData?.Gems ?? gemData?.Items;
  const gemEffects = gemData?.Effects?.Skills ?? gemData?.Effects ?? snapshot.gems?.effects;
  const normalizedGems = array(snapshot.gems?.items);
  const gemSlots = normalizedGems.length ? normalizedGems : array(gemItems);
  const gemApiBySlot = new Map(array(gemEffects).map(row => [Number(row.GemSlot ?? row.Slot ?? row.slot), row]));
  const gems = gemSlots.map(row => {
    const effect = gemApiBySlot.get(Number(row.slot ?? row.Slot ?? row.GemSlot));
    const item = itemRow(row, row);
    const text = [effect?.Description ?? effect?.description ?? row.effectText, effect?.Option ?? effect?.option].flatMap(descriptions);
    return { ...item, skill: clean(effect?.Name ?? effect?.name ?? row.skillName), level: row.Level ?? row.level,
      kind: row.kind || (text.some(value => /재사용 대기/.test(value)) ? 'cooldown' : text.some(value => /피해/.test(value)) ? 'damage' : ''),
      bound: row.bound, texts: text };
  });
  const engravingData = raw.ArmoryEngraving ?? raw.Engraving ?? {};
  const engravingRows = [engravingData.ArkPassiveEffects, engravingData.Effects, engravingData.Engravings, data.equippedEngravings].map(array).find(rows => rows.length) ?? [];
  const engravings = engravingRows.map(row => {
    const parallel = array(engravingData.Effects).find(effect => effect.Name === row.Name);
    const book = array(data.engravingEffects?.items ?? snapshot.effects?.engraving?.items).find(item => item.name === row.Name);
    return { name: clean(row.Name), icon: row.Icon ?? parallel?.Icon, grade: row.Grade ?? book?.grade, level: row.Level ?? book?.bookLevel,
      stone: row.AbilityStoneLevel, texts: lines(row.Description), book };
  });
  const arkPassive = data.arkPassive ?? raw.ArkPassive;
  const gridData = data.arkGrid ?? raw.ArkGrid;
  const normalizedGrid = array(snapshot.arkGrid?.slots).filter(row => row.name);
  const rawGrid = array(gridData?.Slots).filter(row => row.Name || row.Tooltip);
  const grid = rawGrid.length ? rawGrid.map(row => {
    const computed = array(data.arkGridEffects?.items ?? snapshot.effects?.arkGrid?.items).find(item => item.index === row.Index);
    const normalized = normalizedGrid.find(item => item.icon && item.icon === row.Icon && Number(item.point) === Number(row.Point));
    return { name: clean(row.Name) || itemTooltip(row.Tooltip).name, icon: row.Icon, grade: row.Grade, point: row.Point,
      index: row.Index, texts: computed?.activeTexts ?? normalized?.activeTexts ?? [], gems: array(row.Gems).map(gem => ({
        ...itemRow(gem), active: gem.IsActive, index: gem.Index
      })) };
  }) : normalizedGrid.map(row => ({ ...row, texts: row.activeTexts, gems: [] }));
  const cardEffects = data.cardEffects ?? snapshot.effects?.card;
  const rawCards = raw.ArmoryCard ?? raw.Cards;
  const avatarEffects = data.avatarEffects ?? snapshot.effects?.avatar;
  const avatars = avatarEffects?.items ?? array(raw.ArmoryAvatars ?? raw.ArmoryAvatar ?? raw.Avatars).map(row => ({ ...itemRow(row), isInner: row.IsInner, isSet: row.IsSet }));
  return { hasGear: saved.hasGear ?? (rawGear != null || fallback.length > 0),
    gear: Array.isArray(saved.gear) ? saved.gear : fillSlots(gearOrder, gear).filter(row => row.item || row.slot !== '완갑'),
    accessories: Array.isArray(saved.accessories) ? saved.accessories : fillSlots(accessoryOrder, gear),
    gems: Array.isArray(saved.gems) ? saved.gems : gems, engravings: Array.isArray(saved.engravings) ? saved.engravings : engravings,
    accessoryEffects: data.accessoryEffects ?? effects.accessory, braceletEffects: data.braceletEffects ?? effects.bracelet,
    stoneEffects: data.abilityStoneEffects ?? effects.abilityStone, arkPassive, grid, gridEffects: array(gridData?.Effects),
    gridEngine: data.arkGridEffects ?? snapshot.effects?.arkGrid,
    cards: cardEffects?.cards ?? array(rawCards?.Cards).map(row => ({ ...itemRow(row), awakeCount: row.AwakeCount })),
    cardSets: cardEffects?.sets ?? [], cardBonuses: cardEffects?.applied ?? [],
    rawCardSets: array(rawCards?.Effects).flatMap(set => array(set.Items)),
    avatars, stats: array(data.profile?.Stats ?? raw.ArmoryProfile?.Stats).filter(row => combatStats.has(row.Type)) };
}

function image(icon) {
  let url;
  try { url = new URL(icon); } catch { /* No official image in the response. */ }
  return url?.protocol === 'https:' ? `<img class="setupIcon" src="${escape(url.href)}" alt="" width="38" height="38" loading="lazy">`
    : '<span class="setupIcon setupIconEmpty" aria-hidden="true"></span>';
}

function badge(value, kind = '') {
  return `<span class="setupBadge ${kind}">${escape(value)}</span>`;
}

function details(title, content, slot = '') {
  return content ? `<details${slot ? ` class="${slot}"` : ''}><summary>${escape(title)}</summary>${content}</details>` : '';
}

function facts(items) {
  const rows = array(items).filter(value => typeof value === 'string' && value.trim());
  return rows.length ? `<ul class="setupFacts">${rows.map(value => `<li>${escape(value)}</li>`).join('')}</ul>` : '';
}

function blocks(item) {
  return array(item.blocks).map(block => `<div class="setupOptionGroup"><b>${escape(block.name)}</b>${facts(block.lines)}</div>`).join('');
}

function row(item, label, metadata, more = '', kind = '') {
  return `<li class="setupRow ${kind}">${image(item.icon)}<div class="setupRowBody">
    ${label ? `<span class="setupLabel">${escape(label)}</span>` : ''}<strong>${escape(item.name || '이름 미확인')}</strong>
    ${metadata.length ? `<div class="setupBadges">${metadata.join('')}</div>` : ''}${more}</div></li>`;
}

function section(title, content, count = null, extra = '') {
  return `<section class="panel setupCard ${extra}"><div class="setupHeading"><h2>${title}</h2>${count == null ? '' : badge(`${count}개`)}</div>${content || '<p class="hint">표시할 API 정보가 없습니다.</p>'}</section>`;
}

function itemList(rows) {
  return rows ? `<ul class="setupList">${rows}</ul>` : '';
}

function gearRows(slots, hasGear, honing, optionFacts) {
  const counts = new Map();
  return slots.map(({ slot, item }) => {
    counts.set(slot, (counts.get(slot) || 0) + 1);
    const label = ['귀걸이', '반지'].includes(slot) ? `${slot} ${counts.get(slot)}` : slot;
    if (!item) return `<li class="setupEmpty"><span>${label}</span><span>${hasGear ? '미착용 또는 일부 응답 누락' : '조회 미확인'}</span></li>`;
    const metadata = [item.grade && badge(item.grade, 'setupGrade'),
      item.quality != null && badge(`품질 ${item.quality}`),
      honing && numeric(item.honing) && badge(`재련 +${item.honing}`),
      honing && (numeric(item.advanced) ? badge(`상급 재련 ${item.advanced}단계`) : item.advancedExcluded ? badge('상급 재련 해당 없음') : ''),
      honing && numeric(item.itemLevel) && badge(`Lv.${number.format(item.itemLevel)}`)].filter(Boolean);
    const parsedOptions = optionFacts?.(slot, counts.get(slot)) ?? [];
    const link = slot === '무기' && numeric(item.qualityDamage) ? `<p>계산 반영 완료 · 품질 추가 피해 +${percent(item.qualityDamage)}</p>`
      : parsedOptions.length ? '<p>조건부 적용 · 엔진에서 읽은 장착 효과</p>' + facts(parsedOptions)
      : !honing ? '<p class="hint">미확인 · 이 슬롯의 개별 옵션과 계산 항목이 연결되지 않았습니다.</p>' : '';
    return row(item, label, metadata, details('상세 옵션', link + blocks(item)));
  }).join('');
}

function passiveSection(arkPassive) {
  return `<div class="setupPassiveGrid">${passives.map(name => {
    const points = array(arkPassive?.Points).find(point => point.Name === name);
    const rows = array(arkPassive?.Effects).filter(effect => effect.Name === name).map(effect => {
      const tip = itemTooltip(effect.ToolTip ?? effect.Tooltip);
      return row({ icon: effect.Icon, name: clean(effect.Description) || tip.name }, '', [],
        details('노드 효과', facts(tip.texts)));
    }).join('');
    return `<div><h3>${name}${points && numeric(points.Value) ? ` <small>${number.format(points.Value)}P</small>` : ''}</h3>
      ${itemList(rows) || '<p class="hint">활성 노드 정보 없음</p>'}</div>`;
  }).join('')}</div>`;
}

const gridFields = { critRate: '치명타 적중률', critDamage: '치명타 피해', attackSpeed: '공격 속도',
  moveSpeed: '이동 속도', enemyDamage: '적에게 주는 피해', additionalDamage: '추가 피해' };

export function renderCharacterSetup(output, data, powerEffectRows = () => []) {
  if (!output) return;
  const setup = buildCharacterSetup(data);
  const accessoryFacts = (slot, ordinal) => {
    if (slot === '어빌리티 스톤') return [Number(setup.stoneEffects?.attackPower) ? `공격력 ${percent(setup.stoneEffects.attackPower)}` : '',
      ...array(setup.stoneEffects?.engravings).map(row => `${row.name} Lv.${row.level}`)].filter(Boolean);
    const parsed = slot === '팔찌' ? setup.braceletEffects
      : array(setup.accessoryEffects?.items).filter(item => item.type === slot)[ordinal - 1]?.effects;
    return parsed ? powerEffectRows(parsed).map(option => option.text) : [];
  };
  const gems = setup.gems.map(gem => row(gem, gem.skill || '적용 스킬 미확인',
    [numeric(gem.level) && badge(`Lv.${gem.level}`), gem.kind && badge(gem.kind === 'damage' ? '피해' : '재사용 대기'), gem.bound && badge('귀속')].filter(Boolean),
    facts(gem.texts), 'setupGem')).join('');
  const engravings = setup.engravings.map(engraving => row(engraving, '', [
    engraving.grade && badge(engraving.grade, 'setupGrade'), numeric(engraving.level) && badge(`Lv.${engraving.level}`),
    numeric(engraving.stone) && badge(`스톤 Lv.${engraving.stone}`)].filter(Boolean),
    details('적용 효과', `<p class="hint">${engraving.book ? '조건부 적용 · 각인 모델이 읽은 효과는 적용 조건을 따릅니다.' : '미확인 · 해당 각인 수치의 모델 반영 여부를 확인할 수 없습니다.'}</p>${facts(engraving.texts)}`))).join('');
  const grid = setup.grid.map(core => row(core, '장착 코어', [
    core.grade && badge(core.grade, 'setupGrade'), numeric(core.point) && badge(`${core.point}P`)].filter(Boolean),
    details('활성 효과 및 장착 젬', facts(core.texts) + itemList(core.gems.map(gem => row(gem, '젬', [
      gem.grade && badge(gem.grade), gem.active === true ? badge('활성') : gem.active === false ? badge('비활성') : badge('활성 미확인')
    ].filter(Boolean), details('젬 옵션', blocks(gem)))).join(''))))).join('');
  const calculatedGrid = Object.entries(gridFields).filter(([key]) => Number(setup.gridEngine?.[key])).map(([key, label]) => `${label} ${percent(setup.gridEngine[key])}`);
  const gridOptions = setup.gridEffects.map(effect => clean(effect.Tooltip) || clean(effect.Name)).filter(Boolean);
  const gridDetail = details('젬 합산 및 계산 반영 수치',
    (gridOptions.length ? '<p>공식 API 젬 합산</p>' + facts(gridOptions) : '')
    + (calculatedGrid.length ? '<p>계산 반영 완료 · 코어 공통 보정</p>' + facts(calculatedGrid) : '')
    + (gridOptions.length || calculatedGrid.length ? '<p class="hint">스킬별·발동형 코어 효과는 조건부로 계산하며 적용 여부가 확인되지 않은 효과는 툴팁을 표시합니다.</p>' : ''));
  const cards = setup.cards.map(card => row(card, '', [card.grade && badge(card.grade), numeric(card.awakeCount) && badge(`${card.awakeCount}각성`)].filter(Boolean))).join('');
  const setEffects = [...setup.cardSets.map(set => `${set.name} · ${set.equippedCount}장 · ${set.awakeTotal}각성`),
    ...(setup.cardBonuses.length ? setup.cardBonuses.map(item => `${item.name} · ${item.description}`)
      : setup.rawCardSets.map(item => `${clean(item.Name)} · ${clean(item.Description)}`))];
  const avatars = setup.avatars.map(avatar => row(avatar, avatar.type, [
    avatar.grade && badge(avatar.grade), avatar.isInner === true && badge('내부 장착'), avatar.isSet === true && badge('세트'),
    ...array(avatar.stats).map(stat => badge(`${stat.label} +${stat.value}${stat.unit === 'percent' ? '%' : ''}`))].filter(Boolean),
    details('아바타 정보', blocks(avatar)))).join('');
  output.innerHTML = `<div class="setupGearGrid">
    ${section('착용 장비', itemList(gearRows(setup.gear, setup.hasGear, true)))}
    ${section('장신구 및 팔찌', itemList(gearRows(setup.accessories, setup.hasGear, false, accessoryFacts)))}
    </div>${section('장착 보석', gems ? `<ul class="setupGemGrid">${gems}</ul>` : '', setup.gems.length || null)}
    ${section('장착 각인', itemList(engravings), setup.engravings.length || null)}
    ${section('아크 패시브', passiveSection(setup.arkPassive))}
    ${section('아크 그리드', itemList(grid) + gridDetail)}
    ${section('카드 및 아바타', (cards ? details('장착 카드', itemList(cards)) : '')
      + details('활성 카드 세트 효과', facts(setEffects) + (setEffects.length ? '<p class="hint">조건부 적용 · 공격 속성과 방향, 효과 범위를 반영합니다.</p>' : ''))
      + details('장착 아바타', avatars ? '<p class="hint">계산 대상 아님 · 이 목록의 능력치를 독립 보정으로 가산하지 않습니다.</p>' + itemList(avatars) : ''))}
    ${section('전투 특성', setup.stats.length ? `<dl class="setupStats">${setup.stats.map(stat =>
      `<div><dt>${escape(stat.Type)}</dt><dd>${escape(stat.Value)}</dd></div>`).join('')}</dl>` : '')}`;
}
