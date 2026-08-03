# 발사탕

광고 없는 반려견 사료 성분 분석. **https://balsatang.com**

성분표만 보고 판단한다. 광고비를 받지 않고, 점수는 사람이 아니라 코드가 매긴다.

## 구조

```
index.html · app.js · app.css      프론트 (사용자가 보는 화면)
data.js                            사료 데이터. 어드민이 이 파일을 고쳐 커밋한다
articles.js                        콘텐츠
engine/                            채점·원료 판정·문구 템플릿 ← 어드민도 이걸 읽는다
scripts/                           수집·게이트·검증·QA
data/staging                       심사 대기 중인 사료
docs/                              운영 가이드 · QA · 데이터 정책
```

**어드민은 따로 있다** — https://admin.balsatang.com ([balsatang-admin](https://github.com/butblank-oss/balsatang-admin))
어드민이 이 저장소의 `data.js` 를 GitHub API 로 직접 고친다. 도메인이 갈린 건
프론트에 XSS 가 나도 어드민 토큰이 새지 않게 하려는 것이다.

`engine/` 은 이 저장소에만 있고 어드민이 `https://balsatang.com/engine/` 에서 읽는다.
옮겨 적으면 두 벌이 되어 반드시 어긋난다.

## 확인

```
npm run check   데이터 검사 (data.js 문법 · 연동 · 게이트)
npm run qa      화면 자동 점검 (죽은 버튼 · 대비 · 한글 입력 · 레이아웃)
```

자세한 건 `docs/운영-가이드.md`.
