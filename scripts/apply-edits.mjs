#!/usr/bin/env node
/* 심사 화면에서 사람이 고친 값을 스테이징에 반영한다.

   심사 화면의 '발행 명령 복사'는 이런 텍스트를 만든다:

     /publish
     approve: stg_a stg_b
     edits:
     ```json
     { "stg_a": { "facts": { "protein": 28 }, "reason": "라벨 재확인 — 28.0% 이상" } }
     ```

   이 스크립트는 그 JSON 만 받는다. 파일이나 표준입력으로 넘기면 된다:

     node scripts/apply-edits.mjs edits.json
     pbpaste | node scripts/apply-edits.mjs -

   하는 일:
     1) facts / price 를 덮어쓴다
     2) ratings 와 score 를 루브릭으로 다시 계산한다  ← 사람이 점수를 직접 못 고치게 하는 지점
     3) price.pKg 를 다시 계산한다
     4) 고친 값과 사유를 audit.humanEdits 에 남긴다
     5) audit.verdict 를 지운다 — 값이 바뀌었으니 심사 AI 대조는 무효다

   5번 때문에 고친 항목은 곧바로 발행 후보가 되지 않는다.
   대조를 다시 붙이거나, 사유를 근거로 사람이 다시 승인해야 한다. 의도한 동작이다.
*/
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { rateAll } from './lib/rubric.mjs';
import { computeScore } from './lib/schema.mjs';

const STAGING = 'data/staging';
const arg = process.argv[2];
if (!arg) {
  console.error('사용: node scripts/apply-edits.mjs <edits.json | ->');
  process.exit(2);
}

const raw = arg === '-'
  ? await new Promise((res, rej) => {
      let s = ''; process.stdin.setEncoding('utf-8');
      process.stdin.on('data', c => s += c);
      process.stdin.on('end', () => res(s));
      process.stdin.on('error', rej);
    })
  : await readFile(arg, 'utf-8');

/* 명령 전체를 붙여넣어도 되도록, ```json 블록이 있으면 그 안만 쓴다 */
const fenced = raw.match(/```json\s*([\s\S]*?)```/);
let edits;
try { edits = JSON.parse(fenced ? fenced[1] : raw); }
catch (e) { console.error('JSON 을 읽지 못했습니다: ' + e.message); process.exit(2); }

const files = (await readdir(STAGING))
  .filter(f => f.endsWith('.json') && !f.startsWith('_') && f !== 'review.json');

const applied = [];
const missing = new Set(Object.keys(edits));

for (const file of files) {
  const path = join(STAGING, file);
  const batch = JSON.parse(await readFile(path, 'utf-8'));
  let touched = false;

  for (const item of batch.items ?? []) {
    const e = edits[item.stagingId];
    if (!e) continue;
    missing.delete(item.stagingId);

    const p = item.proposed;
    const before = { facts: { ...p.facts }, price: { ...(p.price ?? {}) }, score: p.score };
    const changes = [];

    for (const grp of ['facts', 'price']) {
      for (const [k, v] of Object.entries(e[grp] ?? {})) {
        const old = p[grp]?.[k];
        if (old === v) continue;
        (p[grp] ??= {})[k] = v;
        changes.push(`${grp}.${k}: ${old ?? '—'} → ${v ?? '—'}`);
      }
    }
    if (!changes.length && !e.reason) continue;

    /* 가격이 바뀌면 kg당 단가를 다시 낸다 */
    if (p.price?.p > 0 && p.price?.wg > 0) {
      p.price.pKg = Math.round(p.price.p / (p.price.wg / 1000));
    }
    /* 점수는 사람이 못 고친다. 항상 루브릭이 다시 낸다. */
    const ratings = rateAll({ ...p.facts, pKg: p.pricePending ? null : p.price?.pKg });
    if (p.pricePending) ratings.value = null;
    p.ratings = ratings;
    p.score = p.pricePending ? null : computeScore(ratings);
    if (p.facts?.cautionN != null) p.warnN = p.facts.cautionN;

    (item.audit ??= {}).humanEdits = [
      ...(item.audit.humanEdits ?? []),
      { at: new Date().toISOString(), changes, reason: e.reason ?? null, before }
    ];
    /* 값이 바뀌었으니 심사 AI 대조 결과는 더 이상 유효하지 않다.
       단, 구매 링크만 바뀐 경우는 예외다 — 분석한 사실이 아니라 사람이 여는 링크일 뿐이고,
       이것 때문에 대조를 다시 하게 만들면 링크를 채워 넣을 때마다 발행이 막힌다. */
    const onlyBuyUrl = changes.every(c => c.startsWith('price.buyUrl:'));
    if (item.audit.verdict && !onlyBuyUrl) {
      item.audit.staleVerdict = item.audit.verdict;
      delete item.audit.verdict;
    }
    item.status = 'draft';

    applied.push({ id: item.stagingId, label: `${p.brand} ${p.name}`, changes,
                   score: p.score, ratings, reason: e.reason ?? null });
    touched = true;
  }

  if (touched) await writeFile(path, JSON.stringify(batch, null, 2) + '\n');
}

console.log('\n수정 반영');
console.log('─'.repeat(60));
for (const a of applied) {
  console.log(`\n■ ${a.label}  (${a.id})`);
  for (const c of a.changes) console.log(`    ${c}`);
  if (a.reason) console.log(`    사유: ${a.reason}`);
  console.log(`    → 별점 원료 ${a.ratings.quality} / 탄수 ${a.ratings.carb} / 첨가물 ${a.ratings.additive} / 가성비 ${a.ratings.value ?? '—'}` +
              `  총점 ${a.score ?? '—'}`);
}
for (const id of missing) console.log(`\n✗ ${id} — 스테이징에서 찾지 못했습니다`);

console.log('\n' + '─'.repeat(60));
console.log(`반영 ${applied.length}건${missing.size ? ` · 실패 ${missing.size}건` : ''}`);
if (applied.length) {
  console.log('\n심사 AI 대조는 무효 처리했습니다. 이어서 실행하세요:');
  console.log('  node scripts/gate1-validate.mjs');
  console.log('  node scripts/build-review.mjs');
}
if (missing.size) process.exitCode = 1;
