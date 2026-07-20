export function normalizeCalibrationText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function arkGridCoreKey(snapshot) {
  const slots = Array.isArray(snapshot?.arkGrid?.slots) ? snapshot.arkGrid.slots : [];
  return slots
    .map(slot => [slot?.side, slot?.symbol, slot?.name, slot?.grade, slot?.point]
      .map(normalizeCalibrationText)
      .join(':'))
    .join('|');
}

export function arkGridSignature(snapshot) {
  const slots = Array.isArray(snapshot?.arkGrid?.slots) ? snapshot.arkGrid.slots : [];
  return slots
    .map(slot => [
      normalizeCalibrationText(slot?.name),
      normalizeCalibrationText(slot?.grade).replace(/\s*코어$/, ''),
      Number(slot?.point || 0)
    ].join(':'))
    .join('|');
}

export function classSpecSlotLevelKey(snapshot, slot, fromLevel, toLevel) {
  const profile = snapshot?.profile || {};
  return [
    normalizeCalibrationText(profile.className),
    normalizeCalibrationText(profile.secondClass),
    `${normalizeCalibrationText(slot)}:${Number(fromLevel)}:${Number(toLevel)}`
  ].join('||');
}

export function calibrationScopeMatches(row, snapshot) {
  const scope = row?.scope || row;
  if (!scope || !snapshot) return false;
  const profile = snapshot.profile || {};
  const checks = [];
  if (scope.referenceCharacter) {
    checks.push(normalizeCalibrationText(profile.name) === normalizeCalibrationText(scope.referenceCharacter));
  }
  if (scope.className) {
    checks.push(normalizeCalibrationText(profile.className) === normalizeCalibrationText(scope.className));
  }
  if (scope.secondClass) {
    checks.push(normalizeCalibrationText(profile.secondClass) === normalizeCalibrationText(scope.secondClass));
  }
  if (scope.arkGridCoreKey) {
    checks.push(arkGridCoreKey(snapshot) === normalizeCalibrationText(scope.arkGridCoreKey));
  }
  if (scope.arkGridSignature) {
    checks.push(arkGridSignature(snapshot) === normalizeCalibrationText(scope.arkGridSignature));
  }
  return checks.length > 0 && checks.every(Boolean);
}

export function confidenceTier(confidence) {
  if (confidence === 'verified' || confidence === 'reference-verified') return 0;
  if (confidence === 'class-sampled') return 1;
  if (confidence === 'estimated' || confidence === 'class-estimated') return 2;
  return 3;
}
