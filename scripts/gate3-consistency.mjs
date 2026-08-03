#!/usr/bin/env node
/* 게이트 3 — 정합성 검사.
   이미 발행된 데이터를 기준선으로 삼아 이상치를 찾는다.
   게이트 1이 "형식이 맞는가"를 본다면, 여기서는 "값이 말이 되는가"를 본다.
   판정은 경고(warn)로 낸다. 사람이 발행 화면에서 보고 판단한다. */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { norm, loadFoods } from './lib/schema.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STAGING = join(ROOT, 'data/staging');

const SCORE_GAP = 3.0;   // 같은 브랜드 내 점수 격차 허용치
const PRICE_RATIO = 3.0; // 같은 타입 중앙값 대비 배수 허용치

const { published: FOODS } = await loadFoods(ROOT);

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/* 타입별 kg당 가격 중앙값 */
const byType = {};
for (const f of FOODS) { if (f.price?.pKg) (byType[f.type] ??= []).push(f.price.pKg); }
const typeMedian = Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, median(v)]));

/* 브랜드별 점수 목록 */
const byBrand = {};
for (const f of FOODS) (byBrand[norm(f.brand)] ??= []).push(f.score);

function check(p) {
  const warn = [];
  const W = (m) => warn.push(m);

  const peers = byBrand[norm(p.brand)];
  if (peers?.length && p.score != null) {
    const lo = Math.min(...peers), hi = Math.max(...peers);
    if (p.score < lo - SCORE_GAP || p.score > hi + SCORE_GAP) {
      W(`같은 브랜드(${p.brand}) 기존 점수 ${lo}~${hi} 대비 ${p.score} — 격차 ${SCORE_GAP} 초과`);
    }
  } else {
    W(`신규 브랜드입니다 (${p.brand}) — 기준선 없음, 출처를 특히 꼼꼼히 확인하세요`);
  }

  const med = typeMedian[p.type];
  const pKg = p.price?.pKg;
  if (med && pKg) {
    if (pKg > med * PRICE_RATIO) W(`kg당 ${pKg.toLocaleString()}원 — 같은 타입(${p.type}) 중앙값 ${med.toLocaleString()}원의 ${(pKg / med).toFixed(1)}배`);
    if (pKg < med / PRICE_RATIO) W(`kg당 ${pKg.toLocaleString()}원 — 같은 타입(${p.type}) 중앙값 ${med.toLocaleString()}원의 1/${(med / pKg).toFixed(1)}`);
  }

  const r = p.ratings ?? {};
  if (r.quality === 5 && r.carb === 5 && r.additive === 5 && r.value === 5) {
    W('모든 항목이 만점입니다 — 가성비까지 만점인 사료는 드뭅니다. 재확인 권장');
  }
  if (p.warnN === 0 && r.additive < 4) {
    W(`첨가물 점수 ${r.additive}인데 경고 성분 수(warnN)가 0입니다 — 둘 중 하나가 잘못됐을 수 있습니다`);
  }
  return warn;
}

let files = [];
try { files = (await readdir(STAGING)).filter(f => f.endsWith('.json') && !f.startsWith('_') && f !== 'review.json'); } catch {}
const report = { checkedAt: new Date().toISOString(), items: {} };

console.log('\n게이트 3 · 정합성 검사');
console.log('─'.repeat(60));
let total = 0;
for (const file of files) {
  const batch = JSON.parse(await readFile(join(STAGING, file), 'utf-8'));
  console.log(`\n[${file}]`);
  for (const item of batch.items ?? []) {
    const warn = check(item.proposed ?? {});
    report.items[item.stagingId] = warn;
    total += warn.length;
    console.log(`  ${warn.length ? '⚠' : '✅'} ${item.proposed?.brand} ${item.proposed?.name}`);
    warn.forEach(w => console.log(`       · ${w}`));
  }
}
if (!files.length) console.log('검사할 스테이징 파일이 없습니다.');
console.log(`\n${'─'.repeat(60)}\n경고 ${total}건 — 탈락시키지 않습니다. 발행 화면에서 확인하세요.\n`);

const jsonAt = process.argv.indexOf('--json');
if (jsonAt > -1 && process.argv[jsonAt + 1]) {
  await writeFile(process.argv[jsonAt + 1], JSON.stringify(report, null, 2));
}
