# 로스트아크 4티어/5티어 추천 계산기 - Vercel 버전

캐릭터명을 입력하면 Vercel Serverless Function이 로스트아크 공식 Open API를 호출하고, 프론트 화면에 추천 입력값을 자동 반영하는 구조입니다.

## 파일 구조

```txt
api/character.js      # 로아 Open API 호출 서버 함수. API 키는 여기서만 사용됩니다.
public/index.html     # 화면
public/app.js         # 검색/렌더링/추천 표시
public/style.css      # 스타일
.env.example          # 환경변수 예시
vercel.json           # Vercel 설정
package.json
```

## Vercel 배포 방법

1. GitHub에 이 폴더 전체를 업로드합니다.
2. Vercel에서 `Add New Project`를 누르고 해당 GitHub 저장소를 선택합니다.
3. Project Settings > Environment Variables에 아래 값을 추가합니다.

```env
LOSTARK_API_KEY=새로_재발급받은_API키
```

4. Deploy를 누릅니다.
5. 배포 주소에서 캐릭터명을 검색합니다.

## 중요

- API 키는 GitHub에 올리면 안 됩니다.
- 이미 채팅에 노출한 키는 삭제하거나 재발급하세요.
- 현재 추천 로직은 기본 골격입니다. 기존 계산기의 4티어/5티어 세부 공식이 있으면 `api/character.js`의 `makeRecommendation()`에 연결하면 됩니다.
