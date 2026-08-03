/* QA-5 · 한글 입력 — 검색칸에 한글이 제대로 써지는가.

   이 버그는 세 번 보고됐고 두 번 잘못 고쳤다. 두 번 다 "다시 그릴 때 입력칸
   노드를 살려서 옮겨 심으면 된다" 고 봤는데, 노드가 문서에서 잠깐이라도
   떨어지면 브라우저가 조합을 취소한다. 도로 꽂아도 이미 늦다.
   지난 검사는 '같은 노드인가' 만 봐서 통과해버렸다.

   그래서 여기서는 결과 글자를 본다. '지위픽' 이 아니면 실패다. */
import { serve, launch, bug, pass, findings, ROOT, OUT } from './lib.mjs';
import fs from 'node:fs';
const DATA = fs.readFileSync(ROOT + '/data.js', 'utf8');
const srv = await serve(9120); const b = await launch();
console.log('\n═══ QA-5 한글 입력 ═══');

const CASES = [
  ['프론트 검색',   'http://localhost:9120/balsatang/index.html',            '#q', 'front'],
  ['사료 관리',     'http://localhost:9120/balsatang/admin/foods.html',      '#q', 'foods'],
  ['어드민 사료',   'http://localhost:9120/balsatang/admin/index.html',      '[placeholder="브랜드·사료명 검색"]', 'old-foods'],
  ['어드민 성분',   'http://localhost:9120/balsatang/admin/index.html',      '[placeholder="성분명 검색"]',       'old-ingr'],
  ['어드민 가격',   'http://localhost:9120/balsatang/admin/index.html',      '[placeholder="브랜드·사료명 검색"]', 'old-price']
];

for (const [name, url, sel, kind] of CASES) {
  const pg = await b.newPage({ viewport: { width: 1300, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  if (kind === 'foods') {
    await pg.route('https://api.github.com/**', r => {
      const u = r.request().url();
      if (u.endsWith('/repos/butblank-oss/gsso_scat')) return r.fulfill({ json: { full_name: 'x', permissions: { push: true } } });
      return r.fulfill({ json: { content: Buffer.from(DATA, 'utf8').toString('base64'), sha: 'a' } });
    });
    await pg.addInitScript(() => localStorage.setItem('balsatang.gh.token', 't'));
  }
  await pg.goto(url);
  if (kind === 'front') { await pg.waitForSelector('.app'); await pg.click('.searchbox'); await pg.waitForSelector('#q'); }
  if (kind === 'foods') await pg.waitForSelector('tbody tr');
  if (kind.startsWith('old')) {
    await pg.waitForSelector('.nav-i');
    await pg.click(kind === 'old-ingr' ? 'text=성분 관리' : kind === 'old-price' ? 'text=가격 관리' : 'text=사료 관리');
    await pg.waitForSelector(sel);
  }

  /* 입력칸이 문서에서 떨어지는 순간을 감시한다 */
  await pg.evaluate(s => {
    const el = document.querySelector(s);
    window.__detached = 0;
    new MutationObserver(() => { if (!el.isConnected) window.__detached++; })
      .observe(document.body, { childList: true, subtree: true });
  }, sel);

  const cdp = await pg.context().newCDPSession(pg);
  await pg.click(sel);
  /* '지위픽' 을 실제 IME 순서로 */
  for (const t of ['ㅈ', '지', '짂', '지ㅇ', '지위', '지윞', '지위ㅍ', '지위피', '지위픽'])
    { await cdp.send('Input.imeSetComposition', { text: t, selectionStart: t.length, selectionEnd: t.length }); await pg.waitForTimeout(70); }
  await cdp.send('Input.insertText', { text: '지위픽' });
  await pg.waitForTimeout(600);

  const detached = await pg.evaluate(() => window.__detached);
  const val = await pg.locator(sel).inputValue().catch(() => '(사라짐)');
  if (val !== '지위픽')
    bug('hangul', 'TC-H01', 'P1', `${name} — '지위픽' 을 쳤는데 "${val}" 이 됐습니다 (조합이 끊깁니다)`);
  else if (errs.length)
    bug('hangul', 'TC-H01', 'P2', `${name} — 글자는 맞지만 JS 오류 ${errs.length}건: ${errs[0]}`);
  else pass('TC-H01', `${name} — "지위픽" 정상`);
  await pg.close();
}
fs.writeFileSync(`${OUT}/findings-hangul.json`, JSON.stringify(findings, null, 1));
console.log(`\n한글 입력 발견 ${findings.length}건`);
await b.close(); srv.close();
