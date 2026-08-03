# 브랜드 로고

여기에 파일을 넣고 `balsatang/index.html` 의 `BRAND_LOGO` 에 등록하면
이니셜 마크 대신 로고가 나온다. 파일이 없거나 로드에 실패하면 자동으로 마크로 되돌아간다.

## 넣는 법

1. 파일을 `{brandSlug}.svg` 로 저장한다 (png·webp도 됨)
2. `index.html` 의 `BRAND_LOGO` 에 한 줄 추가

```js
const BRAND_LOGO = {
  'royal-canin': 'assets/brands/royal-canin.svg',
  orijen: 'assets/brands/orijen.svg'      // ← 이렇게
};
```

슬러그는 `data.js` 의 `brandSlug` 값과 정확히 같아야 한다.
현재 값: `orijen` `acana` `royal-canin` `ziwipeak` `harim` `instinct`

## 출처 규칙

로고는 상표다. 아래 중 하나만 쓴다.

- 제조사 공식 **미디어킷 / 브랜드 가이드**
- 국내 수입사에게 받은 파일
- 라이선스가 명시된 곳 (예: Wikimedia Commons의 Public domain)

**쓰지 않는 것:** 구글 이미지 검색 결과, 나무위키 등 위키 CDN, 블로그.
캐시 URL이라 수시로 만료되고, 남의 서버 대역폭을 쓰며, 출처가 불분명하다.

## 현재 파일

| 파일 | 브랜드 | 출처 | 라이선스 |
|---|---|---|---|
| `royal-canin.svg` | 로얄캐닌 | Wikimedia Commons | Public domain |

나머지 브랜드는 이니셜 마크로 표시된다.
