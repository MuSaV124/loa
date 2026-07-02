# 로스트아크 4티어/5티어 추천 계산기 - Vercel API 버전

캐릭터명을 입력하면 공식 Lost Ark Open API로 캐릭터 정보를 불러오고, 계산기에 필요한 값을 자동 추출합니다.

## 자동 추출 항목

- 직업명
- 진화 / 깨달음 / 도약 포인트
- 진화형 피해(진피)
- 적에게 주는 피해량(적주피)
- 추가 피해(추피)
- 치명타 적중률(치적)
- 치명타 피해(치피)
- 공격속도(공속)
- 이동속도(이속)

추출 소스는 아크패시브 설명문과 선택된 스킬 트라이포드 설명문입니다.

## Vercel 환경변수

Vercel Project Settings > Environment Variables에 아래 값을 추가하세요.

```env
LOSTARK_API_KEY=새로_발급받은_API키
```

API 키는 GitHub에 올리면 안 됩니다.

## 파일 구조

```text
api/character.js       서버 API. Lost Ark API 호출 및 효과 파싱
public/index.html      화면
public/app.js          검색/렌더링
public/style.css       스타일
vercel.json            Vercel 설정
```

## 배포

1. GitHub 새 저장소 생성
2. 이 폴더 내용을 업로드
3. Vercel에서 해당 GitHub 저장소 Import
4. 환경변수 `LOSTARK_API_KEY` 추가
5. Deploy
