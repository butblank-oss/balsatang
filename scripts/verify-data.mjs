#!/usr/bin/env node
/* data.js 가 브라우저에서 실제로 실행되는지 확인한다.

   병합 충돌 표시가 그대로 커밋돼 사이트 전체가 죽은 적이 있다.
   data.js 는 한 줄이 4만 자가 넘어 눈으로는 알아볼 수 없다. 그래서 기계가 본다.

     node scripts/verify-data.mjs

   npm run check 에 물려 있어서 게이트를 돌릴 때마다 같이 검사된다.
*/
import { readFile } from 'node:fs/promises';

const DATA_JS = 'data.js';
const src = await readFile(DATA_JS, 'utf-8');
const problems = [];

/* 1. 병합 충돌 표시 */
const conflict = src.split('\n')
  .map((l, i) => [i + 1, l])
  .filter(([, l]) => /^(<<<<<<<|=======|>>>>>>>)/.test(l));
if (conflict.length) {
  problems.push(`병합 충돌 표시가 남아 있습니다 — ${conflict.map(([n]) => `${n}줄`).join(', ')}`);
}

/* 2. 실제로 실행되는가 */
let scope;
if (!conflict.length) {
  try {
    scope = new Function(`${src}; return { FOODS_ALL, FOODS, DETAIL, ICONS };`)();
  } catch (e) {
    problems.push(`실행되지 않습니다: ${e.message}`);
  }
}

/* 3. 최소한의 형태 */
if (scope) {
  const { FOODS_ALL, FOODS, DETAIL, ICONS } = scope;
  if (!Array.isArray(FOODS_ALL) || !FOODS_ALL.length) problems.push('FOODS_ALL 이 비었습니다');
  if (!Array.isArray(FOODS)) problems.push('FOODS 가 배열이 아닙니다');
  if (!DETAIL || typeof DETAIL !== 'object') problems.push('DETAIL 이 객체가 아닙니다');
  if (!ICONS || typeof ICONS !== 'object') problems.push('ICONS 가 객체가 아닙니다');

  if (Array.isArray(FOODS_ALL)) {
    const ids = new Set();
    for (const f of FOODS_ALL) {
      if (!f.id) problems.push(`id 없는 항목: ${f.brand} ${f.name}`);
      else if (ids.has(f.id)) problems.push(`id 중복: ${f.id}`);
      ids.add(f.id);
      if (!f.name) problems.push(`이름 없는 항목: ${f.id}`);
    }
    for (const k of Object.keys(DETAIL ?? {})) {
      if (!ids.has(k)) problems.push(`DETAIL 에 없는 사료의 항목이 있습니다: ${k}`);
    }
  }
}

const line = '─'.repeat(60);
console.log(`\ndata.js 검사`);
console.log(line);
if (problems.length) {
  for (const p of problems) console.log(`  ✗ ${p}`);
  console.log(`\n${line}\n문제 ${problems.length}건 — 이대로 배포하면 사이트가 깨집니다\n`);
  process.exit(1);
}
const { FOODS_ALL, FOODS, DETAIL } = scope;
const withDetail = FOODS.filter(f => DETAIL[f.id]).length;
console.log(`  ✅ 실행 확인 · 사료 ${FOODS_ALL.length}종 (발행 ${FOODS.length}) · 상세 ${withDetail}종`);
console.log(`\n${line}\n`);
