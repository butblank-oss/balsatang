#!/usr/bin/env node
/* 쿠팡 파트너스 Open API 클라이언트.

   www.coupang.com 은 엣지에서 막혀 크롤링이 안 된다(아래 '왜 크롤링이 안 되나' 참고).
   하지만 파트너스 공식 API 는 이 환경에서 그대로 열린다. 확인된 것:

     POST /v2/providers/affiliate_open_api/apis/openapi/v1/deeplink        구매 링크 생성
     GET  /v2/providers/affiliate_open_api/apis/openapi/products/search    상품 검색
     GET  /v2/providers/affiliate_open_api/apis/openapi/v1/products/goldbox

   인증만 붙이면 된다. 키는 파트너스 사이트 → 내 정보 → 오픈 API 키 발급.
   환경변수로만 넘긴다. 코드나 저장소에 절대 적지 않는다.

     export COUPANG_ACCESS_KEY=...
     export COUPANG_SECRET_KEY=...

   사용:
     node scripts/coupang-partners.mjs deeplink <상품URL> [상품URL ...]
     node scripts/coupang-partners.mjs search "오리젠 퍼피" [개수]
     node scripts/coupang-partners.mjs auto        링크 없는 발행 사료를 한 번에 처리

   'auto' 는 등록된 쿠팡 상품 URL 을 deeplink 로 바꿔 data.js 에 넣는다.
   상품 URL 이 없는 사료는 search 로 후보를 찾아 보여주기만 한다 — 자동 선택하지 않는다.
   이름이 비슷한 다른 제품(고양이 사료 등)이 잡히는 걸 여러 번 겪었기 때문이다.

   ── 왜 크롤링이 안 되나 ──
   1) www.coupang.com / m.coupang.com 은 엣지 WAF 가 'Access Denied' 를 준다.
      브라우저 헤더를 전부 맞춰도, HTTP/1.1 로 낮춰도 403 이다.
   2) 이 환경의 모든 트래픽은 로컬 MITM 프록시를 거쳐 나간다. 그래서 크로미움을 띄워도
      쿠팡이 보는 TLS 지문은 크로미움이 아니라 프록시의 것이다.
      '진짜 브라우저를 쓰면 뚫린다'는 방법의 전제가 성립하지 않는다.
   3) 나가는 IP 가 데이터센터 대역이다. 가정용 IP 가 아니면 평판 점수에서 걸린다.
   결론: 이 환경에서 상품 페이지 크롤링은 방법의 문제가 아니라 조건의 문제다.
   대신 공식 API 는 열려 있고, 그게 원래 쓰라고 만들어 둔 길이다.
*/
import { createHmac } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadFoods } from './lib/schema.mjs';

const run = promisify(execFile);
const HOST = 'https://api-gateway.coupang.com';
const BASE = '/v2/providers/affiliate_open_api/apis/openapi';
const DATA_JS = 'data.js';

const ACCESS = process.env.COUPANG_ACCESS_KEY;
const SECRET = process.env.COUPANG_SECRET_KEY;

/* 쿠팡 HMAC — 서명 대상은 'yyMMddTHHmmssZ(GMT) + METHOD + path + query' 다.
   query 는 물음표를 뺀 나머지, path 와 붙여 쓴다. */
function authHeader(method, pathWithQuery) {
  const [path, query = ''] = pathWithQuery.split('?');
  const t = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, 'Z').slice(2);
  const msg = t + method + path + query;
  const sig = createHmac('sha256', SECRET).update(msg).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${ACCESS}, signed-date=${t}, signature=${sig}`;
}

async function call(method, pathWithQuery, body) {
  if (!ACCESS || !SECRET) {
    throw new Error('COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY 환경변수가 없습니다.\n' +
      '  파트너스 → 내 정보 → 오픈 API 키 발급 에서 받아 아래처럼 넘기세요:\n' +
      '  COUPANG_ACCESS_KEY=... COUPANG_SECRET_KEY=... node scripts/coupang-partners.mjs ...');
  }
  const args = ['-sS', '-m', '30', '-X', method,
    '-H', `Authorization: ${authHeader(method, pathWithQuery)}`,
    '-H', 'Content-Type: application/json;charset=UTF-8'];
  if (body) args.push('-d', JSON.stringify(body));
  const { stdout } = await run('curl', [...args, HOST + BASE + pathWithQuery],
                               { maxBuffer: 3e7, encoding: 'utf-8' });
  let j;
  try { j = JSON.parse(stdout); }
  catch { throw new Error('응답을 읽지 못했습니다: ' + stdout.slice(0, 300)); }
  if (j.rCode && j.rCode !== '0') throw new Error(`${j.rCode} ${j.rMessage ?? ''}`);
  if (j.code && j.code !== 'SUCCESS' && j.code !== '200') {
    throw new Error(`${j.code} ${j.messages?.korean ?? j.message ?? ''}`);
  }
  return j;
}

/* 상품 URL → 파트너스 구매 링크. 한 번에 여러 개 보낼 수 있다. */
export async function deeplink(urls) {
  const j = await call('POST', '/v1/deeplink', { coupangUrls: urls });
  return (j.data ?? []).map(d => ({
    origin: d.originalUrl, short: d.shortenUrl, landing: d.landingUrl
  }));
}

export async function search(keyword, limit = 10) {
  const q = `/products/search?keyword=${encodeURIComponent(keyword)}&limit=${limit}`;
  const j = await call('GET', q);
  return (j.data?.productData ?? []).map(p => ({
    id: p.productId, name: p.productName, price: p.productPrice,
    url: p.productUrl, image: p.productImage, rocket: p.isRocket
  }));
}

/* --- CLI --- */
const [cmd, ...rest] = process.argv.slice(2);
const line = '─'.repeat(60);

try {
  if (cmd === 'deeplink') {
    if (!rest.length) throw new Error('상품 URL 을 하나 이상 주세요');
    for (const r of await deeplink(rest)) {
      console.log(`\n  ${r.origin}\n  → ${r.short}`);
    }
    console.log();

  } else if (cmd === 'search') {
    const [kw, n] = rest;
    const rows = await search(kw, Number(n) || 10);
    console.log(`\n"${kw}" 검색 ${rows.length}건`);
    console.log(line);
    for (const p of rows) {
      console.log(`  ${p.name}`);
      console.log(`    ${p.price?.toLocaleString('ko-KR')}원 ${p.rocket ? '· 로켓' : ''}`);
      console.log(`    ${p.url}`);
    }
    console.log();

  } else if (cmd === 'auto') {
    const { all } = await loadFoods('.');
    const retail = f => (f.src?.sources ?? []).find(s => s.role === 'retail');
    const need = all.filter(f => f.status === 'published' && !f.price?.buyUrl);
    const withUrl = need.filter(retail), without = need.filter(f => !retail(f));

    console.log(`\n구매 링크 자동 생성`);
    console.log(line);
    console.log(`  대상 ${need.length}종 — 상품 URL 있음 ${withUrl.length} · 없음 ${without.length}\n`);

    if (withUrl.length) {
      const urls = withUrl.map(f => retail(f).url);
      const made = await deeplink(urls);
      const byOrigin = new Map(made.map(m => [m.origin, m.short]));
      let n = 0;
      for (const f of withUrl) {
        const short = byOrigin.get(retail(f).url);
        if (!short) { console.log(`  ✗ ${f.brand} ${f.name} — 링크를 못 받았습니다`); continue; }
        f.price = { ...(f.price ?? {}), buyUrl: short };
        console.log(`  ✅ ${f.brand} ${f.name}\n     ${short}`);
        n++;
      }
      if (n) {
        const src = await readFile(DATA_JS, 'utf-8');
        const m = src.match(/const FOODS_ALL\s*=\s*(\[[\s\S]*?\]);/);
        await writeFile(DATA_JS, src.replace(m[1], JSON.stringify(all)));
      }
      console.log(`\n  ${n}종 반영 — node scripts/verify-data.mjs 로 확인하세요`);
    }

    if (without.length) {
      console.log(`\n■ 쿠팡 상품 URL 이 없는 ${without.length}종 — 후보만 찾아 둡니다`);
      console.log(`  자동으로 고르지 않습니다. 이름이 비슷한 다른 제품이 잡히는 일이 잦습니다.\n`);
      const out = [];
      for (const f of without) {
        let hits = [];
        try { hits = await search(`${f.brand} ${f.name}`.replace(/\(.*?\)/g, '').trim(), 3); }
        catch (e) { console.log(`  ✗ ${f.brand} ${f.name} — ${e.message}`); continue; }
        out.push({ id: f.id, brand: f.brand, name: f.name, candidates: hits });
        console.log(`  ${f.brand} ${f.name}`);
        for (const h of hits) console.log(`      ${h.name}  ${h.price?.toLocaleString('ko-KR')}원\n      ${h.url}`);
      }
      await writeFile('data/queue/buylink-candidates.json',
        JSON.stringify({ foundAt: new Date().toISOString(), items: out }, null, 2));
      console.log(`\n  후보 저장 → data/queue/buylink-candidates.json`);
    }
    console.log();

  } else {
    console.log(`
쿠팡 파트너스 Open API

  node scripts/coupang-partners.mjs deeplink <상품URL> [...]   구매 링크 생성
  node scripts/coupang-partners.mjs search "<검색어>" [개수]     상품 검색
  node scripts/coupang-partners.mjs auto                       링크 없는 발행 사료 일괄 처리

키는 환경변수로만 넘깁니다:
  COUPANG_ACCESS_KEY=... COUPANG_SECRET_KEY=... node scripts/coupang-partners.mjs auto
`);
  }
} catch (e) {
  console.error(`\n✗ ${e.message}\n`);
  process.exit(1);
}
