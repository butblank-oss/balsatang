/* 전체 QA — 네 화면을 순서대로 돌린다.

   실행: npm run qa
   결과 화면 캡처는 .qa-out/ 에 쌓인다(저장소에 올리지 않는다).

   브라우저가 없다면 한 번만: npx playwright install chromium
   이미 깔린 크로미움을 쓰려면 QA_CHROME 에 실행 파일 경로를 준다.

   심사 화면(review)은 대기 건이 있어야 의미가 있다. 지금 비어 있으면
   그 항목은 건너뛰고 그렇게 말한다 — 통과했다고 하지 않는다. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

const SUITES = [
  ['front.mjs', '소비자 · 프론트'],
  ['foods.mjs', '운영자 · 사료 관리'],
  ['admin.mjs', '운영자 · 통합 어드민'],
  ['hangul.mjs', '한글 입력'],
  ['review.mjs', '심사자 · 발행 심사']
];

/* 심사 화면은 대기 건이 없으면 볼 게 없다 */
let hasQueue = false;
try {
  const r = JSON.parse(fs.readFileSync(path.join(root, 'data/staging/review.json'), 'utf8'));
  hasQueue = (r.summary?.total ?? 0) > 0;
} catch { }

const run = file => new Promise(res => {
  const p = spawn(process.execPath, [path.join(here, file)], { stdio: 'inherit', cwd: root });
  p.on('close', code => res(code));
});

let failed = 0, skipped = [];
for (const [file, name] of SUITES) {
  if (file === 'review.mjs' && !hasQueue) { skipped.push(name); continue; }
  const code = await run(file);
  if (code !== 0) { console.log(`\n⚠ ${name} 실행이 도중에 멈췄습니다 (종료코드 ${code})`); failed++; }
}

console.log('\n' + '═'.repeat(60));
if (skipped.length) console.log(`건너뜀: ${skipped.join(', ')} — 심사 대기 0건 (npm run review 로 만든 뒤 다시 돌리세요)`);
console.log(failed ? `❌ ${failed}개 묶음이 끝까지 돌지 못했습니다` : '✅ 모든 묶음이 끝까지 돌았습니다');
console.log('발견 사항은 위 목록의 🔴 P1 / 🟠 P2 / 🟡 P3 표시를 보세요.');
console.log('═'.repeat(60));
process.exit(failed ? 1 : 0);
