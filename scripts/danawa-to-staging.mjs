#!/usr/bin/env node
/* collect-danawa 가 긁어 온 기본 정보를 심사 대기 항목으로 만든다.

   ── 왜 그대로 발행되지 않나 ──
   다나와엔 원료 표기와 조섬유·수분이 없다. 그게 없으면
     · 원료 품질 별점  — 1번 원료가 뭔지 몰라 못 낸다
     · 주의성분 별점   — 주의·위험 원료 수를 셀 수 없다
     · 건물기준 탄수    — 조섬유·수분이 없어 계산이 안 된다
   네 별점 중 둘과 총점이 비고, 게이트 1 이 '근거 누락' 으로 막는다. 그게 맞다.
   심사 화면에는 '무엇이 빠졌는지' 와 함께 보류로 뜬다.

   가격도 pricePending 이다. 정책상 가격 출처는 쿠팡 상품 페이지만 인정하는데
   다나와 최저가는 쿠팡이 아닐 수 있다. 참고하시라고 근거 문장에만 적어 둔다.

     node scripts/danawa-to-staging.mjs 오리젠 orijen CA
       (브랜드 표시명 · 슬러그 · 원산지 코드)
*/
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [BRAND, SLUG, COUNTRY] = process.argv.slice(2);
if (!BRAND || !SLUG || !COUNTRY) {
  console.log('쓰는 법: node scripts/danawa-to-staging.mjs 오리젠 orijen CA');
  process.exit(1);
}

const src = path.join(ROOT, 'data/staging/_danawa.json');
if (!fs.existsSync(src)) {
  console.log('_danawa.json 이 없습니다. 먼저 collect-danawa.mjs --write 를 돌리세요.');
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
const rows = Array.isArray(raw) ? raw : (raw.items ?? []);

/* ── 오염 검사 ──
   collect-danawa 가 0건을 찾으면 예전 결과 파일이 그대로 남아 있었다. 그걸 읽으면
   직전 브랜드 제품이 이번 브랜드 이름으로 등록된다 — 실제로 로얄캐닌·더리얼 자리에
   아카나 18종이 들어갔다. 제품명이 이 브랜드로 시작하는지 확인하고, 아니면 멈춘다. */
if (!rows.length) {
  console.log(`\n${BRAND} — 다나와에서 찾은 상품이 없습니다. 검색어를 확인하세요.\n`);
  process.exit(0);
}
const nospace = s => String(s ?? '').replace(/\s+/g, '');
const alien = rows.filter(r => !nospace(r.base).startsWith(nospace(BRAND)));
if (alien.length) {
  console.log(`\n❌ 수집 결과가 ${BRAND} 것이 아닙니다 — 다른 브랜드가 섞여 있습니다.`);
  console.log(`   수집 검색어: ${raw.query ?? '(모름)'}`);
  for (const a of alien.slice(0, 5)) console.log(`   · ${a.base}`);
  console.log(`   collect-danawa.mjs "${BRAND} 독" --write 를 먼저 돌리세요.\n`);
  process.exit(1);
}

/* 이미 발행됐거나 이미 스테이징에 있는 건 다시 올리지 않는다 */
const { FOODS_ALL } = new Function(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8')
  .replace(/^/, '') + '; return {FOODS_ALL};')();
const norm = s => String(s).replace(/\s+/g, '').toLowerCase();
const known = new Set(FOODS_ALL.map(f => norm(f.brand + f.name)));

const stagingDir = path.join(ROOT, 'data/staging');
for (const file of fs.readdirSync(stagingDir).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
  let b; try { b = JSON.parse(fs.readFileSync(path.join(stagingDir, file), 'utf8')); } catch { continue; }
  for (const it of b.items ?? []) {
    const p = it.proposed ?? {};
    if (p.brand && p.name) known.add(norm(p.brand + p.name));
  }
}

/* '오리젠 독 퍼피 라지브리드' → '퍼피 라지브리드' */
const shortName = base => base.replace(/^\S+\s+독\s*/, '').replace(/^\S+\s+/, m => m).trim();

const now = new Date().toISOString();
const items = [];
let skipped = 0;

for (const r of rows) {
  /* '로얄 캐닌 독 미니 인도어 어덜트' → '미니 인도어 어덜트'.
     브랜드가 띄어 쓰여 있을 수 있으니 글자 사이 공백을 허용해 지운다. */
  const brandRe = new RegExp('^' + BRAND.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*') + '\\s*(독)?\\s*');
  const name = r.base.replace(brandRe, '').trim() || r.base;
  if (known.has(norm(BRAND + name))) { skipped++; continue; }

  items.push({
    stagingId: `stg_${SLUG}_${r.pcode}`,
    proposed: {
      brand: BRAND, brandSlug: SLUG, country: COUNTRY, name,
      type: r.type ?? 'dry', rx: false,
      ages: [r.age ?? 'all'], sizes: ['all'],
      /* 원료가 없어 낼 수 있는 별점이 없다. 지어내지 않는다. */
      ratings: { quality: null, carb: null, additive: null, value: null },
      score: null, func: [], warnN: 0, concerns: [],
      facts: { protein: r.protein ?? null, dmCarb: null, firstIngrCat: null,
               cautionN: null, dangerN: null, pKg: null },
      specOrigin: 'domestic',
      /* 다나와가 준 두 값만. 조섬유·수분·조회분은 라벨을 봐야 한다. */
      ga: { protein: r.protein ?? null, fat: r.fat ?? null,
            fiber: null, moisture: null, ash: null },
      ingredients: [],
      ...(r.img ? { thumb: r.img + '?shrink=360:360' } : {}),
      /* 아직 라벨을 못 봤다. 게이트는 이 표시를 보고 채점 검사를 미룬다 —
         발행 후보가 되지는 않는다. 사람이 원료를 채워야 draft 가 풀린다. */
      draft: true,
      pricePending: true,
      wgOptionsHint: r.sizes
    },
    sources: [
      { role: 'retail', url: `https://prod.danawa.com/info/?pcode=${r.pcode}`, fetchedAt: now,
        title: '다나와 카탈로그 — 제품명·용량·제형·연령·사진 (가격 근거 아님)' }
    ],
    evidence: {
      'facts.protein': r.protein != null
        ? { src: 0, quote: `다나와 스펙 — 조단백 ${r.protein}%` } : undefined,
      '_남은일': { src: 0, quote:
        `라벨을 봐야 채워집니다 — 원료 표기 전체, 조섬유·수분(건물기준 탄수 계산용), 칼로리. ` +
        `쿠팡 구매 링크와 가격도 필요합니다. 참고: 다나와 최저가 ` +
        `${r.low ? r.low.toLocaleString('ko-KR') + '원' : '미확인'}` +
        `${r.mainProtein ? ` · 주단백질원 ${r.mainProtein}` : ''}` +
        `${r.sizes?.length ? ` · 판매 용량 ${r.sizes.map(s => s >= 1000 ? s / 1000 + 'kg' : s + 'g').join(', ')}` : ''}` }
    },
    collector: { agent: '다나와 수집', via: 'scripts/collect-danawa.mjs', at: now }
  });
}
for (const it of items) for (const k of Object.keys(it.evidence))
  if (it.evidence[k] === undefined) delete it.evidence[k];

const batchId = `danawa-${SLUG}-${now.slice(0, 10)}`;
const out = path.join(stagingDir, `${batchId}.json`);
fs.writeFileSync(out, JSON.stringify(
  { batchId, collectedAt: now, collector: { agent: '다나와 수집', model: null }, items }, null, 2) + '\n');

console.log(`\n${BRAND} — 새로 올림 ${items.length}종 · 이미 있어 건너뜀 ${skipped}종`);
for (const it of items) console.log('   ', it.proposed.name);
console.log(`→ data/staging/${batchId}.json\n`);
