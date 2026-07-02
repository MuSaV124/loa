# LOSTARK 노드 추천 계산기 v1.2.0

## 변경사항

- 인벤 DB 기반 JSON 구조 준비
- 진화 공통 DB `public/data/evolution.json` 추가
- 깨달음/도약 직업별 DB 구조 추가
- API에서 받은 `ArkPassive.Effects[].Name + Level`을 DB와 매칭해 티어별 표시
- 진화 5티어 `뭉툭한 가시`, `입식 타격가` 매핑
- 인벤 DB 생성 스크립트 골격 추가: `scripts/generate-inven-db.js`

## 중요

현재 v1.2.0은 계산값 추천이 아니라 **티어 분류 구조 안정화 버전**입니다.

진화는 전 직업 공통이므로 `public/data/evolution.json`을 확장하면 됩니다.

깨달음/도약은 직업/직업각인별로 다르므로 아래 파일을 계속 추가해야 합니다.

```text
public/data/
├─ evolution.json
├─ enlightenment-breaker-sura.json
└─ leap-breaker.json
```

## 업데이트 방법

1. ZIP 압축 해제
2. GitHub Desktop에서 저장소 폴더 열기
3. 압축 해제된 파일 전체를 저장소 폴더에 덮어쓰기
4. Commit: `v1.2.0`
5. Push origin
6. Vercel 자동 배포 확인