# XXAPICK 기능 인벤토리

감사 기준은 `xxapick-combat-audit-v3-baseline` (`2de05c2`)이다. 라우트는 `public/page-route.js`와 `vercel.json`, 화면은 `public/index.html`, 동적 카드와 이벤트는 `public/app.js`에서 조사했다. 같은 카드가 라우트에 재사용되면 카드 수는 한 번만 집계한다. 검색 결과 행, 장비 부위별 행, 노드 개별 버튼은 소속 카드의 하위 기능으로 포함한다.

| ID | 페이지 | 카드 또는 사용자 조작 | 소스 진입점 |
| --- | --- | --- | --- |
| H01 | 메인·공통 | 홈 4개 도구 바로가기, 로고, 메인·골드 효율·시세·배율 메뉴 | `homePanel`, `setHomeSearchPage`, `navigatePage` |
| H02 | 메인·공통 | 캐릭터 검색·갱신·재시도, 로딩, 이름 정규화, 캐시 복원, Escape | `searchWorkspace`, `searchCharacter`, `getCharacterResult` |
| H03 | 메인·공통 | 공홈 공지 및 실패 시 공식 목록 링크 | `loadLostarkNoticeCard`, `renderLostarkNoticeCard` |
| H04 | 공통 | 주소 직접 접근, 공유, 뒤로/앞으로, 새로고침, 404·메인 복귀 | `pageRouteFromLocation`, `showPage`, `404.html` |
| C01 | 캐릭터·진화·전투 | 프로필, 서버·직업·빌드·아이템 레벨과 캐릭터 메뉴, 링크 복사 | `renderCharacter`, `renderCharacterNavigation` |
| C02 | 캐릭터·진화 | 계산 요약, 치적·치피·다중 치명·진피·추피·적주피·공증·공이속, 출처 펼치기, 초기화 | `renderCombatStats`, `score`, `buildSourceSummary` |
| C03 | 캐릭터·진화 | 깨달음·도약, 적용 범위, 중복 확인 | `extractEnlightenmentEffects`, `enlightenmentAppliedDetailHtml` |
| C04 | 캐릭터·진화 | 어빌리티 스톤·각인서, 각인·팔찌·악세·그리드·카드 출처 | `renderCombatStats`, `getBaseStats` |
| C05 | 캐릭터·진화 | 예리한 둔기 전설/유물, 장착·미장착 비교, 스킬별 조건 | `renderKeenEfficiency` |
| N01 | 진화 | 추가 효과, 7개 수치 입력, 치적 시너지 10/20, 헤드/백 가정, 아드레날린·대체 각인 및 유물 책 레벨, 스킬·트라이포드 요약 | `inputPanel`, `getBaseStats`, `renderSkillEffectControl` |
| N02 | 진화 | 진화 1~5티어, 포인트/상한, 증감·Shift·우클릭·키보드·툴팁, 재계산 | `renderEvolutionTiers`, `recalculateSelectedSettings` |
| N03 | 진화·전투 | 추천 세부 설정, 단타·쿨감 제외·비마나 주력기·수동 지분 | `recommendAdvanced`, `prepareSkillScoring` |
| N04 | 진화·전투 | 서포터 4종·없음, 고급 마나, 자동 스킬 비용/쿨, 수동 시전·후딜·이벤트·음식·회복·중첩·가동률 | `manaEnvironment`, `manaScenarioPanel`, `renderManaEnvironment` |
| N05 | 진화·전투 | TOP5 이론·300초 실측·300초 추정·부족·보류, 마나 N/A, 감도 비교 | `calculateAndRender`, `createManaRanking` |
| N06 | 진화·전투 | 공격 성향과 스킬별 방향 적중률 비교, 조건부 기대 피해 | `readAttackRates`, `attackOutcomes`, `candidateDetailsHtml` |
| N07 | 진화·전투 | API 원본 기준, 현재 배율, API 대비, 카드 정체성·회복 근거 | `calculateAndRender`, `renderArcanaIdentityNote` |
| N08 | 진화·전투 | 조합 상세, 티어 칩과 노드별 효과, 스킬별 피해·치적·치피·지분·쿨타임, 마나 지속성·부족 시점·최소 MP | `candidateDetailsHtml`, `evaluateManaCandidate` |
| B01 | 전투·시뮬레이터 | 현재 스킬 사이클, 스킬별 지분·기본/장착 쿨·보석·트포·룬·그리드·변신 연동 | `renderSkillCyclePanel`, `buildSkillCycleModel` |
| S01 | 시뮬레이터 | 캐릭터 없는 랜딩, 검색, 계산기로 돌아가기, 시세 상태 | `simulatorLanding`, `renderPowerSnapshot`, `renderMarketFreshness` |
| S02 | 시뮬레이터 | 효율 순위, 전체·일반·상급·악세·보석·각인 필터, 신뢰도·누락 설명·더 보기 | `renderSpecEfficiencyShell`, `renderSpecEfficiencyTable` |
| S03 | 시뮬레이터 | 목표 전투력 / 예산 스펙업 경로, 비용·실링·제외 사유 | `renderSpecPlannerOutput`, `buildUpgradePlan` |
| S04 | 시뮬레이터 | A/B 선택·저장·복원·공유·해제, 중복 장비, 공식 전투력/기대 피해/치적/치피/공이속/비용 | `renderSpecScenarioComparison`, `specScenarioEquipment` |
| S05 | 시뮬레이터 | 일반 무기 및 방어구 성장·재련, 책·숨결·장인의 기운·시도 확률 | `calculateNextNormalRefineEstimates`, `renderNormalGearGrowthCostTable`, `renderNormalRefineAttemptCostTable` |
| S06 | 시뮬레이터 | 상급 무기·방어구 재련, 배율·단계·촉매·책·기대 비용 | `calculateNextAdvancedHoningEstimates`, `renderAdvancedHoningAttemptCostTable` |
| S07 | 시뮬레이터 | 장착 보석 및 귀속, 겁화·작열 후보, 합성 수량과 교체 효율 | `renderPowerSnapshot`, `calculateGemSpecEstimates`, `gemFusionPurchaseCount` |
| S08 | 시뮬레이터 | 장착 각인·각인서·돌, 유물 각인서 후보 | `renderPowerEngravingPanel`, `calculateEngravingSpecEstimates`, `adjustedEngravingEffects` |
| S09 | 시뮬레이터 | 악세 장착·연마 옵션·동일 슬롯 교체·페온 적용 | `renderPowerAccessoryRow`, `calculateAccessorySpecEstimates`, `accessoryDamageInput` |
| S10 | 시뮬레이터 | 장착 팔찌, 전투 특성 및 파싱된 효과 | `renderPowerBraceletRow` |
| S11 | 시뮬레이터 | 장비 원자료, 부위·품질·강화·상급 강화·스탯·현재 장비 규칙 | `renderPowerEquipmentRow`, `renderPowerCostPrep` |
| S12 | 시뮬레이터 | 장착 아크그리드 코어·젬·포인트·효과 | `renderPowerArkGridPanel`, `extractArkGridSnapshot` |
| S13 | 시뮬레이터 | 서포터 파티 기여, 공증·낙인·아이덴티티·케어 및 복합 지표 | `renderSupportContributionPanel`, `supportContributionModel` |
| S14 | 시뮬레이터 | T4 비용, 거래/귀속·묶음·보유 수량·보유량 저장·실링/골드·시세 누락 | `renderPowerCostPrep`, `calculateHoningMaterialCost`, `materialPurchaser` |
| S15 | 시뮬레이터 | 페온과 100 크리스탈 골드 환산·수동 입력·품목 규칙 | `updatePheonGoldSummary`, `hydrateCrystalPrice` |
| S16 | 시뮬레이터 | 완갑 재련·구간·노숨/최적/풀숨, 장기백·한계 해방·단계별 숨결·전투력 | `renderArmguardExpectedCost`, `calculateArmguardRangeExpectedCost` |
| S17 | 시뮬레이터 | 방법과 주의사항 접기·펼치기 | `.simulatorMethodNote` |
| M01 | 시세 | 6개 범주·주소·탭 상태·갱신 시간과 오래된 시세 표시 | `renderMarketSubTab`, `renderMarketFreshness` |
| M02 | 시세 | 악세 부위·조합·검색·최저가·거래 상태·필터 및 디버그 펼치기 | `searchMarketAccessory`, `renderMarketResults` |
| M03 | 시세 | 아바타 직업 선택·부위 요약·한 벌 최저가·조회 안내·새로고침 | `loadLegendAvatarSet`, `renderLegendAvatarResult` |
| M04 | 시세 | 유물 각인서 조회·새로고침·누락 | `loadMarketEngravingList`, `renderEngravingPriceGrid` |
| M05 | 시세 | 보석 5~10렙, 겁화·작열 및 새로고침 | `loadMarketGemList`, `renderGemPriceGrid` |
| M06 | 시세 | 4T 재료·아크그리드 젬, 단위/묶음·갱신 실패 보존 | `loadMarketMaterialList`, `renderMaterialPriceGrid` |
| M07 | 시세 | 크리스탈 시세·출처·환산·새로고침 | `loadMarketCrystalPrice`, `renderCrystalMarketPrice` |
| R01 | 배율 | 직업·빌드 검색, 코어·전투분석 지분, 출처와 빈 상태 | `renderRatioPanel`, `findCombatAnalyzerProfile` |

집계 대상은 43개 기능 단위다. 팔찌·아크그리드는 장착 조회와 계산 반영을 검사한다. 팔찌 교체, 아크그리드 교체, 아크 패시브를 독립 상품으로 구매하는 시뮬레이터는 소스에 없다. 진화 노드 변경은 추천 페이지와 시뮬레이터의 A/B 비교 경로에 있다. 시세 갱신 서버와 Workflow는 변경 범위에서 제외하며 하위 함수와 격리 응답으로 검증한다.
