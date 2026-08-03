#!/usr/bin/env node
/* 다나와에서 사료 등록에 필요한 것을 한 번에 뽑는다.
   검색어 또는 pcode 를 주면:
     - 상품명, pcode, 썸네일(img.danuri.io)
     - 국내 등록 영양정보 (조단백·조지방·조섬유·조회분·수분)
     - 쿠팡 최저가 + 쿠팡 상품 URL  ← 가격비교 AJAX(getAllPriceCompareMallList)
     - 판매자 상세 이미지 URL 목록   ← getProductDescription AJAX (원재료 판독용)

   가격비교와 상세 이미지는 페이지에 JS 로 로드되지만,
   같은 AJAX 를 referer 만 맞춰 직접 호출하면 서버가 그대로 응답한다.

   사용:
     node scripts/danawa-product.mjs "뉴트리나 어덜트 치킨 2.1kg"
     node scripts/danawa-product.mjs --pcode 99806063
     node scripts/danawa-product.mjs --json out.json "검색어"
*/
import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const COUPANG = 'TP40F';

async function curl(url, { referer, post } = {}) {
  const args = ['-sL', '-m', '25', '-A', UA];
  if (referer) args.push('-e', referer);
  if (post) args.push('-X', 'POST', '-d', post);
  const { stdout } = await run('curl', [...args, url], { maxBuffer: 60 * 1024 * 1024, encoding: 'buffer' });
  return stdout.toString('utf-8');
}

const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');

/* 검색어 → 첫 매칭 상품의 pcode */
export async function findPcode(query) {
  const raw = await curl('https://search.danawa.com/dsearch.php?query=' + encodeURIComponent(query));
  for (const blk of raw.split(/class="prod_item/).slice(1)) {
    const pc = blk.match(/pcode=(\d+)/);
    const nm = blk.match(/alt="([^"]{4,160})"/);
    if (pc && nm) return { pcode: pc[1], matchedName: unesc(nm[1]).trim() };
  }
  return null;
}

/* 상세 페이지 → 이름·썸네일·영양정보 */
async function fetchDetail(pcode) {
  const url = `https://prod.danawa.com/info/?pcode=${pcode}`;
  const raw = await curl(url, { referer: 'https://search.danawa.com/' });
  const t = unesc(raw.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  const num = (label) => {
    const m = t.match(new RegExp(label + '\\s*:\\s*([\\d.]+)\\s*%'));
    return m ? Number(m[1]) : null;
  };
  const name = (raw.match(/<meta property="og:title" content="([^"]+)"/) || [])[1];
  const thumbM = raw.match(/https:\/\/img\.danuri\.io\/catalog-image\/[^"'?]+/);
  return {
    url,
    name: name ? unesc(name).replace(/\s*:\s*다나와.*$/, '').trim() : null,
    thumb: thumbM ? thumbM[0] + '?shrink=360:360' : null,
    ga: { protein: num('조단백'), fat: num('조지방'), fiber: num('조섬유'),
          ash: num('조회분'), moisture: num('수분') },
    spec: (t.match(/상세 스펙\s*([^[]{0,200})/) || [, null])[1]?.trim().slice(0, 160) ?? null
  };
}

/* 가격비교 AJAX → 몰별 가격. 쿠팡 최저가와 그 bridge 링크를 찾는다. */
async function fetchPrices(pcode) {
  const raw = await curl('https://prod.danawa.com/info/ajax/getAllPriceCompareMallList.ajax.php', {
    referer: `https://prod.danawa.com/info/?pcode=${pcode}`,
    post: `productSeq=${pcode}&pcode=${pcode}&sortType=priceASC`
  });
  const items = [];
  for (const blk of raw.split(/class="diff_item/).slice(1)) {
    const mall = blk.match(/data-linkProduct="([A-Z0-9]+)_/);
    const pr = blk.match(/<em[^>]*>\s*([\d,]{4,})\s*<\/em>/);
    const lnk = blk.match(/href="(https:\/\/prod\.danawa\.com\/bridge\/[^"]+)"/);
    if (!pr) continue;
    items.push({ mall: mall ? mall[1] : '?', price: Number(pr[1].replace(/,/g, '')),
                 bridge: lnk ? unesc(lnk[1]) : null });
  }
  const coupang = items.filter(i => i.mall === COUPANG).sort((a, b) => a.price - b.price);
  return { totalMalls: items.length, coupang };
}

/* bridge → 쿠팡 상품 URL */
async function resolveCoupang(bridge) {
  if (!bridge) return null;
  const body = await curl(bridge, { referer: 'https://prod.danawa.com/' });
  const m = body.match(/https:\/\/link\.coupang\.com\/re\/[^'"]+/);
  if (!m) return null;
  const q = new URL(unesc(m[0])).searchParams;
  const pid = q.get('pageKey');
  if (!pid) return null;
  const item = q.get('itemId'), vend = q.get('vendorItemId');
  return `https://www.coupang.com/vp/products/${pid}` +
         (item && vend ? `?itemId=${item}&vendorItemId=${vend}` : '');
}

/* 판매자 상세 이미지 — 원재료 패널이 들어있는 경우가 많다 */
async function fetchDescImages(pcode) {
  const raw = await curl('https://prod.danawa.com/info/ajax/getProductDescription.ajax.php', {
    referer: `https://prod.danawa.com/info/?pcode=${pcode}`,
    post: `productSeq=${pcode}&pcode=${pcode}`
  });
  return [...new Set(raw.match(/https?:\/\/[^"'<> ]+\.(?:jpg|jpeg|png)/gi) ?? [])];
}

export async function lookup(queryOrPcode) {
  let pcode = queryOrPcode, matchedName = null;
  if (!/^\d+$/.test(String(queryOrPcode))) {
    const f = await findPcode(queryOrPcode);
    if (!f) return null;
    pcode = f.pcode; matchedName = f.matchedName;
  }
  const detail = await fetchDetail(pcode);
  const prices = await fetchPrices(pcode);
  const best = prices.coupang[0] ?? null;
  const coupangUrl = best ? await resolveCoupang(best.bridge) : null;
  return {
    pcode, matchedName, ...detail,
    coupang: best ? { price: best.price, url: coupangUrl } : null,
    mallCount: prices.totalMalls,
    descImages: await fetchDescImages(pcode)
  };
}

/* --- CLI --- */
const isEntry = process.argv[1] && process.argv[1].endsWith('danawa-product.mjs');
if (isEntry) {
  const jsonAt = process.argv.indexOf('--json');
  const jsonPath = jsonAt > -1 ? process.argv[jsonAt + 1] : null;
  const pcodeAt = process.argv.indexOf('--pcode');
  const args = process.argv.slice(2).filter((a, i) =>
    !a.startsWith('--') && i !== jsonAt - 1 && process.argv[i + 1] !== '--json' &&
    (pcodeAt === -1 || i + 2 !== pcodeAt + 1));
  const targets = pcodeAt > -1 ? [process.argv[pcodeAt + 1]] : args;

  const results = [];
  for (const t of targets) {
    const r = await lookup(t);
    results.push(r);
    if (!r) { console.log(`✗ ${t} — 검색 결과 없음`); continue; }
    console.log(`\n■ ${r.name ?? r.matchedName}  (pcode ${r.pcode})`);
    console.log(`  영양   조단백 ${r.ga.protein} / 조지방 ${r.ga.fat} / 조섬유 ${r.ga.fiber} / 조회분 ${r.ga.ash} / 수분 ${r.ga.moisture}`);
    console.log(`  쿠팡   ${r.coupang ? r.coupang.price.toLocaleString() + '원  ' + (r.coupang.url ?? 'URL 해석 실패') : '판매 없음'}  (전체 ${r.mallCount}개 몰)`);
    console.log(`  썸네일 ${r.thumb ?? '없음'}`);
    console.log(`  상세이미지 ${r.descImages.length}장`);
  }
  if (jsonPath) await writeFile(jsonPath, JSON.stringify(results, null, 2));
}
