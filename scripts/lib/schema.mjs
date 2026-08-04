/* 발사탕 데이터 스키마와 공통 규칙 — 실제 내용은 engine/policy.js 에 있다.

   심사 화면(브라우저)도 같은 규칙으로 게이트를 다시 돌려야 해서 engine/ 으로
   옮겼다. 이 파일은 예전 경로를 그대로 쓰는 스크립트들을 위한 얇은 통로다.
   정책 원문은 docs/DATA-POLICY.md 참고. */
import { POLICY, computeScore, SCORE_WEIGHT } from './shared.mjs';

export const {
  ENUM, RETAIL_HOST, isRetailHost, isDomesticSource, isCoupangProductUrl,
  SOURCE_GRADE, PRICE_KG, TTL_DAYS, daysSince,
  REQUIRED_ITEM_FIELDS, REQUIRED_FOOD_FIELDS, REQUIRED_GA_KEYS,
  REQUIRED_PRICE_FIELDS, REQUIRED_RATING_KEYS, isHttpUrl
} = POLICY;
/* 예전 이름 그대로 — 엔진의 normalizeIngredient 와 헷갈리지 않게 안에서는 normKey 다 */
export const norm = POLICY.normKey;
export { computeScore, SCORE_WEIGHT };

/* data.js 에서 전체 사료 저장소를 읽는다. Node 에서만 쓴다.
   FOODS_ALL = 전체(모든 status), FOODS = 발행분만. 중복 검사는 전체를 기준으로 한다. */
export async function loadFoods(rootDir) {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const src = await readFile(join(rootDir, 'data.js'), 'utf-8');
  const m = src.match(/const FOODS_ALL\s*=\s*(\[[\s\S]*?\]);/);
  if (!m) throw new Error('data.js 에서 FOODS_ALL 배열을 찾지 못했습니다');
  const all = JSON.parse(m[1]);
  return { all, published: all.filter(f => f.status === 'published') };
}
