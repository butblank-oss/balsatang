# 스테이징 — 발행 대기 사료

수집 루틴이 여기에 JSON을 올린다. **사람이 발행하기 전까지 사이트에 나가지 않는다.**

## 규칙

- 파일 하나 = 수집 배치 하나. 이름은 `YYYY-MM-DD-collect.json`
- `_` 로 시작하는 파일은 게이트가 건너뛴다 (예시·메모용)
- 형식은 `_example.json` 참고

## 흐름

```
수집 루틴  →  data/staging/2026-08-03-collect.json  →  PR
                          ↓
              게이트 1 (형식·수식·출처·URL 생존)
              게이트 2 (심사 AI 블라인드 재조사 대조)
              게이트 3 (기존 데이터 대비 이상치)
                          ↓
              어드민 심사 화면에서 사람이 확인
                          ↓
              발행 승인  →  balsatang/data.js 로 병합
              반려      →  data/rejected/ 로 이동
```

## 필드

| 키 | 뜻 |
|---|---|
| `proposed` | 수집 AI가 제안한 사료 데이터 |
| `sources` | 근거 출처 목록. `role`: official/importer/retail/authority |
| `evidence` | 값마다 어느 출처(`src` 번호)의 어느 문장(`quote`)인지 |
| `audit` | 심사 AI가 백지에서 다시 조사한 결과와 대조 내역 |
| `gates` | 게이트별 판정 결과 |
| `status` | draft / review / published / rejected / stale |

`evidence` 없이 `sources`만 있는 항목은 게이트 1에서 탈락한다.
