/* 디자인 핸드오프 규칙 검사.

   design_handoff_balsatang_renewal/tokens.json 은 "이 값을 그대로 옮긴다. 임의로
   반올림하거나 근사값으로 바꾸지 말 것" 이라고 못박아 두었다. 사람 눈으로는
   #5F0080 과 #4A0A66 이 둘 다 그냥 보라라서 구분이 안 된다. 기계가 본다.

   검사하는 것 — 실제로 그려진 화면의 계산된 스타일이다. 소스를 읽지 않는다.
     1. 팔레트 밖 색      tokens.color + README 가 값을 못박은 셋(#FAF9FB·#DDD7E3·#A8A2B0)
     2. 금지된 그림자      "앱 내부에는 그림자를 쓰지 않는다". 예외는 썸네일 위 배지 하나
     3. 자간 0            한글은 -2~-4.5% 가 필수다. 브라우저 기본값이 버튼 안에서 이걸 되돌린다
     4. 이미지 웰         카탈로그 이미지는 흰 배경 JPG다. 흰 배경 + 1px 헤어라인이 아니면
                          틴트 위에 흰 사각형 경계가 그대로 드러난다
     5. 가로 넘침         390pt 기준 단일 레이아웃

   실행: node scripts/qa/design.mjs   (npm run qa 에 물려 있다) */
import { serve, launch } from './lib.mjs';

const PORT = 4610;

/* tokens.json 의 색 + README 가 표에 값을 적어 둔 것들.
   후자는 토큰 파일에 없지만 문서가 값을 지정했으므로 팔레트로 인정한다. */
const PALETTE = new Set([
  '#2E0040', '#5F0080', '#8B2FB8', '#C79BE0', '#F3E8FA', '#FBF8FD',
  '#1D3A8A', '#E6EDFB', '#F5F8FE',
  '#17151A', '#4A4552', '#6B6470', '#8A8494', '#9A93A3', '#B4AEBC', '#C6C0CE',
  '#E7E2EC', '#F0EDF3', '#EDEAF0', '#F7F5F9', '#F5F2F7', '#F3F1F6',
  '#1FA97C', '#F1FAF6', '#0F6B4E', '#3E7A65', '#7FE0BC',
  '#E8A33D', '#FEF7EC', '#B87514', '#8A5A14', '#8A7455',
  '#FFFFFF', '#000000',
  /* README 전용 — 비교표 머리 / 빈 별 아웃라인·시트 손잡이 / 각주 회색 / 비활성 버튼 */
  '#FAF9FB', '#DDD7E3', '#A8A2B0', '#EFEDF2'
]);

/* 유일하게 허용되는 바깥 그림자. 이미지 위에 뜨는 배지라 최소한의 분리가 필요하다. */
const ALLOWED_SHADOW = 'rgba(23, 21, 26, 0.08) 0px 1px 4px 0px';

const SCREENS = [
  ['홈', () => { }],
  ['검색', () => go('search')],
  ['상세 · 성분 분석', () => go('detail', { id: FOODS[0].id })],
  ['상세 · 급여량 가격', () => { go('detail', { id: FOODS[0].id }); state.detailTab = 'feeding'; render(); }],
  ['비교', () => { state.compare = [FOODS[0].id, FOODS[1].id]; go('compare'); }],
  ['콘텐츠', () => go('content')],
  ['맞춤 입력', () => go('wizard')]
];

const srv = await serve(PORT);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const pg = await ctx.newPage();
/* 바깥으로 나가는 요청(폰트 CDN, 상품 이미지)은 이 검사와 무관하다. 기다리지 않는다. */
await pg.route('**/*', r => r.request().url().startsWith(`http://127.0.0.1:${PORT}/`)
  ? r.continue() : r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
const pageErrors = [];
pg.on('pageerror', e => pageErrors.push(String(e)));
await pg.addInitScript(() => {
  window.__hex = v => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(v);
    if (!m) return null;
    if (m[4] !== undefined && +m[4] === 0) return null;   // 투명은 검사 대상이 아니다
    return '#' + [1, 2, 3].map(i => (+m[i]).toString(16).padStart(2, '0')).join('').toUpperCase();
  };
});

const rows = [];
for (const [name, nav] of SCREENS) {
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(600);
  await pg.evaluate(`(${nav.toString()})()`);
  await pg.waitForTimeout(500);

  const r = await pg.evaluate(({ pal, okShadow }) => {
    const found = { color: [], shadow: [], tracking: [], well: [] };
    const seen = new Set();
    const once = (k, list, msg) => { if (!seen.has(k)) { seen.add(k); list.push(msg); } };

    for (const el of document.querySelectorAll('#view *, .tabbar *')) {
      const cs = getComputedStyle(el);
      const who = el.tagName.toLowerCase() +
        (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '');

      for (const [prop, v] of [['글자', cs.color], ['배경', cs.backgroundColor], ['테두리', cs.borderTopColor]]) {
        const h = window.__hex(v);
        if (h && !pal.includes(h)) once(h + prop, found.color, `${h} — ${prop} · ${who}`);
      }

      const sh = cs.boxShadow;
      if (sh && sh !== 'none' && !/inset/.test(sh) && sh !== okShadow)
        once('sh' + sh, found.shadow, `${sh} — ${who}`);

      /* 잎 노드에 한글이 있는데 자간이 0 이면 헐거워 보인다 */
      if (!el.children.length && /[가-힣]/.test(el.textContent) &&
        (cs.letterSpacing === 'normal' || parseFloat(cs.letterSpacing) === 0))
        once('ls' + who, found.tracking, `${who} — "${el.textContent.trim().slice(0, 20)}"`);
    }

    /* 이미지 웰: 흰 배경 + 헤어라인이어야 한다 */
    for (const w of document.querySelectorAll('.well')) {
      const cs = getComputedStyle(w);
      if (window.__hex(cs.backgroundColor) !== '#FFFFFF' || !cs.boxShadow.includes('inset'))
        once('well' + w.className, found.well,
          `${window.__hex(cs.backgroundColor)} · 헤어라인 ${cs.boxShadow.includes('inset') ? '있음' : '없음'}`);
    }

    return {
      found,
      wells: document.querySelectorAll('.well').length,
      overX: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  }, { pal: [...PALETTE], okShadow: ALLOWED_SHADOW });

  rows.push({ name, ...r });
}
await browser.close();
srv.close();

/* ── 결과 ── */
console.log('\n디자인 규칙 검사 — design_handoff/tokens.json 기준');
console.log('─'.repeat(64));
let bad = 0;
for (const s of rows) {
  const list = [
    ...s.found.color.map(x => ['팔레트 밖 색 ', x]),
    ...s.found.shadow.map(x => ['금지된 그림자', x]),
    ...s.found.tracking.map(x => ['자간 0      ', x]),
    ...s.found.well.map(x => ['이미지 웰    ', x])
  ];
  if (s.overX > 0) list.push(['가로 넘침    ', `${s.overX}px`]);
  bad += list.length;
  console.log(`  ${list.length ? '❌' : '✅'} ${s.name} — 웰 ${s.wells}개`);
  for (const [k, v] of list) console.log(`       ${k} ${v}`);
}
if (pageErrors.length) { bad += pageErrors.length; console.log('\n  ❌ 페이지 오류'); for (const e of pageErrors.slice(0, 5)) console.log('       ' + e); }
console.log('─'.repeat(64));
console.log(bad ? `  ${bad}건 어긋남\n` : '  일곱 화면 모두 규칙대로입니다\n');
process.exit(bad ? 1 : 0);
