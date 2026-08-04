#!/usr/bin/env node
/* 게이트 1 — 기계 검사.
   AI 판단이 아니라 코드가 참·거짓을 판정한다. 하나라도 실패하면 그 항목은 탈락.

   사용:
     node scripts/gate1-validate.mjs                 형식·수식·출처 구조만 검사
     node scripts/gate1-validate.mjs --live          출처 URL 실제 접속까지 검사

   프록시 뒤(클라우드 세션)에서는 NODE_USE_ENV_PROXY=1 이 필요하다.
   Node 내장 fetch 가 HTTPS_PROXY 를 스스로 읽지 않기 때문이다.
   npm run gate1:live 를 쓰면 자동으로 붙는다. CI 에는 프록시가 없어 그냥 동작한다.
     node scripts/gate1-validate.mjs --json out.json 결과를 파일로 저장
*/
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { norm, loadFoods, isHttpUrl, isRetailHost } from './lib/schema.mjs';
/* 검사 본체는 engine/gate1.js 한 곳에 있다. 심사 화면(브라우저)도 같은 함수를 부른다 —
   사람이 라벨을 채워 넣으면 그 값으로 게이트를 그 자리에서 다시 돌려야 하기 때문이다. */
import { checkItem, draftTodo } from './lib/shared.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STAGING = join(ROOT, 'data/staging');
const LIVE = process.argv.includes('--live');
const jsonAt = process.argv.indexOf('--json');


/* 출처 URL이 살아 있는지, 그 페이지에 브랜드명이 실제로 있는지 확인한다.
   기본 User-Agent 로는 대부분의 제조사·판매처가 403을 돌려주므로 브라우저 UA 를 쓴다. */
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
                   '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function checkLive(item) {
  const fail = [];
  const p = item.proposed ?? {};
  /* 한글 브랜드명(인스팅트)과 영문 슬러그(instinct) 중 하나만 있으면 인정한다 —
     해외 제조사 공식 페이지는 영문이고, 국내 판매처는 한글이다. */
  const names = [p.brand, p.brandSlug].filter(Boolean).map(norm).filter(n => n.length >= 2);

  for (const [i, s] of (item.sources || []).entries()) {
    if (!isHttpUrl(s.url)) continue;
    /* 쿠팡은 봇 차단으로 서버에서 항상 403이다. 형식 검증은 checkItem 이 이미 했으므로 건너뛴다. */
    if (isRetailHost(s.url)) continue;
    try {
      const res = await fetch(s.url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
        headers: { 'user-agent': BROWSER_UA, 'accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
                   'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8' }
      });
      if (!res.ok) { fail.push({ code: 'E_URL_DEAD', msg: `sources[${i}] HTTP ${res.status}: ${s.url}` }); continue; }
      const body = norm(await res.text());
      if (names.length && !names.some(n => body.includes(n))) {
        fail.push({ code: 'E_URL_BRAND',
          msg: `sources[${i}] 페이지에 브랜드명(${names.join(' / ')})이 없습니다: ${s.url}` });
      }
    } catch (err) {
      fail.push({ code: 'E_URL_FETCH', msg: `sources[${i}] 접속 실패 (${err.name}): ${s.url}` });
    }
  }
  return fail;
}

/* --- 실행 --- */
const { all: published } = await loadFoods(ROOT);
let files = [];
try {
  files = (await readdir(STAGING)).filter(f => f.endsWith('.json') && !f.startsWith('_') && f !== 'review.json');
} catch { /* 폴더 없음 = 검사할 것 없음 */ }

const report = { checkedAt: new Date().toISOString(), live: LIVE, batches: [], pass: 0, failCount: 0 };
const seen = new Set();

for (const file of files) {
  const batch = JSON.parse(await readFile(join(STAGING, file), 'utf-8'));
  const out = { file, batchId: batch.batchId ?? null, items: [] };
  for (const item of batch.items ?? []) {
    const label = `${item.proposed?.brand ?? '?'} ${item.proposed?.name ?? '?'}`;
    const pending = item.proposed?.pricePending === true;

    /* 자료 수집 중인 항목은 채점 검사를 걸지 않는다. 아직 검사할 단계가 아니다. */
    if (item.proposed?.draft === true) {
      out.items.push({
        stagingId: item.stagingId, label, gate1: 'draft', pricePending: pending,
        fail: [], warn: [], todo: draftTodo(item)
      });
      report.draft = (report.draft ?? 0) + 1;
      continue;
    }

    const { fail, warn } = checkItem(item, published, seen);
    if (LIVE && fail.length === 0) fail.push(...await checkLive(item));
    const ok = fail.length === 0;
    out.items.push({
      stagingId: item.stagingId, label,
      gate1: ok ? (pending ? 'pending' : 'pass') : 'fail',
      pricePending: pending,
      fail, warn
    });
    ok ? report.pass++ : report.failCount++;
  }
  report.batches.push(out);
}

/* --- 출력 --- */
const line = '─'.repeat(60);
console.log(`\n게이트 1 · 기계 검사${LIVE ? ' (URL 실접속 포함)' : ''}`);
console.log(line);
if (!report.batches.length) console.log('검사할 스테이징 파일이 없습니다.');
for (const b of report.batches) {
  console.log(`\n[${b.file}]`);
  for (const it of b.items) {
    const mark = it.gate1 === 'pass' ? '✅' : it.gate1 === 'pending' ? '⏸'
      : it.gate1 === 'draft' ? '📝' : '❌';
    const tag = it.gate1 === 'pending' ? '  (가격 대기)' : it.gate1 === 'draft' ? '  (자료 수집 중)' : '';
    console.log(`  ${mark} ${it.label}${tag}`);
    for (const t of it.todo ?? []) console.log(`       · 채울 것: ${t}`);
    for (const f of it.fail) console.log(`       ✗ ${f.msg}`);
    for (const w of it.warn) console.log(`       ⚠ ${w.msg}`);
  }
}
console.log(`\n${line}\n통과 ${report.pass} · 탈락 ${report.failCount}` +
  (report.draft ? ` · 자료 수집 중 ${report.draft}` : '') + '\n');

if (jsonAt > -1 && process.argv[jsonAt + 1]) {
  await writeFile(process.argv[jsonAt + 1], JSON.stringify(report, null, 2));
}
process.exit(report.failCount > 0 ? 1 : 0);
