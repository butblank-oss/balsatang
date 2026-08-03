/* 발사탕 엔진 — 채점·원료 판정·판정 카드 생성.

   원래 이 로직은 scripts/lib/ 에만 있어서 Node 에서만 돌았다. 어드민이
   브라우저에서 같은 계산을 하려면 옮겨 적어야 했고, 옮겨 적는 순간 두 벌이
   되어 서로 어긋난다 — 예전 어드민이 딱 그렇게 어긋나서 구매 링크를 버렸다.

   그래서 로직을 여기 한 벌만 둔다.
     · 브라우저 : <script src="engine.js"> 로 읽는다
     · Node     : scripts/lib/shared.mjs 가 이 파일을 읽어 그대로 내보낸다

   앞에 dict.js(원료 사전)와 phrases.js(문구 템플릿)가 먼저 와야 한다.

   ⚠ AI 는 점수를 매기지 않는다. 사실만 뽑고 여기 루브릭이 계산한다.
*/
/* 탄수화물 — 건물기준 탄수(%). 낮을수록 좋다. */
function rateCarb(dmCarb) {
  if (dmCarb == null) return null;
  if (dmCarb <= 25) return 5;
  if (dmCarb <= 35) return 4;
  if (dmCarb <= 44) return 3;
  if (dmCarb <= 56) return 2;
  return 1;
}

/* 원료 — 조단백(%)이 기준. 다만 1번 원료가 곡물이면 3점을 넘지 못한다. */
function rateQuality(protein, firstIngrCat) {
  if (protein == null) return null;
  let s = protein >= 32 ? 5 : protein >= 25 ? 4 : protein >= 16 ? 3 : 2;
  if (firstIngrCat === 'grain') s = Math.min(s, 3);
  return s;
}

/* 첨가물 — 주의 성분 개수. 위험 성분이 하나라도 있으면 3점을 넘지 못한다. */
function rateAdditive(cautionN, dangerN) {
  if (cautionN == null) return null;
  let s = cautionN === 0 ? 5 : cautionN <= 2 ? 4 : cautionN <= 4 ? 3 : 2;
  if ((dangerN ?? 0) > 0) s = Math.min(s, 3);
  return s;
}

/* 가성비 — kg당 가격(원). 타입과 무관한 절대 구간.
   구간은 기존 41종의 채점을 최대한 재현하도록 맞췄다(90% 일치). */
function rateValue(pKg) {
  if (pKg == null) return null;
  if (pKg <= 10000) return 5;
  if (pKg <= 16000) return 4;
  if (pKg <= 32000) return 3;
  if (pKg <= 45000) return 2;
  return 1;
}

/* 사실(facts)에서 ratings 전체를 계산한다.
   facts = { dmCarb, protein, firstIngrCat, cautionN, dangerN, pKg } */
function rateAll(facts) {
  /* pKg 가 없으면 value 는 null 이 된다. 가격 확보 전에도 나머지 3개는 채점된다. */
  return {
    quality: rateQuality(facts.protein, facts.firstIngrCat),
    carb: rateCarb(facts.dmCarb),
    additive: rateAdditive(facts.cautionN, facts.dangerN),
    value: rateValue(facts.pKg)
  };
}

/* 게이트가 쓰는 설명문 — 왜 이 점수인지 사람에게 보여준다. */
const RUBRIC_TEXT = {
  quality: '조단백 32%↑=5, 25%↑=4, 16%↑=3, 그 미만=2. 1번 원료가 곡물이면 최대 3점',
  carb: '건물기준 탄수 25%↓=5, 35%↓=4, 44%↓=3, 56%↓=2, 초과=1',
  additive: '주의 성분 0개=5, 1~2개=4, 3~4개=3, 5개↑=2. 위험 성분 있으면 최대 3점',
  value: 'kg당 1만원↓=5, 1.6만원↓=4, 3.2만원↓=3, 4.5만원↓=2, 초과=1'
};

/* 사실 항목의 필수 키 — 이게 없으면 채점을 검증할 수 없다. */
const REQUIRED_FACT_KEYS = ['dmCarb', 'protein', 'firstIngrCat', 'cautionN', 'dangerN'];

/* 건물기준 탄수 계산. 기존 41종이 쓰는 방식과 동일하게 조회분은 제외한다
   (41종 중 34종이 조회분 미표기이고, 표기된 건도 계산에 반영되지 않았다).
   조회분을 빼면 dmCarb 가 약 9%p 낮아져 루브릭 경계가 어긋난다. */
function computeDmCarb({ protein, fat, fiber, moisture }) {
  if ([protein, fat, fiber, moisture].some(v => v == null)) return null;
  const carb = 100 - (protein + fat + fiber + moisture);
  return Math.round((carb / (100 - moisture)) * 1000) / 10;
}

/* 종합 점수 — DATA-POLICY 4. 가중치 합이 1이어야 한다. */
const SCORE_WEIGHT = { quality: 0.45, additive: 0.28, carb: 0.20, value: 0.07 };
function computeScore(ratings) {
  const w = SCORE_WEIGHT;
  const raw = 2 * (w.quality * ratings.quality + w.additive * ratings.additive +
                   w.carb * ratings.carb + w.value * ratings.value);
  return Math.round(raw * 10) / 10;
}

function normalizeIngredient(raw) {
  let s = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return null;
  if (DICT.alias[s]) return DICT.alias[s];
  const bare = s.replace(/\s*\([^)]*\)\s*$/, '').trim();   // 끝의 괄호 설명 제거
  if (DICT.alias[bare]) return DICT.alias[bare];
  if (DICT.ingredients[bare]) return bare;
  const noOrganic = bare.replace(/^유기농\s*/, '').trim();
  if (DICT.alias[noOrganic]) return DICT.alias[noOrganic];
  if (DICT.ingredients[noOrganic]) return noOrganic;
  return s;
}

/* 어느 사료에나 들어가는 영양 보충제류. 하나씩 사전에 넣는 대신 형태로 알아본다.
   모른다고 표시하면 '분류하지 못한 원료' 가 매번 십수 개씩 잡혀 쓸모가 없어진다. */
const PATTERNS = [
  [/비타민|바이오틴|엽산|나이아신|판토텐산|리보플라빈|티아민|피리독신|콜레칼시페롤|토코페롤/, 'vitamin', 'safe', '비타민 보충제'],
  [/미네랄|미량광물|광물질|무기물|아연|셀레늄|망간|코발트|요오드|구리|철분|황산/, 'vitamin', 'safe', '미네랄 보충제'],
  [/인산칼슘|탄산칼슘|석회석|염화칼륨|염화콜린|제올라이트|제올라이트|규조토/, 'other', 'safe', '칼슘·전해질 보충 원료'],
  [/메치오닌|메티오닌|라이신|트레오닌|트립토판|아르기닌|카르니틴|타우린/, 'other', 'safe', '아미노산 보충제'],
  [/프로바이오|바실러스|락토바실러스|Bacillus|Lactobacillus|효소|프로테아제/i, 'probiotic', 'safe', '유익균·소화효소'],
  [/추출물|분말$|믹스$/, 'herb', 'safe', '보조 원료'],
];

function lookupIngredient(raw) {
  const name = normalizeIngredient(raw);
  if (!name) return null;
  let hit = DICT.ingredients[name];
  if (!hit) {
    for (const [re, cat, safe, desc] of PATTERNS) {
      if (re.test(name)) { hit = { cat, safe, basis: null, desc, warn: null, allergen: false }; break; }
    }
  }
  return {
    name: String(raw).trim(),
    cat: hit?.cat ?? 'other',
    safe: hit?.safe ?? 'unknown',      /* 사전에 없으면 모른다고 한다. 안전하다고 하지 않는다 */
    basis: hit?.basis ?? null,
    desc: hit?.desc ?? null,
    warn: hit?.warn ?? null,
    allergen: hit?.allergen ?? false,
    known: !!hit,
    func: DICT.functional[name] ?? null
  };
}

/* '옥수수이에요' 처럼 어색하게 붙는 걸 막는다. 받침이 있으면 이에요, 없으면 예요. */
function iyeyo(word) {
  const last = String(word ?? '').trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code >= 0xAC00 && code <= 0xD7A3) {
    return (code - 0xAC00) % 28 ? `${word}이에요` : `${word}예요`;
  }
  return `${word}이에요`;   /* 영문·숫자로 끝나면 읽는 대로 이에요 */
}

/* ── 영양 프로파일 ─────────────────────────────────────── */
function deriveNutrient(ga = {}, opts = {}) {
  const num = v => (v == null || v === '' ? null : Number(v));
  const protein = num(ga.protein), fat = num(ga.fat), fiber = num(ga.fiber);
  const ash = num(ga.ash), moisture = num(ga.moisture);
  let carb = null, dmCarb = null;
  if ([protein, fat, fiber, moisture].every(v => v != null)) {
    carb = Math.round((100 - (protein + fat + fiber + moisture)) * 10) / 10;
    dmCarb = computeDmCarb({ protein, fat, fiber, moisture });
  }
  return {
    protein, fat, fiber, moisture, ash, carb, dmCarb,
    meat: opts.meatRatio ?? null,
    calKg: num(ga.kcalPerKg),
    src: opts.src ?? 'label'
  };
}

/* ── 원료 목록 ─────────────────────────────────────────── */
/* 상위 5개를 주원료(main)로 본다. 사료 표기는 함량 많은 순이라 앞쪽이 실제 구성을 좌우한다. */
function deriveIngredients(list = []) {
  return list.map((raw, i) => {
    const info = lookupIngredient(raw);
    return {
      rank: i + 1, main: i < 5, name: info.name,
      cat: info.cat, safe: info.safe, basis: info.basis,
      desc: info.desc, warn: info.warn, allergen: info.allergen
    };
  });
}

function deriveDist(ingr = []) {
  const d = { safe: 0, caution: 0, danger: 0, unknown: 0, total: ingr.length };
  for (const i of ingr) d[i.safe === 'unknown' ? 'unknown' : i.safe]++;
  return d;
}

/* ── 기능성 원료 ───────────────────────────────────────── */
function deriveFuncIngr(list = []) {
  const out = {};
  for (const raw of list) {
    const info = lookupIngredient(raw);
    if (!info.func) continue;
    const { key, ev } = info.func;
    (out[key] ??= []);
    if (out[key].some(x => x.n === info.name)) continue;
    out[key].push({ n: info.name, note: null, ev });
  }
  return out;
}

const FUNC_LABEL = {
  eye_tear: '눈물·피모', joint: '관절', digestive: '소화·장', immune: '면역·활력',
  heart: '심장', kidney: '신장', liver: '간', weight: '체중 관리',
  skin: '피부·피모', dental: '치아'
};

/* ── 판정 카드 ─────────────────────────────────────────── */
/* 기존 41종이 쓰던 category 를 그대로 쓴다: ingredient_quality, carb_level,
   additive_safety, nutrition_balance, price_value, functional_benefit */
function deriveVerdict({ nutrient, ingr, dist, funcIngr, price, facts }) {
  const pos = [], cau = [], dan = [];
  const pct = v => `${Number(v).toFixed(1).replace(/\.0$/, '')}%`;

  /* 1번 원료 — 무엇으로 만든 사료인지가 가장 먼저 보여야 한다 */
  const first = ingr[0];
  if (first) {
    if (first.cat === 'meat' || first.cat === 'fish' || first.cat === 'organ') {
      pos.push({ icon: '🥩', category: 'ingredient_quality',
        title: first.cat === 'fish' ? '첫 번째 원료가 생선이에요' : '첫 번째 원료가 고기예요',
        body: `원재료 표기 맨 앞이 ${iyeyo(first.name)}. 함량이 가장 많다는 뜻이에요.` });
    } else if (first.cat === 'grain' || first.cat === 'legume') {
      cau.push({ icon: '🌾', category: 'ingredient_quality',
        title: '첫 번째 원료가 고기가 아니에요',
        body: `맨 앞이 ${iyeyo(first.name)}. 고기보다 ${first.cat === 'grain' ? '곡물' : '콩류'}로 더 많이 채웠다는 뜻이에요.` });
    }
  }

  /* 상위 5개 중 동물성 비중 */
  const top = ingr.filter(i => i.main);
  const animal = top.filter(i => ['meat', 'fish', 'organ'].includes(i.cat)).length;
  if (top.length >= 3 && animal >= 3) {
    pos.push({ icon: '💪', category: 'ingredient_quality',
      title: '주원료 대부분이 동물성이에요',
      body: `상위 ${top.length}개 중 ${animal}개가 고기·생선이에요.` });
  }

  /* 출처가 불투명한 원료.
     고기인데 어떤 동물인지 안 밝힌 건 위험으로, 곡물·식물성 충전재의 품목 미표기는
     주의로 나눈다. 둘을 같은 무게로 다루면 경고가 무뎌진다. */
  const opaqueMeat = ingr.filter(i => ['meat', 'fish', 'organ'].includes(i.cat) && i.safe === 'danger');
  if (opaqueMeat.length) {
    dan.push({ icon: '🚨', category: 'ingredient_quality',
      title: '출처가 불투명한 고기 원료가 있어요',
      body: `${opaqueMeat.map(v => v.name).join(', ')} — 어떤 동물의 어느 부위인지 표기되지 않았어요.` });
  }
  const opaquePlant = ingr.filter(i => i.warn === '원료 추적 불가' && !opaqueMeat.includes(i));
  if (opaquePlant.length) {
    cau.push({ icon: '🔍', category: 'ingredient_quality',
      title: '품목이 밝혀지지 않은 원료가 있어요',
      body: `${opaquePlant.map(v => v.name).join(', ')} — 어떤 곡물·식물인지 표기되지 않아 알러지 원인을 추적하기 어려워요.` });
  }

  /* 탄수화물 */
  const c = nutrient.dmCarb;
  if (c != null) {
    if (c <= 25) pos.push({ icon: '📉', category: 'carb_level',
      title: `탄수화물이 낮아요 (${pct(c)} 추정)`, body: '건물기준 25% 이하로 낮은 편이에요.' });
    else if (c <= 35) pos.push({ icon: '📊', category: 'carb_level',
      title: `탄수화물이 적당해요 (${pct(c)} 추정)`, body: '건물기준 25~35% 수준이에요.' });
    else if (c <= 44) cau.push({ icon: '📊', category: 'carb_level',
      title: `탄수화물이 조금 높아요 (${pct(c)} 추정)`, body: '건물기준 35~44% 수준이에요.' });
    else if (c <= 56) cau.push({ icon: '📊', category: 'carb_level',
      title: `탄수화물이 높아요 (${pct(c)} 추정)`, body: '건물기준 44~56% 수준이에요. 체중 관리가 필요한 아이는 주의하세요.' });
    else cau.push({ icon: '⚠️', category: 'carb_level',
      title: `탄수화물이 매우 높아요 (${pct(c)} 추정)`, body: '건물기준 56%를 넘어요. 곡물 비중이 큰 사료예요.' });
  }

  /* 단백질 */
  const pr = nutrient.protein;
  if (pr != null) {
    if (pr >= 32) pos.push({ icon: '🍖', category: 'nutrition_balance',
      title: `조단백이 높아요 (${pct(pr)})`, body: '프리미엄 사료 기준(28% 이상)을 넘어요.' });
    else if (pr < 18) cau.push({ icon: '🍖', category: 'nutrition_balance',
      title: `조단백이 낮아요 (${pct(pr)})`, body: 'AAFCO 성견 권장 최소치(18%)에 못 미쳐요.' });
  }

  /* 첨가물 */
  /* 출처 불투명한 고기는 위에서 따로 말했다. 여기서는 첨가물 쪽만 센다 —
     같은 원료로 카드를 두 장 만들면 실제보다 위험해 보인다. */
  const dangerIngr = ingr.filter(i => i.safe === 'danger' && !opaqueMeat.includes(i));
  if (dangerIngr.length) {
    dan.push({ icon: '☠️', category: 'additive_safety',
      title: `위험 성분 ${dangerIngr.length}개 포함`,
      body: `${dangerIngr.map(i => i.name).join(', ')} — 장기 급여 시 위험이 보고된 성분이에요.` });
  }
  const cautionN = facts?.cautionN ?? dist.caution;
  if (cautionN === 0 && !dangerIngr.length) {
    pos.push({ icon: '✅', category: 'additive_safety',
      title: '주의 성분이 없어요', body: '충전재·불명확한 첨가물이 확인되지 않았어요.' });
  } else if (cautionN >= 5) {
    cau.push({ icon: '⚡', category: 'additive_safety',
      title: `주의 성분 ${cautionN}개 포함`,
      body: '곡물 충전재·향미제 등 주의해서 볼 원료가 많은 편이에요.' });
  }

  /* 가성비 */
  const pKg = price?.pKg;
  if (pKg != null) {
    const man = Math.round(pKg / 100) / 100;
    if (pKg <= 10000) pos.push({ icon: '💰', category: 'price_value',
      title: `가성비가 좋아요 (kg당 ${pKg.toLocaleString('ko-KR')}원)`, body: 'kg당 1만원 이하예요.' });
    else if (pKg > 45000) cau.push({ icon: '💸', category: 'price_value',
      title: `가격이 높아요 (kg당 ${man}만원)`, body: 'kg당 4.5만원을 넘어요.' });
  }

  /* 기능성 */
  for (const [k, arr] of Object.entries(funcIngr)) {
    const proven = arr.filter(x => x.ev === 'proven');
    if (!proven.length) continue;
    pos.push({ icon: '🌿', category: 'functional_benefit',
      title: `${FUNC_LABEL[k] ?? k}에 도움되는 원료가 있어요`,
      body: `${proven.map(x => x.n).join(', ')} — 근거가 확인된 원료예요.` });
  }

  /* 모르는 원료가 많으면 그대로 말한다 */
  if (dist.unknown >= 3) {
    cau.push({ icon: '❓', category: 'ingredient_quality',
      title: `분류하지 못한 원료 ${dist.unknown}개`,
      body: '사전에 없는 원료라 안전성을 판단하지 않았어요.' });
  }
  return { pos, cau, dan };
}

/* ── 이런 아이에게 어떨까요 ────────────────────────────── */
function deriveFit({ nutrient, ingr, dist, funcIngr }) {
  const fit = [], cau = [];
  const has = k => (funcIngr[k] ?? []).length > 0;
  const c = nutrient.dmCarb, fatV = nutrient.fat, pr = nutrient.protein;

  if (has('eye_tear')) fit.push({ concernType: 'eye_tear', label: '눈물·피부에 도움되는 원료가 들어있어요' });
  if (has('joint')) fit.push({ concernType: 'joint', label: '관절에 도움되는 원료가 들어있어요' });
  if (has('digestive')) fit.push({ concernType: 'digestive', label: '소화하기 좋은 원료 구성이에요' });
  if (has('immune')) fit.push({ concernType: 'immune', label: '면역에 도움되는 원료가 들어있어요' });
  if (has('kidney')) fit.push({ concernType: 'kidney', label: '신장 케어에 쓰이는 원료가 들어있어요' });
  if (has('liver')) fit.push({ concernType: 'liver', label: '간 건강에 쓰이는 원료가 들어있어요' });

  if (c != null && c <= 30 && dist.danger === 0)
    fit.push({ concernType: 'healthy', label: '탄수화물이 낮고 위험 성분이 없어요' });
  if (pr != null && pr >= 28)
    fit.push({ concernType: 'post_surgery', label: '단백질이 높아 회복기에 도움이 될 수 있어요' });

  if (c != null && c >= 45)
    cau.push({ concernType: 'weight', label: '탄수화물이 높아 체중 관리가 필요한 아이는 주의가 필요해요' });
  else if (fatV != null && fatV >= 18)
    cau.push({ concernType: 'weight', label: '지방이 높아 체중 관리가 필요한 아이는 주의가 필요해요' });

  const allergens = ingr.filter(i => i.allergen);
  if (allergens.length)
    cau.push({ concernType: 'allergy',
      label: `${allergens.slice(0, 3).map(i => i.name).join('·')} 같은 알러지 유발 가능 원료가 있어요` });

  if (dist.danger > 0)
    cau.push({ concernType: 'healthy', label: '위험 성분이 있어 장기 급여는 권하지 않아요' });

  const salt = ingr.some(i => i.name.includes('소금') || i.name.includes('염'));
  if (salt && pr != null && pr >= 30)
    cau.push({ concernType: 'kidney', label: '단백질과 나트륨이 있어 신장이 약한 아이는 상담이 필요해요' });

  return { fit, fitCaution: cau };
}

/* ── 한 번에 ───────────────────────────────────────────── */
function deriveDetail({ ga, ingredients, facts, price, weightOptions, rxInfo }) {
  const nutrient = deriveNutrient(ga ?? {});
  const ingr = deriveIngredients(ingredients ?? []);
  const dist = deriveDist(ingr);
  const funcIngr = deriveFuncIngr(ingredients ?? []);
  const verdict = deriveVerdict({ nutrient, ingr, dist, funcIngr, price, facts });
  const { fit, fitCaution } = deriveFit({ nutrient, ingr, dist, funcIngr });

  const opts = (weightOptions ?? (price?.wgOptions ?? []))
    .slice().sort((a, b) => a - b)
    .map(g => ({ g, label: g >= 1000 ? `${Math.round(g / 100) / 10}kg` : `${g}g` }));

  return {
    rxInfo: rxInfo ?? null,
    weightOpts: opts,
    verdict, nutrient, ingr, funcIngr, dist,
    fit, fitCaution,
    prices: price?.p > 0
      ? [{ wg: price.wg, shop: price.shop, price: price.p, pKg: price.pKg,
           url: price.buyUrl ?? null, avail: true }]
      : [],
    recall: null
  };
}

/* ── 문구 채우기 ───────────────────────────────────────
   템플릿의 {중괄호}를 그 사료의 값으로 바꾼다. 값이 없으면 중괄호를 지운다 —
   화면에 '{dmCarb}' 가 그대로 나오면 안 된다. */
function fillPhrase(tpl, vars = {}) {
  return String(tpl ?? '').replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return v == null || v === '' ? '' : String(v);
  }).replace(/\s{2,}/g, ' ').trim();
}

/* 사료 하나에서 문구에 쓸 값을 뽑는다 */
function phraseVars({ nutrient = {}, ingr = [], price = {} } = {}) {
  const pct = v => (v == null ? null : `${v}%`);
  const allergens = ingr.filter(i => i.allergen).map(i => i.name);
  return {
    protein: pct(nutrient.protein), fat: pct(nutrient.fat), fiber: pct(nutrient.fiber),
    moisture: pct(nutrient.moisture), dmCarb: pct(nutrient.dmCarb), meat: pct(nutrient.meat),
    first: ingr[0]?.name ?? null,
    allergens: allergens.length ? allergens.slice(0, 3).join('·') : null,
    items: null,
    pKg: price.pKg != null ? price.pKg.toLocaleString('ko-KR') : null,
    price: price.p != null ? price.p.toLocaleString('ko-KR') : null
  };
}


/* ── 기능성 근거 강도 ───────────────────────────────────
   태그가 붙었다/안 붙었다만으로는 변별력이 없다. eye_tear 는 43종 중 32종에 붙는데
   근거가 대부분 생선·어유(오메가3)라 프리미엄 사료 대부분이 해당한다.
   근거 원료의 개수와 등급으로 강도를 매겨 정렬과 표시에 쓴다.
     강도 = proven 원료 × 2 + possible 원료 × 1 */
const EV_WEIGHT = { proven: 2, possible: 1 };
function strengthOf(list) {
  return (list || []).reduce((s, i) => s + (EV_WEIGHT[i.ev] ?? 1), 0);
}
function strengthMap(funcIngr) {
  if (!funcIngr) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(funcIngr)) { const n = strengthOf(v); if (n > 0) out[k] = n; }
  return out;
}

/* ── 스테이징 한 건 → 발행용 사료 레코드 ────────────────
   scripts/merge-approved.mjs 가 하던 일을 여기로 옮겼다. 심사 화면이 브라우저에서
   그대로 발행할 수 있어야 하기 때문이다. 점수는 제출값이 아니라 항상 공식으로
   다시 계산한다 — 사람이든 AI 든 점수를 직접 써넣는 경로는 없다. */
function publishRecord(item, uuid, now) {
  const p = item.proposed;
  const detail = (p.ga || p.ingredients)
    ? deriveDetail({
        ga: p.ga, ingredients: p.ingredients, facts: p.facts,
        price: p.price, weightOptions: p.price?.wgOptions, rxInfo: p.rxInfo ?? null
      })
    : null;
  const food = {
    id: uuid,
    brand: p.brand, brandSlug: p.brandSlug, country: p.country, name: p.name,
    type: p.type, rx: p.rx, ages: p.ages, sizes: p.sizes,
    thumb: p.thumb ?? null, ico: p.ico ?? 'dog',
    score: computeScore(p.ratings),
    ratings: p.ratings, func: p.func, warnN: p.warnN ?? 0,
    concerns: p.concerns, price: p.price,
    funcStrength: strengthMap(p.funcIngr ?? detail?.funcIngr),
    specOrigin: p.specOrigin,
    status: 'published',
    srcState: 'sourced',
    src: {
      sources: item.sources,
      evidence: item.evidence,
      audit: { verdict: item.audit?.verdict ?? null, model: item.audit?.auditor?.model ?? null },
      stagingId: item.stagingId,
      publishedAt: now
    }
  };
  if (food.funcStrength === undefined) delete food.funcStrength;
  return { food, detail };
}

globalThis.ENGINE = {
  normalizeIngredient, lookupIngredient,
  rateCarb, rateQuality, rateAdditive, rateValue, rateAll, computeDmCarb,
  computeScore, SCORE_WEIGHT, RUBRIC_TEXT, REQUIRED_FACT_KEYS,
  deriveNutrient, deriveIngredients, deriveDist, deriveFuncIngr,
  deriveVerdict, deriveFit, deriveDetail,
  fillPhrase, phraseVars, iyeyo, FUNC_LABEL,
  strengthOf, strengthMap, publishRecord
};
