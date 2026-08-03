/* QA-4 · 운영자 — 예전 어드민 전 페이지
   QA-5 · 횡단 — 눌러도 아무 일 없는 버튼 찾기 */
import { serve, launch, watch, bug, pass, findings, overflowX, lowContrast, OUT } from './lib.mjs';
import fs from 'node:fs';

const srv = await serve(9104);
const b = await launch();
const U = 'http://localhost:9104/balsatang/admin/index.html';
console.log('\n═══ QA-4 운영자 · 예전 어드민 ═══');

const pg = await b.newPage({ viewport: { width: 1400, height: 950 } });
const log = watch(pg, 'admin');
pg.on('dialog', d => d.accept());
await pg.goto(U);
await pg.waitForSelector('.nav-i');

const PAGES = [['dash', '대시보드'], ['foods', '사료 관리'], ['ingr', '성분 관리'],
['tags', '맞춤찾기 태그'], ['recall', '리콜 관리'], ['price', '가격 관리'],
['article', '콘텐츠'], ['review', '리뷰 관리']];

/* TC-B01 전 페이지 진입 */
{
  const empty = [];
  for (const [k, label] of PAGES) {
    log.errors.length = 0;
    await pg.evaluate(x => go(x), k);
    await pg.waitForTimeout(300);
    const txt = (await pg.textContent('#wrap')).trim();
    const title = await pg.textContent('#pgTitle');
    if (!txt) empty.push(label);
    if (log.errors.length) bug('admin', 'TC-B01', 'P1', `${label} 진입 시 JS 오류: ${log.errors[0]}`);
    if (!title.trim()) bug('admin', 'TC-B01', 'P3', `${label} 화면 제목이 비어 있음`);
    const ov = await overflowX(pg);
    if (ov > 0) bug('admin', 'TC-B01', 'P3', `${label} 가로 넘침 ${ov}px`);
  }
  if (empty.length) bug('admin', 'TC-B01', 'P1', `내용이 비어 있는 화면: ${empty.join(', ')}`);
  else pass('TC-B01', `${PAGES.length}개 화면 전부 렌더`);
}

/* TC-B02 눌러도 아무 일 없는 버튼 — 페이지마다 훑는다 */
{
  const deadAll = {};
  for (const [k, label] of PAGES) {
    await pg.evaluate(x => go(x), k);
    await pg.waitForTimeout(300);
    const btns = pg.locator('#wrap button:visible');
    const n = Math.min(await btns.count(), 24);
    const dead = [];
    for (let i = 0; i < n; i++) {
      await pg.evaluate(x => go(x), k);            /* 매번 같은 자리에서 시작 */
      await pg.waitForTimeout(160);
      const el = pg.locator('#wrap button:visible').nth(i);
      if (!await el.count()) continue;
      const name = ((await el.textContent().catch(() => '')) || '').trim().replace(/\s+/g, ' ').slice(0, 22);
      if (!name) continue;
      const before = await pg.evaluate(() => ({
        h: document.body.innerHTML.length,
        page: typeof page !== 'undefined' ? page : null,
        modal: !!document.querySelector('.modal'),
        toast: document.querySelector('#toast')?.classList.contains('on')
      }));
      await el.click({ timeout: 1200 }).catch(() => { });
      await pg.waitForTimeout(280);
      const after = await pg.evaluate(() => ({
        h: document.body.innerHTML.length,
        page: typeof page !== 'undefined' ? page : null,
        modal: !!document.querySelector('.modal'),
        toast: document.querySelector('#toast')?.classList.contains('on')
      }));
      const changed = before.h !== after.h || before.page !== after.page
        || before.modal !== after.modal || (!before.toast && after.toast);
      if (!changed) dead.push(name);
      /* 모달이 열렸으면 닫고 다음 버튼으로 — 안 닫으면 뒤 버튼이 전부 가려진다 */
      await pg.evaluate(() => { try { closeModal(); } catch { } });
      await pg.waitForTimeout(60);
    }
    if (dead.length) deadAll[label] = [...new Set(dead)];
  }
  const keys = Object.keys(deadAll);
  if (keys.length) for (const k of keys)
    bug('admin', 'TC-B02', 'P2', `${k} — 눌러도 아무 반응 없는 버튼: ${deadAll[k].join(', ')}`);
  else pass('TC-B02', '반응 없는 버튼 없음');
}

/* TC-B03 사료 수정 위저드 5단계 */
{
  await pg.evaluate(() => { try { closeModal(); } catch { } go('foods'); });
  await pg.waitForTimeout(300);
  const edit = pg.locator('#wrap button').filter({ hasText: '수정' }).first();
  if (!await edit.count()) bug('admin', 'TC-B03', 'P2', '사료 목록에 수정 버튼이 없음');
  else {
    await edit.click(); await pg.waitForTimeout(400);
    const steps = await pg.locator('.step, [class*=step]').count();
    for (let i = 0; i < 5; i++) {
      const next = pg.locator('#wrap button').filter({ hasText: '다음 단계' }).first();
      if (!await next.count()) break;
      log.errors.length = 0;
      await next.click(); await pg.waitForTimeout(350);
      if (log.errors.length) bug('admin', 'TC-B03', 'P1', `위저드 ${i + 2}단계에서 오류: ${log.errors[0]}`);
    }
    const txt = await pg.textContent('#wrap');
    if (!txt.trim()) bug('admin', 'TC-B03', 'P1', '위저드 마지막 단계가 비어 있음');
    else pass('TC-B03', `위저드 ${steps ? steps + '단계 ' : ''}끝까지 진행`);
    await pg.screenshot({ path: `${OUT}/shot-admin-wizard.png` });
  }
}

/* TC-B04 사료 관리 화면에 '최신 데이터 불러오기' 가 실제로 동작하는지 */
{
  await pg.evaluate(() => go('foods')); await pg.waitForTimeout(300);
  await pg.evaluate(() => { store.foods[0].name = 'QA낡은초안'; store.save(); });
  await pg.reload(); await pg.waitForSelector('.nav-i');
  await pg.evaluate(() => go('foods')); await pg.waitForTimeout(400);
  const stale = await pg.evaluate(() => store.foods[0].name);
  if (stale !== 'QA낡은초안') bug('admin', 'TC-B04', 'P2', '임시저장이 새로고침 후 유지되지 않음');
  const btn = pg.locator('#wrap button').filter({ hasText: '최신 데이터' }).first();
  if (!await btn.count()) bug('admin', 'TC-B04', 'P1', "'최신 데이터 불러오기' 버튼이 없음");
  else {
    await btn.click(); await pg.waitForTimeout(500);
    const now = await pg.evaluate(() => store.foods[0].name);
    if (now === 'QA낡은초안') bug('admin', 'TC-B04', 'P1', '최신 데이터 불러오기를 눌러도 초안이 그대로');
    else pass('TC-B04', `최신 데이터 불러오기 동작 (${now})`);
  }
}

/* TC-B05 data.js 내보내기가 막혀 있는지 */
{
  const ex = pg.locator('button, a').filter({ hasText: '내보내기' }).first();
  if (!await ex.count()) bug('admin', 'TC-B05', 'P3', '내보내기 버튼을 찾을 수 없음');
  else {
    await ex.click(); await pg.waitForTimeout(400);
    const m = (await pg.textContent('.modal')).replace(/\s+/g, ' ');
    if (/data\.js 받기/.test(m)) bug('admin', 'TC-B05', 'P1', 'data.js 내보내기가 열려 있음 — 구매 링크가 사라지는 파일이 나감');
    else if (!/막아뒀|사료 관리/.test(m)) bug('admin', 'TC-B05', 'P2', '내보내기 모달에 왜 막았는지 설명이 없음');
    else pass('TC-B05', 'data.js 내보내기 차단 + 대체 경로 안내');
    await pg.locator('.modal button').filter({ hasText: '닫기' }).first().click().catch(() => { });
  }
}

/* TC-B06 대비 */
{
  await pg.evaluate(() => go('foods')); await pg.waitForTimeout(300);
  const lc = await lowContrast(pg);
  if (lc.length) bug('admin', 'TC-B06', 'P3', `저대비 ${lc.length}건: ${lc.slice(0, 3).map(x => `"${x.text}" ${x.ratio}:1`).join(' / ')}`);
  else pass('TC-B06', '대비 정상');
}

if (log.errors.length) bug('admin', 'TC-B00', 'P1', `JS 오류 ${log.errors.length}건: ${[...new Set(log.errors)].slice(0, 2).join(' | ')}`);
fs.writeFileSync(`${OUT}/findings-admin.json`, JSON.stringify(findings, null, 1));
console.log(`\n예전 어드민 발견 ${findings.length}건`);
await b.close(); srv.close();
