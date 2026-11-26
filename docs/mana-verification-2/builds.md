# 60빌드 최대 마나·자연 회복·스킬 증거

한국 Armory 보관 시각 2026-11-25T08:20:41.607Z, 캐릭터 99개, 스킬 행 2394개. 공식 Swagger v1.

- 프로필 스키마 CharacterImage, ExpeditionLevel, TownLevel, TownName, Title, GuildMemberGrade, GuildName, UsingSkillPoint, TotalSkillPoint, Stats, Tendencies, CombatPower, Decorations, HonorPoint, ServerName, CharacterName, CharacterLevel, CharacterClassName, ItemAvgLevel
- 능력치 스키마 Type, Value, Tooltip. 실제 능력치 유형 치명, 특화, 제압, 신속, 인내, 숙련, 최대 생명력, 공격력.
- 상세 엔드포인트 /armories/characters/{characterName}/profiles와 통합 응답을 같은 스키마와 대조했다.

표의 자연 회복, 틱과 고갈 시간은 포털 캡처에 없다. 표에서 특수 자원만 확인되는 기공사·브레이커·인파이터의 MP 분석은 N/A다.

| 직업 / 빌드 | 표본 | 전투 레벨 | 최대 MP·자연 회복량·틱 | MP / 대체·무료 / UNKNOWN | 재분류한 기존 UNKNOWN |
|---|---:|---|---|---:|---:|
| 가디언나이트 / 드레드 로어 | 3 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 0 / 33 / 39 | 39 |
| 가디언나이트 / 업화의 계승자 | 2 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 0 / 22 / 26 | 26 |
| 건슬링어 / 사냥의 시간 | 3 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 72 / 0 / 12 | 12 |
| 건슬링어 / 피스메이커 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 24 / 0 / 4 | 4 |
| 기공사 / 무상신공 | 1 | 70 | N/A | 0 / 6 / 16 | 16 |
| 기공사 / 역천지체 | 1 | 70 | N/A | 0 / 6 / 16 | 16 |
| 기상술사 / 이슬비 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 18 / 0 / 4 | 4 |
| 기상술사 / 질풍노도 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 18 / 0 / 4 | 4 |
| 데모닉 / 멈출 수 없는 충동 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 19 / 0 / 13 | 13 |
| 데모닉 / 완벽한 억제 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 19 / 0 / 13 | 13 |
| 데빌헌터 / 전술 탄환 | 3 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 75 / 0 / 12 | 12 |
| 데빌헌터 / 핸드거너 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 25 / 0 / 4 | 4 |
| 도화가 / 만개 | 2 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 36 / 0 / 8 | 8 |
| 도화가 / 회귀 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 18 / 0 / 4 | 4 |
| 디스트로이어 / 분노의 망치 | 2 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 38 / 0 / 8 | 8 |
| 디스트로이어 / 중력 수련 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 19 / 0 / 4 | 4 |
| 리퍼 / 갈증 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 0 / 0 / 23 | 23 |
| 리퍼 / 달의 소리 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 0 / 0 / 23 | 23 |
| 바드 / 절실한 구원 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 19 / 0 / 4 | 4 |
| 바드 / 진실된 용맹 | 2 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 38 / 0 / 8 | 8 |
| 발키리 / 빛의 기사 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 20 / 0 / 4 | 4 |
| 발키리 / 해방자 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 20 / 0 / 4 | 4 |
| 배틀마스터 / 오의 강화 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 14 / 6 / 4 | 4 |
| 배틀마스터 / 초심 | 2 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 28 / 12 / 8 | 8 |
| 버서커 / 광기 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 20 / 0 / 4 | 4 |
| 버서커 / 광전사의 비기 | 2 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 40 / 0 / 8 | 8 |
| 브레이커 / 권왕파천무 | 2 | 70 | N/A | 0 / 40 / 8 | 8 |
| 브레이커 / 수라의 길 | 2 | 70 | N/A | 0 / 40 / 8 | 8 |
| 블래스터 / 포격 강화 | 2 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 36 / 0 / 18 | 18 |
| 블래스터 / 화력 강화 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 18 / 0 / 9 | 9 |
| 블레이드 / 버스트 | 2 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 40 / 0 / 8 | 8 |
| 블레이드 / 잔재된 기운 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 20 / 0 / 4 | 4 |
| 서머너 / 넘치는 교감 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 18 / 1 / 4 | 5 |
| 서머너 / 상급 소환사 | 3 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 54 / 3 / 12 | 15 |
| 소서리스 / 점화 | 3 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 54 / 0 / 12 | 12 |
| 소서리스 / 환류 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 18 / 0 / 4 | 4 |
| 소울이터 / 그믐의 경계 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 18 / 0 / 4 | 4 |
| 소울이터 / 만월의 집행자 | 3 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 54 / 0 / 12 | 12 |
| 스카우터 / 아르데타인의 기술 | 2 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 0 / 22 / 38 | 38 |
| 스카우터 / 진화의 유산 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 0 / 11 / 19 | 19 |
| 스트라이커 / 오의난무 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 14 / 6 / 4 | 4 |
| 스트라이커 / 일격필살 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 14 / 6 / 4 | 4 |
| 슬레이어 / 처단자 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 20 / 0 / 4 | 4 |
| 슬레이어 / 포식자 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 20 / 0 / 4 | 4 |
| 아르카나 / 황제의 칙령 | 3 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 57 / 0 / 12 | 12 |
| 아르카나 / 황후의 은총 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 19 / 0 / 4 | 4 |
| 워로드 / 고독한 기사 | 3 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 57 / 0 / 12 | 12 |
| 워로드 / 전투 태세 | 2 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 38 / 0 / 8 | 8 |
| 인파이터 / 극의: 체술 | 3 | 70 | N/A | 0 / 60 / 12 | 12 |
| 인파이터 / 충격 단련 | 2 | 70 | N/A | 0 / 40 / 8 | 8 |
| 차원술사 / 공간 검사 | 2 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 36 / 0 / 8 | 8 |
| 차원술사 / 시간 관리자 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 18 / 0 / 4 | 4 |
| 창술사 / 절정 | 4 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 88 / 0 / 16 | 16 |
| 창술사 / 절제 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 22 / 0 / 4 | 4 |
| 호크아이 / 두 번째 동료 | 2 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 40 / 0 / 8 | 8 |
| 호크아이 / 죽음의 습격 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 20 / 0 / 4 | 4 |
| 홀리나이트 / 심판자 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 20 / 0 / 4 | 4 |
| 홀리나이트 / 축복의 오라 | 1 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 20 / 0 / 4 | 4 |
| 환수사 / 야성 | 3 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 54 / 0 / 12 | 12 |
| 환수사 / 환수 각성 | 2 | 70 | UNKNOWN / UNKNOWN / UNKNOWN | 34 / 0 / 6 | 6 |

## 기존 583개 행 재분류

| 사유 | 행 |
|---|---:|
| 각성기 비용 행 생략 | 198 |
| 대체 자원 회복·충전 문구 · MP 비용 행 생략 | 93 |
| 리퍼 비용 행 생략 · 페르소나/혼돈과 구분 | 38 |
| 명시 대체 자원 · 정령의 구슬 | 4 |
| 상태·아이덴티티 조건 표기 · MP 비용 행 생략 | 17 |
| 스킬 설명으로 바로 이어짐 · MP 비용 행 생략 | 37 |
| 초각성기 비용 행 생략 | 196 |
