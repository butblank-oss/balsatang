#!/usr/bin/env node
/* 심사 화면이 읽을 단일 파일을 만든다.
   스테이징 원본 + 게이트 1 결과 + 게이트 3 결과를 하나로 합쳐 data/staging/_review.json 과 웹 배포용 사본 review.json 에 쓴다.
   어드민은 서버가 없으므로, 이 파일 하나만 fetch 하면 심사에 필요한 모든 정보가 들어있게 한다. */
import { readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STAGING = join(ROOT, 'data/staging');
const OUT = join(STAGING, '_review.json');
/* GitHub Pages(Jekyll)는 밑줄로 시작하는 파일을 배포에서 제외한다.
   심사 화면이 웹에서도 열리도록 밑줄 없는 사본을 함께 쓴다. */
const OUT_WEB = join(STAGING, 'review.json');
const LIVE = process.argv.includes('--live');

const tmp1 = join(ROOT, '.g1.tmp.json');
const tmp3 = join(ROOT, '.g3.tmp.json');

/* 게이트는 탈락 건이 있으면 종료코드 1을 낸다. 그건 오류가 아니므로 무시하고 결과만 읽는다. */
const quiet = async (args) => { try { await run('node', args, { cwd: ROOT }); } catch { /* 탈락 있음 */ } };

await quiet(['scripts/gate1-validate.mjs', ...(LIVE ? ['--live'] : []), '--json', tmp1]);
await quiet(['scripts/gate3-consistency.mjs', '--json', tmp3]);

const g1 = JSON.parse(await readFile(tmp1, 'utf-8'));
const g3 = JSON.parse(await readFile(tmp3, 'utf-8'));
await rm(tmp1, { force: true });
await rm(tmp3, { force: true });

/* stagingId → 게이트 1 결과 */
const g1By = {};
for (const b of g1.batches) for (const it of b.items) g1By[it.stagingId] = it;

let files = [];
try { files = (await readdir(STAGING)).filter(f => f.endsWith('.json') && !f.startsWith('_') && f !== 'review.json'); } catch {}

const review = {
  builtAt: new Date().toISOString(),
  live: LIVE,
  batches: [],
  summary: { total: 0, ready: 0, blocked: 0, pricePending: 0 }
};

for (const file of files) {
  const batch = JSON.parse(await readFile(join(STAGING, file), 'utf-8'));
  const items = (batch.items ?? []).map(item => {
    const g1r = g1By[item.stagingId] ?? { gate1: 'unknown', fail: [], warn: [] };
    const g2 = item.audit?.verdict ?? 'none';
    const g3w = g3.items?.[item.stagingId] ?? [];
    /* 발행 후보 = 게이트 1 통과 + 심사 AI 대조 일치. 게이트 3 경고는 막지 않는다.
       가격을 못 구한 항목(pending)은 총점을 낼 수 없어 발행 후보가 아니다. */
    const ready = g1r.gate1 === 'pass' && g2 === 'match';
    review.summary.total++;
    ready ? review.summary.ready++ : review.summary.blocked++;
    if (g1r.pricePending) review.summary.pricePending++;
    return {
      stagingId: item.stagingId,
      label: `${item.proposed?.brand ?? '?'} ${item.proposed?.name ?? '?'}`,
      proposed: item.proposed,
      sources: item.sources ?? [],
      evidence: item.evidence ?? {},
      audit: item.audit ?? null,
      pricePending: g1r.pricePending === true,
      gates: {
        g1: g1r.gate1, g1fail: g1r.fail ?? [], g1warn: g1r.warn ?? [],
        g2, g2diff: item.audit?.diff ?? [],
        g3warn: g3w
      },
      ready
    };
  });
  review.batches.push({ file, batchId: batch.batchId ?? null, collectedAt: batch.collectedAt ?? null, items });
}

const json = JSON.stringify(review, null, 2);
await writeFile(OUT, json);
await writeFile(OUT_WEB, json);
console.log(`\n심사 데이터 생성 → data/staging/_review.json (웹용 사본 review.json)`);
console.log(`  전체 ${review.summary.total} · 발행후보 ${review.summary.ready} · 보류 ${review.summary.blocked}` +
            (review.summary.pricePending ? ` (그중 가격대기 ${review.summary.pricePending})` : '') + '\n');
