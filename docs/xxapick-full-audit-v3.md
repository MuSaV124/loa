# XXAPICK 3차 전수 감사

기준은 `2de05c2`이며 감사 작업은 `codex/xxapick-combat-audit-v3`에서 진행한다. 화면·이벤트 집계 기준과 사용자 조작은 [전체 기능 인벤토리](xxapick-feature-inventory.md)에 있다. 전체 43개 기능 단위에 대해 검증 결과를 기록한다. PASS는 계산과 기능에 대해 필요한 증거가 모두 있는 경우, FAIL은 재현 가능한 오류가 남은 경우, PARTIAL은 검증된 경로와 미검증 경로가 함께 있는 경우, UNKNOWN은 판정 근거 부족, N/A는 적용 대상 없음이다.

## 자료와 검증 방법

- 기존 감사의 103개 응답 중 클래스·빌드·스킬이 있는 99개를 격리 재생한다. 실제 장착 빌드 기준 30직업·60빌드다. 원본 응답과 시세 파일은 `tmp`에서 사용하며 저장소에 추가하지 않는다. 시세 표본은 공개 GET으로 내려받은 응답이며 미리보기용 입력으로만 사용한다. [OpenAPI 명세](https://developer-lostark.game.onstove.com/api-docs) · [공격 판정 감사 v2](combat-attack-audit-v2.md)
- 11월 18일 다중 치명과 밸런스, 11월 19일·20일 핫픽스, 11월 25일 점검 및 11월 26일 알려진 이슈를 확인했다. 11월 25일 장신구 변경은 게임 UI에 이전 연마 단계가 남는 현상 수정이다. 새 시즌 장비 이관 공지는 사전 안내다. [11월 18일](https://lostark.game.onstove.com/News/Notice/Views/13598) · [11월 19일](https://lostark.game.onstove.com/News/Notice/Views/13601) · [11월 20일](https://lostark.game.onstove.com/News/Notice/Views/13603) · [11월 25일](https://lostark.game.onstove.com/News/Notice/Views/13606) · [11월 26일](https://lostark.game.onstove.com/News/Notice/Views/13605) · [2부 사전 안내](https://lostark.game.onstove.com/News/Notice/Views/13608)
- 공식 전투력은 장착 상태의 `ArmoryProfile.CombatPower`와 대조한다. 변경 후 공식 전투력은 게임 내 같은 직업·세팅·강화 구간의 전후 표본 또는 공개 산식이 필요하다. 계산기의 기대 피해 및 환산 전투력은 표본 모델로만 검산한다. [OpenAPI 변경 이력](https://developer-lostark.game.onstove.com/changelog)
- 재련 범위는 일반·상급 및 완갑이다. 완갑 15→16의 공식 기본 확률 3%, 성장 파편 328,000개, 재련 1회 9,280G를 공식 표와 교차 확인했다. 장인의 기운 계수와 숨결 부분 배분은 구현상의 전제다. 완갑 중간 단계 능력치와 전투력은 공식 공개 능력치 기준점 사이의 보간 및 변환이다. [완갑 공식 재련 표](https://lostark.game.onstove.com/News/Notice/Views/13508#anchor-1785742364253) · [공식 아이템 사전](https://lostark.game.onstove.com/ItemDictionary?key=134301106)
- 장착 수치와 스킬 지분에는 공식 원본, 전투분석 프리셋, 추정 수치가 각각 들어간다. 공홈이 제공하지 않는 실측 방향 적중률, 타격 분할 지분, 개인 DPS, 주문·룬 발동률, 실전 회복 타임라인은 관측되지 않았다. 가정 기반 이론과 300초 실측 검증을 구분한다. [계산 구조](calculation-engine.md)
- 읽기 전용 시세 조회에서 보석·유각·재료 기준 시각은 11월 26일 06:57 KST였다. LOSPI 크리스탈 호출은 403으로 기록됐고 10월 4일 11:00 KST 시세가 남았다. 재료·보석·유각과 크리스탈의 기준 시각은 다르며, 격리 실행에서는 같은 스냅샷을 시장 페이지와 시뮬레이터에 공급했다. [공개 시세 스냅샷](https://loa-beige.vercel.app/api/market-snapshot)

## 교차 계산과 수정

| 검산 | 독립 기준과 결과 |
| --- | --- |
| 다중 치명·피해 묶음 | 치피 250%에서 치적 90/100/120/200/220/300%의 배율 2.35/2.50/2.80/4.00/4.30/5.50을 별도 난수 표본과 대조했다. 치적 220%, 뭉툭한 가시 상한 80%, 초과 치적 전환율 1.4, 기존 진피 19%의 예는 `(0.2 + 0.8 × 2.5) × 3.15 = 6.93`이다. |
| 중복 피해·페온 | 적주피 5%·10%를 `1.05 × 1.10`으로 곱한 예와 악세 슬롯별 출처 교체를 대조했다. 예상 피해 `after = null`은 계산 불가, 확인된 `after = 0`은 -100%다. 100크리스탈 3,000G, 1페온 8크리스탈의 예는 240G/페온이다. 필요 페온 가격이 미확인인 악세 후보는 효율표에서 제외한다. |
| 일반 재련 | 시행 확률을 생존 확률과 곱한 뒤 천장 확률을 더하고, `Σ(성공까지 시도 × 해당 확률)`을 독립 난수 실험으로 대조했다. 고정 골드 및 귀속을 차감한 묶음 구매비는 시도 횟수 분포에 따라 따로 계산한다. |
| 상급·완갑 비용 | 일반·대성공과 특수 단계 진행량을 전이 확률로 평가한다. 단계별 재료 합계의 독립 기준은 `test-advanced-honing-math.mjs`, `test-armguard-honing.mjs`에 있다. 완갑 0→25 구간 계산은 T4 비용 펼치기에서 시작하도록 변경했다. |
| 예산과 효율 | 골드 비용을 상승률로 나눠 같은 지표 내 오름차순으로 비교한다. 10만 골드당 효율은 `상승률 × 100,000 ÷ 골드`다. 장신구 한 슬롯에 두 대안이 있을 때 같은 슬롯을 한 번만 비용에 합산한다. 독립 검산에서 40G와 60G 두 슬롯은 100G이고, 같은 슬롯 100G 대안을 추가하지 않는다. |
| 캐릭터 전환·캐시 | 신규 응답과 재접속에 같은 방향 각인 원문을 전달하도록 경량 필드를 추가했다. 이름 없는 응답은 오류 경로를 타고, 캐릭터별 목표·예산·완갑 단계와 후보 필터는 전환 시 기본값 또는 해당 캐릭터의 이전 입력을 적용한다. 분석 탭에서 시뮬레이터 전용 후보 API를 미리 요청하던 경로를 제거했다. |
| 시세 실패 보존 | 서버 스냅샷 보존 로직은 기존 단위 테스트로 재검증했다. 브라우저에서 보석·유각·재료·크리스탈 API 503을 격리 주입한 뒤 카드별 마지막 가격이 남는 것을 확인했다. 새 응답이 데이터 검사를 통과하지 못하면 UI의 시각도 실제 유지된 섹션 기준을 사용한다. |

## 카드별 판정

아래 표의 브라우저 증거는 별도로 명시된 경우 이외에는 격리 API를 사용한 로컬 실행 기준이다. 상세 정량 증거는 `scripts/audit-xxapick-v3.mjs`가 기록하는 JSON에 있다.

| ID | 페이지 · 카드 | 출처 · 계산/검산 | UI·오류·수정 및 남은 근거 | 판정 |
| --- | --- | --- | --- | --- |
| H01 | 메인 · 도구/메뉴 | HTML과 `navigatePage`의 링크·라우트 대응 | 홈 4개 버튼 및 주요 메뉴, Preview 확인 대기 | PARTIAL |
| H02 | 공통 · 검색/갱신 | `getCharacterResult`의 프로필·캐시, 502·503 경로 | 오류 재시도와 이름 정규화, 원본 프로필 누락 처리 추가 | PARTIAL |
| H03 | 공통 · 공식 공지 | `renderLostarkNoticeCard`, 공홈 링크 및 제목 | 격리 공지 응답, 원격 카드 확인 대기 | PARTIAL |
| H04 | 공통 · 라우팅 | `pagePath`/`readPageRoute`, 공유 URL·404 | 뒤로/앞으로·새로고침·404 케이스, Preview 확인 대기 | PARTIAL |
| C01 | 캐릭터 · 프로필 | `parseCharacterArmory`와 `renderCharacter`, 공식 프로필 필드 대조 | 검색된 캐릭터와 링크 복사, 원격 재조회 대기 | PARTIAL |
| C02 | 캐릭터 · 계산 요약 | `score` → `expectedHitDamage`, 스킬별 가중 및 숫자 포맷 | 출처 펼치기·노드 초기화, 실전 적용률 미확인 | PARTIAL |
| C03 | 캐릭터 · 깨달음·도약 | `extractEnlightenmentEffects`, 중복 문구 제외와 스킬 범위 | 상세 기본 경로, 조건부 효과 전수 실측 미확인 | PARTIAL |
| C04 | 캐릭터 · 장착 효과 | `getBaseStats`, 돌·각인·악세·그리드·팔찌·카드 API 툴팁 | 각인 원문 캐시 보존 추가, 방향 각인별 실측 미확인 | PARTIAL |
| C05 | 캐릭터 · 예리한 둔기 | `renderKeenEfficiency`, 장착 단계별 공통 엔진 비율 | 전설/유물 표시, 회심 중첩과 실전 지분 미확인 | PARTIAL |
| N01 | 진화 · 추가 효과 | `getBaseStats`, 사용자가 입력한 치적·피해·속도 및 각인 | 표시와 재계산 적용 비교, 기존 적용 버튼 경로 유지 | PARTIAL |
| N02 | 진화 · 노드 | `evolutionAllocations` 1~5T 레벨·포인트와 `shiftClickTargetLevel` | 마우스·키보드·툴팁·재계산 및 초기화 | PARTIAL |
| N03 | 진화/전투 · 추천 입력 | `prepareSkillScoring`, 쿨감 및 지분으로 가중 | 단타·쿨감 제외, 스킬 지분의 실측 범위 부족 | PARTIAL |
| N04 | 진화/전투 · 마나 환경 | `renderManaEnvironment`, 공식/수동 회복과 스킬 비용 | 서포터·수동 MP·회복 조건 적용, 자연 회복 실측 부족 | PARTIAL |
| N05 | 진화/전투 · TOP5 | `createManaRanking`, 같은 유형 내 배율 내림차순 | 이론과 300초 구분, 전 빌드 실제 전투 자료 없음 | PARTIAL |
| N06 | 진화/전투 · 방향 적중률 | `attackOutcomes` 미적중·헤드·백 결과의 가중 평균 | 전투 페이지에 재계산 버튼 노출, 입력·합계 경계 테스트, 실전 적중률과 타격별 지분 부족 | PARTIAL |
| N07 | 진화/전투 · API 기준 | `calculateAndRender`, API/선택 조합의 같은 엔진 비교 | 배율 소수 네 자리·미확인 표시, 조건부 지분 부족 | PARTIAL |
| N08 | 진화/전투 · 조합 상세 | `candidateDetailsHtml`, 마나 지연과 사용 횟수, 스킬별 피해 기여 | 상세 접기/펼치기, 실제 300초 입력 미확보 | PARTIAL |
| B01 | 전투/시뮬레이터 · 사이클 | `buildSkillCycleModel`, 스킬·신속·보석·트포·그리드·룬 | 양 페이지 동일 스킬 행, 분석 지분은 프리셋 | PARTIAL |
| S01 | 시뮬레이터 · 랜딩/복귀 | `renderPage` 및 캐릭터 주소·시세 초기 상태 | 진입/복귀, 시뮬레이터 렌더의 분석 탭 API 호출 제거 | PARTIAL |
| S02 | 시뮬레이터 · 효율 순위 | `specEfficiencyScore`, 골드/상승률 및 지표별 순위 | 유형 필터와 더 보기, 신뢰도별 증거 차이 | PARTIAL |
| S03 | 시뮬레이터 · 예산/목표 | `buildUpgradePlan`, 누적 골드·실링·전투력과 중복 슬롯 제약 | 입력 시 바로 재계산, 포커스가 이동할 때 다음 클릭을 잃는 경로와 0G 예산 복원 수정 | PARTIAL |
| S04 | 시뮬레이터 · A/B | `specScenarioEquipment`, 공통 엔진 전후 비율 및 보석 지분 | 선택·공유·저장·복원, NULL 피해 변화 수정 | PARTIAL |
| S05 | 시뮬레이터 · 일반 재련 | `normalHoningAttemptDistribution`, 생존 확률·천장·묶음 소모 | 다음 단계·가격 확인, 공식 전투력 상승 실측 전 구간 미확보 | PARTIAL |
| S06 | 시뮬레이터 · 상급 재련 | `optimizeAdvancedHoning`, 성공 상태 전이와 촉매·책 비용 | 단계·후보 UI, 최신 게임 전 구간의 실제 사용 비용 미확보 | PARTIAL |
| S07 | 시뮬레이터 · 보석 | API 슬롯·레벨·스킬·귀속, `gemFusionPurchaseCount` 및 변경 피해/쿨 가중 | 고정 11개 문구 수정 및 귀속 개수 표시, 실제 피해 전후 미확보 | PARTIAL |
| S08 | 시뮬레이터 · 각인/각인서 | 장착 등급·레벨, `relicEngravingEffect`와 전후 기대 피해 | 분류/후보와 장착 정보, 조건부 효과의 실전 충족률 미확보 | PARTIAL |
| S09 | 시뮬레이터 · 장신구 | `accessoryDamageInput`, 슬롯 교체·거래가+페온 | 가격 누락이 0페온으로 효율에 들어가던 경로 수정 | PARTIAL |
| S10 | 시뮬레이터 · 팔찌 | 장착 API와 `renderPowerBraceletRow`, 피해·특성 추출 | 조회 전용, 방향·부분 타격 실측 미확보 | PARTIAL |
| S11 | 시뮬레이터 · 장비 파싱 | `parseEquipmentSnapshotItem`, 장착 부위 및 품질·툴팁 | 상세 펼치기, 모든 옵션 툴팁 세대와 장비 재련 결과 미확인 | PARTIAL |
| S12 | 시뮬레이터 · 아크그리드 | `extractArkGridSnapshot`, 코어·젬 및 `passive-skill-effects` | 장착 상세, 확률/상태/스택의 전 케이스 미확보 | PARTIAL |
| S13 | 시뮬레이터 · 서포터 | `supportContributionModel`, 상시·풀·가동률 가중, 복합 30/60/10 | 서포터만 표시, 실제 낙인 중첩과 가동률 미확보 | PARTIAL |
| S14 | 시뮬레이터 · 재료 비용 | `materialPurchaser`, 필요량–보유량, 묶음 수에 등록가 적용 | 귀속 입력과 시세 경고, 실제 구매 체결과 재고 깊이 미확보 | PARTIAL |
| S15 | 시뮬레이터 · 페온 | `updatePheonGoldSummary`, 크리스탈 단가×페온당 수량 | 수동 입력을 늦은 응답이 덮어쓰는 경로 수정, LOSPI 새 시세 미확인 | PARTIAL |
| S16 | 시뮬레이터 · 완갑 | `calculateArmguardRangeExpectedCost`, 천장·귀속·장비 성장 | 현재/목표·숨결 옵션, 공홈의 숨결 규칙 및 전투력 실측 부족 | PARTIAL |
| S17 | 시뮬레이터 · 방법 안내 | `simulatorMethodNote`, 엔진·가격·주기 설명 | 접기/펼치기 및 모델 설명, Preview 확인 대기 | PARTIAL |
| M01 | 시세 · 분류/신선도 | `marketFreshness`와 적용된 스냅샷 시각 | 보존된 가격과 갱신 시간 맞춤, Preview 확인 대기 | PARTIAL |
| M02 | 시세 · 악세 | `/markets`·`/auctions`, 부위·옵션과 최저 등록가 | 성공·빈 결과의 디버그 펼침, 실제 판매 거래가 미확보 | PARTIAL |
| M03 | 시세 · 아바타 | `loadLegendAvatarSet`, 4개 부위 최저 등록가 합산 | 직업 선택 경합 방지, 실 API 매물 교차 검산 대기 | PARTIAL |
| M04 | 시세 · 유각 | `renderEngravingPriceGrid`, 가격 내림차순 | 503에서도 가격표 보존, 실 API 매물 교차 검산 대기 | PARTIAL |
| M05 | 시세 · 보석 | `renderGemPriceGrid`, 5~10레벨별 겁화·작열 가격 | 503에서도 가격표 보존, 실 API 매물 교차 검산 대기 | PARTIAL |
| M06 | 시세 · 재료·젬 | `renderMaterialPriceGrid`, 최저 등록가와 묶음 단가 | 503에도 가격·갱신 상태를 유지, 실 API 매물 교차 검산 대기 | PARTIAL |
| M07 | 시세 · 크리스탈 | `renderCrystalMarketPrice`, LOSPI 1시간 종가 | 503에서도 가격카드 보존, 공개 응답은 LOSPI 403으로 이전 값 사용 | PARTIAL |
| R01 | 배율 · 직업 데이터 | `renderRatioPanel`, 직업·빌드·코어별 대표 전투분석 | 필터와 빈 상태, 게시된 배율의 게임 내 최신 실측 미확인 | PARTIAL |

## 재현

```powershell
npm test
npm run test:ui
npm run build
git diff --check
node scripts/audit-xxapick-v3.mjs tmp/attack-audit-v2-armories.json tmp/xxapick-v3-market-input.json tmp/xxapick-v3-audit.json
```

`ui` 또는 `builds` 인수를 추가하면 별도로 실행한다. 테스트에서 사용한 서버는 Vercel의 페이지 rewrite와 앱 소스를 제공하고, API별 격리 응답을 공급한다. 운영 `/api/refresh-market-cache`는 호출하지 않는다. 현재 Preview 전체 검증과 게임 내 전후 실측은 완료 근거가 없다.
