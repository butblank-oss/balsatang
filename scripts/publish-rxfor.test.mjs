/* 발행 회귀 — 처방식 용도(rxFor)가 발행 과정에서 사라지지 않는지.

   왜 있나: 발행은 proposed 의 필드를 하나씩 골라 옮긴다. 목록에 없는 칸은 값이 멀쩡히
   있어도 조용히 사라지고, 검사도 화면도 아무 말을 하지 않는다. rxFor 가 실제로 그
   상태였다 — 화면 담당이 용도 표시를 만들어 뒀는데 발행하면 값이 안 넘어왔다.

   옮기는 자리가 둘이다(engine.js publishRecord · scripts/merge-approved.mjs). 한쪽만
   고치면 다른 경로로 발행할 때 또 사라지므로, 둘이 갈라지는 것까지 함께 본다.

   실행: node scripts/publish-rxfor.test.mjs  (npm run check 에 물려 있다) */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ENGINE } from './lib/shared.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* 발행에 필요한 최소 항목. 점수·별점은 이 검사와 무관해 비워 둔다. */
const mk = proposed => ({
  stagingId: 'test_rx',
  sources: [{ role: 'official', url: 'https://example.kr/a', fetchedAt: '2026-10-07' }],
  evidence: {},
  proposed: { brand: 'B', brandSlug: 'b', country: 'KR', name: 'N', type: 'dry',
              ages: ['adult'], sizes: ['small'], ratings: {}, func: [], concerns: {},
              specOrigin: 'domestic', ...proposed }
});

const publish = proposed => ENGINE.publishRecord(mk(proposed), 'uuid', '2026-10-07T00:00:00Z').food;

/* 1. 용도가 있으면 그대로 발행된다 */
assert.deepEqual(publish({ rx: true, rxFor: ['urinary'] }).rxFor, ['urinary'],
  'rx:true 인 사료의 rxFor 가 발행 결과에 그대로 있어야 합니다');

/* 2. 용도를 못 구했으면 null — 지어내지 않는다 (공식 문장이 없으면 비우는 것이 규칙이다) */
assert.equal(publish({ rx: true }).rxFor, null, 'rxFor 를 못 구했으면 null 이어야 합니다');

/* 3. 처방식이 아닌 사료도 칸 자체는 있어야 한다 — 화면이 없는 키를 더듬지 않게 */
assert.ok('rxFor' in publish({ rx: false }), '처방식이 아니어도 rxFor 칸은 있어야 합니다');

/* 4. 발행 경로 둘이 갈라지지 않았는지. 한쪽에만 칸을 더하는 것이 이 버그의 원인이었다. */
const mergeSrc = readFileSync(join(root, 'scripts/merge-approved.mjs'), 'utf8');
assert.match(mergeSrc, /rxFor:\s*p\.rxFor/,
  'scripts/merge-approved.mjs 도 rxFor 를 넘겨야 합니다 (engine.js 만 고치면 이 경로에서 사라집니다)');

console.log('✅ 발행 rxFor 회귀 통과 — 값 보존 / 못 구하면 null / 칸 존재 / 두 경로 일치, 4케이스');
