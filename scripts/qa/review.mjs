/* QA-3 · 심사자 — 발행 심사 화면
   실제 큐(review.json)는 비거나 들쭉날쭉해서, 그대로 두면 stg_qa_ok·stg_qa_blocked
   카드를 못 찾아 30초를 기다리다 멈춘다. 그래서 진짜 모양의 배치를 하나 만들어 넣고
   전체 흐름을 돌린다 — 끝나면 finally 에서 원본으로 되돌린다. */
import { serve, launch, watch, bug, pass, findings, overflowX, lowContrast, OUT, ROOT } from './lib.mjs';
import fs from 'node:fs';

const P = ROOT + '/data/staging/review.json';
const BACKUP = fs.readFileSync(P, 'utf8');

/* 시험용 두 건. build-review.mjs 가 내는 모양 그대로다(batches[].items[] · summary).
   stg_qa_ok 는 라벨을 고치는 TC-R04 이후 화면이 게이트를 다시 돌리므로(review.html 의
   gateNow), 편집 뒤에도 통과를 유지하려면 proposed 가 실제 gate1 을 통과해야 한다.
   그래서 숫자를 지어내지 않고 '게이트를 그대로 통과하는 상태로 유지되는' _example.json 의
   proposed·sources·evidence 를 재료로 쓴다. 대조 불일치는 audit 으로만 심는다 —
   gate1 은 audit 을 보지 않아 통과에 지장이 없다. stg_qa_blocked 는 가격 근거(retail)
   출처만 빼서 실제로 탈락시킨다(E_SRC_PRICE). 끝나면 finally 에서 원본으로 되돌린다. */
const EX = JSON.parse(fs.readFileSync(ROOT + '/data/staging/_example.json', 'utf8')).items[0];
const okProposed = { ...EX.proposed, name: 'QA 통과 사료' };
/* 수집값보다 심사 AI 재조사 조단백을 3 낮춰 대조 불일치 한 줄을 만든다 */
const indProtein = EX.proposed.facts.protein - 3;
const DIFF = [{ key: 'facts.protein', collected: EX.proposed.facts.protein, independent: indProtein }];
const QA_FIXTURE = {
  builtAt: new Date().toISOString(), live: false,
  batches: [{
    file: 'qa-fixture.json', batchId: 'qa-fixture', collectedAt: new Date().toISOString(),
    items: [
      { stagingId: 'stg_qa_ok', label: `${EX.proposed.brand} QA 통과 사료`,
        proposed: okProposed, sources: EX.sources, evidence: EX.evidence,
        audit: { ...EX.audit, verdict: 'mismatch',
                 independent: { ...EX.audit.independent,
                                facts: { ...EX.audit.independent.facts, protein: indProtein } },
                 diff: DIFF },
        pricePending: false, draft: false,
        gates: { g1: 'pass', g1fail: [], g1warn: [], todo: [],
                 g2: 'mismatch', g2diff: DIFF, g3warn: [] },
        ready: true },
      { stagingId: 'stg_qa_blocked', label: `${EX.proposed.brand} 게이트 탈락 사료`,
        proposed: { ...EX.proposed, name: '게이트 탈락 사료' },
        sources: EX.sources.filter(s => s.role !== 'retail'), evidence: EX.evidence, audit: null,
        pricePending: false, draft: false,
        gates: { g1: 'fail',
                 g1fail: [{ code: 'E_SRC_PRICE', msg: '가격 근거(쿠팡 상품 출처)가 없습니다' }],
                 g1warn: [], todo: [], g2: 'none', g2diff: [], g3warn: [] },
        ready: false }
    ]
  }],
  summary: { total: 2, ready: 1, blocked: 1, pricePending: 0 }
};
fs.writeFileSync(P, JSON.stringify(QA_FIXTURE, null, 2));

const srv = await serve(9103);
const b = await launch();
const U = 'http://localhost:9103/admin/review.html';
console.log('\n═══ QA-3 심사자 · 발행 심사 ═══');

try {
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
    /* 구매 링크 칸은 data-edit="price.buyUrl" 이다. 옛 선택자 [data-buy] 는 화면에 없어
       '구매 링크 입력칸 없음' 이 거짓으로 떴다. */
    const buy = pg.locator('.card[data-id="stg_qa_ok"] [data-edit="price.buyUrl"]');
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

  fs.writeFileSync(`${OUT}/findings-review.json`, JSON.stringify(findings, null, 1));
  console.log(`\n심사 화면 발견 ${findings.length}건`);
} finally {
  /* 중간에 터져도 저장소의 review.json 이 시험용으로 덮인 채 남지 않게 한다 */
  fs.writeFileSync(P, BACKUP);
  await b.close().catch(() => {});
  srv.close();
}
