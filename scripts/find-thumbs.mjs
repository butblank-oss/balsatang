#!/usr/bin/env node
/* 발행된 사료의 썸네일을 다나와 카탈로그 이미지로 채운다.

   기존 41종은 원본 앱의 업로드 경로(/objects/uploads/…)를 가리키고 있어 이미지가 뜨지 않는다.
   다나와 카탈로그 이미지(img.danuri.io)는 국내 유통 상품의 실제 제품 사진이다.

     node scripts/find-thumbs.mjs           찾기만 하고 결과를 보여준다
     node scripts/find-thumbs.mjs --write   확실한 것만 data.js 에 넣는다
     node scripts/find-thumbs.mjs --write --include-weak   애매한 것까지 넣는다(권하지 않음)

   ── 왜 이렇게 까다롭게 맞추나 ──
   검색 첫 결과를 그냥 집어오면 엉뚱한 제품이 잡힌다. 실제로 겪은 것:
     지위픽 에어드라이 벤슨/램/비프  → 전부 '사슴고기' 하나로
     아카나 와일드 프레리            → '아카나 캣' (고양이 사료)
     로얄캐닌 레날                   → '로얄캐닌 캣 레날'
   썸네일이 틀리면 사용자는 다른 제품을 보고 있는 것이므로, 이름이 확실히 맞을 때만 쓴다.
*/
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadFoods } from './lib/schema.mjs';

const run = promisify(execFile);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DATA_JS = 'data.js';
const WRITE = process.argv.includes('--write');
const INCLUDE_WEAK = process.argv.includes('--include-weak');

const unesc = s => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function curl(url) {
  const { stdout } = await run('curl', ['-sL', '-m', '25', '-A', UA, url],
    { maxBuffer: 6e7, encoding: 'buffer' });
  return stdout.toString('utf-8');
}

/* 표기 흔들림. 같은 제품을 한글로 옮기는 방식이 회사·쇼핑몰마다 다르다. */
const SYN = [
  ['미디엄', '미디움'], ['프레리', '프레이리'], ['필차드', '피차드'],
  ['맥커럴', '고등어'], ['맥커럴', '매커럴'], ['트라이프', '트라입'],
  ['램', '양고기'], ['비프', '소고기'], ['치킨', '닭고기'],
  ['벤슨', '벤션'], ['벤슨', '사슴고기'], ['살몬', '연어'],
  ['하이포알러제닉', '하이포알러지'], ['인테스티널', '인테스티날'],
  ['그레인프리', '그레인 프리'], ['식스', '6'], ['식스', 'six'],
  ['핏', '피트'], ['앤', '앤드'], ['인스팅트', 'instinct'],
  ['사티에티', '세티어티'], ['키블', 'kibble']
];
const canon = w => {
  for (const [a, b] of SYN) { if (w === b) return a; }
  return w;
};

/* 비교용 토큰에서 뺄 말. 용량·개수·제조사 접두어·일반 명사는 제품을 구분하지 않는다. */
const STOP = new Set([
  '독', '강아지', '반려견', '애견', '사료', '건식', '전연령', '개',
  '챔피언펫푸드', '한국마즈', '하림펫푸드', '네추럴발란스', '카길애그리퓨리나',
  '대주펫푸드', '우리와', '오에스피', '이글포에스', '지위픽', '지위'
]);
function tokens(s) {
  return String(s)
    .replace(/\[다나와\]|\(\d+개\)/g, ' ')
    .replace(/[\d.]+\s*(kg|g|ml|l)\b/gi, ' ')
    .replace(/[^가-힣A-Za-z0-9]+/g, ' ')
    .toLowerCase().trim().split(/\s+/)
    .filter(w => w.length > 1 && !STOP.has(w))
    .map(canon);
}

/* 검색 결과에서 상품을 뽑는다. 두 종류가 섞여 나온다.

   1) 다나와 카탈로그 상품 — pcode 가 있고 이미지가 img.danuri.io
   2) 쇼핑몰 직판 상품    — cmpny_c 로 판매몰이 찍히고, 쿠팡(TP40F)이면
                            이미지가 img*.coupangcdn.com 이다. 쿠팡이 실제로
                            쓰는 상품 사진이라 이쪽이 더 낫다.

   상단 JSON-LD(ItemList)는 앞 6개만 담고 있어 본 목록 블록을 직접 읽는다. */
function parseResults(html) {
  const out = [];
  for (const blk of html.split(/class="prod_item/).slice(1)) {
    const anchor = blk.match(/<p class="prod_name">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
    const altM = blk.match(/<img[^>]*\salt="([^"]{4,200})"/);
    let name = anchor ? unesc(anchor[1].replace(/<[^>]+>/g, '')) : (altM ? unesc(altM[1]) : null);
    if (!name) continue;
    name = name.replace(/\s+/g, ' ').trim();

    const pc = blk.match(/pcode=(\d+)/);
    const shop = blk.match(/cmpny_c=([A-Z0-9]+)/);
    const cat = blk.match(/(?:src|data-src)="(?:https?:)?(\/\/img\.danuri\.io\/[^"?]+)"/);
    const cou = blk.match(/(?:src|data-src)="(?:https?:)?(\/\/img\d*[a-z]*\.coupangcdn\.com\/[^"?]+)"/);

    if (cou) {
      out.push({ id: 'cp:' + (blk.match(/link_prod_c=([A-Za-z0-9]+)/)?.[1] ?? name),
                 name, img: 'https:' + cou[1], from: 'coupang' });
    } else if (pc && cat) {
      out.push({ id: 'dn:' + pc[1], pcode: pc[1], name,
                 img: 'https:' + cat[1], from: 'danawa' });
    }
    void shop;
  }
  return out;
}

/* 후보가 이 사료가 맞는지.
   한쪽만 보면 안 된다. '미니 어덜트' 를 찾는데 '미니 인도어 어덜트' 가 잡히면
   찾는 말은 전부 들어있지만 실제로는 다른 제품이다.
   그래서 빠진 말(missing)과 더 붙은 말(extra)을 같이 본다. */
function match(food, cand) {
  const n = cand.name;
  if (/캣|고양이|cat\b/i.test(n) && !/캣|고양이/.test(food.brand + food.name)) return null;
  const want = tokens(`${food.brand} ${food.name}`);
  const got = tokens(n);
  if (!want.length) return null;
  const same = (a, b) => a === b || a.includes(b) || b.includes(a);
  const missing = want.filter(w => !got.some(g => same(g, w)));
  const extra = got.filter(g => !want.some(w => same(g, w)));
  return { cover: (want.length - missing.length) / want.length, missing, extra };
}

/* 자동 대조로 못 맞추는 것들. 등록된 이름과 국내 유통명이 아예 다른 경우다.
   여기 적힌 이름과 정확히 시작이 같은 카탈로그 상품을 쓴다.
   확신이 없는 제품은 넣지 않는다 — 틀린 사진을 붙이느니 브랜드 마크가 낫다. */
const OVERRIDE = {
  '에어드라이 램':              '지위픽 독 에어드라이 양고기 1kg',
  '에어드라이 트라이프 앤 램':   '지위픽 독 에어드라이 트라이프&양고기 1kg',
  '에어드라이 맥커럴 앤 램':     '지위픽 독 에어드라이 고등어&양고기 1kg',
  '에어드라이 프리레인지 치킨':  '지위픽 독 에어드라이 닭고기 1kg',
  '식스 피쉬':                  '오리젠 독 6 피쉬 11.4kg',
  '오리지널 독 키블 치킨':      '인스팅트 오리지날 치킨 독 키블 1.8kg',
  '더리얼 퍼피':                '더리얼 독 그레인프리 크런치 닭고기 퍼피 1.6kg',
  '더리얼 시니어':              '더리얼 독 그레인프리 크런치 닭고기 시니어 1kg',
  '더리얼 연어':                '더리얼 독 그레인프리 크런치 연어 어덜트 1.6kg'
};

const { all } = await loadFoods('.');
const need = all.filter(f => f.status === 'published' && !/^https?:/.test(f.thumb ?? ''));

/* 브랜드 단위로 후보를 한 번에 모은다. 제품명별로 검색하면 표기가 조금만 달라도
   결과가 비고, 브랜드로 모으면 그 브랜드의 카탈로그 전체에서 고를 수 있다. */
const pool = new Map();
async function brandPool(brand) {
  if (pool.has(brand)) return pool.get(brand);
  const b = brand.replace(/\(.*?\)/g, '').trim();
  const seen = new Map();
  for (const q of [`${b} 독`, `${b} 강아지 사료`]) {
    for (const page of [1, 2]) {
      const html = await curl('https://search.danawa.com/dsearch.php?query=' +
        encodeURIComponent(q) + '&page=' + page);
      for (const c of parseResults(html)) if (c.img && !seen.has(c.id)) seen.set(c.id, c);
    }
  }
  const list = [...seen.values()];
  pool.set(brand, list);
  return list;
}

const strong = [], close = [], none = [];

/* 브랜드 풀에서 못 찾으면 제품명으로 한 번 더 찾는다.
   브랜드 검색 결과에 안 실리는 제품이 있다. */
async function productPool(f) {
  const q = `${f.brand} 독 ${f.name}`.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
  const html = await curl('https://search.danawa.com/dsearch.php?query=' + encodeURIComponent(q));
  return parseResults(html).filter(c => c.img);
}

for (const f of need) {
  const ov = OVERRIDE[f.name];
  if (ov) {
    const html = await curl('https://search.danawa.com/dsearch.php?query=' + encodeURIComponent(ov));
    const hit = parseResults(html).find(c => c.img && c.name.replace(/\s+/g, '').includes(ov.replace(/\s+/g, '')));
    if (hit) { strong.push([f, { ...hit, m: { extra: [] }, forced: true }]); continue; }
  }
  const list = await brandPool(f.brand);
  const ranked = list.map(c => ({ ...c, m: match(f, c) }))
    .filter(c => c.m && c.m.cover >= 0.999)
    .sort((a, b) => (a.m.extra.length - b.m.extra.length) ||
                    ((a.from === 'coupang' ? 0 : 1) - (b.from === 'coupang' ? 0 : 1)));
  let best = ranked[0];
  let pool2 = ranked;
  if (!best || best.m.extra.length) {
    const extra = await productPool(f);
    const r2 = extra.map(c => ({ ...c, m: match(f, c) }))
      .filter(c => c.m && c.m.cover >= 0.999)
      .sort((a, b) => (a.m.extra.length - b.m.extra.length) ||
                      ((a.from === 'coupang' ? 0 : 1) - (b.from === 'coupang' ? 0 : 1)));
    if (r2[0] && (!best || r2[0].m.extra.length < best.m.extra.length)) { best = r2[0]; pool2 = r2; }
  }
  if (!best) { none.push([f, null, list.length]); continue; }
  if (!best.m.extra.length) strong.push([f, best]);
  else close.push([f, best, pool2.slice(0, 3)]);
}

const line = '─'.repeat(60);
const show = (title, rows, withExtra) => {
  if (!rows.length) return;
  console.log(`\n■ ${title} ${rows.length}종`);
  for (const [f, c, aux] of rows) {
    console.log(`  ${f.brand} ${f.name}`);
    if (!c) { console.log(`     → 후보 없음 (브랜드 카탈로그 ${aux ?? 0}개 확인)`); continue; }
    console.log(`     → [${c.from === 'coupang' ? '쿠팡' : '다나와'}] ${c.name}${c.forced ? '  (직접 지정)' : ''}`);
    if (withExtra) {
      console.log(`        덧붙은 말: ${c.m.extra.join(', ')}`);
      for (const a of (aux ?? []).slice(1)) console.log(`        다른 후보: ${a.name}`);
    }
  }
};

console.log(`\n썸네일 찾기${WRITE ? '' : ' (모의 실행 — --write 로 반영)'}`);
console.log(line);
console.log(`  대상 ${need.length}종`);
show('확실 — 이름이 정확히 일치', strong);
show('애매 — 찾는 말은 다 있지만 다른 말이 더 붙어 있다', close, true);
show('후보 없음', none);

const apply = INCLUDE_WEAK ? [...strong, ...close] : strong;
if (WRITE && apply.length) {
  for (const [f, c] of apply) f.thumb = c.from === 'danawa' ? c.img + '?shrink=360:360' : c.img;
  const src = await readFile(DATA_JS, 'utf-8');
  const m = src.match(/const FOODS_ALL\s*=\s*(\[[\s\S]*?\]);/);
  await writeFile(DATA_JS, src.replace(m[1], JSON.stringify(all)));
  console.log(`\n  ${apply.length}종 반영 → ${DATA_JS}`);
}
console.log(`\n${line}\n확실 ${strong.length} · 애매 ${close.length} · 후보없음 ${none.length}\n`);
