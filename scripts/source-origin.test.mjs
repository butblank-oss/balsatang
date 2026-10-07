/* 출처 판정 회귀 — 성분이 '어느 나라 기준' 인지 사실대로 찍히는지.

   두 가지를 지킨다.

   ① 한국 공식인데 도메인이 .kr 이 아닌 곳을 국내로 본다.
      글로벌 브랜드는 한 도메인 아래 나라별 경로로 나눈다(royalcanin.com/kr).
      호스트명만 보면 .com 이라 해외로 잡혀, 한국 공식 라벨에서 뜬 성분에
      🟡 해외 성분표 배지가 틀리게 붙는다.
      ⚠ 그렇다고 '/kr 이 들어가면 국내' 로 넓히면 안 된다 — 해외 사이트의 한국어 안내
        페이지까지 국내가 되어 배지가 반대로 틀린다. 아는 주소만 명시로 허용한다.

   ② 원재료와 보장성분을 다른 출처에서 가져오면 막는다.
      기존 검사(E_GA_SRC_MIX)는 ga.* 인용끼리만 봤다. 로얄캐닌 4종이 그 그물을
      빠져나갔다 — 보장성분이 전부 미국 한 곳이라 ga 끼리는 같았고, 섞인 자리는
      원재료(한국 공식) ↔ 보장성분(미국 공식) 사이였다. 사람이 눈으로 잡았다.

   실행: node scripts/source-origin.test.mjs  (npm run check 에 물려 있다) */
import assert from 'node:assert/strict';
import { checkItem, POLICY } from './lib/shared.mjs';

const { isDomesticSource } = POLICY;

/* ═══ ① isDomesticSource ═══ */

/* 1. 한국 공식 — 명시 목록에 있는 도메인+경로 짝. */
assert.equal(isDomesticSource('https://www.royalcanin.com/kr/dogs/products/retail-products/mini-indoor-adult-2434'), true,
  'royalcanin.com/kr 은 한국 공식이라 국내여야 합니다');

/* 2. 같은 도메인의 본사·다른 나라 경로는 해외 — ①이 과하게 넓어지지 않았는지. */
assert.equal(isDomesticSource('https://www.royalcanin.com/us/dogs/products/retail-products/poodle-adult-3057'), false,
  'royalcanin.com/us 는 해외여야 합니다');
assert.equal(isDomesticSource('https://www.royalcanin.com/'), false,
  'royalcanin.com 본사는 해외여야 합니다');

/* 3. 목록 밖의 .com/kr 류는 해외 — 모르면 해외가 틀릴 때 안전한 쪽이다.
   이 케이스가 '경로 추측' 으로 돌아가는 것을 막는 자리다. */
assert.equal(isDomesticSource('https://example.com/kr/products/abc'), false,
  '명시 목록에 없는 .com/kr 은 해외여야 합니다');

/* 4. 경로 구간 전체로만 맞춘다 — prefix 를 느슨하게 보면 다른 나라 경로가 걸린다. */
assert.equal(isDomesticSource('https://www.royalcanin.com/kr-global/dogs'), false,
  '/kr-global 은 /kr 이 아니므로 해외여야 합니다');

/* 5. 원래 규칙은 그대로 — .kr 도메인과 쿠팡. */
assert.equal(isDomesticSource('https://brand.co.kr/product/1'), true, '.kr 은 국내여야 합니다');
assert.equal(isDomesticSource('https://www.coupang.com/vp/products/123'), true, '쿠팡은 국내여야 합니다');

/* ═══ ② 원재료 ↔ 보장성분 출처 섞임 ═══ */

/* ga 근거 검사까지 도달하도록 필수 칸을 채운 최소 항목. 다른 fail 이 쌓이지만
   우리가 보는 건 E_SRC_MIX 하나뿐이라 영향받지 않는다. */
const q = (src, quote) => ({ src, quote });
const mk = (gaSrc, ingrSrc) => ({
  stagingId: 'test_src_mix',
  sources: [
    { role: 'official', url: 'https://www.royalcanin.com/kr/a', fetchedAt: '2026-10-07' },
    { role: 'official', url: 'https://www.royalcanin.com/us/a', fetchedAt: '2026-10-07' }
  ],
  proposed: {
    ga: { protein: 20, fat: 5, fiber: 2.8, moisture: 10.5 },
    ingredients: ['쌀', '육분', '옥수수']
  },
  evidence: {
    'ga.protein': q(gaSrc, 'Protein 20%'), 'ga.fat': q(gaSrc, 'Fat 5%'),
    'ga.fiber': q(gaSrc, 'Fibre 2.8%'), 'ga.moisture': q(gaSrc, 'Moisture 10.5%'),
    ingredients: q(ingrSrc, '쌀, 육분, 옥수수')
  }
});
const srcMix = (gaSrc, ingrSrc) =>
  checkItem(mk(gaSrc, ingrSrc), [], new Set()).fail.some(f => f.code === 'E_SRC_MIX');

/* 6. 원재료 한국(0) · 보장성분 미국(1) → 탈락. 로얄캐닌 4종이 실제로 이 상태였다. */
assert.ok(srcMix(1, 0), '원재료와 보장성분의 출처가 다르면 E_SRC_MIX 가 나야 합니다');

/* 7. 둘 다 같은 출처면 통과. */
assert.ok(!srcMix(0, 0), '원재료와 보장성분이 같은 출처면 통과해야 합니다');
assert.ok(!srcMix(1, 1), '둘 다 미국 출처여도 서로 같으면 이 검사는 통과해야 합니다');

console.log('✅ 출처 판정 회귀 통과 — 한국 공식 명시 허용 / 목록 밖은 해외 / 원재료·보장성분 같은 출처, 9케이스');
