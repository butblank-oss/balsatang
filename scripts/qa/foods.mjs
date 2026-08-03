/* QA-2 · 운영자 — 사료 관리(GitHub 커밋) */
import { serve, launch, watch, bug, pass, findings, overflowX, lowContrast, brokenImages, ROOT, OUT } from './lib.mjs';
import fs from 'node:fs';

const srv = await serve(9102);
const b = await launch();
const DATA = fs.readFileSync(ROOT + '/data.js', 'utf8');
const U = 'http://localhost:9102/balsatang/admin/foods.html';
console.log('\n═══ QA-2 운영자 · 사료 관리 ═══');

let put = null, getCount = 0, failNextPut = null;
async function open({ token = 't', canWrite = true } = {}) {
  const pg = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const log = watch(pg, 'foods');
  await pg.route('https://api.github.com/**', route => {
    const u = route.request().url(), m = route.request().method();
    if (u.endsWith('/repos/butblank-oss/gsso_scat'))
      return route.fulfill({ json: { full_name: 'butblank-oss/gsso_scat', permissions: { push: canWrite } } });
    if (m === 'GET') { getCount++; return route.fulfill({ json: { content: Buffer.from(DATA, 'utf8').toString('base64'), sha: 'sha0000000' } }); }
    if (m === 'PUT') {
      put = JSON.parse(route.request().postData());
      if (failNextPut) { const s = failNextPut; failNextPut = null; return route.fulfill({ status: s, json: { message: 'is at 111 but expected 222' } }); }
      return route.fulfill({ json: { content: { sha: 'sha1111111' }, commit: { sha: 'c0ffee1234' } } });
    }
    return route.fulfill({ status: 404, json: { message: 'unmocked' } });
  });
  await pg.addInitScript(t => { if (t) localStorage.setItem('balsatang.gh.token', t); else localStorage.removeItem('balsatang.gh.token'); }, token);
  pg.on('dialog', d => d.accept());
  await pg.goto(U);
  return { pg, log };
}

/* TC-A01 토큰 없이 진입 */
{
  const { pg } = await open({ token: '' });
  await pg.waitForTimeout(500);
  const txt = await pg.textContent('#wrap');
  if (!/토큰/.test(txt)) bug('foods', 'TC-A01', 'P1', '토큰 없이 열었는데 안내가 없음');
  else pass('TC-A01', '토큰 없음 → 안내 표시');
  const rows = await pg.locator('tbody tr').count();
  if (rows) bug('foods', 'TC-A01', 'P1', '토큰 없이도 데이터가 보임');
  await pg.close();
}

/* TC-A02 쓰기 권한 없는 토큰 */
{
  const { pg } = await open({ canWrite: false });
  await pg.waitForTimeout(500);
  const txt = await pg.textContent('#wrap');
  if (!/권한/.test(txt)) bug('foods', 'TC-A02', 'P2', '읽기 전용 토큰인데 경고가 없음');
  else pass('TC-A02', '읽기 전용 토큰 → 경고');
  await pg.close();
}

/* 이하 정상 토큰 */
const { pg, log } = await open();
await pg.waitForSelector('tbody tr');

/* TC-A03 목록·필터·카운트 */
{
  const rows = await pg.locator('tbody tr').count();
  const chips = await pg.locator('[data-filter]').allTextContents();
  if (rows !== 55) bug('foods', 'TC-A03', 'P2', `목록 ${rows}행 (data.js 는 55종)`);
  else pass('TC-A03', `목록 ${rows}행 · 필터 ${chips.length}개`);
  for (const c of chips) {
    const k = c.trim();
    const btn = pg.locator('[data-filter]').filter({ hasText: k.split(' ')[0] }).first();
    await btn.click(); await pg.waitForTimeout(200);
    const n = await pg.locator('tbody tr').count();
    const want = Number(k.match(/(\d+)$/)?.[1]);
    const emptyState = await pg.locator('.empty').count();
    if (want === 0 && !emptyState) bug('foods', 'TC-A03', 'P2', `'${k}' 는 0건인데 빈 상태가 안 뜸`);
    if (want > 0 && n !== want) bug('foods', 'TC-A03', 'P2', `필터 '${k}' 표시 ${want} vs 실제 ${n}행`);
  }
  await pg.locator('[data-filter="all"]').click(); await pg.waitForTimeout(200);
  pass('TC-A03', '필터 카운트와 실제 행 수 일치');
  await pg.screenshot({ path: `${OUT}/shot-foods-01-list.png` });
}

/* TC-A04 썸네일 판정이 실제와 맞는지 */
{
  const wrong = await pg.evaluate(() =>
    S.foods.filter(f => f.thumb && !/^https:\/\//.test(f.thumb)).map(f => `${f.brand} ${f.name} → ${f.thumb}`));
  if (wrong.length) bug('foods', 'TC-A04', 'P1',
    `못 불러오는 썸네일 주소인데 '썸네일 없음' 으로 안 잡힘 ${wrong.length}건: ${wrong[0]}`);
  else pass('TC-A04', '썸네일 주소 전부 https');
  const broken = await brokenImages(pg);
  if (broken.length > 3) bug('foods', 'TC-A04', 'P3', `목록에서 안 뜨는 이미지 ${broken.length}건 (샌드박스 네트워크 영향일 수 있음)`);
}

/* TC-A05 편집 패널 열기 */
{
  await pg.locator('tbody tr').first().click();
  await pg.waitForSelector('#panel.on');
  const title = await pg.textContent('#panelTitle');
  if (!title.trim()) bug('foods', 'TC-A05', 'P2', '패널 제목이 비어 있음');
  const fields = await pg.locator('#panelBody [data-k]').count();
  if (fields < 8) bug('foods', 'TC-A05', 'P2', `편집 필드가 ${fields}개뿐`);
  else pass('TC-A05', `패널 열림 "${title}" · 필드 ${fields}개`);
  const lc = await lowContrast(pg);
  if (lc.length) bug('foods', 'TC-A05', 'P2', `패널 저대비 ${lc.length}건: ${lc.slice(0, 3).map(x => `"${x.text}" ${x.ratio}:1`).join(' / ')}`);
  await pg.screenshot({ path: `${OUT}/shot-foods-02-panel.png` });
}

/* TC-A06 가격 수정 → kg당·별점 재계산 안내 */
{
  await pg.fill('[data-k="price.p"]', '30000');
  await pg.waitForTimeout(200);
  const d = (await pg.textContent('#derived')).replace(/\s+/g, ' ');
  const wg = await pg.inputValue('[data-k="price.wg"]');
  const want = Math.round(30000 / Number(wg) * 1000);
  if (!d.includes(want.toLocaleString('ko-KR'))) bug('foods', 'TC-A06', 'P1', `kg당 계산 틀림 — 기대 ${want} / 표시 "${d}"`);
  else pass('TC-A06', `가격 수정 → kg당 ${want.toLocaleString('ko-KR')}원`);
}

/* TC-A07 값 되돌리면 '수정함' 도 풀려야 함 */
{
  const orig = await pg.evaluate(() => JSON.parse(S.orig.get(S.cur.id)).price.p);
  await pg.fill('[data-k="price.p"]', String(orig));
  await pg.waitForTimeout(200);
  const dirty = await pg.evaluate(() => dirtyList().length);
  if (dirty !== 0) bug('foods', 'TC-A07', 'P2', `원래 값으로 되돌렸는데 수정함 ${dirty}건으로 남음`);
  else pass('TC-A07', '원래 값 복귀 → 수정함 해제');
}

/* TC-A08 잘못된 값은 커밋을 막는지 */
{
  const cases = [
    ['[data-k="price.buyUrl"]', 'https://smartstore.naver.com/x', '쿠팡'],
    ['[data-k="brand"]', '', '브랜드'],
    ['[data-k="thumb"]', 'ftp://x/y.jpg', '썸네일']
  ];
  for (const [sel, val, expect] of cases) {
    const before = await pg.inputValue(sel);
    await pg.fill(sel, val); await pg.waitForTimeout(150);
    await pg.click('#panelDone'); await pg.waitForTimeout(200);
    put = null;
    await pg.click('#commit'); await pg.waitForTimeout(400);
    const t = (await pg.textContent('#toast') || '').trim();
    if (put) bug('foods', 'TC-A08', 'P1', `잘못된 값(${val || '빈값'})인데 커밋이 나감`);
    else if (!t.includes(expect)) bug('foods', 'TC-A08', 'P2', `막긴 했는데 안내가 모호함: "${t}"`);
    await pg.locator('tbody tr').first().click(); await pg.waitForSelector('#panel.on');
    await pg.fill(sel, before); await pg.waitForTimeout(150);
  }
  pass('TC-A08', '잘못된 구매링크·빈 브랜드·잘못된 썸네일 전부 커밋 차단');
  await pg.click('#panelDone');
}

/* TC-A09 정상 커밋 → 파일 두 줄만 바뀌는지 */
{
  await pg.locator('tbody tr').first().click(); await pg.waitForSelector('#panel.on');
  await pg.fill('[data-k="price.buyUrl"]', 'https://link.coupang.com/a/QATEST');
  await pg.click('#panelDone'); await pg.waitForTimeout(200);
  put = null;
  await pg.click('#commit'); await pg.waitForTimeout(700);
  if (!put) bug('foods', 'TC-A09', 'P1', '정상 값인데 커밋이 안 나감');
  else {
    const text = Buffer.from(put.content, 'base64').toString('utf8');
    const a = DATA.split('\n'), c = text.split('\n');
    const diff = a.map((l, i) => l !== c[i] ? i + 1 : null).filter(Boolean);
    if (a.length !== c.length) bug('foods', 'TC-A09', 'P1', `줄 수가 달라짐 ${a.length}→${c.length}`);
    else if (diff.some(n => n !== 1 && n !== 3)) bug('foods', 'TC-A09', 'P1', `선언 줄(1·3) 말고 ${diff.join(',')} 행도 바뀜`);
    else pass('TC-A09', `커밋 · ${diff.join('·')}행만 변경 · 메시지 "${put.message.split('\n')[0]}"`);
    if (/__reScore/.test(text)) bug('foods', 'TC-A09', 'P2', '내부용 임시 필드(__reScore)가 파일에 새어나감');
    /* 커밋한 결과가 실제로 유효한 data.js 인지 */
    try {
      const sc = new Function(`${text}; return {FOODS_ALL,FOODS,DETAIL,ICONS}`)();
      if (sc.FOODS_ALL.length !== 55) bug('foods', 'TC-A09', 'P1', `커밋 결과 사료 ${sc.FOODS_ALL.length}종`);
    } catch (e) { bug('foods', 'TC-A09', 'P1', `커밋 결과가 실행되지 않음: ${e.message}`); }
  }
  const dockHidden = await pg.locator('#dock').isHidden();
  if (!dockHidden) bug('foods', 'TC-A09', 'P2', '커밋 후에도 수정함 표시가 남음');
}

/* TC-A10 충돌(409) 처리 */
{
  await pg.locator('tbody tr').first().click(); await pg.waitForSelector('#panel.on');
  await pg.fill('[data-k="price.buyUrl"]', 'https://link.coupang.com/a/QACONFLICT');
  await pg.click('#panelDone'); await pg.waitForTimeout(200);
  failNextPut = 409;
  await pg.click('#commit'); await pg.waitForTimeout(700);
  const t = (await pg.textContent('#toast') || '').trim();
  if (!/다른 곳|새로고침/.test(t)) bug('foods', 'TC-A10', 'P2', `409 안내가 불친절함: "${t}"`);
  else pass('TC-A10', `충돌 → "${t}"`);
  const stillDirty = await pg.evaluate(() => dirtyList().length);
  if (!stillDirty) bug('foods', 'TC-A10', 'P1', '커밋 실패했는데 수정 내용이 사라짐');
  else pass('TC-A10', '커밋 실패 후에도 수정 내용 보존');
  const btn = await pg.textContent('#commit');
  if (!btn.includes('커밋')) bug('foods', 'TC-A10', 'P2', `실패 후 버튼 글자가 "${btn}" 로 남음`);
}

/* TC-A11 되돌리기 */
{
  await pg.click('#revert'); await pg.waitForTimeout(400);
  const n = await pg.evaluate(() => dirtyList().length);
  if (n) bug('foods', 'TC-A11', 'P2', `되돌리기 후에도 ${n}건 남음`);
  else pass('TC-A11', '되돌리기 동작');
}

/* TC-A12 화면 밖으로 넘치는지 / 좁은 화면 */
{
  const ov = await overflowX(pg);
  if (ov > 0) bug('foods', 'TC-A12', 'P3', `넓은 화면에서 가로 스크롤 ${ov}px`);
  await pg.setViewportSize({ width: 430, height: 900 }); await pg.waitForTimeout(300);
  const ov2 = await overflowX(pg);
  if (ov2 > 0) bug('foods', 'TC-A12', 'P2', `좁은 화면(430px)에서 가로로 ${ov2}px 넘침 — 휴대폰에서 쓰기 어려움`);
  else pass('TC-A12', '좁은 화면에서도 넘치지 않음');
  await pg.screenshot({ path: `${OUT}/shot-foods-03-narrow.png` });
  await pg.setViewportSize({ width: 1280, height: 900 });
}

if (log.errors.length) bug('foods', 'TC-A00', 'P1', `JS 오류 ${log.errors.length}건: ${[...new Set(log.errors)].slice(0, 2).join(' | ')}`);
fs.writeFileSync(`${OUT}/findings-foods.json`, JSON.stringify(findings, null, 1));
console.log(`\n사료 관리 발견 ${findings.length}건`);
await b.close(); srv.close();
