#!/usr/bin/env node
/* 공공데이터포털의 반려동물 사료 등록정보를 받아 온다.

   사료관리법상 국내에 파는 사료는 성분등록을 해야 하고, 그 등록정보(제품명·
   성분등록번호·등록성분량·주원료명)를 일부 지자체가 공개하고 있다.
   제조사 상세 이미지를 눈으로 읽는 것보다 정확하고, 정부 자료라 출처 등급이 A다.

   ── 확인된 데이터셋 ──
     15049785  인천광역시 반려동물 사료정보              (2024-04-25)
     15106643  인천광역시 반려동물 사료 등록성분량·주원료명 (2022-09-16, 161건)
     15062350  제주특별자치도 반려동물 사료성분정보        (2019-11-25)

   ── 확인했지만 쓸 수 없는 것 ──
     15147972  농림축산식품부 반려동물 사료정보
       전국 단위라 기대했으나, 실제로는 농사로의 '반려동물 집밥 만들기' 원료 정보다.
       시판 사료의 등록성분표가 아니다.

   사료 성분등록은 시·도가 받는다. 그래서 전국 단일 데이터셋이 없고,
   공개하는 지자체 것만 모을 수 있다. 그 지역에 등록한 제조사·수입사만 담긴다.

   ── 쓰는 법 ──
   공공데이터포털(data.go.kr) 로그인 → 마이페이지 → 인증키 발급 (일반 인증키, 즉시 발급)
   받은 키를 환경변수로 넘긴다. 저장소에 적지 않는다.

     DATA_GO_KR_KEY=... node scripts/feed-registry.mjs fetch     전부 받아 저장
     DATA_GO_KR_KEY=... node scripts/feed-registry.mjs find 오리젠   받아둔 데이터에서 찾기
*/
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const KEY = process.env.DATA_GO_KR_KEY;
const OUT = 'data/registry/feed-registry.json';

const SETS = [
  { pk: '15049785', uddi: 'uddi:4a7fe868-b290-4e6c-94e7-9bbd08c6c3e7',
    name: '인천광역시 반려동물 사료정보 (2024)' },
  { pk: '15106643', uddi: 'uddi:b7ecf089-9bdf-439e-8516-df60b3c50785',
    name: '인천광역시 사료 등록성분량·주원료명 (2022)' },
  { pk: '15062350', uddi: 'uddi:3c105632-0c38-45aa-ad0d-d1eddd1f1645',
    name: '제주특별자치도 반려동물 사료성분정보 (2019)' }
];

async function get(url) {
  const { stdout } = await run('curl', ['-sS', '-m', '30', url],
    { maxBuffer: 6e7, encoding: 'utf-8' });
  return JSON.parse(stdout);
}

async function fetchSet(s) {
  const rows = [];
  for (let page = 1; page <= 40; page++) {
    const url = `https://api.odcloud.kr/api/${s.pk}/v1/${encodeURIComponent(s.uddi)}` +
                `?page=${page}&perPage=100&serviceKey=${encodeURIComponent(KEY)}`;
    const j = await get(url);
    if (j.code && j.code !== 0 && j.code !== 200) throw new Error(`${j.code} ${j.msg ?? ''}`);
    const data = j.data ?? [];
    rows.push(...data);
    if (rows.length >= (j.totalCount ?? rows.length) || !data.length) break;
  }
  return rows;
}

const cmd = process.argv[2];
const line = '─'.repeat(60);

if (cmd === 'fetch') {
  if (!KEY) {
    console.error('\n✗ DATA_GO_KR_KEY 가 없습니다.' +
      '\n  data.go.kr 로그인 → 마이페이지 → 인증키 발급(일반 인증키)' +
      '\n  DATA_GO_KR_KEY=... node scripts/feed-registry.mjs fetch\n');
    process.exit(1);
  }
  const out = { fetchedAt: new Date().toISOString(), sets: [] };
  console.log(`\n사료 등록정보 받기`);
  console.log(line);
  for (const s of SETS) {
    try {
      const rows = await fetchSet(s);
      out.sets.push({ ...s, count: rows.length, rows });
      console.log(`  ✅ ${s.name} — ${rows.length}건`);
      if (rows[0]) console.log(`     컬럼: ${Object.keys(rows[0]).join(' / ')}`);
    } catch (e) {
      console.log(`  ✗ ${s.name} — ${e.message}`);
    }
  }
  await mkdir('data/registry', { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 2));
  const total = out.sets.reduce((n, s) => n + s.count, 0);
  console.log(`\n${line}\n총 ${total}건 → ${OUT}\n`);

} else if (cmd === 'find') {
  const q = process.argv.slice(3).join(' ').trim();
  if (!q) { console.error('찾을 말을 주세요'); process.exit(2); }
  let db;
  try { db = JSON.parse(await readFile(OUT, 'utf-8')); }
  catch { console.error(`${OUT} 이 없습니다. 먼저 fetch 를 실행하세요.`); process.exit(1); }
  const norm = s => String(s ?? '').replace(/[\s\-_()]/g, '').toLowerCase();
  const nq = norm(q);
  let n = 0;
  for (const s of db.sets) {
    for (const r of s.rows) {
      if (!Object.values(r).some(v => norm(v).includes(nq))) continue;
      n++;
      console.log(`\n■ [${s.name}]`);
      for (const [k, v] of Object.entries(r)) {
        if (v == null || v === '') continue;
        console.log(`   ${k}: ${String(v).slice(0, 300)}`);
      }
    }
  }
  console.log(`\n${n}건\n`);

} else {
  console.log(`
반려동물 사료 등록정보 (공공데이터포털)

  DATA_GO_KR_KEY=... node scripts/feed-registry.mjs fetch      전부 받아 저장
  node scripts/feed-registry.mjs find <검색어>                  받아둔 데이터에서 찾기

인증키: data.go.kr 로그인 → 마이페이지 → 인증키 발급 (일반 인증키, 즉시 발급)
`);
}
