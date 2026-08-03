/* QA-3 · 심사자 — 발행 심사 화면
   지금 review.json 은 비어 있다. 빈 상태만 보고 끝내면 정작 쓸 때 터진다.
   그래서 진짜 모양의 배치를 하나 만들어 넣고 전체 흐름을 돌린다. */
import { serve, launch, watch, bug, pass, findings, overflowX, lowContrast, OUT, ROOT } from './lib.mjs';
import fs from 'node:fs';

const P = ROOT + '/data/staging/review.json';
const BACKUP = fs.readFileSync(P, 'utf8');

const srv = await serve(9103);
const b = await launch();
const U = 'http://localhost:9103/(어드민 저장소) review.html';
console.log('\n═══ QA-3 심사자 · 발행 심사 ═══');

{
  const pg = await b.newPage({ viewport: { width: 1280, height: 950 } });
  const log = watch(pg, 'review');
  pg.on('dialog', d => d.accept());
  await pg.goto(U); await pg.waitForTimeout(900);

  /* TC-R02 카드 렌더 */
  {
    const cards = await pg.locator('.card[data-id]').count();
    if (cards !== 2) bug('review', 'TC-R02', 'P1', `심사 카드 ${cards}장 (2장이어야 함)`);
    else pass('TC-R02', '심사 카드 2장 렌더');
    const txt = (await pg.textContent('body'));
    if (!txt.includes('QA 통과 사료')) bug('review', 'TC-R02', 'P1', '사료 이름이 화면에 없음');
    if (!/불일치|mismatch|대조/.test(txt)) bug('review', 'TC-R02', 'P1', '심사 AI 대조 불일치 사유가 화면에 안 보임');
    else pass('TC-R02', '대조 불일치 사유 표시');
    await pg.screenshot({ path: `${OUT}/shot-review-02-cards.png`, fullPage: true });
  }

  /* TC-R03 탈락한 건은 승인할 수 없어야 한다 */
  {
    const blocked = pg.locator('.card[data-id="stg_qa_blocked"]');
    const approve = blocked.locator('[data-act="publish"]');
    if (!await approve.count()) pass('TC-R03', '탈락 건에 승인 버튼 없음');
    else {
      const dis = await approve.first().isDisabled().catch(() => false);
      if (!dis) bug('review', 'TC-R03', 'P1', '게이트 탈락 건인데 승인 버튼이 눌림');
      else pass('TC-R03', '탈락 건 승인 버튼 비활성');
    }
  }

  /* 카드는 접혀 있다 — 펼쳐야 고치기가 보인다 */
  for (const id of ['stg_qa_ok', 'stg_qa_blocked']) {
    await pg.locator(`.card[data-id="${id}"] .hd, .card[data-id="${id}"] .head, .card[data-id="${id}"]`).first().click();
    await pg.waitForTimeout(200);
  }

  /* TC-R04 값 고치기 → 발행 명령에 실리는지 */
  {
    const f = pg.locator('.card[data-id="stg_qa_ok"] [data-edit]').first();
    if (!await f.count()) bug('review', 'TC-R04', 'P2', '심사 화면에서 값을 고칠 수 없음');
    else {
      await f.fill('30'); await f.dispatchEvent('change'); await pg.waitForTimeout(300);
      const bar = (await pg.textContent('body'));
      if (!/수정|고침|1건/.test(bar)) bug('review', 'TC-R04', 'P2', '값을 고쳤는데 하단에 표시가 없음');
      else pass('TC-R04', '값 수정 → 하단 표시');
    }
  }

  /* TC-R05 구매 링크 입력 검증 */
  {
    const buy = pg.locator('.card[data-id="stg_qa_ok"] [data-buy]');
    if (!await buy.count()) bug('review', 'TC-R05', 'P2', '심사 화면에 구매 링크 입력칸이 없음');
    else {
      await buy.fill('https://smartstore.naver.com/x'); await buy.dispatchEvent('change');
      await pg.waitForTimeout(300);
      const warn = (await pg.textContent('body'));
      if (!/쿠팡|올바른|확인/.test(warn))
        bug('review', 'TC-R05', 'P2', '쿠팡이 아닌 구매 링크를 넣어도 아무 경고가 없음 — 발행 명령에 그대로 실림');
      else pass('TC-R05', '잘못된 구매 링크 경고');
      await buy.fill('https://link.coupang.com/a/QAOK'); await buy.dispatchEvent('change');
    }
  }

  /* TC-R06 발행 명령 복사 */
  {
    const copy = pg.locator('[data-act="copy"],[data-copy],button').filter({hasText:'복사'}).first();
    if (!await copy.count()) bug('review', 'TC-R06', 'P1', '발행 명령 복사 버튼이 없음');
    else {
      await pg.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => { });
      /* 승인 하나 체크 */
      const ok = pg.locator('.card[data-id="stg_qa_ok"] [data-act="publish"]').first();
      if (await ok.count()) { await ok.click(); await pg.waitForTimeout(200); }
      await copy.click(); await pg.waitForTimeout(400);
      const cb = await pg.evaluate(() => navigator.clipboard.readText().catch(() => '')).catch(() => '');
      if (!cb || !/publish|approve/i.test(cb))
        bug('review', 'TC-R06', 'P2', `복사 결과가 비었거나 형식이 다름: "${String(cb).slice(0, 60)}"`);
      else pass('TC-R06', `발행 명령 복사 — "${String(cb).split('\n')[0].slice(0, 50)}"`);
    }
  }

  /* TC-R07 새로고침 후 편집 유지 */
  {
    await pg.reload(); await pg.waitForTimeout(900);
    const v = await pg.locator('.card[data-id="stg_qa_ok"] [data-edit]').first().inputValue().catch(() => '');
    if (v !== '30') bug('review', 'TC-R07', 'P2', `새로고침하면 고친 값이 사라짐 (${v})`);
    else pass('TC-R07', '새로고침 후 편집 유지');
  }

  /* TC-R08 레이아웃 */
  {
    const ov = await overflowX(pg);
    if (ov > 0) bug('review', 'TC-R08', 'P3', `가로 스크롤 ${ov}px`);
    const lc = await lowContrast(pg);
    if (lc.length) bug('review', 'TC-R08', 'P2', `저대비 ${lc.length}건: ${lc.slice(0, 3).map(x => `"${x.text}" ${x.ratio}:1`).join(' / ')}`);
    else pass('TC-R08', '레이아웃·대비 정상');
  }

  if (log.errors.length) bug('review', 'TC-R00', 'P1', `JS 오류 ${log.errors.length}건: ${[...new Set(log.errors)].slice(0, 2).join(' | ')}`);
  await pg.close();
}

fs.writeFileSync(`${OUT}/findings-review.json`, JSON.stringify(findings, null, 1));
console.log(`\n심사 화면 발견 ${findings.length}건`);
await b.close(); srv.close();
