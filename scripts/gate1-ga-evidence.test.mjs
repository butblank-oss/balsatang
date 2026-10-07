/* 게이트1 회귀 — 보장성분표(ga) 값마다 근거 인용을 요구하는 검사가 살아 있는지.

   왜 있나: ga 중 별점 계산에 안 쓰이는 값(조회분 ash)은 facts 근거검사가 건드리지
   않아, 값만 있고 인용이 없어도 통과했다. 다나와(B등급) 스펙이 공식 확인 없이 남는
   정책 1 위반이고, 지위픽 2종이 실제로 그 상태로 통과했다(먀오가 사람 눈으로 잡음).
   '값이 있으면 근거도 있어야 한다' 는 규칙 — 값이 없으면 면제.

   실행: node scripts/gate1-ga-evidence.test.mjs  (npm run check 에 물려 있다) */
import assert from 'node:assert/strict';
import { checkItem } from './lib/shared.mjs';

/* ga 검사(gate1 7번 섹션)까지 도달하도록 REQUIRED_ITEM_FIELDS 만 채운 최소 항목.
   그 뒤 ratings·score 등으로 다른 fail 이 쌓이지만, 우리가 보는 건 'ga.<키> 근거
   누락' 하나뿐이라 영향받지 않는다. */
const mk = (ga, ev) => ({
  stagingId: 'test_ga',
  sources: [{ role: 'label', url: 'https://example.kr/a', fetchedAt: '2026-10-07' }],
  proposed: { ga },
  evidence: ev
});
const gaEvMissing = (item, key) =>
  checkItem(item, [], new Set()).fail.some(f => f.code === 'E_EV_NONE' && f.msg.includes(`ga.${key}`));

const quote = { src: 0, quote: 'Ash (max) 12.0%' };

/* 1. 조회분 값만 있고 근거가 없으면 탈락 — 이게 지위픽이 통과하던 바로 그 구멍 */
assert.ok(gaEvMissing(mk({ ash: 12 }, {}), 'ash'),
  'ga.ash 값만 있고 근거 없으면 E_EV_NONE 이 나야 합니다');

/* 2. 근거를 붙이면 통과 */
assert.ok(!gaEvMissing(mk({ ash: 12 }, { 'ga.ash': quote }), 'ash'),
  'ga.ash 근거를 붙이면 통과해야 합니다');

/* 3. 값이 없으면 면제 (ash 를 필수값으로 올리는 게 아니다) */
assert.ok(!gaEvMissing(mk({ protein: 30 }, { 'ga.protein': quote }), 'ash'),
  'ga.ash 값이 없으면 근거를 요구하지 않아야 합니다');

/* 4. 별점에 쓰이는 키도 같은 규칙 — 값 있고 근거 없으면 탈락 */
assert.ok(gaEvMissing(mk({ protein: 30 }, {}), 'protein'),
  'ga.protein 값만 있고 근거 없으면 E_EV_NONE 이 나야 합니다');

/* 5. null 값은 면제 */
assert.ok(!gaEvMissing(mk({ ash: null }, {}), 'ash'),
  'ga.ash 가 null 이면 근거를 요구하지 않아야 합니다');

/* --- ga.* 인용이 모두 같은 출처(src)를 가리키는지 — 생산지 섞기 방지 ---
   같은 제품이라도 생산지마다 배합이 달라(로얄캐닌 가스트로 영국 섬유 1.8 vs 미국 4.7)
   다른 나라 라벨에서 빈 칸을 끌어와 채우면 어디에도 없는 성분표가 된다. src 가 2개 이상
   필요한 검사라 sources 를 둘 둔다 — src:1 이 유효해야 gaSrcs 에 담긴다. */
const mk2 = (ga, ev) => ({
  stagingId: 'test_ga_src',
  sources: [
    { role: 'label', url: 'https://example.uk/a', fetchedAt: '2026-10-07' },
    { role: 'label', url: 'https://example.us/b', fetchedAt: '2026-10-07' }
  ],
  proposed: { ga },
  evidence: ev
});
const q = src => ({ src, quote: 'Protein (min) 20.0%' });
const gaSrcMix = item => checkItem(item, [], new Set()).fail.some(f => f.code === 'E_GA_SRC_MIX');

/* 6. ga 인용이 모두 같은 출처면 통과 */
assert.ok(!gaSrcMix(mk2({ protein: 20, fat: 5 }, { 'ga.protein': q(0), 'ga.fat': q(0) })),
  'ga.* 인용이 모두 같은 src 면 통과해야 합니다');

/* 7. ga 인용이 서로 다른 출처를 가리키면 탈락 — 이게 영/미 라벨 섞기 사고 */
assert.ok(gaSrcMix(mk2({ protein: 20, fat: 5 }, { 'ga.protein': q(0), 'ga.fat': q(1) })),
  '서로 다른 src 를 가리키면 E_GA_SRC_MIX 로 탈락해야 합니다');

/* 8. ga 인용이 하나뿐이면(비교 대상 없음) 통과 */
assert.ok(!gaSrcMix(mk2({ protein: 20 }, { 'ga.protein': q(0) })),
  'ga 인용이 하나뿐이면 섞임 검사에 걸리지 않아야 합니다');

console.log('✅ 게이트1 ga 근거 검사 회귀 통과 — 값 있으면 근거 요구 / 없으면 면제 / 인용 출처 동일, 8케이스');
