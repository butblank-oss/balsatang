#!/usr/bin/env node
/* 다나와 카탈로그에서 사료의 '기본 정보'만 긁어 온다.

   ── 무엇을 가져오고 무엇을 못 가져오나 ──
   가져오는 것 : 제품명·용량·제형·연령·주단백질원·조단백·조지방·제품 사진·다나와 최저가
   못 가져오는 것 : 원료 표기 전체, 조섬유·수분·조회분, 칼로리

   원료가 없으면 별점 넷 중 둘(원료 품질·주의성분)이 안 나오고, 조섬유·수분이
   없으면 건물기준 탄수도 못 낸다. 그래서 이 스크립트가 만든 건 그대로는 발행할 수
   없다 — 게이트 1 이 '근거 누락' 으로 막는다. 그게 맞다. 사람이 라벨을 확인해
   원료를 채워야 발행 후보가 된다.

   가격도 마찬가지다. 정책상 가격 출처는 쿠팡 상품 페이지만 인정한다. 다나와
   최저가는 사람이 쿠팡 링크를 찾을 때 참고하라고 근거 문장에만 적어 둔다.

     node scripts/collect-danawa.mjs "오리젠 독"          찾기만 한다
     node scripts/collect-danawa.mjs "오리젠 독" --write  스테이징에 올린다
*/
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const run = promisify(execFile);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const QUERY = process.argv[2] || '오리젠 독';
const WRITE = process.argv.includes('--write');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const curl = async url => {
  const { stdout } = await run('curl', ['-sS', '--max-time', '25', '-A', UA, url], { maxBuffer: 60e6 });
  return stdout;
};
const unent = s => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
const strip = s => unent(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/* ── 1. 검색해서 pcode 를 모은다 ── */
async function findCodes(q) {
  const html = await curl('https://search.danawa.com/dsearch.php?limit=90&query=' + encodeURIComponent(q));
  const out = new Map();
  const re = /<p class="prod_name">[\s\S]*?<a[^>]*pcode=(\d+)[^>]*>([\s\S]*?)<\/a>/g;
  /* 다나와는 브랜드를 띄어 쓰는 경우가 있다 — '로얄 캐닌 독', '더 리얼 독'.
     '로얄캐닌 독' 으로 물으면 결과는 40건 오는데 접두 일치는 0건이 된다.
     공백을 지우고 견준다. */
  const key = s => s.replace(/\s+/g, '');
  const qk = key(q);
  let m;
  while ((m = re.exec(html))) {
    const name = strip(m[2]);
    if (key(name).startsWith(qk) && !out.has(name)) out.set(name, m[1]);
  }
  return [...out].map(([name, pcode]) => ({ name, pcode }));
}

/* ── 2. 상품 하나의 기본 정보 ── */
async function detail(pcode) {
  const html = await curl('https://prod.danawa.com/info/?pcode=' + pcode);
  const meta = n => {
    const m = new RegExp(`<meta[^>]*(?:name|property)="${n}"[^>]*content="([^"]*)"`).exec(html);
    return m ? unent(m[1]) : null;
  };
  const title = (meta('og:title') || '').replace(/^\[다나와\]\s*/, '').replace(/\s*\(\d+개\)\s*$/, '').trim();
  const img = (meta('og:image') || '').split('?')[0];
  const low = /([0-9,]+)\s*원/.exec(meta('og:description') || '');

  /* 스펙 줄 — '강아지 전용 / 사료 / 전연령 / 건식 / 스몰(~8mm) / 주 단백질원: …' */
  const i = html.indexOf('spec_list');
  /* [영양정보] 블록이 뒤쪽에 있어서 1600자로는 잘렸다. 넉넉히 읽는다. */
  const spec = i < 0 ? '' : strip(html.slice(i, i + 3000).replace(/<[^>]+>/g, '|'))
    .replace(/\|+/g, '|').replace(/^spec_list"?>?\|?/, '');

  /* 스펙의 [영양정보] 가 조섬유·조회분·수분까지 준다. 없으면 keywords 로 물러선다.
     넷(조단백·조지방·조섬유·수분)이 다 있으면 건물기준 탄수를 낼 수 있다. */
  const kw = spec + ' ' + (meta('keywords') || '');
  const num = label => {
    const m = new RegExp(label + '\\s*\\|?\\s*:?\\s*\\|?\\s*([0-9.]+)\\s*%').exec(kw);
    return m ? Number(m[1]) : null;
  };
  const prot = num('조단백') != null ? [null, num('조단백')] : null;
  const fat = num('조지방') != null ? [null, num('조지방')] : null;
  /* '주 단백질원|: |칠면조고기|, |닭고기|' 처럼 항목마다 막대가 낀다.
     콜론 뒤부터 다음 슬래시(다음 스펙 항목) 전까지를 통째로 걷어낸다. */
  const mp = /주 ?단백질원\s*\|?\s*:\s*([\s\S]*?)(?:\/|$)/.exec(spec);
  const mainProt = mp ? [mp[1].replace(/\|/g, ' ').replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim()] : null;

  return {
    pcode, title, img,
    lowPrice: low ? Number(low[1].replace(/,/g, '')) : null,
    type: /건식/.test(spec) ? 'dry' : /습식/.test(spec) ? 'wet' : /동결건조/.test(spec) ? 'freeze_dried' : null,
    age: /전연령/.test(spec) ? 'all' : /퍼피|자견/.test(spec) ? 'puppy'
      : /시니어|노령/.test(spec) ? 'senior' : /성견/.test(spec) ? 'adult' : null,
    protein: num('조단백'), fat: num('조지방'),
    fiber: num('조섬유'), ash: num('조회분'), moisture: num('수분'),
    /* 다나와 스펙에 '처방식' 이 찍힌다. 수의사 처방 사료는 화면에서 따로 안내한다. */
    rx: /\|처방식\|/.test(spec) || /처방식/.test(spec),
    mainProtein: mainProt?.[0] || null,
    spec
  };
}

/* 제품명 끝의 용량을 g 으로. '11.4kg' → 11400 */
function weightOf(title) {
  const t = title.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const m = /([\d.]+)\s*(kg|g)\s*$/i.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  const g = /kg/i.test(m[2]) ? Math.round(n * 1000) : Math.round(n);
  /* 50g·6g 짜리는 사료가 아니라 샘플이나 간식이다. 판매 용량으로 세지 않는다. */
  return g >= 200 ? g : null;
}
/* 용량을 뗀 나머지가 제품이다. '오리젠 독 퍼피 6kg' → '오리젠 독 퍼피' */
const baseName = t => t
  .replace(/\s*\([^)]*\)\s*$/, '')          /* '(11.4kg x 1개)' 같은 꼬리 먼저 */
  .replace(/\s*[\d.]+\s*(kg|g)\s*$/i, '')
  .trim();

/* ── 실행 ── */
const codes = await findCodes(QUERY);
console.log(`\n다나와 "${QUERY}" — 상품 ${codes.length}건`);
if (!codes.length) {
  /* 0건이어도 결과 파일을 비워서 남긴다. 안 그러면 직전 브랜드 결과가 그대로
     남아, 다음 단계가 그걸 읽어 엉뚱한 브랜드 이름으로 등록해 버린다.
     실제로 로얄캐닌·더리얼 자리에 아카나 제품이 들어갔다. */
  if (WRITE) fs.writeFileSync(path.join(ROOT, 'data/staging/_danawa.json'),
    JSON.stringify({ query: QUERY, items: [] }, null, 2) + '\n');
  console.log('  없습니다.');
  process.exit(0);
}

const rows = [];
for (const c of codes) {
  try { rows.push({ ...await detail(c.pcode), listName: c.name }); }
  catch (e) { console.log(`  ! ${c.name} — ${e.message}`); }
}

/* 용량만 다른 것은 한 제품으로 묶는다 */
const groups = new Map();
for (const r of rows) {
  const key = baseName(r.title || r.listName);
  if (!groups.has(key)) groups.set(key, { key, sizes: [], rows: [] });
  const g = groups.get(key);
  const w = weightOf(r.title || r.listName);
  if (w) g.sizes.push(w);
  g.rows.push(r);
}

/* ── 걸러낼 것 ──
   검색 결과에는 고양이 사료·간식·껌이 섞여 들어온다. 실제로 '지위픽' 23종 중
   고양이 12종과 구강간식 1종이 있었다. 이름만 비슷하다고 개 사료로 등록하면
   사용자가 엉뚱한 제품을 본다. 습식은 사장님이 빼기로 했다. */
const SKIP_NAME = /(^|\s)(캣|고양이)|간식|껌|뼈|스틱|트릿|파우치|토퍼|영양제/;
const isDogFood = g => {
  const best = g.rows[0];
  if (SKIP_NAME.test(g.key)) return { ok: false, why: '고양이용·간식' };
  if (/고양이|캣/.test(best.spec ?? '')) return { ok: false, why: '고양이용' };
  if (best.type === 'wet') return { ok: false, why: '습식' };
  if (!/사료/.test(best.spec ?? '')) return { ok: false, why: '사료가 아님' };
  return { ok: true };
};

console.log('─'.repeat(64));
const items = [];
const dropped = [];
for (const g of [...groups.values()].sort((a, b) => a.key.localeCompare(b.key, 'ko'))) {
  const v = isDogFood(g);
  if (!v.ok) { dropped.push(`${g.key} (${v.why})`); continue; }
  const best = g.rows.find(r => r.protein != null) ?? g.rows[0];
  const sizes = [...new Set(g.sizes)].sort((a, b) => a - b);
  const low = g.rows.map(r => r.lowPrice).filter(Boolean).sort((a, b) => a - b)[0] ?? null;
  console.log(`\n■ ${g.key}   ${sizes.map(s => s >= 1000 ? s / 1000 + 'kg' : s + 'g').join(' / ')}`);
  console.log(`   제형 ${best.type ?? '?'} · 연령 ${best.age ?? '?'}${best.rx ? ' · 처방식' : ''}` +
    ` · 조단백 ${best.protein ?? '?'} 조지방 ${best.fat ?? '?'} 조섬유 ${best.fiber ?? '?'} 수분 ${best.moisture ?? '?'}`);
  console.log(`   주단백질원 ${best.mainProtein ?? '?'}`);
  console.log(`   다나와 최저가 ${low ? low.toLocaleString('ko-KR') + '원' : '?'} · 사진 ${best.img ? '있음' : '없음'}`);
  items.push({ ...best, base: g.key, sizes, low });
}
console.log('\n' + '─'.repeat(64));
if (dropped.length) {
  console.log(`걸러낸 것 ${dropped.length}종`);
  for (const d of dropped) console.log('   · ' + d);
}
console.log(`제품 ${items.length}종 · 원료는 다나와에 없습니다 — 라벨을 봐야 채워집니다.\n`);

if (WRITE) {
  /* 어떤 검색어로 긁은 건지 같이 적는다. 다음 단계가 이걸 대조해 오염을 막는다. */
  fs.writeFileSync(path.join(ROOT, 'data/staging/_danawa.json'),
    JSON.stringify({ query: QUERY, items }, null, 2) + '\n');
  console.log('→ data/staging/_danawa.json (스테이징 변환은 build-staging 이 한다)\n');
}
