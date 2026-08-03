#!/usr/bin/env node
/* 쿠팡 파트너스 구매 링크를 관리한다.

   수수료는 파트너스 링크(link.coupang.com/a/…)로 들어온 구매에만 붙는다.
   그 링크는 파트너스 계정으로 상품마다 직접 만들어야 하고, API 권한이 나오기 전에는
   자동으로 만들 방법이 없다. 그래서 사람이 하나씩 만들어 넘기고, 이 스크립트가 받는다.

   목록 보기 — 링크가 없는 사료와, 링크를 만들 때 열어야 할 상품 페이지를 뽑는다:
     node scripts/buy-links.mjs

   반영하기 — 사람이 만든 링크를 받아 검증하고 data.js 에 넣는다:
     node scripts/buy-links.mjs --set links.json
     pbpaste | node scripts/buy-links.mjs --set -

   links.json 형태 (키는 사료 이름 일부 또는 id):
     { "건강백서 건강한 관절": "https://link.coupang.com/a/XXXX", ... }

   --set 은 단축링크를 실제로 열어 어느 상품으로 가는지 확인하고,
   그 상품이 등록된 출처와 다르면 경고한다. 다른 제품으로 가는 링크를
   모르고 싣는 일을 막기 위해서다.
*/
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadFoods, isRetailHost } from './lib/schema.mjs';

const run = promisify(execFile);
const DATA_JS = 'data.js';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const line = '─'.repeat(60);
const retailOf = f => (f.src?.sources ?? []).find(s => s.role === 'retail');
const pageKeyOf = url => (String(url).match(/\/vp\/products\/(\d+)/) ?? [])[1] ?? null;

/* 단축링크가 실제로 어느 상품으로 가는지 — 302 Location 을 읽는다 */
async function resolveShort(url) {
  const { stdout } = await run('curl', ['-sI', '-m', '20', '-A', UA, url],
                               { maxBuffer: 4 * 1024 * 1024 });
  const loc = (stdout.match(/^location:\s*(\S+)/im) ?? [])[1];
  return loc ? { url: loc, pageKey: pageKeyOf(loc) } : null;
}

const { all } = await loadFoods('.');
const published = all.filter(f => f.status === 'published');

const setAt = process.argv.indexOf('--set');
if (setAt === -1) {
  /* --- 목록 --- */
  const need = [], have = [], noSource = [];
  for (const f of published) {
    if (f.price?.buyUrl) { have.push(f); continue; }
    const r = retailOf(f);
    (r ? need : noSource).push([f, r]);
  }

  console.log(`\n쿠팡 파트너스 구매 링크`);
  console.log(line);
  console.log(`  링크 있음 ${have.length} · 만들어야 함 ${need.length} · 쿠팡 출처 없음 ${noSource.length}`);

  if (need.length) {
    console.log(`\n■ 링크를 만들어야 하는 사료 ${need.length}종`);
    console.log(`  아래 주소를 열고 쿠팡 파트너스로 링크를 만든 뒤,`);
    console.log(`  { "사료이름": "링크" } 형태로 모아서 --set 으로 넘기세요.\n`);
    for (const [f, r] of need) {
      console.log(`  ${f.brand} ${f.name}`);
      console.log(`    ${r.url}`);
    }
    /* 그대로 채워 넣을 수 있는 뼈대를 같이 준다 */
    console.log(`\n  빈 양식:`);
    console.log(JSON.stringify(Object.fromEntries(need.map(([f]) => [f.name, ''])), null, 2)
      .split('\n').map(l => '  ' + l).join('\n'));
  }
  if (noSource.length) {
    console.log(`\n■ 쿠팡 상품 출처가 없어 링크를 만들 수 없는 사료 ${noSource.length}종`);
    console.log(`  먼저 쿠팡 판매처를 찾아 등록해야 합니다.`);
    for (const [f] of noSource.slice(0, 8)) console.log(`    ${f.brand} ${f.name}`);
    if (noSource.length > 8) console.log(`    … 외 ${noSource.length - 8}종`);
  }
  console.log(`\n${line}\n`);
  process.exit(0);
}

/* --- 반영 --- */
const path = process.argv[setAt + 1];
if (!path) { console.error('--set 뒤에 파일 경로 또는 - 가 필요합니다'); process.exit(2); }

const raw = path === '-'
  ? await new Promise((res, rej) => { let s = ''; process.stdin.setEncoding('utf-8');
      process.stdin.on('data', c => s += c); process.stdin.on('end', () => res(s));
      process.stdin.on('error', rej); })
  : await readFile(path, 'utf-8');

const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
let input;
try { input = JSON.parse(fenced ? fenced[1] : raw); }
catch (e) { console.error('JSON 을 읽지 못했습니다: ' + e.message); process.exit(2); }

const applied = [], warned = [], failed = [];

for (const [key, link] of Object.entries(input)) {
  if (!link) continue;
  const k = String(key).trim();
  const hits = published.filter(f =>
    f.id === k || f.name === k || `${f.brand} ${f.name}` === k ||
    f.name.includes(k) || `${f.brand} ${f.name}`.includes(k));
  if (hits.length !== 1) {
    failed.push([k, hits.length ? `이름이 ${hits.length}종과 겹칩니다` : '사료를 찾지 못했습니다']);
    continue;
  }
  const f = hits[0];
  if (!isRetailHost(link)) { failed.push([k, `쿠팡 도메인이 아닙니다: ${link}`]); continue; }

  const resolved = await resolveShort(link);
  const want = pageKeyOf(retailOf(f)?.url);
  if (!resolved) {
    warned.push([f, link, '단축링크를 풀지 못했습니다 — 상품 확인 없이 넣습니다']);
  } else if (want && resolved.pageKey && resolved.pageKey !== want) {
    warned.push([f, link,
      `등록된 상품(${want})이 아니라 다른 상품(${resolved.pageKey})으로 갑니다`]);
  }
  f.price = { ...(f.price ?? {}), buyUrl: link };
  applied.push([f, link, resolved?.pageKey ?? null]);
}

if (applied.length) {
  const src = await readFile(DATA_JS, 'utf-8');
  const m = src.match(/const FOODS_ALL\s*=\s*(\[[\s\S]*?\]);/);
  await writeFile(DATA_JS, src.replace(m[1], JSON.stringify(all)));
}

console.log(`\n구매 링크 반영`);
console.log(line);
for (const [f, link, pk] of applied) {
  console.log(`  ✅ ${f.brand} ${f.name}`);
  console.log(`     ${link}${pk ? `  → 상품 ${pk}` : ''}`);
}
for (const [f, link, why] of warned) {
  console.log(`  ⚠ ${f.brand} ${f.name} — ${why}`);
  console.log(`     ${link}`);
}
for (const [k, why] of failed) console.log(`  ✗ ${k} — ${why}`);
console.log(`\n${line}\n반영 ${applied.length}${warned.length ? ` (경고 ${warned.length})` : ''}` +
            `${failed.length ? ` · 실패 ${failed.length}` : ''}\n`);
if (failed.length) process.exitCode = 1;
