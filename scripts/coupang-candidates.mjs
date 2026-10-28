#!/usr/bin/env node
/* 심사 대기 사료마다 쿠팡 상품 후보를 찾아 둔다. 매일 심사 목록 갱신 때 돈다.

     node scripts/coupang-candidates.mjs            전부 다시 찾기
     node scripts/coupang-candidates.mjs --only stg_orijen_5195074 [...]

   하는 일:
     1) 스테이징 사료마다 '브랜드 이름'으로 쿠팡 검색 → 위에서 3개를 후보로 둔다
     2) 후보마다 파트너스 구매 링크(link.coupang.com/a/…)를 만든다
     3) 상품명에 용량이 있으면 읽어 둔다. 없으면 null — 추측하지 않는다
     4) data/queue/coupang-picks.json 에 사람이 미리 골라 둔 상품이 있으면
        그 상품을 '선택됨'으로 붙인다 (가격·링크는 이번 검색 기준으로 새로 받는다)

   결과는 data/queue/coupang-candidates.json 하나다. 스테이징 원본은 건드리지 않는다.
   고르는 건 사람이다 — 심사 화면에서 후보를 고르고 용량을 확인하면 그때 스테이징에 들어간다.
   이름이 비슷한 다른 제품(고양이 사료, 다른 맛)이 위에 잡히는 일이 잦아서다.

   키가 없으면(로컬, Secrets 미등록) 아무것도 바꾸지 않고 0 으로 끝난다.
   심사 목록 갱신 자체를 막으면 안 되기 때문이다. */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { search, deeplink } from './coupang-partners.mjs';

const STAGING = 'data/staging';
const OUT = 'data/queue/coupang-candidates.json';
const PICKS = 'data/queue/coupang-picks.json';
const PER_ITEM = 3;
/* 파트너스 검색 API 는 분당 호출 수 제한이 있다. 넉넉히 쉰다. */
const GAP_MS = 1500;
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!process.env.COUPANG_ACCESS_KEY || !process.env.COUPANG_SECRET_KEY) {
  console.log('쿠팡 키(COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY)가 없어 후보 찾기를 건너뜁니다.');
  process.exit(0);
}

const onlyAt = process.argv.indexOf('--only');
const only = onlyAt === -1 ? null : new Set(process.argv.slice(onlyAt + 1));

const readJson = async (p, dflt) => { try { return JSON.parse(await readFile(p, 'utf-8')); } catch { return dflt; } };

/* 상품명 → 그램. '6kg, 1개' → 6000, '2.1kg 2개' → 4200, '400g' → 400.
   용량 표기가 없거나 서로 다른 용량이 둘 이상이면 null 이다 — 고르는 사람이 직접 넣는다.
   ('4.5kg 그레인프리 …, 4.5kg' 처럼 같은 용량이 두 번 나오는 건 하나로 본다) */
function wgFromName(name) {
  const grams = ([, n, unit]) => Math.round(Number(n) * (unit.toLowerCase() === 'kg' ? 1000 : 1));
  const all = [...String(name).matchAll(/(\d+(?:\.\d+)?)\s*(kg|g)(?![a-z])/gi)];
  const sizes = [...new Map(all.map(m => [grams(m), m])).values()];
  if (sizes.length !== 1) return { wg: null, wgNote: sizes.length ? '용량 표기가 여러 개' : null };
  const [, n, unit] = sizes[0];
  const one = grams(sizes[0]);
  const cnt = Number((String(name).match(/(\d+)\s*개(?!월)/) ?? [])[1] ?? 1);
  return cnt > 1
    ? { wg: one * cnt, wgNote: `${n}${unit} × ${cnt}개` }
    : { wg: one, wgNote: null };
}

/* 검색 결과의 추적 링크 → 쿠팡 상품 주소. 스테이징 출처(role: retail)에 넣을 주소다. */
const ids = url => ({
  pageKey: (String(url).match(/(?:pageKey=|products\/)(\d+)/) ?? [])[1] ?? null,
  itemId: (String(url).match(/itemId=(\d+)/) ?? [])[1] ?? null,
  vendorItemId: (String(url).match(/vendorItemId=(\d+)/) ?? [])[1] ?? null
});
const productUrl = ({ pageKey, itemId, vendorItemId }) =>
  `https://www.coupang.com/vp/products/${pageKey}` +
  (itemId ? `?itemId=${itemId}` + (vendorItemId ? `&vendorItemId=${vendorItemId}` : '') : '');

const query = p => `${p.brand} ${p.name}`.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();

/* --- 스테이징 사료 목록 --- */
const files = (await readdir(STAGING))
  .filter(f => f.endsWith('.json') && !f.startsWith('_') && f !== 'review.json');
const items = [];
for (const f of files) {
  const batch = await readJson(join(STAGING, f), {});
  for (const it of batch.items ?? []) {
    if (!it.proposed || (only && !only.has(it.stagingId))) continue;
    items.push(it);
  }
}

const prev = await readJson(OUT, { items: {} });
const picks = (await readJson(PICKS, { items: {} })).items ?? {};
const out = { builtAt: new Date().toISOString(), note: '', items: only ? { ...prev.items } : {} };

let found = 0, failed = 0;
for (const it of items) {
  const p = it.proposed;
  const q = query(p);
  let rows = [];
  try { rows = await search(q, 10); }
  catch (e) {
    failed++;
    console.log(`  ✗ ${q} — ${e.message}`);
    /* 실패하면 지난번 후보를 그대로 둔다. 하루 못 받았다고 화면에서 사라지면 안 된다. */
    if (prev.items?.[it.stagingId]) out.items[it.stagingId] = prev.items[it.stagingId];
    await sleep(GAP_MS);
    continue;
  }
  await sleep(GAP_MS);

  const pick = picks[it.stagingId];
  const pickIds = pick ? ids(pick.url) : null;

  const toCand = r => {
    const id = ids(r.url);
    return { name: r.name, price: r.price ?? null, ...wgFromName(r.name),
             rocket: !!r.rocket, image: r.image ?? null,
             ...id, url: productUrl(id), buyUrl: null };
  };
  /* 쿠팡 검색 순서는 광고·인기 순이라 다른 제품이 위에 잘 뜬다('식스피쉬' → 피트앤트림).
     사료 이름 낱말이 상품명에 많이 들어간 순으로 다시 세운다. 고양이 사료는 뒤로 민다. */
  const words = q.toLowerCase().split(' ').filter(w => w.length > 1);
  const squash = s => String(s).toLowerCase().replace(/\s+/g, '');
  const fit = r => words.filter(w => squash(r.name).includes(squash(w))).length -
                   (/고양이|캣|cat/i.test(r.name) ? words.length : 0);
  const ranked = rows.map((r, i) => ({ r, i, s: fit(r) }))
    .sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.r);
  const cands = ranked.slice(0, PER_ITEM).map(toCand);

  /* 미리 골라 둔 상품: 검색 10건 안에 같은 itemId 가 있으면 그 이름·가격을 쓴다.
     없으면 가격은 비워 둔다 — 상품 페이지는 이 환경에서 열리지 않는다. */
  let picked = null;
  if (pick) {
    const hit = rows.find(r => ids(r.url).itemId === pickIds.itemId);
    picked = hit
      ? { ...toCand(hit), url: productUrl(pickIds) }
      : { name: null, price: null, wg: null, wgNote: '검색 결과에 없어 가격·용량을 못 받음',
          rocket: false, image: null, ...pickIds, url: productUrl(pickIds), buyUrl: null };
    if (pick.wg) { picked.wg = pick.wg; picked.wgNote = '사람이 확인한 용량'; }
    picked.by = pick.by ?? '사람';
    picked.memo = pick.memo ?? null;
  }

  /* 파트너스 링크는 한 번에 만든다. 지난번에 만든 링크가 있으면 다시 쓴다. */
  const known = new Map(Object.values(prev.items ?? {})
    .flatMap(x => [...(x.candidates ?? []), ...(x.picked ? [x.picked] : [])])
    .filter(c => c.buyUrl).map(c => [c.url, c.buyUrl]));
  const all = [...cands, ...(picked ? [picked] : [])];
  for (const c of all) c.buyUrl = known.get(c.url) ?? null;
  const need = [...new Set(all.filter(c => !c.buyUrl).map(c => c.url))];
  if (need.length) {
    try {
      const made = new Map((await deeplink(need)).map(m => [m.origin, m.short]));
      for (const c of all) c.buyUrl ??= made.get(c.url) ?? null;
    } catch (e) { console.log(`  ✗ ${q} 링크 만들기 — ${e.message}`); }
    await sleep(GAP_MS);
  }

  out.items[it.stagingId] = { query: q, fetchedAt: new Date().toISOString(), candidates: cands, picked };
  found++;
  console.log(`  ${q}${picked ? '  (선택됨)' : ''}`);
  for (const c of cands) {
    console.log(`      ${c.price?.toLocaleString('ko-KR') ?? '—'}원 · ${c.wg ? c.wg + 'g' : '용량?'} · ${c.name}`);
  }
}

out.note = '쿠팡 파트너스 검색 상위 후보. 자동 선택하지 않는다 — 심사 화면에서 사람이 고르고 용량을 확인한다. ' +
           'wg 가 null 이면 상품명에 용량이 없다는 뜻이다.';
await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`\n후보 저장 → ${OUT}  (${found}종${failed ? ` · 실패 ${failed}` : ''})`);
