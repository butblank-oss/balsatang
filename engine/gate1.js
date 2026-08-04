/* 게이트 1 — 기계 검사. AI 판단이 아니라 코드가 참·거짓을 판정한다.

   ── 왜 engine/ 에 있나 ──
   원래 scripts/gate1-validate.mjs 안에만 있었다. 그래서 심사 화면(브라우저)은
   이 검사를 돌릴 수 없었고, build-review 가 미리 계산해 둔 ready 값만 믿었다.
   사람이 심사 화면에서 라벨을 채워 넣어도 그 값으로 게이트를 다시 돌릴 방법이
   없어서, 자료 수집 중인 항목은 영영 발행 후보가 되지 못했다.

   검사를 여기로 옮겨 한 벌로 만들었다. Node 스크립트와 어드민이 같은 함수를
   부른다. 브라우저에서 다시 돌린다고 검사가 느슨해지지 않는다 — 같은 코드다.
   (URL 실접속 검사는 브라우저에서 CORS 로 막히므로 Node 쪽에만 남겨 둔다.)

   의존: engine/policy.js, engine/dict.js, engine/engine.js
*/

/* Node 는 이 파일들을 한 스코프에 이어 붙여 실행한다. 최상위 const 가
   서로 부딪히지 않게 감싼다. */
(function () {


const { ENUM, SOURCE_GRADE, PRICE_KG, TTL_DAYS, daysSince,
        REQUIRED_ITEM_FIELDS, REQUIRED_FOOD_FIELDS, REQUIRED_GA_KEYS, REQUIRED_RATING_KEYS,
        isHttpUrl, normKey: norm, isRetailHost, RETAIL_HOST,
        isDomesticSource, isCoupangProductUrl } = globalThis.POLICY;
const { rateAll, RUBRIC_TEXT, REQUIRED_FACT_KEYS, computeDmCarb,
        computeScore, lookupIngredient } = globalThis.ENGINE;

/* 아직 라벨을 못 본 항목 — 카탈로그에서 기본 정보만 긁어 온 상태다.
   검사해 봐야 '원료가 없다 · 탄수가 없다 · 별점이 없다' 가 열 줄씩 나오는데,
   그건 고장이 아니라 아직 안 채운 것이다. 둘을 섞으면 심사 화면이 빨간 벽이 되고
   진짜 문제가 묻힌다. 무엇을 채워야 하는지만 짚어 준다.
   발행 경로는 그대로 막혀 있다 — draft 는 결코 발행 후보가 되지 않는다. */
function draftTodo(item) {
  const p = item.proposed ?? {};
  const todo = [];
  if (!(p.ingredients ?? []).length) todo.push('원료 표기 전체 (표기 순서대로)');
  if (p.ga?.fiber == null || p.ga?.moisture == null) todo.push('조섬유·수분 (건물기준 탄수 계산에 필요)');
  if (p.ga?.protein == null) todo.push('조단백');
  if (p.pricePending) todo.push('쿠팡 상품 링크와 가격');
  if (!p.thumb) todo.push('제품 사진');
  return todo;
}

function checkItem(item, published, seen) {
  const fail = [];
  const warn = [];
  const F = (code, msg) => fail.push({ code, msg });
  const W = (code, msg) => warn.push({ code, msg });

  for (const k of REQUIRED_ITEM_FIELDS) {
    if (item[k] == null) F('E_ITEM_FIELD', `항목 필드 누락: ${k}`);
  }
  if (fail.length) return { fail, warn };

  const p = item.proposed;
  const srcs = item.sources;
  const ev = item.evidence;

  /* --- 1. 필수 필드 --- */
  for (const k of REQUIRED_FOOD_FIELDS) {
    if (p[k] == null) F('E_FIELD', `사료 필드 누락: ${k}`);
  }

  /* --- 2. enum --- */
  const single = { type: p.type, country: p.country, ico: p.ico };
  for (const [k, v] of Object.entries(single)) {
    if (v != null && !ENUM[k].includes(v)) F('E_ENUM', `${k} 허용값 아님: ${v}`);
  }
  for (const k of ['ages', 'sizes', 'func', 'concerns']) {
    if (!Array.isArray(p[k])) { F('E_ENUM', `${k} 는 배열이어야 합니다`); continue; }
    for (const v of p[k]) if (!ENUM[k].includes(v)) F('E_ENUM', `${k} 허용값 아님: ${v}`);
  }
  if (p.price && p.price.shop && !ENUM.shop.includes(p.price.shop)) {
    F('E_ENUM', `shop 허용값 아님: ${p.price.shop}`);
  }
  if (typeof p.rx !== 'boolean') F('E_TYPE', 'rx 는 true/false 여야 합니다');

  /* --- 3. ratings — 가격 보류 중이면 value 는 아직 매길 수 없다 --- */
  const pending = p.pricePending === true;
  for (const k of REQUIRED_RATING_KEYS) {
    const v = p.ratings?.[k];
    if (pending && k === 'value') {
      if (v != null) F('E_RATING', 'ratings.value 는 가격 확보 전까지 null 이어야 합니다');
      continue;
    }
    if (!Number.isInteger(v) || v < 1 || v > 5) F('E_RATING', `ratings.${k} 는 1~5 정수여야 합니다 (현재: ${v})`);
  }

  /* --- 3.5 ratings 도 계산값이어야 한다 —
     AI는 사실(facts)만 뽑고, 점수는 루브릭이 매긴다. 제출값이 다르면 탈락. --- */
  const facts = p.facts;
  if (!facts) {
    F('E_FACTS_NONE', 'facts 가 없습니다 — 채점을 검증할 수 없습니다');
  } else {
    for (const k of REQUIRED_FACT_KEYS) {
      if (facts[k] == null) F('E_FACTS', `facts.${k} 누락 — 채점 검증에 필요합니다`);
    }
    const expect = rateAll({ ...facts, pKg: p.price?.pKg });
    for (const k of REQUIRED_RATING_KEYS) {
      if (pending && k === 'value') continue;
      if (expect[k] == null) continue;
      if (p.ratings?.[k] !== expect[k]) {
        F('E_RATING_RUBRIC',
          `ratings.${k} 가 채점 기준과 다릅니다. 제출 ${p.ratings?.[k]} / 기준 ${expect[k]} — ${RUBRIC_TEXT[k]}`);
      }
    }
  }

  /* --- 3.7 보장성분표와 원재료 목록 —
     상세 화면(판정 카드·영양 프로파일·주원료)이 전부 여기서 만들어진다.
     없으면 사용자에게 빈 화면이 나가므로 등록을 막는다. --- */
  const ga = p.ga;
  if (ga == null) {
    F('E_GA_NONE', 'ga 가 없습니다 — 보장성분표(조단백·조지방·조섬유·수분)를 적어야 합니다');
  } else {
    for (const k of REQUIRED_GA_KEYS) {
      if (!(Number(ga[k]) >= 0)) F('E_GA', `ga.${k} 가 숫자가 아닙니다: ${ga[k]}`);
    }
    /* facts 는 ga 에서 나온 값이다. 서로 어긋나면 어느 쪽이 맞는지 알 수 없다. */
    if (facts && Number(ga.protein) !== Number(facts.protein)) {
      F('E_GA_PROTEIN', `ga.protein(${ga.protein}) 과 facts.protein(${facts.protein}) 이 다릅니다`);
    }
    if (facts && REQUIRED_GA_KEYS.every(k => Number(ga[k]) >= 0)) {
      const dm = computeDmCarb({ protein: +ga.protein, fat: +ga.fat, fiber: +ga.fiber, moisture: +ga.moisture });
      if (facts.dmCarb != null && Math.abs(dm - facts.dmCarb) > 0.15) {
        F('E_GA_DMCARB', `ga 로 계산한 건물기준 탄수(${dm})와 facts.dmCarb(${facts.dmCarb})가 다릅니다`);
      }
    }
  }

  if (!Array.isArray(p.ingredients) || p.ingredients.length === 0) {
    F('E_INGR_NONE', 'ingredients 가 없습니다 — 원재료명을 표기 순서대로 적어야 합니다');
  } else {
    if (p.ingredients.some(x => typeof x !== 'string' || !x.trim())) {
      F('E_INGR', 'ingredients 에 빈 값이 있습니다');
    }
    if (p.ingredients.length < 3) {
      W('W_INGR_SHORT', `원재료가 ${p.ingredients.length}개뿐입니다 — 표기 전체를 옮겼는지 확인하세요`);
    }
    /* 1번 원료 분류가 실제 첫 원료와 맞는지 — 원료 품질 점수가 여기서 갈린다 */
    if (facts?.firstIngrCat) {
      const first = lookupIngredient(p.ingredients[0]);
      const CAT = { meat: 'meat', organ: 'meat', fish: 'fish', grain: 'grain',
                    legume: 'grain', vegetable: 'veg', other: 'other', fat: 'other',
                    oil: 'other', probiotic: 'other', herb: 'other', vitamin: 'other' };
      const got = CAT[first.cat];
      if (first.known && got && got !== facts.firstIngrCat) {
        F('E_INGR_FIRST',
          `facts.firstIngrCat(${facts.firstIngrCat})가 1번 원료 '${p.ingredients[0]}'(${got})와 다릅니다`);
      }
    }
  }

  /* --- 4. score 는 계산값이어야 한다 (AI가 매기면 안 됨) --- */
  if (pending && p.score != null) {
    F('E_SCORE', 'score 는 가격 확보 전까지 null 이어야 합니다 (가성비 점수가 빠져 총점을 낼 수 없음)');
  }
  if (!pending && p.ratings && REQUIRED_RATING_KEYS.every(k => Number.isInteger(p.ratings[k]))) {
    const expect = computeScore(p.ratings);
    if (p.score != null && Math.abs(p.score - expect) > 0.05) {
      F('E_SCORE', `score 가 공식과 다릅니다. 제출 ${p.score} / 계산 ${expect}`);
    }
  }

  /* --- 5. 가격 --- */
  /* 가격을 아직 못 구한 항목은 임시저장만 한다. 가격 검사를 건너뛰고 보류로 표시한다. */
  const pricePending = p.pricePending === true;
  if (pricePending && p.price != null) {
    F('E_PRICE_PENDING', 'pricePending 이 true 인데 price 가 들어있습니다. 하나만 지정하세요');
  }
  if (!pricePending && p.price == null) {
    F('E_FIELD', '사료 필드 누락: price (가격을 못 구했다면 pricePending: true 로 표시하세요)');
  }
  const pr = pricePending ? {} : (p.price || {});
  if (!pricePending) {
  if (!(pr.p > 0)) F('E_PRICE', `가격이 유효하지 않습니다: ${pr.p}`);
  if (!(pr.wg > 0)) F('E_PRICE', `중량(g)이 유효하지 않습니다: ${pr.wg}`);
  /* 가격 기준 용량은 판매 중인 용량 중 최소 — DATA-POLICY 3.4 */
  if (!Array.isArray(pr.wgOptions) || pr.wgOptions.length === 0) {
    F('E_PRICE_OPTS', 'price.wgOptions 가 없습니다 — 확인한 판매 용량을 모두 적어야 합니다');
  } else if (pr.wg != null) {
    const min = Math.min(...pr.wgOptions);
    if (pr.wg !== min) {
      F('E_PRICE_MINWG',
        `가격 기준 용량이 최소 용량이 아닙니다. 제출 ${pr.wg}g / 최소 ${min}g (확인된 용량: ${pr.wgOptions.join(', ')}g)`);
    }
  }

  if (pr.p > 0 && pr.wg > 0) {
    const expect = Math.round(pr.p / (pr.wg / 1000));
    if (pr.pKg != null && Math.abs(pr.pKg - expect) / expect > 0.01) {
      F('E_PRICE_CALC', `pKg 계산 불일치. 제출 ${pr.pKg} / 계산 ${expect}`);
    }
    if (expect < PRICE_KG.min || expect > PRICE_KG.max) {
      F('E_PRICE_RANGE', `kg당 ${expect.toLocaleString()}원 — 상식 범위(${PRICE_KG.min.toLocaleString()}~${PRICE_KG.max.toLocaleString()}) 밖입니다`);
    }
  }
  /* 판매처. 정책상 인정하는 곳은 쿠팡뿐이고(DATA-POLICY 3.4), 다나와는 쿠팡 상품을
     찾는 도구로만 쓴다. 다만 기존 41종에 공식몰 가격이 남아 있어 탈락시키지는 않는다 —
     새로 들어오는 건에 대해 사람이 한 번 보게 경고만 남긴다. */
  if (pr.shop && pr.shop !== 'coupang') {
    W('W_SHOP_NOT_COUPANG', `판매처가 ${pr.shop} 입니다 — 인정 판매처는 쿠팡이고 수수료도 쿠팡에만 붙습니다`);
  }

  /* 구매 버튼이 여는 링크. 쿠팡 파트너스 단축링크(link.coupang.com/a/…)를 쓸 수 있다.
     가격 근거는 sources 의 정식 상품 URL 이고, 이건 사람이 여는 링크일 뿐이다. */
  if (pr.buyUrl != null) {
    if (!isHttpUrl(pr.buyUrl) || !isRetailHost(pr.buyUrl)) {
      F('E_PRICE_BUYURL', `price.buyUrl 은 쿠팡 도메인이어야 합니다: ${pr.buyUrl}`);
    }
  } else {
    /* 수수료는 파트너스 링크로 들어온 구매에만 붙는다. 링크는 사람이 직접 만들어야 해서
       탈락시키지 않고 경고만 한다 — 심사 화면에서 붙여넣으면 된다. */
    W('W_NO_BUYURL', '쿠팡 파트너스 구매 링크(price.buyUrl)가 없습니다 — 수수료가 붙지 않습니다');
  }
  }  /* if (!pricePending) */

  /* --- 6. 출처 구조 --- */
  if (!Array.isArray(srcs) || srcs.length === 0) {
    F('E_SRC_NONE', '출처가 없습니다');
  } else {
    srcs.forEach((s, i) => {
      if (!ENUM.sourceRole.includes(s.role)) F('E_SRC_ROLE', `sources[${i}].role 허용값 아님: ${s.role}`);
      if (!isHttpUrl(s.url)) F('E_SRC_URL', `sources[${i}].url 형식 오류: ${s.url}`);
      if (!s.fetchedAt) F('E_SRC_DATE', `sources[${i}] 확인 시각 누락`);
    });
    /* 성분 근거: A등급 1곳 이상, 없으면 B등급 2곳 이상 — DATA-POLICY 3.2 */
    const gA = srcs.filter(s => SOURCE_GRADE[s.role] === 'A').length;
    const gB = srcs.filter(s => SOURCE_GRADE[s.role] === 'B').length;
    if (gA < 1 && gB < 2) {
      F('E_SRC_GRADE', `성분 근거 부족 — A등급 ${gA}곳, B등급 ${gB}곳 (A 1곳 또는 B 2곳 필요)`);
    }
    /* 가격 근거: 쿠팡 상품 페이지 1곳 — DATA-POLICY 3.2. 가격 보류 중이면 면제. */
    const retails = srcs.filter(s => s.role === 'retail');
    if (!retails.length && !pricePending) F('E_SRC_PRICE', '가격 근거(쿠팡 상품 출처)가 없습니다');
    for (const r of retails) {
      if (!isRetailHost(r.url)) {
        F('E_SRC_RETAIL_HOST',
          `가격 출처는 ${RETAIL_HOST} 만 인정합니다. 가격비교 사이트는 출처가 될 수 없습니다: ${r.url}`);
      } else if (!isCoupangProductUrl(r.url)) {
        F('E_SRC_RETAIL_SHAPE',
          `쿠팡 상품 페이지 형식이 아닙니다 (/vp/products/{상품ID}): ${r.url}`);
      }
    }

    /* 성분 출처가 국내인지 해외인지 표시해야 한다 — DATA-POLICY 3.5.
       해외 성분표도 등록은 하되, 국내 유통품과 배합이 다를 수 있음을 사용자에게 알린다.
       표시가 실제 출처와 어긋나면 탈락시킨다. */
    const specSrcs = srcs.filter(s => SOURCE_GRADE[s.role] === 'A');
    if (specSrcs.length) {
      const actual = specSrcs.some(s => isDomesticSource(s.url)) ? 'domestic' : 'overseas';
      if (!ENUM.specOrigin.includes(p.specOrigin)) {
        F('E_SPEC_ORIGIN', `specOrigin 은 ${ENUM.specOrigin.join(' 또는 ')} 여야 합니다 (현재: ${p.specOrigin})`);
      } else if (p.specOrigin !== actual) {
        F('E_SPEC_ORIGIN_MISMATCH',
          `specOrigin 이 실제 출처와 다릅니다. 제출 ${p.specOrigin} / 실제 ${actual}` +
          (actual === 'overseas' ? ' — A등급 출처가 전부 해외입니다' : ' — 국내 출처가 포함되어 있습니다'));
      }
    }

    /* 유효기간 */
    for (const s of srcs) {
      if (!s.fetchedAt) continue;
      const age = daysSince(s.fetchedAt);
      const ttl = s.role === 'retail' ? TTL_DAYS.price : TTL_DAYS.spec;
      if (age > ttl) W('W_STALE', `sources[${srcs.indexOf(s)}] 확인일이 ${Math.floor(age)}일 지났습니다 (유효 ${ttl}일)`);
    }
  }

  /* --- 7. 근거 인용 — 값마다 어느 출처의 어느 문장인지 --- */
  const needEvidence = [...REQUIRED_FACT_KEYS.map(k => `facts.${k}`), ...(pending ? [] : ['price.p'])];
  for (const key of needEvidence) {
    const e = ev?.[key];
    if (!e) { F('E_EV_NONE', `근거 누락: ${key}`); continue; }
    if (!Number.isInteger(e.src) || !srcs?.[e.src]) F('E_EV_SRC', `${key} 의 출처 번호가 잘못됨: ${e.src}`);
    if (!e.quote || String(e.quote).trim().length < 2) F('E_EV_QUOTE', `${key} 의 인용문이 비어 있습니다`);
  }

  /* --- 8. 중복 --- */
  const key = norm(p.brand) + '|' + norm(p.name);
  if (published.some(f => norm(f.brand) + '|' + norm(f.name) === key)) {
    F('E_DUP', `이미 등록된 사료입니다: ${p.brand} ${p.name}`);
  }
  if (seen.has(key)) F('E_DUP_BATCH', `같은 배치 안에서 중복: ${p.brand} ${p.name}`);
  seen.add(key);

  return { fail, warn };
}

globalThis.GATE1 = { checkItem, draftTodo };
})();
