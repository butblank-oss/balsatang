/* 화면들이 같은 데이터를 같은 모양으로 읽는지 검사한다.

   발사탕은 화면이 넷이다.
     · 프론트        balsatang/index.html    — 사람이 본다
     · 사료 관리     balsatang/admin/foods.html  — 사료를 고쳐 GitHub 에 커밋한다
     · 예전 어드민   balsatang/admin/index.html  — 성분·콘텐츠·태그를 본다

   넷이 같은 data.js 를 읽는데, 읽는 쪽이 기대하는 필드가 서로 어긋나면
   한쪽에서 고친 게 다른 쪽에서 사라진다. 실제로 예전 어드민의 data.js
   내보내기가 FOODS_ALL 선언과 buyUrl 을 통째로 버리고 있었다.
   그 종류의 사고를 사람이 아니라 기계가 잡게 한다.

   실행: node scripts/verify-surfaces.mjs   (npm run check 에 물려 있다) */
import fs from 'node:fs';

const problems = [];
const notes = [];
const read = p => fs.readFileSync(p, 'utf8');

/* ── data.js 가 내주는 것 ── */
const dataSrc = read('data.js');
const scope = new Function(`${dataSrc}; return { FOODS_ALL, FOODS, DETAIL, ICONS };`)();
const { FOODS_ALL, FOODS, DETAIL } = scope;

/* ── 1. 선언 이름 ──
   foods.html 은 data.js 를 텍스트로 열어 'const FOODS_ALL=' 로 시작하는 줄을
   통째로 갈아끼운다. 선언이 한 줄에 하나가 아니면 편집 자체가 막힌다. */
const lines = dataSrc.split('\n');
for (const name of ['FOODS_ALL', 'DETAIL']) {
  const hit = lines.filter(l => l.startsWith(`const ${name}=`));
  if (hit.length !== 1) {
    problems.push(`data.js: 'const ${name}=' 로 시작하는 줄이 ${hit.length}개입니다 (1개여야 어드민이 고칠 수 있습니다)`);
    continue;
  }
  const body = hit[0].slice(`const ${name}=`.length).replace(/;\s*$/, '');
  try {
    const back = `const ${name}=` + JSON.stringify(JSON.parse(body)) + ';';
    if (back !== hit[0]) problems.push(`data.js: ${name} 을 다시 써도 원문과 같지 않습니다 (어드민이 커밋하면 diff 가 뒤집힙니다)`);
  } catch {
    problems.push(`data.js: ${name} 을 JSON 으로 읽을 수 없습니다 (어드민이 편집을 거부합니다)`);
  }
}

/* ── 2. 프론트가 실제로 쓰는 필드가 데이터에 있는지 ── */
const appSrc = read('app.js');
const usesBuyUrl = appSrc.includes('price?.buyUrl');
if (usesBuyUrl) {
  const n = FOODS_ALL.filter(f => f.price?.buyUrl).length;
  if (n === 0) problems.push('app.js 는 price.buyUrl 을 읽는데 데이터에 하나도 없습니다 (구매 링크가 전부 사라졌을 수 있습니다)');
  else notes.push(`구매 링크 ${n}종`);
}
for (const key of ['ratings', 'concerns', 'func']) {
  const missing = FOODS_ALL.filter(f => f[key] == null).map(f => f.name);
  if (missing.length) problems.push(`${key} 없는 사료 ${missing.length}종: ${missing.slice(0, 3).join(', ')}`);
}

/* ── 3. 공유 엔진이 성하고 한 벌인지 ──
   채점·원료 판정은 engine/ 한 곳에만 있다. Node 는 여기서 읽고,
   어드민(admin.balsatang.com)은 https://balsatang.com/engine/ 에서 같은 파일을 읽는다.
   이 파일이 깨지면 두 곳이 동시에 멈춘다. */
for (const f of ['engine/dict.js', 'engine/phrases.js', 'engine/engine.js']) {
  if (!fs.existsSync(f)) { problems.push(`${f} 이 없습니다 — 어드민이 이 파일을 읽습니다`); continue; }
  const src = read(f);
  const decl = f.includes('dict') ? 'DICT' : f.includes('phrases') ? 'PHRASES' : null;
  if (decl) {
    const hit = src.split('\n').filter(l => l.startsWith(`const ${decl}=`));
    if (hit.length !== 1) problems.push(`${f}: 'const ${decl}=' 줄이 ${hit.length}개입니다 (어드민이 한 줄만 갈아끼웁니다)`);
  }
}
try {
  const sc = {};
  new Function('globalThis', read('engine/dict.js') + read('engine/phrases.js') + read('engine/engine.js'))
    .call(sc, sc);
  if (typeof sc.ENGINE?.computeScore !== 'function') problems.push('engine.js 가 ENGINE 을 내주지 않습니다');
  else notes.push(`엔진 함수 ${Object.keys(sc.ENGINE).length}개 · 원료 사전 ${Object.keys(new Function(read('engine/dict.js') + ';return DICT')().ingredients).length}종`);
} catch (e) {
  problems.push(`engine/ 을 실행할 수 없습니다: ${e.message}`);
}

/* ── 4. 심사 화면이 보는 스테이징이 발행본과 겹치지 않는지 ── */
const stagingDir = 'data/staging';
if (fs.existsSync(stagingDir)) {
  const ids = new Set(FOODS_ALL.map(f => `${f.brand} ${f.name}`));
  let dup = 0;
  for (const file of fs.readdirSync(stagingDir).filter(f => f.endsWith('.json'))) {
    let batch;
    try { batch = JSON.parse(read(`${stagingDir}/${file}`)); } catch { continue; }
    for (const item of (Array.isArray(batch) ? batch : batch.items ?? [])) {
      const p = item.proposed ?? {};
      if (p.brand && p.name && ids.has(`${p.brand} ${p.name}`)) dup++;
    }
  }
  if (dup) problems.push(`이미 발행된 사료가 스테이징에 ${dup}건 남아 있습니다 (심사 화면에 중복으로 뜹니다)`);
}

/* ── 4-1. 죽은 썸네일 주소 ──
   예전 앱이 남긴 /objects/uploads/... 는 값은 있지만 안 불러와진다.
   목록에서는 '썸네일 있음' 으로 세어져 운영자가 영영 못 찾는다. */
const deadThumb = FOODS_ALL.filter(f => f.thumb && !/^https:\/\//.test(f.thumb));
if (deadThumb.length)
  problems.push(`https 가 아닌 썸네일 주소 ${deadThumb.length}건: ${deadThumb.map(f => f.name).slice(0, 3).join(', ')}`);

/* ── 4-2. 판정 카드 키 ──
   엔진은 위험 카드를 verdict.dan 에 담는데 예전 데이터는 bad 를 썼다.
   화면이 dan 만 읽던 탓에 위험 경고가 통째로 안 보였다. 다시 갈리면 여기서 잡는다. */
const badKey = Object.entries(DETAIL).filter(([, d]) => d?.verdict && 'bad' in d.verdict);
if (badKey.length)
  problems.push(`verdict.bad 를 쓰는 항목 ${badKey.length}건 — 화면은 dan 을 읽습니다`);

/* ── 5. 썸네일·상세 연결 ── */
const orphan = Object.keys(DETAIL).filter(id => !FOODS_ALL.some(f => f.id === id));
if (orphan.length) problems.push(`DETAIL 에만 있고 사료 목록엔 없는 항목 ${orphan.length}건`);
notes.push(`사료 ${FOODS_ALL.length}종 (발행 ${FOODS.length}) · 상세 ${Object.keys(DETAIL).length}종`);
notes.push(`썸네일 없음 ${FOODS_ALL.filter(f => !f.thumb).length}종`);
notes.push(`콘텐츠 ${(() => { try { return new Function(`${read('articles.js')}; return ARTICLES.length`)(); } catch { return '?'; } })()}편`);

/* ── 결과 ── */
console.log('\n화면 간 연동 검사');
console.log('─'.repeat(60));
for (const n of notes) console.log(`  · ${n}`);
if (problems.length) {
  console.log('');
  for (const p of problems) console.log(`  ❌ ${p}`);
  console.log('─'.repeat(60) + '\n');
  process.exit(1);
}
console.log('  ✅ 네 화면이 같은 모양으로 읽습니다');
console.log('─'.repeat(60) + '\n');
