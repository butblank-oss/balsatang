/* 발사탕 데이터 스키마와 공통 규칙. 게이트 스크립트와 병합 스크립트가 공유한다.
   정책 원문은 docs/DATA-POLICY.md 참고. */

export const ENUM = {
  type: ['dry', 'wet', 'air_dried', 'freeze_dried', 'raw'],
  country: ['KR', 'CA', 'US', 'FR', 'NZ', 'AU', 'DE', 'IT', 'NL', 'BE', 'GB', 'JP', 'TH'],
  ages: ['all', 'puppy', 'adult', 'senior'],
  sizes: ['all', 'small', 'medium', 'large'],
  func: ['digestive', 'eye_tear', 'heart', 'immune', 'joint', 'kidney', 'weight', 'skin', 'dental', 'liver'],
  concerns: ['allergy', 'digestive', 'eye_tear', 'healthy', 'joint', 'kidney', 'liver',
             'picky_eater', 'post_surgery', 'senior', 'weight', 'skin', 'dental'],
  shop: ['coupang', 'brand_official', 'naver', 'other'],
  ico: ['beef', 'bird', 'cross', 'dog', 'drumstick', 'fish', 'leaf'],
  status: ['draft', 'review', 'published', 'rejected', 'stale'],
  specOrigin: ['domestic', 'overseas'],
  sourceRole: ['official', 'importer', 'label', 'retail', 'authority']
};

/* 가격 출처로 인정하는 도메인 — DATA-POLICY 3.2. 쿠팡만 인정한다. */
export const RETAIL_HOST = 'coupang.com';

export function isRetailHost(url) {
  try { const h = new URL(url).hostname.toLowerCase();
        return h === RETAIL_HOST || h.endsWith('.' + RETAIL_HOST); }
  catch { return false; }
}

/* 국내 출처인지 — 성분은 국내 유통 제품 기준이어야 한다 (DATA-POLICY 3.2).
   .kr 도메인 외에 국내 서비스가 쓰는 도메인도 포함한다. 다나와(danawa.com)와 그 이미지
   CDN(danuri.io)은 국내 유통 상품의 국내 등록 정보를 싣는다. */
const DOMESTIC_HOSTS = ['danawa.com', 'danuri.io'];

export function isDomesticSource(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h.endsWith('.kr')) return true;
    if (isRetailHost(url)) return true;
    return DOMESTIC_HOSTS.some(d => h === d || h.endsWith('.' + d));
  } catch { return false; }
}

/* 쿠팡 상품 URL 형식 — 쿠팡은 봇 차단이 강해 실접속 검증이 불가능하므로 형식으로 검증한다. */
export function isCoupangProductUrl(url) {
  try { return isRetailHost(url) && /^\/vp\/products\/\d+/.test(new URL(url).pathname); }
  catch { return false; }
}

/* 출처 등급 — DATA-POLICY 3.1 */
export const SOURCE_GRADE = {
  /* label — 제품 봉지·상세이미지의 성분분석표를 사람이 눈으로 판독한 것.
     사료관리법이 표기를 강제하는 원본이라 제조사 홈페이지보다 오히려 1차 자료다.
     수입 사료는 국내 공식 페이지가 아예 없는 경우가 많아, 이걸 B로 두면
     사람이 라벨을 보고 등록하는 흐름 자체가 영영 통과하지 못한다. */
  official: 'A', importer: 'A', authority: 'A', label: 'A', retail: 'B'
};

/* 점수 가중치 — DATA-POLICY 4. 합이 1이 되어야 한다. */
export const SCORE_WEIGHT = { quality: 0.45, additive: 0.28, carb: 0.20, value: 0.07 };

export function computeScore(ratings) {
  const w = SCORE_WEIGHT;
  const raw = 2 * (w.quality * ratings.quality + w.additive * ratings.additive +
                   w.carb * ratings.carb + w.value * ratings.value);
  return Math.round(raw * 10) / 10;
}

/* 가격 상식 범위 (원/kg). 벗어나면 오타로 본다.
   하한 3,000원은 너무 높았다. 대용량 저가 사료는 kg당 1,400원대가 실제로 존재한다
   (뉴트리나 프라임 밸런스 15kg 21,890원 = 1,459원/kg, 울트라 초이스 15kg = 1,400원/kg). */
export const PRICE_KG = { min: 1000, max: 200000 };

/* 출처 유효기간 (일) — DATA-POLICY 3.3 */
export const TTL_DAYS = { price: 30, spec: 365 };

export function daysSince(iso) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Infinity : (Date.now() - t) / 86400000;
}

/* 스테이징 항목 한 건의 필수 구조. 게이트 1이 이걸로 검사한다. */
export const REQUIRED_ITEM_FIELDS = ['stagingId', 'proposed', 'sources', 'evidence'];
export const REQUIRED_FOOD_FIELDS = ['brand', 'brandSlug', 'country', 'name', 'type',
                                     'rx', 'ages', 'sizes', 'ratings', 'func', 'concerns', 'facts',
                                     'specOrigin', 'ga', 'ingredients'];

/* 보장성분표. 상세 화면의 영양 프로파일이 여기서 나온다.
   조회분·열량은 라벨에 없을 수 있어 필수가 아니다. */
export const REQUIRED_GA_KEYS = ['protein', 'fat', 'fiber', 'moisture'];
/* 가격은 나중에 채울 수 있다. pricePending: true 인 항목은 price 없이 임시저장된다. */
export const REQUIRED_PRICE_FIELDS = ['price'];
export const REQUIRED_RATING_KEYS = ['quality', 'carb', 'additive', 'value'];

export function isHttpUrl(u) {
  try { const p = new URL(u); return p.protocol === 'https:' || p.protocol === 'http:'; }
  catch { return false; }
}

/* 문자열을 비교 가능한 형태로 — 공백/대소문자/구두점 차이는 무시한다. */
export function norm(s) {
  return String(s ?? '').toLowerCase().replace(/[\s\-_·.,()]/g, '');
}

/* data.js 에서 전체 사료 저장소를 읽는다.
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
