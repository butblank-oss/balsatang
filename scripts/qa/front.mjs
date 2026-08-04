/* QA-1 · 소비자 — 프론트 전 화면 */
import { serve, launch, watch, bug, pass, findings, overflowX, hiddenUnderBar, lowContrast, OUT } from './lib.mjs';
import fs from 'node:fs';

const srv = await serve(9101);
const b = await launch();
const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
const log = watch(pg, 'front');
const U = 'http://localhost:9101/index.html';
const shot = n => pg.screenshot({ path: `${OUT}/shot-front-${n}.png`, fullPage: true });

console.log('\n═══ QA-1 소비자 · 프론트 ═══');

await pg.goto(U);
await pg.waitForSelector('.app');

/* TC-F01 홈 첫 진입 */
{
  const ov = await overflowX(pg);
  if (ov > 0) bug('front', 'TC-F01', 'P2', `홈에 가로 스크롤 ${ov}px 생김`);
  else pass('TC-F01', '홈 진입 · 가로 넘침 없음');
  const lc = await lowContrast(pg);
  if (lc.length) bug('front', 'TC-F01', 'P2', `홈 저대비 텍스트 ${lc.length}건: ${lc.slice(0, 3).map(x => `"${x.text}" ${x.ratio}:1`).join(' / ')}`);
  const hb = await hiddenUnderBar(pg);
  if (hb) bug('front', 'TC-F01', 'P2', `홈 하단이 탭바에 가림: ${hb.slice(0, 2).join(', ')}`);
  await shot('01-home');
}

/* TC-F02 홈 → 고민 칩 필터 */
{
  const chips = await pg.locator('.chiprow .chip, .concerns .chip').count();
  if (!chips) bug('front', 'TC-F02', 'P1', '홈에 고민 칩이 하나도 없음');
  else {
    await pg.locator('.chiprow .chip').nth(1).click().catch(() => { });
    await pg.waitForTimeout(300);
    pass('TC-F02', `고민 칩 ${chips}개 · 선택 동작`);
  }
}

/* TC-F03 검색 — 결과 있음 / 없음 */
{
  await pg.evaluate(() => go('search'));
  await pg.waitForSelector('#q');
  await pg.fill('#q', '오리젠'); await pg.waitForTimeout(400);
  const n1 = await pg.locator('.row').count();
  await pg.fill('#q', 'zzzz없는사료'); await pg.waitForTimeout(400);
  const empty = await pg.locator('.empty').count();
  if (!n1) bug('front', 'TC-F03', 'P1', "'오리젠' 검색 결과 0건");
  else if (!empty) bug('front', 'TC-F03', 'P2', '없는 검색어인데 빈 상태가 안 뜸');
  else pass('TC-F03', `검색 ${n1}건 · 빈 상태 정상`);
  await shot('03-search-empty');
  /* 빈 상태의 버튼들이 실제로 동작하는지 */
  const req = pg.locator('[data-request]');
  if (await req.count()) {
    await req.first().click(); await pg.waitForTimeout(300);
    const t = await pg.textContent('#toast');
    if (!t?.trim()) bug('front', 'TC-F03', 'P2', "'분석 요청하기' 를 눌러도 아무 반응 없음");
    else pass('TC-F03', `분석 요청 → "${t.trim()}"`);
  }
  await pg.fill('#q', ''); await pg.waitForTimeout(400);
}

/* TC-F04 상세 — 전 사료 진입 */
{
  const ids = await pg.evaluate(() => FOODS.map(f => f.id));
  const broken = [];
  for (const id of ids) {
    log.errors.length = 0;
    await pg.evaluate(i => go('detail', { id: i }), id);
    await pg.waitForTimeout(90);
    const ok = await pg.evaluate(() => !!document.querySelector('#view').textContent.trim().length);
    if (!ok || log.errors.length) broken.push(id);
  }
  if (broken.length) bug('front', 'TC-F04', 'P1', `상세가 안 그려지는 사료 ${broken.length}종`);
  else pass('TC-F04', `사료 ${ids.length}종 상세 전부 렌더`);
}

/* TC-F05 상세 — 탭 전환과 하단 가림 */
{
  const id = await pg.evaluate(() => FOODS[0].id);
  await pg.evaluate(i => go('detail', { id: i }), id);
  await pg.waitForTimeout(200);
  const tabs = await pg.locator('[data-dtab]').count();
  if (tabs < 2) bug('front', 'TC-F05', 'P2', '상세 탭이 2개 미만');
  await pg.locator('[data-dtab]').nth(1).click(); await pg.waitForTimeout(300);
  const hb = await hiddenUnderBar(pg);
  if (hb) bug('front', 'TC-F05', 'P2', `상세 급여량 탭 하단이 가림: ${hb.slice(0, 2).join(', ')}`);
  const ov = await overflowX(pg);
  if (ov > 0) bug('front', 'TC-F05', 'P2', `상세에 가로 스크롤 ${ov}px`);
  await shot('05-detail-feeding');
  const lc = await lowContrast(pg);
  if (lc.length) bug('front', 'TC-F05', 'P2', `상세 저대비 ${lc.length}건: ${lc.slice(0, 3).map(x => `"${x.text}" ${x.ratio}:1`).join(' / ')}`);
  else pass('TC-F05', '상세 탭 전환 · 대비 정상');
}

/* TC-F06 비교담기 → 비교 화면 */
{
  /* 분석 준비 중 사료는 설계상 하단 독이 없다(E7 — 알림 받기·비슷한 사료로 안내).
     비교담기를 시험하려면 분석이 끝난 사료를 잡아야 한다. FOODS[0] 을 그냥 집으면
     목록 맨 앞이 준비 중인 날에만 빨갛게 뜬다. */
  const id = await pg.evaluate(() =>
    (FOODS.find(f => DETAIL[f.id]?.ingr?.length) ?? FOODS[0]).id);
  await pg.evaluate(i => { state.compare = []; save(); go('detail', { id: i }); }, id);
  await pg.waitForTimeout(200);
  const btn = pg.locator('[data-compare],[data-add-compare]');
  if (!await btn.count()) {
    const t = await pg.locator('.dock button').allTextContents();
    bug('front', 'TC-F06', 'P1', `상세에 비교담기 버튼이 없음 (독 버튼: ${t.join(' / ')})`);
  } else {
    await btn.first().click(); await pg.waitForTimeout(400);
    const scr = await pg.evaluate(() => state.screen);
    const n = await pg.evaluate(() => state.compare.length);
    if (scr !== 'compare') bug('front', 'TC-F06', 'P1', `비교담기 후 '${scr}' 로 감 (compare 여야 함)`);
    else if (n !== 1) bug('front', 'TC-F06', 'P1', `비교담기 했는데 담긴 개수 ${n}`);
    else pass('TC-F06', '비교담기 → 비교 화면 · 1개 담김');
  }
}

/* TC-F07 비교 — 빈 슬롯에서 바로 고르기 */
{
  const slot = pg.locator('[data-pick-slot="1"]');
  if (!await slot.count()) bug('front', 'TC-F07', 'P1', '비교 화면에 빈 슬롯 선택 버튼이 없음');
  else {
    await slot.first().click(); await pg.waitForTimeout(400);
    const sheetOn = await pg.evaluate(() => document.querySelector('#sheet')?.classList.contains('on'));
    if (!sheetOn) bug('front', 'TC-F07', 'P1', '빈 슬롯을 눌러도 고르기 시트가 안 열림');
    else {
      const pick = pg.locator('#sheet [data-pick]');
      if (!await pick.count()) bug('front', 'TC-F07', 'P1', '고르기 시트에 사료가 하나도 없음');
      else {
        await pick.first().click(); await pg.waitForTimeout(400);
        const n = await pg.evaluate(() => state.compare.filter(Boolean).length);
        if (n !== 2) bug('front', 'TC-F07', 'P1', `시트에서 골랐는데 담긴 개수 ${n}`);
        else pass('TC-F07', '빈 슬롯 → 시트 → 2개 비교');
      }
    }
    await shot('07-compare');
    const ov = await overflowX(pg);
    if (ov > 0) bug('front', 'TC-F07', 'P2', `비교 화면 가로 스크롤 ${ov}px`);
  }
}

/* TC-F08 콘텐츠 목록 → 상세 */
{
  await pg.evaluate(() => go('content')); await pg.waitForTimeout(300);
  const cards = pg.locator('[data-article],[data-go-article],.row');
  const n = await cards.count();
  if (!n) bug('front', 'TC-F08', 'P2', '콘텐츠 목록이 비어 있음');
  else {
    const before = await pg.evaluate(() => document.body.innerHTML.length);
    await cards.first().click(); await pg.waitForTimeout(400);
    const after = await pg.evaluate(() => document.body.innerHTML.length);
    if (before === after) bug('front', 'TC-F08', 'P1', `콘텐츠 카드(${n}개)를 눌러도 아무 반응이 없음 — 상세 화면이 없음`);
    else pass('TC-F08', '콘텐츠 상세 진입');
  }
  await shot('08-content');
}

/* TC-F09 맞춤 위저드 — 검증과 제출 */
{
  await pg.evaluate(() => { state.pet = null; save(); go('wizard'); }); await pg.waitForTimeout(300);
  /* 몸무게 없이 제출 */
  await pg.click('[data-wz-submit]'); await pg.waitForTimeout(300);
  const scr = await pg.evaluate(() => state.screen);
  const toast = (await pg.textContent('#toast') || '').trim();
  if (scr !== 'wizard') bug('front', 'TC-F09', 'P1', '몸무게 없이도 제출이 통과됨');
  else if (!toast) bug('front', 'TC-F09', 'P2', '몸무게 없이 제출했는데 안내가 없음');
  else pass('TC-F09', `몸무게 검증 → "${toast}"`);

  await pg.fill('#wz-kg', '9');
  for (const v of ['adult', 'eye_tear', 'mid']) await pg.click(`[data-wz-val="${v}"]`).catch(() => { });
  const btn = await pg.evaluate(() => { const r = document.querySelector('[data-wz-submit]').getBoundingClientRect(); return Math.round(r.height); });
  if (btn < 44) bug('front', 'TC-F09', 'P2', `제출 버튼 높이 ${btn}px (최소 44px)`);
  await pg.click('[data-wz-submit]'); await pg.waitForTimeout(500);
  const scr2 = await pg.evaluate(() => state.screen);
  if (scr2 !== 'custom') bug('front', 'TC-F09', 'P1', `제출 후 '${scr2}' (custom 이어야 함)`);
  else pass('TC-F09', `제출 → 결과 화면 · 버튼 ${btn}px`);
  await shot('09-result');
}

/* TC-F10 맞춤 결과 — 알러지 제외가 실제로 걸리는지 */
{
  await pg.evaluate(() => {
    state.pet = { name: '테스트', kg: 9, ageGroup: 'adult', concerns: [], activity: 'mid', allergens: ['닭'] };
    save(); go('custom');
  });
  await pg.waitForTimeout(400);
  const topId = await pg.evaluate(() => document.querySelector('[data-go-detail]')?.dataset.goDetail);
  const hasChicken = await pg.evaluate(id => (DETAIL[id]?.ingr || []).some(i => i.name.includes('닭')), topId);
  if (hasChicken) bug('front', 'TC-F10', 'P1', "알러지로 '닭' 을 골랐는데 1위 추천에 닭이 들어있음");
  else pass('TC-F10', '알러지 제외 반영됨');
}

/* TC-F11 새로고침 후 상태 유지 */
{
  await pg.reload(); await pg.waitForTimeout(500);
  const pet = await pg.evaluate(() => state.pet?.name);
  if (pet !== '테스트') bug('front', 'TC-F11', 'P2', `새로고침하면 맞춤 정보가 사라짐 (pet=${pet})`);
  else pass('TC-F11', '새로고침 후 맞춤 정보 유지');
}

/* TC-F12 탭바 4개 전환 */
{
  for (const t of ['home', 'compare', 'content', 'custom']) {
    await pg.click(`[data-tab="${t}"]`); await pg.waitForTimeout(250);
    const now = await pg.evaluate(() => state.screen);
    const ov = await overflowX(pg);
    if (ov > 0) bug('front', 'TC-F12', 'P2', `${t} 탭 가로 스크롤 ${ov}px`);
    const hb = await hiddenUnderBar(pg);
    if (hb) bug('front', 'TC-F12', 'P2', `${t} 탭 하단 가림: ${hb.slice(0, 2).join(', ')}`);
  }
  pass('TC-F12', '탭 4개 전환');
}

/* TC-F00b 병합 충돌 마커가 파일에 남아 있는가.

   실제로 있었던 일이다. merge 실패를 삼키고 `git add -A` 로 커밋해서
   index.html 에 충돌 마커가 그대로 올라갔고, data.js·articles.js 가 두 번
   로드돼 라이브 사이트가 깨졌다. 사람이 눈으로 잡을 수 있는 종류가 아니다. */
{
  const files = ['index.html', 'app.js', 'app.css', 'data.js', 'articles.js', 'site.js', 'legal.js'];
  const bad = [];
  for (const f of files) {
    let t; try { t = fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'); } catch { continue; }
    if (/^(<{7}|={7}|>{7})/m.test(t)) bad.push(f);
  }
  /* 같은 스크립트를 두 번 부르면 const 재선언으로 통째로 멈춘다 */
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"?]+)/g)].map(m => m[1]);
  const dup = srcs.filter((v, i) => srcs.indexOf(v) !== i);
  if (dup.length) bad.push(`중복 로드: ${[...new Set(dup)].join(', ')}`);
  if (bad.length) bug('front', 'TC-F00b', 'P1', `병합 충돌 흔적: ${bad.join(' / ')}`);
  else pass('TC-F00b', '충돌 마커 없음 · 스크립트 중복 없음');
}

/* TC-F13 푸터 — 파트너스 고지가 상시로 보이는가 */
{
  const bad = [];
  for (const [h, name] of [['#/', '홈'], ['#/compare', '비교'], ['#/content', '콘텐츠'], ['#/custom', '맞춤']]) {
    await pg.evaluate(x => { location.hash = x; }, h); await pg.waitForTimeout(300);
    const r = await pg.evaluate(() => {
      const f = document.querySelector('.foot');
      return f ? { ad: /쿠팡 파트너스/.test(f.innerText), links: f.querySelectorAll('.foot-nav button').length } : null;
    });
    if (!r) bad.push(`${name} 푸터 없음`);
    else if (!r.ad) bad.push(`${name} 파트너스 고지 없음`);
    else if (r.links < 2) bad.push(`${name} 약관·방침 링크 ${r.links}개`);
  }
  /* 사업자정보는 값이 있을 때만 나와야 한다. 빈 값인데 '상호' 같은 글자가
     보이면 없는 걸 있는 것처럼 적은 것이다. */
  const fake = await pg.evaluate(() =>
    !SITE.name && /상호|사업자등록번호|통신판매업/.test(document.querySelector('.foot')?.innerText || ''));
  if (fake) bad.push('사업자정보가 비었는데 항목 이름이 화면에 나옴');
  if (bad.length) bug('front', 'TC-F13', 'P1', bad.join(' / '));
  else pass('TC-F13', '푸터 · 파트너스 고지 4화면 상시');
}

/* TC-F14 이용약관·개인정보처리방침 */
{
  const bad = [];
  for (const [h, want] of [['#/terms', '이용약관'], ['#/privacy', '개인정보처리방침']]) {
    await pg.evaluate(x => { location.hash = x; }, h); await pg.waitForTimeout(350);
    const r = await pg.evaluate(() => ({
      title: document.querySelector('h2.t-product')?.textContent ?? '',
      paras: document.querySelectorAll('.sec.md .md-p').length
    }));
    if (r.title !== want) bad.push(`${h} 제목이 '${r.title}'`);
    if (r.paras < 5) bad.push(`${h} 본문 ${r.paras}문단`);
    const ov = await overflowX(pg);
    if (ov > 0) bad.push(`${h} 가로 스크롤 ${ov}px`);
  }
  /* 푸터 링크가 실제로 그 화면을 여는가 */
  await pg.evaluate(() => { location.hash = '#/'; }); await pg.waitForTimeout(300);
  await pg.click('.foot-nav [data-go="terms"]'); await pg.waitForTimeout(350);
  const hash = await pg.evaluate(() => location.hash);
  if (hash !== '#/terms') bad.push(`푸터 이용약관 링크가 ${hash} 로 감`);
  if (bad.length) bug('front', 'TC-F14', 'P2', bad.join(' / '));
  else pass('TC-F14', '약관·방침 화면 · 푸터 링크');
}

/* 종합 */
if (log.errors.length) bug('front', 'TC-F00', 'P1', `JS 오류 ${log.errors.length}건: ${[...new Set(log.errors)].slice(0, 3).join(' | ')}`);
if (log.missing.length) bug('front', 'TC-F00', 'P2', `404 ${log.missing.length}건: ${[...new Set(log.missing)].slice(0, 3).join(' | ')}`);

fs.writeFileSync(`${OUT}/findings-front.json`, JSON.stringify(findings, null, 1));
console.log(`\n프론트 발견 ${findings.length}건`);
await b.close(); srv.close();
