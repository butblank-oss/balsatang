#!/usr/bin/env node
/* 기능성 태그의 강도를 계산해 data.js 에 넣는다.
   태그가 붙었다/안 붙었다만으로는 변별력이 없다. 예를 들어 eye_tear 는 43종 중 32종에 붙는데,
   근거가 대부분 생선·어유(오메가3)라 프리미엄 사료 대부분이 해당한다.
   근거 원료의 개수와 등급으로 강도를 매겨 정렬과 표시에 쓴다.

     강도 = proven 원료 × 2 + possible 원료 × 1

   사용: node scripts/compute-func-strength.mjs [--dry-run]
*/
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_JS = join(ROOT, 'data.js');
const DRY = process.argv.includes('--dry-run');

const EV_WEIGHT = { proven: 2, possible: 1 };

export function strengthOf(list) {
  return (list || []).reduce((s, i) => s + (EV_WEIGHT[i.ev] ?? 1), 0);
}

/* 강도를 사람이 읽는 단계로. 상세 화면 배지에 쓴다. */
export function strengthLevel(n) {
  if (n >= 4) return 'strong';
  if (n >= 2) return 'medium';
  return n > 0 ? 'weak' : null;
}

/* 다른 스크립트가 strengthOf() 만 가져다 쓸 때 본문이 실행되지 않도록 막는다. */
const isEntry = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!isEntry) { /* 라이브러리로 불렸다 */ }
else {

const src = await readFile(DATA_JS, 'utf-8');
const foodsM = src.match(/const FOODS_ALL\s*=\s*(\[[\s\S]*?\]);/);
const detailM = src.match(/const DETAIL\s*=\s*(\{[\s\S]*?\});/);
if (!foodsM || !detailM) throw new Error('data.js 에서 FOODS_ALL 또는 DETAIL 을 찾지 못했습니다');

const foods = JSON.parse(foodsM[1]);
const detail = JSON.parse(detailM[1]);

let changed = 0, noDetail = 0;
const dist = {};

for (const f of foods) {
  const d = detail[f.id];
  if (!d) { noDetail++; continue; }
  const fs = {};
  for (const [k, list] of Object.entries(d.funcIngr || {})) {
    const s = strengthOf(list);
    if (s > 0) fs[k] = s;
  }
  /* func 배열은 그대로 두고 강도만 덧붙인다. 태그를 지우면 기존 필터가 깨진다. */
  const before = JSON.stringify(f.funcStrength ?? null);
  f.funcStrength = Object.keys(fs).length ? fs : undefined;
  if (JSON.stringify(f.funcStrength ?? null) !== before) changed++;
  for (const [k, v] of Object.entries(fs)) {
    (dist[k] ??= { strong: 0, medium: 0, weak: 0 })[strengthLevel(v)]++;
  }
}

if (!DRY) {
  await writeFile(DATA_JS, src.replace(foodsM[1], JSON.stringify(foods)));
}

const line = '─'.repeat(56);
console.log(`\n기능성 태그 강도 계산${DRY ? ' (모의 실행)' : ''}`);
console.log(line);
console.log(`  대상 ${foods.length}종 · 갱신 ${changed}종` + (noDetail ? ` · 상세 없음 ${noDetail}종` : ''));
console.log(`\n  태그별 분포 (강함 ≥4 / 보통 2~3 / 약함 1)`);
for (const [k, v] of Object.entries(dist).sort((a, b) => (b[1].strong + b[1].medium + b[1].weak) - (a[1].strong + a[1].medium + a[1].weak))) {
  console.log(`    ${k.padEnd(11)} 강함 ${String(v.strong).padStart(2)} · 보통 ${String(v.medium).padStart(2)} · 약함 ${String(v.weak).padStart(2)}`);
}
console.log(`\n${line}\n`);

}
