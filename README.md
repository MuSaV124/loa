# LOSTARK 진화 노드 추천 계산기 v1.7.0

## 변경 사항
- 진화 노드를 티어별 다중 선택 방식으로 변경했습니다.
- 1티어는 노드당 Lv.30까지, 총 40P까지 선택됩니다.
- 2티어는 기본 Lv.2까지, `한계 돌파`와 `축복의 여신`만 Lv.3까지 선택됩니다.
- 3티어는 Lv.2, 4티어는 Lv.1, 5티어는 Lv.2까지 선택됩니다.
- 치명타 확률 표시는 80%에서 멈추지 않고 실제 합산값 그대로 표시합니다.
- `뭉툭한 가시` 전환 표기를 `뭉가 전환`으로 수정했습니다.
- 5티어 추천 비교는 기존 5티어를 하나로 교체하는 방식으로 계산합니다.

## 아이콘 이미지 넣는 위치
아이콘 파일은 아래 폴더에 넣으면 됩니다.

```txt
public/images/evolution/
```

예시:

```txt
public/images/evolution/crit.png
public/images/evolution/blunt-thorn.png
public/images/evolution/standup-striker.png
```

이미지를 넣은 뒤 `public/data/evolution.json`에서 각 노드의 `iconImage` 값을 파일명에 맞게 바꾸면 됩니다.

```json
{
  "name": "뭉툭한 가시",
  "iconImage": "/images/evolution/blunt-thorn.png"
}
```

PNG, JPG, WEBP, SVG 모두 가능합니다.
