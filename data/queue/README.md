# 작업 대기열

다나와 강아지 사료 검색 상위 N개를 수집한 목록이다. **발행 대상이 아니라 조사 순서표**다.

```bash
npm run ranking              # 상위 30개
node scripts/collect-ranking.mjs --top 50
```

## 무엇이 들어있나

| 필드 | 내용 | 출처 |
|---|---|---|
| `rank` | 다나와 노출 순위 | 검색 결과 순서 |
| `name` | 브랜드 포함 상품명 | `prod_name` 링크 텍스트 |
| `price` `wg` `pKg` | 가격·용량·kg당 | 다나와 최저가 |
| `spec.ga` | **조단백·조지방·조섬유·조회분·수분** | 다나와 상품 상세 `[영양정보]` |
| `spec.summary` | 타입·연령·알갱이 크기 등 | 다나와 상세 스펙 |
| `alreadyRegistered` | 이미 `data.js` 에 있는지 | 브랜드·제품명 토큰 대조 |
| `coupangUrl` | 쿠팡 상품 링크 | 다나와 판매몰 중개 (확보 안 될 수 있음) |

## 아직 없는 것

**원재료 목록.** 다나와는 영양정보만 제공하고 전성분표는 싣지 않는다.
루브릭의 `firstIngrCat`(1번 원료 분류)와 `cautionN`·`dangerN`(주의·위험 성분 개수)은
제조사 페이지나 제품 봉투에서 따로 확보해야 한다.

즉 이 대기열만으로는 **탄수화물 점수만** 계산할 수 있다.

## 다음 단계

1. `alreadyRegistered: false` 인 항목을 순위 순으로 처리한다
2. 제조사 페이지에서 원재료 목록을 구한다
3. `.claude/skills/사료-등록/SKILL.md` 규칙대로 `data/staging/` 에 올린다
4. 게이트 → 심사 화면 → 발행

영양정보는 국내 유통 제품 기준이므로 `specOrigin: "domestic"` 으로 등록한다.
