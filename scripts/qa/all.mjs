/* 전체 QA — 프론트와 어드민 화면을 순서대로 돌린다.

   실행: npm run qa
   결과 화면 캡처는 .qa-out/ 에 쌓인다(저장소에 올리지 않는다).

   브라우저가 없다면 한 번만: npx playwright install chromium
   이미 깔린 크로미움을 쓰려면 QA_CHROME 에 실행 파일 경로를 준다.

   ⚠ playwright 가 '없다' 고 나오면 설치 설정부터 본다. NODE_ENV=production 이면
     npm install 이 검사용 꾸러미를 통째로 건너뛴다 — npm install --include=dev 로 받는다.
     이것 때문에 프론트 묶음 둘이 멈춰 있던 적이 있다.

   심사 화면(review)은 대기 건이 있어야 의미가 있다. 지금 비어 있으면
   그 항목은 건너뛰고 그렇게 말한다 — 통과했다고 하지 않는다. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT, ADMIN } from './paths.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = ROOT;

/* needs — 그 묶음이 열어 보는 어드민 화면. 어드민은 옆 저장소(balsatang-admin)에 있고,
   그 위치는 paths.mjs 한 곳에서만 읽는다.

   ⚠ 여기에 적힌 이름이 틀리면 '없다' 고 읽혀 네 묶음이 통째로 조용히 건너뛰어진다.
   실제로 그렇게 오래 안 돌고 있었다 — 옛 한 저장소 시절의 경로가 그대로 남아 있었다.
   그래서 '건너뜀' 과 '폴더 자체가 없음' 을 아래에서 갈라 말한다. 뭉치면 또 못 알아챈다. */
const SUITES = [
  ['design.mjs', '디자인 규칙'],
  ['front.mjs', '소비자 · 프론트'],
  ['foods.mjs', '운영자 · 사료 관리', 'foods.html'],
  ['admin.mjs', '운영자 · 통합 어드민', 'index.html'],
  ['hangul.mjs', '한글 입력', 'foods.html'],
  ['review.mjs', '심사자 · 발행 심사', 'review.html']
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

/* 어드민 폴더가 통째로 없는 것과, 그 안의 화면 하나가 없는 것은 다른 사고다.
   앞은 '여기 받아 두지 않았다', 뒤는 '파일 이름이 틀렸거나 지워졌다' 이고 고치는 사람이 다르다. */
const hasAdmin = fs.existsSync(ADMIN);

let failed = 0, skipped = [], moved = [], missing = [];
for (const [file, name, needs] of SUITES) {
  if (needs && !hasAdmin) { moved.push(name); continue; }
  if (needs && !fs.existsSync(path.join(ADMIN, needs))) { missing.push(`${name} (${needs})`); failed++; continue; }
  if (file === 'review.mjs' && !hasQueue) { skipped.push(name); continue; }
  const code = await run(file);
  if (code !== 0) { console.log(`\n⚠ ${name} 실행이 도중에 멈췄습니다 (종료코드 ${code})`); failed++; }
}

console.log('\n' + '═'.repeat(60));
if (moved.length) console.log(`여기 없음: ${moved.join(', ')}
  어드민 저장소를 못 찾았습니다 — ${ADMIN}
  butblank-oss/balsatang-admin 을 그 자리에 받아 두거나, QA_ADMIN_ROOT 로 위치를 알려주세요.`);
if (missing.length) console.log(`❌ 어드민 화면 파일이 없습니다: ${missing.join(', ')} — ${ADMIN} 안을 확인하세요`);
if (skipped.length) console.log(`건너뜀: ${skipped.join(', ')} — 심사 대기 0건 (npm run review 로 만든 뒤 다시 돌리세요)`);
console.log(failed ? `❌ ${failed}개 묶음이 끝까지 돌지 못했습니다` : '✅ 모든 묶음이 끝까지 돌았습니다');
console.log('발견 사항은 위 목록의 🔴 P1 / 🟠 P2 / 🟡 P3 표시를 보세요.');
console.log('═'.repeat(60));
process.exit(failed ? 1 : 0);
