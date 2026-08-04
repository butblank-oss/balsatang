/* 라벨 텍스트를 그대로 붙여넣으면 등록에 필요한 값으로 갈라 준다.

   ── 왜 필요한가 ──
   다나와에서 긁어 온 항목은 원료 표기가 없어 '자료 수집 중' 으로 막혀 있다.
   그걸 푸는 유일한 방법은 사람이 라벨을 보고 원료를 넣는 것인데, 심사 화면에는
   원료를 넣을 칸 자체가 없었다. 그래서 심사자가 값을 다 채워도 발행이 안 됐다.

   칸을 열댓 개 만드는 대신, 라벨을 통째로 붙여넣게 한다. 사람이 하는 일은
   복사·붙여넣기 한 번이고, 갈라내는 건 코드가 한다.

   ── 지어내지 않는다 ──
   못 읽은 항목은 null 로 둔다. 비어 있으면 게이트가 막고, 심사자가 직접 채운다.
   읽은 값도 화면에 그대로 보여 주고 사람이 확인한 뒤에야 반영된다.

   의존: engine/dict.js, engine/engine.js
*/

/* Node 는 engine 파일들을 한 스코프에 이어 붙여 실행한다. 최상위 이름이
   부딪히지 않게 감싼다. */
(function () {

const { lookupIngredient, deriveIngredients, deriveDist, computeDmCarb } = globalThis.ENGINE;

const num = s => {
  const n = Number(String(s).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/* ── 보장성분 ──
   '조단백질(이상): 35 %' · '조단백 35%' · '조단백질 | 35' 를 모두 받는다.
   라벨 표기가 제각각이라 라벨과 값 사이에 뭐가 끼든 넘긴다. 다만 줄을 넘지는
   않는다 — 넘기면 다음 항목의 숫자를 물어 온다. */
function ga(text) {
  const one = (...labels) => {
    for (const l of labels) {
      const m = new RegExp(l + '[^\\n%]{0,20}?([0-9]+(?:\\.[0-9]+)?)\\s*%').exec(text);
      if (m) return num(m[1]);
    }
    return null;
  };
  return {
    protein: one('조단백질', '조단백', '粗蛋白'),
    fat: one('조지방', '粗脂肪'),
    fiber: one('조섬유', '粗纖維'),
    moisture: one('수분', '水分'),
    ash: one('조회분', '粗灰分')
  };
}

/* ── 열량 ──
   'ME 3070 kcal/kg' · '380 kcal/100g' 둘 다 kg 기준으로 바꾼다. */
function kcalPerKg(text) {
  let m = /([0-9,]+(?:\.[0-9]+)?)\s*kcal\s*\/?\s*kg/i.exec(text);
  if (m) return Math.round(num(m[1]));
  m = /([0-9,]+(?:\.[0-9]+)?)\s*kcal\s*\/?\s*100\s*g/i.exec(text);
  if (m) return Math.round(num(m[1]) * 10);
  return null;
}

/* ── 원료 표기 ──
   라벨에서 가장 긴 '쉼표로 이어진 덩어리' 를 원료 목록으로 본다. 성분분석표나
   첨가물 목록도 쉼표를 쓰지만 항목 수가 훨씬 적다.

   첨가물 줄이 원료보다 길어지는 경우가 있어(비타민·미네랄을 다 적은 라벨),
   '%' 나 'mg' 이 붙은 항목이 절반을 넘으면 원료 목록이 아니라고 본다 —
   원료 표기는 함량을 일부에만 적고, 첨가물은 거의 전부에 적는다. */
function ingredients(text) {
  const chunks = String(text ?? '')
    .split(/\n|·\s|•/)
    .map(s => s.trim())
    .filter(s => (s.match(/,/g) || []).length >= 4);
  if (!chunks.length) return [];

  const parse = raw => raw
    /* '1. 사용원료', '원재료명 :' 같은 머리말을 뗀다 */
    .replace(/^\s*\d+\s*[.)]\s*/, '')
    .replace(/^(사용\s*원료|원재료명?|원료명?|성분|Ingredients)\s*[:：]?\s*/i, '')
    /* 괄호를 먼저 걷어낸다. 쉼표로 자른 뒤에 지우면 '신선한 닭 내장(간, 심장)' 이
       '신선한 닭 내장(간' 과 '심장)' 두 개로 갈라진다. */
    .replace(/\([^)]*\)/g, ' ')          /* '(21%)', '(간, 심장)' 같은 괄호 설명 */
    .split(',')
    .map(s => s
      .replace(/[.。]\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean);

  let best = [];
  for (const c of chunks) {
    const list = parse(c);
    const withUnit = list.filter(x => /\d\s*(mg|g|IU|CFU|%)/i.test(x)).length;
    if (list.length && withUnit / list.length > 0.5) continue;   /* 첨가물 목록 */
    if (list.length > best.length) best = list;
  }
  return best;
}

/* ── 링크 ──
   썸네일은 이미지 주소, 구매 링크는 쿠팡 주소. 쿠팡 상품 페이지(/vp/products/…)와
   파트너스 단축 링크(link.coupang.com/a/…)는 쓰임이 다르다 —
   앞엣것은 가격 근거 출처, 뒤엣것은 사용자가 누르는 버튼이다. 갈라서 돌려준다. */
function links(text) {
  const urls = String(text ?? '').match(/https?:\/\/[^\s<>"')]+/g) || [];
  const isImg = u => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u) || /img\.|image|thumb/i.test(u);
  const coupang = urls.filter(u => /(^|\.)coupang\.com\//.test(u));
  return {
    thumb: urls.find(u => isImg(u) && !/coupang\.com/.test(u)) ?? null,
    buyUrl: coupang.find(u => /link\.coupang\.com\/a\//.test(u)) ?? coupang[0] ?? null,
    productUrl: coupang.find(u => /\/vp\/products\/\d+/.test(u)) ?? null
  };
}

/* ── 판매 용량과 가격 ──
   '2kg, 6kg, 11.4kg' 처럼 나열된 용량을 g 으로 모은다. 200g 미만은 샘플이라 뺀다.
   가격은 '2kg 31,870원' 처럼 용량과 붙어 있을 때만 읽는다. 짝을 못 지으면
   읽지 않는다 — 어느 용량 가격인지 모르는 값은 쓸 수가 없다. */
function sizesAndPrice(text) {
  const t = String(text ?? '');
  const wg = [];
  for (const m of t.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*(kg|g)\b/gi)) {
    const g = /kg/i.test(m[2]) ? Math.round(num(m[1]) * 1000) : Math.round(num(m[1]));
    if (g >= 200 && g <= 30000) wg.push(g);
  }
  const pair = /([0-9]+(?:\.[0-9]+)?)\s*(kg|g)[^\n]{0,12}?([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,})\s*원/i.exec(t);
  const price = pair
    ? { wg: /kg/i.test(pair[2]) ? Math.round(num(pair[1]) * 1000) : Math.round(num(pair[1])),
        p: num(pair[3]) }
    : null;
  return { wgOptions: [...new Set(wg)].sort((a, b) => a - b), price };
}

/* ── 이름과 라벨이 맞는지 ──
   한 라인에 맛만 다른 제품이 여럿 있는 경우가 흔하다 — 더리얼은 21종 전부,
   지위픽은 6종 전부가 그렇다. 이때 엉뚱한 카드에 라벨을 붙여넣어도 아무도
   못 알아챈다. 사용자에게는 '닭고기 사료' 라고 적힌 소고기 사료가 나간다.

   제품명에 주재료가 적혀 있으면, 라벨 앞쪽 원료에 그 고기가 실제로 있는지 본다.
   없으면 경고한다 — 막지는 않는다. '프리런 덕' 처럼 이름이 레시피명인 경우도
   있고, 제조사가 이름과 다르게 배합하는 경우도 있어 사람이 판단해야 한다. */
const FLAVOR = [
  ['닭고기',   /닭|치킨/,            ['닭', '치킨', '계육']],
  ['오리고기', /오리|덕\b/,          ['오리']],
  ['칠면조',   /칠면조|터키/,         ['칠면조']],
  ['소고기',   /소고기|쇠고기|비프/,   ['소고기', '쇠고기', '우육']],
  ['양고기',   /양고기|램\b/,        ['양고기', '양']],
  ['돼지고기', /돼지|포크/,           ['돼지', '돈육']],
  ['사슴고기', /사슴|벨리슨/,         ['사슴']],
  ['연어',     /연어|새먼/,           ['연어']],
  ['고등어',   /고등어/,              ['고등어']],
  ['청어',     /청어/,                ['청어']],
  ['생선',     /생선|피쉬|피시|해산물/, ['생선', '어', '연어', '청어', '고등어', '대구', '멸치', '메를루사']]
];

function flavorCheck(name, ingredients = []) {
  const n = String(name ?? '');
  const hit = FLAVOR.filter(([, re]) => re.test(n));
  if (!hit.length) return null;                 /* 이름에 주재료가 없다 — 볼 게 없다 */
  /* 앞쪽 원료가 그 사료의 정체다. 뒤쪽 향미제까지 세면 무엇이든 통과한다. */
  const head = ingredients.slice(0, 8).join(' ');
  const missing = hit.filter(([, , words]) => !words.some(w => head.includes(w)));
  if (!missing.length) return null;
  return { name: n, missing: missing.map(([label]) => label), head: ingredients.slice(0, 5) };
}

/* ── 전부 갈라내고, 원료로 낼 수 있는 사실까지 계산한다 ── */
function parse(text) {
  const g = ga(text);
  const list = ingredients(text);
  const { thumb, buyUrl, productUrl } = links(text);
  const { wgOptions, price } = sizesAndPrice(text);

  const ingr = deriveIngredients(list);
  const dist = deriveDist(ingr);
  const first = list.length ? lookupIngredient(list[0]) : null;
  /* facts.firstIngrCat 은 다섯 갈래뿐이다. 사전의 세부 분류를 여기에 맞춘다 —
     게이트도 같은 표로 검사하므로 표가 어긋나면 통과할 수 없다. */
  const CAT = { meat: 'meat', organ: 'meat', fish: 'fish', grain: 'grain',
                legume: 'grain', vegetable: 'veg', other: 'other', fat: 'other',
                oil: 'other', probiotic: 'other', herb: 'other', vitamin: 'other' };

  const dmCarb = computeDmCarb(g);

  return {
    ga: g,
    kcalPerKg: kcalPerKg(text),
    ingredients: list,
    ingr, dist,
    /* 사전에 없는 원료. 주의·위험을 셀 수 없으니 사람이 봐야 한다. */
    unknown: ingr.filter(x => x.safe === 'unknown').map(x => x.name),
    facts: {
      protein: g.protein,
      dmCarb,
      firstIngrCat: first?.known ? (CAT[first.cat] ?? 'other') : null,
      cautionN: list.length ? dist.caution : null,
      dangerN: list.length ? dist.danger : null
    },
    thumb, buyUrl, productUrl, wgOptions, price
  };
}

globalThis.LABEL = { parse, ga, kcalPerKg, ingredients, links, sizesAndPrice, flavorCheck };
})();
