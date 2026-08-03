#!/usr/bin/env node
/* 다나와 강아지 사료 검색 상위 N개를 수집해 작업 대기열을 만든다.
   여기서 모으는 것은 순위·상품명·가격·용량·쿠팡 링크까지다.
   성분(보장성분·원재료)은 제조사 페이지에서 따로 확보해야 하므로 이 단계에서는 비워 둔다.

   쿠팡은 봇 차단으로 직접 열 수 없어, 다나와의 판매몰 링크에서 상품 ID만 얻는다.

   사용:
     node scripts/collect-ranking.mjs                 상위 30개
     node scripts/collect-ranking.mjs --top 50        개수 지정
     node scripts/collect-ranking.mjs --dry-run       파일을 쓰지 않고 출력만
*/
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadFoods, norm } from './lib/schema.mjs';

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'data/queue');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const COUPANG_MALL = 'TP40F';
const DRY = process.argv.includes('--dry-run');
const topAt = process.argv.indexOf('--top');
const TOP = topAt > -1 ? Number(process.argv[topAt + 1]) || 30 : 30;

/* 사료가 아닌 것을 걸러낸다. 검색 결과에 용품·간식이 섞여 들어온다. */
const NOT_FOOD = /사료통|급수기|급식기|물병|스푼|스쿱|보관|용기|매트|장난감|배변|하네스|리드|케이지|샴푸|영양제|비타민|칫솔|치약/;
const IS_TREAT = /간식|츄|저키|스틱|트릿|껌|육포/;

async function curl(url, referer) {
  const args = ['-sL', '-m', '25', '-A', UA];
  if (referer) args.push('-e', referer);
  const { stdout } = await run('curl', [...args, url], { maxBuffer: 40 * 1024 * 1024, encoding: 'buffer' });
  return stdout.toString('utf-8');
}

const unesc = (s) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');

/* 다나와 중개 링크 → 쿠팡 상품 URL */
async function resolveCoupang(bridgeUrl) {
  try {
    const body = await curl(bridgeUrl, 'https://search.danawa.com/');
    const m = body.match(/https:\/\/link\.coupang\.com\/re\/[^'"]+/);
    if (!m) return null;
    const q = new URL(unesc(m[0])).searchParams;
    const pid = q.get('pageKey');
    if (!pid) return null;
    const item = q.get('itemId'), vend = q.get('vendorItemId');
    return `https://www.coupang.com/vp/products/${pid}` +
           (item && vend ? `?itemId=${item}&vendorItemId=${vend}` : '');
  } catch { return null; }
}

/* 다나와 상품 상세의 [영양정보] — 국내 유통 제품 기준 수치다.
   원재료 전체 목록은 없으므로 firstIngrCat / cautionN 은 제조사 페이지에서 따로 구해야 한다. */
async function fetchDanawaDetail(pcode) {
  if (!pcode) return null;
  try {
    const raw = await curl(`https://prod.danawa.com/info/?pcode=${pcode}`, 'https://search.danawa.com/');
    const brM = raw.match(/href="(https:\/\/prod\.danawa\.com\/bridge\/go_link_goods\.php[^"]*cmpny_c=TP40F[^"]*)"/)
             || raw.match(/href="(https:\/\/prod\.danawa\.com\/bridge\/go_link_goods\.php[^"]+)"/);
    const bridge = brM ? unesc(brM[1]) : null;
    const t = unesc(raw.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
    const num = (label) => {
      const m = t.match(new RegExp(label + '\\s*:\\s*([\\d.]+)\\s*%'));
      return m ? Number(m[1]) : null;
    };
    const ga = { protein: num('조단백'), fat: num('조지방'), fiber: num('조섬유'),
                 ash: num('조회분'), moisture: num('수분') };
    const specTxt = t.match(/상세 스펙\s*([^[]{0,200})/);
    const spec = ga.protein == null ? null : {
      ga, summary: specTxt ? specTxt[1].trim().slice(0, 160) : null,
      url: `https://prod.danawa.com/info/?pcode=${pcode}`
    };
    return { spec, bridge };
  } catch { return null; }
}

function parseWeight(name) {
  const kg = name.match(/([\d.]+)\s*kg/i);
  if (kg) return Math.round(parseFloat(kg[1]) * 1000);
  const g = name.match(/(\d{3,4})\s*g\b/i);
  return g ? Number(g[1]) : null;
}

async function collectPage(query, page) {
  const url = `https://search.danawa.com/dsearch.php?query=${encodeURIComponent(query)}&page=${page}`;
  const raw = await curl(url);
  const out = [];
  for (const blk of raw.split(/class="prod_item/).slice(1)) {
    /* alt 는 브랜드가 빠진 짧은 이름이다. prod_name 링크 텍스트에 브랜드가 들어있다. */
    const linkNm = blk.match(/class="prod_name"[\s\S]{0,900}?<a[^>]*>([^<]{6,180})<\/a>/);
    const altNm = blk.match(/alt="([^"]{6,160})"/);
    const pr = blk.match(/class="price_sect"[\s\S]{0,1500}?<strong>\s*([\d,]{4,})\s*<\/strong>/);
    if (!pr || !(linkNm || altNm)) continue;
    const name = unesc((linkNm ? linkNm[1] : altNm[1])).replace(/\s+/g, ' ').trim();
    const pc = blk.match(/pcode=(\d+)/);
    const br = blk.match(/href="(https:\/\/prod\.danawa\.com\/bridge\/go_link_goods\.php[^"]+)"/);
    out.push({
      name,
      price: Number(pr[1].replace(/,/g, '')),
      wg: parseWeight(name),
      pcode: pc ? pc[1] : null,
      onCoupang: blk.includes(COUPANG_MALL),
      bridge: br ? unesc(br[1]) : null,
      searchUrl: url
    });
  }
  return out;
}

/* --- 실행 --- */
const QUERY = '강아지 사료';
const { all: known } = await loadFoods(ROOT);
/* 다나와 상품명은 "로얄캐닌 독 미니 인도어 어덜트 3kg" 처럼 중간에 '독' 과 용량이 끼어 있다.
   문자열 포함으로는 못 잡으므로, 등록된 사료의 브랜드·제품명 토큰이 모두 들어있는지로 본다. */
const knownTokens = known.map(f => ({
  label: `${f.brand} ${f.name}`,
  tokens: `${f.brand} ${f.name}`.split(/[\s·()]+/).map(norm).filter(t => t.length >= 2)
}));

const rows = [];
for (let page = 1; page <= 4 && rows.length < TOP * 2; page++) {
  rows.push(...await collectPage(QUERY, page));
}

/* 사료가 아닌 것과 중복을 걸러 순위를 매긴다 */
const seen = new Set();
const ranked = [];
for (const r of rows) {
  if (NOT_FOOD.test(r.name) || IS_TREAT.test(r.name)) continue;
  if (!r.wg || r.wg < 400) continue;                  // 샘플·파우치 제외
  const key = norm(r.name);
  if (seen.has(key)) continue;
  seen.add(key);
  ranked.push({ ...r, rank: ranked.length + 1, pKg: Math.round(r.price / (r.wg / 1000)) });
  if (ranked.length >= TOP) break;
}

/* 쿠팡 링크와 국내 영양정보를 확보한다.
   검색 결과에 판매몰 링크가 없는 경우가 많아 상세 페이지에서도 찾는다. */
for (const r of ranked) {
  r.coupangUrl = r.bridge ? await resolveCoupang(r.bridge) : null;
  delete r.bridge;
  const detail = await fetchDanawaDetail(r.pcode);
  r.spec = detail?.spec ?? null;
  if (!r.coupangUrl && detail?.bridge) r.coupangUrl = await resolveCoupang(detail.bridge);
}

/* 이미 등록된 사료인지 표시 */
for (const r of ranked) {
  const n = norm(r.name);
  const hit = knownTokens.find(k => k.tokens.length >= 2 && k.tokens.every(t => n.includes(t)));
  r.alreadyRegistered = Boolean(hit);
  r.matchedWith = hit ? hit.label : null;
}

const payload = {
  source: 'danawa',
  query: QUERY,
  collectedAt: new Date().toISOString(),
  note: '순위·상품명·가격·용량·쿠팡링크만 수집했다. 성분은 제조사 페이지에서 따로 확보해야 한다.',
  total: ranked.length,
  items: ranked
};

if (!DRY) {
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, 'ranking.json'), JSON.stringify(payload, null, 2));
}

const line = '─'.repeat(74);
console.log(`\n다나와 "${QUERY}" 상위 ${ranked.length}개${DRY ? ' (모의 실행)' : ''}`);
console.log(line);
for (const r of ranked) {
  const flags = [r.alreadyRegistered ? '등록됨' : null, r.coupangUrl ? '쿠팡' : null,
                 r.spec ? `조단백${r.spec.ga.protein}` : null].filter(Boolean).join(' ');
  console.log(`${String(r.rank).padStart(2)}. ${r.name.slice(0, 42).padEnd(42)} ` +
              `${r.price.toLocaleString().padStart(8)}원 ${String(r.pKg.toLocaleString() + '/kg').padStart(11)}  ${flags}`);
}
const newOnes = ranked.filter(r => !r.alreadyRegistered).length;
const withCoupang = ranked.filter(r => r.coupangUrl).length;
const withSpec = ranked.filter(r => r.spec).length;
console.log(`\n${line}`);
console.log(`  미등록 ${newOnes}개 · 쿠팡 링크 ${withCoupang}개 · 국내 영양정보 ${withSpec}개`);
if (!DRY) console.log(`  → data/queue/ranking.json\n`);
