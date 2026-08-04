/* 데이터 정책 상수와 판정 함수 — 한 벌.

   원래 scripts/lib/schema.mjs 에만 있어서 Node 스크립트만 볼 수 있었다. 그런데
   심사 화면(브라우저)이 사람이 채워 넣은 값으로 게이트를 다시 돌려야 해서,
   같은 규칙이 양쪽에 필요해졌다. 옮겨 적으면 반드시 어긋나므로 여기 한 곳에 둔다.
   Node 는 scripts/lib/shared.mjs 를 거쳐 읽고, 어드민은 <script> 로 읽는다.

   정책 원문은 docs/DATA-POLICY.md. */

/* Node 는 이 파일들을 한 스코프에 이어 붙여 실행한다. 최상위 const 가
   서로 부딪히지 않게 감싼다. */
(function () {


const ENUM = {
  type: ['dry', 'wet', 'air_dried', 'freeze_dried', 'raw'],
  country: ['KR', 'CA', 'US', 'FR', 'NZ', 'AU', 'DE', 'IT', 'NL', 'BE', 'GB', 'JP', 'TH'],
  ages: ['all', 'puppy', 'adult', 'senior'],
  sizes: ['all', 'small', 'medium', 'large'],
  func: ['digestive', 'eye_tear', 'heart', 'immune', 'joint', 'kidney', 'weight', 'skin', 'dental', 'liver'],
  /* immune 은 예전 데이터에 이미 쓰이고 있었는데 목록에 없어서, 어드민과 앱이
     둘 다 'immune' 이라는 코드를 그대로 화면에 뿌렸다. 실제 고민이므로 넣는다. */
  concerns: ['allergy', 'digestive', 'eye_tear', 'healthy', 'immune', 'joint', 'kidney',
             'liver', 'picky_eater', 'post_surgery', 'senior', 'weight', 'skin', 'dental'],
  shop: ['coupang', 'brand_official', 'naver', 'other'],
  ico: ['beef', 'bird', 'cross', 'dog', 'drumstick', 'fish', 'leaf'],
  status: ['draft', 'review', 'published', 'rejected', 'stale'],
  specOrigin: ['domestic', 'overseas'],
  /* catalog — 다나와 같은 상품 카탈로그. 제품명·용량·제형·사진의 근거는 되지만
     판매처가 아니라서 가격 근거로는 못 쓴다. 예전엔 이걸 retail 로 적었는데,
     retail 은 쿠팡 상품 페이지만 인정하는 자리라 게이트에 걸렸다. */
  sourceRole: ['official', 'importer', 'label', 'retail', 'authority', 'catalog']
};

/* 가격 출처로 인정하는 도메인 — DATA-POLICY 3.2. 쿠팡만 인정한다. */
const RETAIL_HOST = 'coupang.com';

function isRetailHost(url) {
  try { const h = new URL(url).hostname.toLowerCase();
        return h === RETAIL_HOST || h.endsWith('.' + RETAIL_HOST); }
  catch { return false; }
}

/* 국내 출처인지 — 성분은 국내 유통 제품 기준이어야 한다 (DATA-POLICY 3.2).
   .kr 도메인 외에 국내 서비스가 쓰는 도메인도 포함한다. 다나와(danawa.com)와 그 이미지
   CDN(danuri.io)은 국내 유통 상품의 국내 등록 정보를 싣는다. */
const DOMESTIC_HOSTS = ['danawa.com', 'danuri.io'];

function isDomesticSource(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h.endsWith('.kr')) return true;
    if (isRetailHost(url)) return true;
    return DOMESTIC_HOSTS.some(d => h === d || h.endsWith('.' + d));
  } catch { return false; }
}

/* 쿠팡 상품 URL 형식 — 쿠팡은 봇 차단이 강해 실접속 검증이 불가능하므로 형식으로 검증한다. */
function isCoupangProductUrl(url) {
  try { return isRetailHost(url) && /^\/vp\/products\/\d+/.test(new URL(url).pathname); }
  catch { return false; }
}

/* 출처 등급 — DATA-POLICY 3.1 */
const SOURCE_GRADE = {
  /* label — 제품 봉지·상세이미지의 성분분석표를 사람이 눈으로 판독한 것.
     사료관리법이 표기를 강제하는 원본이라 제조사 홈페이지보다 오히려 1차 자료다.
     수입 사료는 국내 공식 페이지가 아예 없는 경우가 많아, 이걸 B로 두면
     사람이 라벨을 보고 등록하는 흐름 자체가 영영 통과하지 못한다. */
  official: 'A', importer: 'A', authority: 'A', label: 'A', retail: 'B',
  /* 카탈로그는 2차 자료다. 이것만으로는 성분 근거가 못 되고(B 두 곳 필요),
     가격 근거로는 아예 쓸 수 없다. */
  catalog: 'B'
};

/* 가격 상식 범위 (원/kg). 벗어나면 오타로 본다.
   하한 3,000원은 너무 높았다. 대용량 저가 사료는 kg당 1,400원대가 실제로 존재한다
   (뉴트리나 프라임 밸런스 15kg 21,890원 = 1,459원/kg, 울트라 초이스 15kg = 1,400원/kg). */
const PRICE_KG = { min: 1000, max: 200000 };

/* 출처 유효기간 (일) — DATA-POLICY 3.3 */
const TTL_DAYS = { price: 30, spec: 365 };

function daysSince(iso) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Infinity : (Date.now() - t) / 86400000;
}

/* 스테이징 항목 한 건의 필수 구조. 게이트 1이 이걸로 검사한다. */
const REQUIRED_ITEM_FIELDS = ['stagingId', 'proposed', 'sources', 'evidence'];
const REQUIRED_FOOD_FIELDS = ['brand', 'brandSlug', 'country', 'name', 'type',
                              'rx', 'ages', 'sizes', 'ratings', 'func', 'concerns', 'facts',
                              'specOrigin', 'ga', 'ingredients'];

/* 보장성분표. 상세 화면의 영양 프로파일이 여기서 나온다.
   조회분·열량은 라벨에 없을 수 있어 필수가 아니다. */
const REQUIRED_GA_KEYS = ['protein', 'fat', 'fiber', 'moisture'];
/* 가격은 나중에 채울 수 있다. pricePending: true 인 항목은 price 없이 임시저장된다. */
const REQUIRED_PRICE_FIELDS = ['price'];
const REQUIRED_RATING_KEYS = ['quality', 'carb', 'additive', 'value'];

function isHttpUrl(u) {
  try { const p = new URL(u); return p.protocol === 'https:' || p.protocol === 'http:'; }
  catch { return false; }
}

/* 문자열을 비교 가능한 형태로 — 공백/대소문자/구두점 차이는 무시한다. */
function normKey(s) {
  return String(s ?? '').toLowerCase().replace(/[\s\-_·.,()]/g, '');
}

globalThis.POLICY = {
  ENUM, RETAIL_HOST, isRetailHost, isDomesticSource, isCoupangProductUrl,
  SOURCE_GRADE, PRICE_KG, TTL_DAYS, daysSince,
  REQUIRED_ITEM_FIELDS, REQUIRED_FOOD_FIELDS, REQUIRED_GA_KEYS,
  REQUIRED_PRICE_FIELDS, REQUIRED_RATING_KEYS,
  isHttpUrl, normKey
};
})();
