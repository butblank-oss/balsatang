#!/usr/bin/env node
/* 사람이 승인한 건만 data.js 로 발행한다.
   게이트를 통과하지 않은 항목은 명령에 들어와도 발행하지 않는다 — 명령보다 게이트가 우선한다.

   사용:
     node scripts/merge-approved.mjs --approve stg_a,stg_b --reject stg_c
     node scripts/merge-approved.mjs --dry-run --approve stg_a
*/
import { readFile, readdir, writeFile, rm, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { computeScore, loadFoods } from './lib/schema.mjs';
import { strengthOf } from './compute-func-strength.mjs';
import { deriveDetail } from './lib/derive.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STAGING = join(ROOT, 'data/staging');
const REJECTED = join(ROOT, 'data/rejected');
const DATA_JS = join(ROOT, 'data.js');
const DRY = process.argv.includes('--dry-run');

const argList = (flag) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1].split(/[,\s]+/).filter(Boolean) : [];
};
const approve = new Set(argList('--approve'));
const reject = new Set(argList('--reject'));

if (!approve.size && !reject.size) {
  console.error('발행하거나 반려할 항목이 없습니다. --approve / --reject 를 지정하세요.');
  process.exit(2);
}

/* 게이트 결과 — 이게 없으면 아무것도 발행하지 않는다. */
let review;
try {
  review = JSON.parse(await readFile(join(STAGING, '_review.json'), 'utf-8'));
} catch {
  console.error('data/staging/_review.json 이 없습니다. 먼저 build-review.mjs 를 실행하세요.');
  process.exit(2);
}
const readyBy = {};
for (const b of review.batches) for (const it of b.items) readyBy[it.stagingId] = it.ready;

const files = (await readdir(STAGING)).filter(f => f.endsWith('.json') && !f.startsWith('_') && f !== 'review.json');
const { all: foods } = await loadFoods(ROOT);
const existingIds = new Set(foods.map(f => f.id));

const published = [], rejected = [], refused = [], missing = new Set([...approve, ...reject]);
const details = {};   /* uuid → 상세 화면 데이터 */

for (const file of files) {
  const path = join(STAGING, file);
  const batch = JSON.parse(await readFile(path, 'utf-8'));
  const keep = [];

  for (const item of batch.items ?? []) {
    const id = item.stagingId;
    missing.delete(id);

    if (reject.has(id)) {
      rejected.push({ ...item, rejectedAt: new Date().toISOString(), batchFile: file });
      continue;
    }
    if (!approve.has(id)) { keep.push(item); continue; }

    /* 승인 명령이 있어도 게이트를 통과하지 않았으면 발행하지 않는다. */
    if (!readyBy[id]) {
      refused.push({ id, label: `${item.proposed?.brand} ${item.proposed?.name}` });
      keep.push(item);
      continue;
    }

    const p = item.proposed;
    let uuid = randomUUID();
    while (existingIds.has(uuid)) uuid = randomUUID();
    existingIds.add(uuid);

    /* 상세 화면 데이터. 라벨에서 뽑은 보장성분표와 원재료 목록으로 규칙이 만든다.
       ga·ingredients 가 없으면 만들지 않는다 — 없는 걸 지어내지 않는다. */
    const detail = (p.ga || p.ingredients)
      ? deriveDetail({ ga: p.ga, ingredients: p.ingredients, facts: p.facts,
                       price: p.price, weightOptions: p.price?.wgOptions,
                       rxInfo: p.rxInfo ?? null })
      : null;
    if (detail) details[uuid] = detail;

    published.push({
      id: uuid,
      brand: p.brand, brandSlug: p.brandSlug, country: p.country, name: p.name,
      type: p.type, rx: p.rx, ages: p.ages, sizes: p.sizes,
      thumb: p.thumb ?? null, ico: p.ico ?? 'dog',
      score: computeScore(p.ratings),   // 제출값이 아니라 항상 공식으로 다시 계산한다
      ratings: p.ratings, func: p.func, warnN: p.warnN ?? 0,
      concerns: p.concerns, price: p.price,
      /* 기능성 근거 강도. 수집분에 funcIngr 가 있으면 여기서 계산해 둔다.
         없으면 나중에 scripts/compute-func-strength.mjs 로 일괄 계산한다. */
      funcStrength: (() => {
        const fi = p.funcIngr ?? detail?.funcIngr;
        return fi ? Object.fromEntries(Object.entries(fi)
          .map(([k, v]) => [k, strengthOf(v)]).filter(([, v]) => v > 0)) : undefined;
      })(),
      specOrigin: p.specOrigin,     // 성분표가 국내 기준인지 해외 기준인지 — 사용자에게 표시된다
      status: 'published',
      srcState: 'sourced',
      src: {
        sources: item.sources,
        evidence: item.evidence,
        audit: { verdict: item.audit?.verdict ?? null, model: item.audit?.auditor?.model ?? null },
        stagingId: id,
        publishedAt: new Date().toISOString()
      }
    });
  }

  if (!DRY) {
    if (keep.length) await writeFile(path, JSON.stringify({ ...batch, items: keep }, null, 2));
    else await rm(path, { force: true });
  }
}

if (published.length && !DRY) {
  let src = await readFile(DATA_JS, 'utf-8');
  const m = src.match(/const FOODS_ALL\s*=\s*(\[[\s\S]*?\]);/);
  const merged = [...JSON.parse(m[1]), ...published];
  src = src.replace(m[1], JSON.stringify(merged));
  if (Object.keys(details).length) {
    const dm = src.match(/const DETAIL\s*=\s*(\{[\s\S]*?\});\s*\n/);
    const mergedD = { ...JSON.parse(dm[1]), ...details };
    src = src.replace(dm[1], JSON.stringify(mergedD));
  }
  await writeFile(DATA_JS, src);
}

if (rejected.length && !DRY) {
  await mkdir(REJECTED, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const path = join(REJECTED, `${stamp}.json`);
  let prev = [];
  try { prev = JSON.parse(await readFile(path, 'utf-8')); } catch {}
  await writeFile(path, JSON.stringify([...prev, ...rejected], null, 2));
}

/* --- 결과 --- */
const line = '─'.repeat(60);
console.log(`\n발행 처리${DRY ? ' (모의 실행 — 파일을 바꾸지 않음)' : ''}`);
console.log(line);
published.forEach(f => console.log(`  ✅ 발행   ${f.brand} ${f.name}  (${f.score}점)`));
rejected.forEach(r => console.log(`  🗑  반려   ${r.proposed?.brand} ${r.proposed?.name}`));
refused.forEach(r => console.log(`  ⛔ 거부   ${r.label} — 게이트 미통과. 승인 명령을 무시했습니다`));
missing.forEach(id => console.log(`  ❓ 없음   ${id} — 스테이징에 해당 항목이 없습니다`));
console.log(`\n${line}\n발행 ${published.length} · 반려 ${rejected.length}` +
            `${refused.length ? ` · 거부 ${refused.length}` : ''}${missing.size ? ` · 없음 ${missing.size}` : ''}\n`);

process.exit(refused.length || missing.size ? 1 : 0);
