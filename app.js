/* 발사탕 — 화면 로직.

   데이터(data.js)와 계산은 그대로 두고 UI 만 새 디자인으로 옮긴 것이다.

   ⚠ 제품 종합 점수(f.score)는 화면에 렌더링하지 않는다.
     정렬·추천 가중치로만 쓴다. 별점(f.ratings)은 사람이 판단하는 재료라 남긴다.
     이유는 docs/DATA-POLICY 와 디자인 핸드오프 NOTES.md 참고.
*/

/* ═══ 짧은 도우미 ═══ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const won = n => Math.round(n).toLocaleString('ko-KR');
const gLabel = g => g >= 1000 ? (Math.round(g / 100) / 10) + 'kg' : g + 'g';
const icon = (k, size = 20, cls = '') =>
  `<span class="i ${cls}" style="width:${size}px;height:${size}px"><svg viewBox="0 0 24 24">${ICONS[k] || ''}</svg></span>`;

/* 받침에 따라 조사를 고른다. '오리젠은/램은' 처럼 어색해지는 걸 막는다. */
function josa(word, withJong, withoutJong) {
  const ch = String(word ?? '').trim().slice(-1).charCodeAt(0);
  const has = ch >= 0xAC00 && ch <= 0xD7A3 ? (ch - 0xAC00) % 28 !== 0 : true;
  return has ? withJong : withoutJong;
}

/* ═══ 사료 상태 ═══
   세 가지를 확실히 구분한다. 배지를 숨기면 '확인했고 없음' 과 '아직 확인 안 함' 이 섞인다. */
function analysisState(f) {
  const d = DETAIL[f.id];
  return (d && (d.ingr || []).length) ? 'analyzed' : 'pending';
}
function cautionState(f) {
  if (analysisState(f) === 'pending') return { k: 'pending', n: 0, label: '분석 준비 중' };
  const n = f.warnN ?? 0;
  return n > 0
    ? { k: 'has', n, label: `주의성분 ${n >= 3 ? '3종+' : n + '종'}` }
    : { k: 'none', n: 0, label: '주의성분 없음' };
}
function cautionBadge(f) {
  const s = cautionState(f);
  const mark = s.k === 'none' ? `<span class="dot">${icon('check', 9)}</span>`
    : s.k === 'has' ? `<span class="dot">!</span>` : `<span class="dot"></span>`;
  return `<span class="cbadge ${s.k}">${mark}${s.label}</span>`;
}
function cautionTag(f) {
  const s = cautionState(f);
  return `<span class="tag ${s.k === 'none' ? 'safe' : s.k === 'has' ? 'caution' : 'pending'}">${s.label}</span>`;
}

/* ═══ 성분 사실 태그 ═══
   판단이 아니라 라벨에 적힌 사실만 태그로 만든다. */
const GRAIN_WORDS = /옥수수|밀|소맥|대두|보리|귀리|쌀|현미|곡류|글루텐|콘그릿츠/;
function foodTags(f) {
  const d = DETAIL[f.id] || {};
  const n = d.nutrient || {};
  const out = [];
  const names = (d.ingr || []).map(i => i.name);
  if (names.length && !names.some(x => GRAIN_WORDS.test(x))) out.push('그레인프리');
  if (n.protein >= 30) out.push(`조단백 ${n.protein}%`);
  const first = (d.ingr || [])[0];
  if (first && ['meat', 'fish', 'organ'].includes(first.cat)) {
    out.push(`첫 원료 ${first.name.replace(/\s*\(.*$/, '').slice(0, 10)}`);
  }
  if (f.sizes?.includes('small')) out.push('소형견');
  if (f.rx) out.push('처방식');
  return out.slice(0, 3);
}
function tagRow(f) {
  return `<div class="tags">${cautionTag(f)}${foodTags(f).slice(0, 2)
    .map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>`;
}

/* ═══ 제품 이미지 웰 ═══ */
function well(f, size) {
  const pend = analysisState(f) === 'pending';
  const src = /^https?:/.test(f.thumb || '') ? f.thumb : null;
  const initial = `<span class="initial" style="font-size:${Math.round(size / 3)}px">${esc((f.brand || '?')[0])}</span>`;
  /* 이미지가 안 뜨면 빈 칸이 남는다. 브랜드 이니셜로 바꿔 자리를 지킨다. */
  const inner = src
    ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.parentNode.innerHTML=this.dataset.fb" data-fb="${esc(initial)}">`
    : initial;
  return `<div class="well well-${size}${pend ? ' pending' : ''}">${inner}</div>`;
}

/* ═══ 가격 ═══ */
function per100g(f) {
  if (!f.price?.pKg) return null;
  return Math.round(f.price.pKg / 10);
}
function buyUrlOf(f) {
  if (f.price?.buyUrl) return f.price.buyUrl;
  const r = (f.src?.sources || []).find(s => s.role === 'retail');
  return r ? r.url : null;
}

/* ═══ 칼로리 ═══ */
function kcalPerKg(f) {
  const n = (DETAIL[f.id] || {}).nutrient || {};
  if (n.calKg) return { v: n.calKg, est: false };
  const v = Math.round(((n.protein || 0) * 3.5 + (n.fat || 0) * 8.5 + (n.carb || 0) * 3.5) * 10);
  return { v: v > 0 ? v : 3600, est: true };
}

/* ═══ 검색 ═══ */
const TYPE_KO = { dry: '건식', wet: '습식', freeze_dried: '동결건조',
  air_dried: '에어드라이', raw: '화식', topping: '토핑' };
const typeKo = t => TYPE_KO[t] || t;

const SEARCH_SYNONYM = [
  { tags: ['eye_tear'], words: ['눈물', '눈물자국', '눈물착색', '착색', '피부', '피모', '털', '가려움', '아토피', '눈곱'] },
  { tags: ['weight'], words: ['다이어트', '체중', '비만', '살', '감량', '뚱뚱', '체중관리', '저칼로리', '칼로리'] },
  { tags: ['kidney'], words: ['신장', '콩팥', '신부전', '요로', '방광', '결석', '유리너리'] },
  { tags: ['liver'], words: ['간', '간수치', '간질환', '헤파틱', '담낭'] },
  { tags: ['joint'], words: ['관절', '슬개골', '고관절', '다리', '절뚝', '연골', '관절염'] },
  { tags: ['digestive'], words: ['소화', '장', '설사', '무른변', '구토', '위장', '장염', '변'] },
  { tags: ['allergy'], words: ['알러지', '알레르기', '두드러기', '가수분해', '단일단백', '저알러지'] },
  { tags: ['picky_eater'], words: ['입맛', '편식', '안먹', '기호성', '까다', '잘안먹'] },
  { tags: ['senior'], words: ['시니어', '노견', '노령', '늙은', '고령', '노화'] },
  { tags: ['post_surgery'], words: ['수술', '회복', '병후', '요양', '아픈'] },
  { tags: ['healthy'], words: ['건강', '일반', '평범', '유지'] },
  { tags: ['heart'], words: ['심장', '심장병', '심부전'] },
  { tags: ['immune'], words: ['면역', '면역력', '기력', '활력'] },
  { tags: ['dental'], words: ['치아', '이빨', '구강', '치석', '입냄새'] },
  { tags: ['skin'], words: ['피부병', '습진', '각질'] }
];
/* 한 글자 단어는 정확히 일치할 때만 인정한다 — '신장' 안의 '장'이 소화 태그를 끌어오지 않게. */
const wordHit = (n, w) => w.length <= 1 ? n === w : n.includes(w);
function synonymTags(q) {
  const n = q.replace(/\s/g, '');
  if (!n) return [];
  const out = new Set();
  for (const g of SEARCH_SYNONYM) if (g.words.some(w => wordHit(n, w))) g.tags.forEach(t => out.add(t));
  return [...out];
}

const state = {
  tab: 'home',
  query: '',
  filters: new Set(),
  sort: 'recommend',            /* recommend | priceAsc | recent — 품질 점수 정렬은 없다 */
  compare: [],                  /* 최대 2, 탭을 옮겨도 유지 */
  pet: null,
  feeding: { weightKg: 5, meals: 2, bagG: 0 },
  recent: [],
  detailId: null,
  detailTab: 'nutrition',
  articleId: null,
  articleCat: null,
  wizard: { step: 0, data: {} }
};

/* ═══ 저장 ═══ */
const LS = 'balsatang.v2';
function save() {
  try {
    localStorage.setItem(LS, JSON.stringify({
      pet: state.pet, feeding: state.feeding, compare: state.compare, recent: state.recent.slice(0, 12)
    }));
  } catch { }
}
function load() {
  try {
    const j = JSON.parse(localStorage.getItem(LS) || '{}');
    Object.assign(state, {
      pet: j.pet ?? null,
      feeding: j.feeding ?? state.feeding,
      compare: (j.compare ?? []).filter(id => FOODS.some(f => f.id === id)).slice(0, 2),
      recent: (j.recent ?? []).filter(id => FOODS.some(f => f.id === id))
    });
  } catch { }
}

/* ═══ 검색·필터·정렬 ═══ */
function matchQuery(f, q) {
  if (!q) return true;
  const hay = `${f.brand} ${f.name}`.toLowerCase().replace(/\s/g, '');
  const nq = q.toLowerCase().replace(/\s/g, '');
  if (hay.includes(nq)) return true;
  const tags = synonymTags(q);
  return tags.length > 0 && tags.some(t => (f.func || []).includes(t) || (f.concerns || []).includes(t));
}
const FILTERS = {
  noCaution: { label: '주의성분 없음', test: f => cautionState(f).k === 'none' },
  grainFree: { label: '그레인프리', test: f => foodTags(f).includes('그레인프리') },
  small: { label: '소형견', test: f => (f.sizes || []).some(s => s === 'small' || s === 'all') }
};
function searchResults() {
  let list = FOODS.filter(f => matchQuery(f, state.query));
  for (const k of state.filters) list = list.filter(FILTERS[k].test);
  const s = state.sort;
  /* '많이 찾는 순'은 조회수가 있어야 한다. 아직 없으므로 라벨을 '발사탕 추천순'으로 두고
     내부 score 로 정렬한다. 없는 데이터를 있는 것처럼 말하지 않는다. */
  if (s === 'priceAsc') list.sort((a, b) => (a.price?.pKg ?? 9e9) - (b.price?.pKg ?? 9e9));
  else if (s === 'recent') list = list.slice().reverse();
  else list.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return list;
}
const SORT_LABEL = { recommend: '발사탕 추천순', priceAsc: '가격 낮은 순', recent: '최근 분석 순' };
const AGE_KO = { all: '전연령', puppy: '퍼피', adult: '성견', senior: '시니어' };
const ageLabel = f => (f.ages || []).map(a => AGE_KO[a] || a).join('·') || '전연령';

/* ═══ 토스트 ═══ */
let toastTimer;
function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>` +
    (action ? `<button data-toast-act>${esc(action.label)}</button>` : '');
  if (action) $('[data-toast-act]', el).onclick = () => { el.classList.remove('on'); action.run(); };
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2400);
}

/* ═══ 비교함 ═══ */
/* 담고 나서 어디로 갈지가 중요하다.
   담아만 두고 화면에 그대로 있으면 사용자는 다음에 뭘 할지 모른다.
   그래서 담는 즉시 비교 화면으로 데려가고, 거기서 두 번째를 고르게 한다.
   goCompare=false 는 이미 비교 화면 안에서 고른 경우다(화면 이동이 필요 없다). */
function addCompare(id, goCompare = true) {
  if (state.compare.includes(id)) { toast('이미 담긴 사료예요'); return; }
  if (state.compare.length >= 2) {
    toast('두 개까지 담을 수 있어요', {
      label: '바꾸기', run: () => { state.compare = [state.compare[1], id]; save(); goCompare ? go('compare') : render(); }
    });
    return;
  }
  state.compare.push(id); save();
  if (goCompare) go('compare'); else render();
  toast(state.compare.length === 1 ? '담았어요. 비교할 사료를 하나 더 골라주세요' : '비교함에 담았어요');
}

/* ═══ 사료 고르기 시트 ═══
   비교할 사료를 검색 화면으로 튕기지 않고 이 자리에서 고른다.
   비교하다 말고 다른 화면으로 나가면 하던 일이 끊긴다. */
function openPicker(slotIndex) {
  const render_ = (q = '') => {
    const list = FOODS
      .filter(f => !state.compare.includes(f.id) || state.compare[slotIndex] === f.id)
      .filter(f => !q || `${f.brand} ${f.name}`.toLowerCase().replace(/\s/g, '').includes(q.toLowerCase().replace(/\s/g, '')))
      .slice(0, 40);
    return `
      <div class="searchbox sm" style="margin-bottom:6px">
        ${icon('search', 18)}<input id="pk-q" value="${esc(q)}" placeholder="사료 이름으로 찾기" autocomplete="off">
      </div>
      <div id="pk-list">${pickerGroups(list, q)}</div>`;
  };
  sheet('비교할 사료 고르기', render_(), el => {
    const bind = () => $$('[data-pick]', el).forEach(b =>
      b.onclick = () => {
        const id = b.dataset.pick;
        closeSheet();
        if (state.compare[slotIndex]) state.compare[slotIndex] = id, save(), render();
        else addCompare(id, false);
      });
    bind();
    const q = $('#pk-q', el);
    let t;
    q.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        $('#pk-list', el).innerHTML = pickerGroups(
          FOODS.filter(f => !state.compare.includes(f.id) || state.compare[slotIndex] === f.id)
            .filter(f => `${f.brand} ${f.name}`.toLowerCase().replace(/\s/g, '').includes(q.value.toLowerCase().replace(/\s/g, '')))
            .slice(0, 40), q.value);
        bind();
      }, 200);
    });
    setTimeout(() => q.focus(), 80);
  });
}
/* 검색어가 없으면 최근 본 사료를 앞에 따로 묶는다.
   대개 그중 하나를 고른다. 다만 최근 본 게 실제로 있을 때만 머리말을 붙인다 —
   아무거나 위에 두고 '최근 본 사료' 라고 쓰면 거짓말이 된다. */
function pickerGroups(list, q) {
  if (q) return pickerRows(list);
  const recent = state.recent.map(id => list.find(f => f.id === id)).filter(Boolean);
  const rest = list.filter(f => !recent.includes(f));
  const head = t => `<div class="t-micro c-mute" style="margin:16px 0 2px">${t}</div>`;
  return (recent.length ? head('최근 본 사료') + pickerRows(recent) : '')
       + (rest.length ? (recent.length ? head('전체 사료') : '') + pickerRows(rest) : '');
}
function pickerRows(list) {
  if (!list.length) return '<p class="t-bodySm c-sub" style="padding:24px 0;text-align:center">찾는 사료가 없어요.</p>';
  return list.map(f => `<button class="row press" data-pick="${f.id}">
    ${well(f, 44)}
    <span class="row-b">
      <span class="row-brand">${esc(f.brand)}</span>
      <span class="row-name" style="display:block">${esc(f.name)}</span>
      <span class="row-meta">${cautionState(f).label}${f.price?.pKg ? ` · 100g당 ${won(per100g(f))}원` : ''}</span>
    </span>
    ${icon('plus', 18, 'chev')}</button>`).join('');
}

/* ═══ 서버가 붙을 자리 ═══
   분석 요청·알림 신청은 접수할 서버가 아직 없다. 지금은 폼으로 보내고,
   백엔드가 생기면 이 함수 안만 fetch 로 바꾸면 화면은 건드릴 필요가 없다. */
const REQUEST_FORM = null;   /* 예: 'https://docs.google.com/forms/d/e/…/viewform?usp=pp_url&entry.1=' */
function submitRequest(type, payload) {
  if (REQUEST_FORM) {
    window.open(REQUEST_FORM + encodeURIComponent(`[${type}] ${JSON.stringify(payload)}`), '_blank', 'noopener');
    return;
  }
  toast('접수 창구를 준비 중이에요');
}

/* ═══ 화면 이동 ═══ */
const TABS = ['home', 'compare', 'content', 'custom'];
function go(screen, opt = {}) {
  if (screen === 'detail' && opt.id) {
    state.detailId = opt.id;
    state.detailTab = opt.tab || 'nutrition';
    state.recent = [opt.id, ...state.recent.filter(x => x !== opt.id)].slice(0, 12);
    save();
  }
  if (screen === 'article' && opt.articleId) state.articleId = opt.articleId;
  if (TABS.includes(screen)) state.tab = screen;
  state.screen = screen;
  render();
  window.scrollTo(0, 0);
  history.pushState({ screen, ...opt }, '');
}
window.addEventListener('popstate', e => {
  const s = e.state?.screen;
  if (!s) { state.screen = state.tab = 'home'; }
  else {
    state.screen = s;
    if (s === 'detail') state.detailId = e.state.id ?? state.detailId;
    if (s === 'article') state.articleId = e.state.articleId ?? state.articleId;
    if (TABS.includes(s)) state.tab = s;
  }
  render();
});

/* ═══════════════════════════════════════════════════════
   01 홈
   ═══════════════════════════════════════════════════════ */
/* 고민 아이콘 8종 — 디자인 원본(design_handoff 3a)의 SVG 를 그대로 옮긴 것이다.
   색만 currentColor 로 바꿔 어느 배경에서든 쓰게 했다. */
const CONCERN_ICON = {
  skin: `<path d="M12 3.4c3.3 3.6 5.1 6.1 5.1 8.4a5.1 5.1 0 01-10.2 0c0-2.3 1.8-4.8 5.1-8.4z"></path><circle cx="9.9" cy="12.3" r=".95" fill="currentColor" stroke="none"></circle><circle cx="13.6" cy="13.9" r=".95" fill="currentColor" stroke="none"></circle><circle cx="10.8" cy="15.8" r=".95" fill="currentColor" stroke="none"></circle>`,
  weight: `<path d="M12 5.6V19M8.4 19h7.2M4.2 8.2h15.6"></path><circle cx="12" cy="4.2" r="1.4"></circle><path d="M4.2 8.2L1.9 13.4M4.2 8.2l2.3 5.2M1.9 13.4a2.3 2.3 0 004.6 0M19.8 8.2l-2.3 5.2M19.8 8.2l2.3 5.2M17.5 13.4a2.3 2.3 0 004.6 0"></path>`,
  joint: `<path d="M9.2 3.6v4.9a3.3 3.3 0 003.3 3.3M14.8 20.4v-4.9a3.3 3.3 0 00-3.3-3.3"></path><path d="M6.1 13.4a6.2 6.2 0 01.5-3.1M17.9 10.6a6.2 6.2 0 01-.5 3.1"></path><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"></circle>`,
  gut: `<circle cx="12" cy="12" r="8.6"></circle><path d="M6.6 10.6q1.35-1.7 2.7 0t2.7 0 2.7 0"></path><path d="M6.6 14.4q1.35-1.7 2.7 0t2.7 0 2.7 0"></path>`,
  tear: `<path d="M3.9 11.8c2.3-3.1 5-4.7 8.1-4.7s5.8 1.6 8.1 4.7"></path><circle cx="12" cy="10.6" r="2.2"></circle><path d="M12 15.6c1.15 1.3 1.75 2.1 1.75 2.8a1.75 1.75 0 01-3.5 0c0-.7.6-1.5 1.75-2.8z"></path>`,
  picky: `<path d="M3.4 13h17.2a8.6 8.6 0 01-17.2 0z"></path><path d="M6.8 20.4h10.4"></path><path d="M12 9.9S9.1 8.3 9.1 6.5A1.75 1.75 0 0112 5.3a1.75 1.75 0 012.9 1.2c0 1.8-2.9 3.4-2.9 3.4z"></path>`,
  senior: `<path d="M12 20.2S3.6 15.1 3.6 9.6A4.5 4.5 0 0112 7.3a4.5 4.5 0 018.4 2.3c0 5.5-8.4 10.6-8.4 10.6z"></path><path d="M6.9 11.4h2.7l1.4-2.5 1.9 4.5 1.4-2h2.8"></path>`,
  rx: `<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="5"></rect><path d="M12 8.3v7.4M8.3 12h7.4"></path>`,
};
const cicon = (k, size) =>
  `<span class="i" style="width:${size}px;height:${size}px"><svg viewBox="0 0 24 24">${CONCERN_ICON[k] || ''}</svg></span>`;

const CONCERNS = [
  { key: 'skin', label: '피부·알러지', ico: 'droplet', tags: ['skin', 'allergy', 'eye_tear'] },
  { key: 'weight', label: '체중 관리', ico: 'scale', tags: ['weight'] },
  { key: 'joint', label: '관절', ico: 'bone', tags: ['joint'] },
  { key: 'gut', label: '장·소화', ico: 'soup', tags: ['digestive'] },
  { key: 'tear', label: '눈물자국', ico: 'eye', tags: ['eye_tear'] },
  { key: 'picky', label: '잘 안 먹어요', ico: 'utensils', tags: ['picky_eater'] },
  { key: 'senior', label: '노령견 케어', ico: 'heartPulse', tags: ['senior'] },
  { key: 'rx', label: '처방식', ico: 'cross', tags: [] }
];

function homeCard(f) {
  return `<button class="press" data-go-detail="${f.id}" style="width:168px;flex-shrink:0;text-align:left">
    <div style="position:relative">${well(f, 168)}
      <span style="position:absolute;top:9px;right:9px">${cautionBadge(f)}</span></div>
    <div style="margin-top:11px;font-size:12px;font-weight:600;color:var(--ink50)">${esc(f.brand)}</div>
    <div class="t-item" style="margin-top:2px">${esc(f.name)}</div>
    <div class="t-caption c-sub" style="margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(foodTags(f)[0] || '분석 준비 중')}</div>
  </button>`;
}

function renderHome() {
  const analyzed = FOODS.filter(f => analysisState(f) === 'analyzed');
  const fresh = analyzed.slice(-8).reverse();
  const value = analyzed.filter(f => f.price?.pKg).sort((a, b) => a.price.pKg - b.price.pKg).slice(0, 4);
  const popular = ['오리젠', '지위픽', '뉴트리나'];

  return `
  <div class="top">
    <div class="logo">발<b>사탕</b></div>
    <div style="flex:1"></div>
    <div class="adfree">광고 0원 분석</div>
  </div>

  <div style="padding:26px var(--screenX) 0">
    <h1 class="t-hero">우리 아이 사료,<br><span style="color:var(--purple700)">진짜</span> 괜찮을까?</h1>
    <p class="t-body c-sub" style="margin-top:10px">성분표만 보고 솔직하게 분석해요.<br>광고비는 1원도 받지 않아요.</p>
  </div>

  <div style="padding:20px var(--screenX) 0">
    <button class="searchbox press" data-go="search">
      ${icon('search', 20)}<span style="flex:1">사료 이름을 검색해보세요</span>
    </button>
  </div>

  <div class="chiprow" style="margin-top:12px">
    ${popular.map(p => `<button class="chip press" data-search="${esc(p)}">${esc(p)}</button>`).join('')}
  </div>

  <div style="padding:26px var(--screenX) 0">
    <button class="card dark press" data-go="custom" style="width:100%;text-align:left;display:flex;align-items:center;gap:14px;padding:20px">
      <div style="flex:1;min-width:0">
        <div class="t-tag" style="color:var(--purple300)">맞춤 추천</div>
        <div style="margin-top:7px;font-size:19px;font-weight:800;letter-spacing:-.035em;line-height:1.36">몸무게·나이·고민만<br>알려주시면 돼요</div>
        <span style="display:inline-flex;align-items:center;gap:4px;margin-top:13px;height:32px;padding:0 14px;border-radius:999px;background:#fff;color:var(--purple900);font-size:13px;font-weight:700">1분이면 끝나요 ›</span>
      </div>
      <div style="width:76px;height:76px;border-radius:var(--rThumbLg);background:#4A0A66;display:grid;place-items:center;color:var(--purple300);font-size:11px;font-weight:700;text-align:center;line-height:1.4">우리아이<br>사진</div>
    </button>
  </div>

  <div class="sec">
    <div class="sec-h"><h2 class="t-section">고민별로 찾기</h2></div>
    <div class="concerns">
      ${CONCERNS.map(c => `<button class="chip press" data-concern="${c.key}">${c.label}</button>`).join('')}
    </div>
  </div>

  <div class="sec lg">
    <div class="sec-h"><h2 class="t-section">이번 주 새로 분석한 사료</h2>
      <button class="sec-more" data-go="search">전체보기</button></div>
    <div style="display:flex;gap:14px;overflow-x:auto;margin:0 calc(var(--screenX) * -1);padding:0 var(--screenX)">
      ${fresh.map(homeCard).join('')}
    </div>
  </div>

  <div class="sec lg">
    <div class="sec-h"><h2 class="t-section">가성비 좋은 사료</h2></div>
    ${value.map(f => `<button class="row press" data-go-detail="${f.id}">
      ${well(f, 56)}
      <span class="row-b">
        <span class="row-brand">${esc(f.brand)}</span>
        <span class="row-name" style="display:block">${esc(f.name)}</span>
        <span class="row-meta">100g당 ${won(per100g(f))}원 · ${cautionState(f).label}</span>
      </span>
      ${icon('chevronRight', 16, 'chev')}
    </button>`).join('')}
  </div>

  <p class="note">모든 분석은 라벨 표기 성분 기준의 참고용이에요.
건강 문제는 수의사와 상담해주세요.</p>`;
}

/* ═══════════════════════════════════════════════════════
   02 검색 결과
   ═══════════════════════════════════════════════════════ */
function renderSearch() {
  const list = searchResults();
  const allCount = FOODS.filter(f => matchQuery(f, state.query)).length;
  const picked = state.compare.length;

  const chips = [
    `<button class="chip press${state.filters.size === 0 ? ' on' : ''}" data-filter="">전체<em>${allCount}</em></button>`,
    ...Object.entries(FILTERS).map(([k, v]) =>
      `<button class="chip press${state.filters.has(k) ? ' on' : ''}" data-filter="${k}">${v.label}</button>`)
  ].join('');

  return `
  <div class="top icons">
    <button class="iconbtn press" data-back>${icon('chevronRight', 24, 'ui')}</button>
    <div class="searchbox sm" style="flex:1">
      ${icon('search', 18)}
      <input id="q" value="${esc(state.query)}" placeholder="사료 이름을 검색해보세요" autocomplete="off">
    </div>
  </div>
  <div id="s-body">${searchBodyHtml()}</div>
  `;
}

/* 검색어·필터에 따라 바뀌는 부분. 입력칸은 여기 들어있지 않다. */
function searchBodyHtml() {
  const list = searchResults();
  const allCount = FOODS.filter(f => matchQuery(f, state.query)).length;
  const picked = state.compare.length;
  const chips = [
    `<button class="chip press${state.filters.size === 0 ? ' on' : ''}" data-filter="">전체<em>${allCount}</em></button>`,
    ...Object.entries(FILTERS).map(([k, v]) =>
      `<button class="chip press${state.filters.has(k) ? ' on' : ''}" data-filter="${k}">${v.label}</button>`)
  ].join('');
  const rows = list.length ? list.map(f => `
    <button class="row press" data-go-detail="${f.id}" style="align-items:flex-start">
      ${well(f, 82)}
      <span class="row-b">
        <span class="row-brand">${esc(f.brand)}<i></i>${esc(ageLabel(f))}</span>
        <span class="row-name" style="display:block">${esc(f.name)}</span>
        ${tagRow(f)}
        <span class="row-meta" style="display:block;margin-top:6px">${esc(searchSummary(f))}</span>
      </span>
    </button>`).join('') : renderEmptySearch();

  return `
  <div class="chiprow" style="margin-top:14px">${chips}</div>
  <div style="display:flex;align-items:center;justify-content:space-between;padding:20px var(--screenX) 6px">
    <div class="t-caption c-sub"><b style="color:var(--ink);font-size:15px;font-weight:800">${list.length}개</b>의 사료</div>
    <button class="t-caption c-sub press" data-sort style="display:flex;align-items:center;gap:3px">
      ${SORT_LABEL[state.sort]} ${icon('chevronRight', 14)}
    </button>
  </div>
  <div style="padding:0 var(--screenX)">${rows}</div>
  ${picked ? `<div class="dock"><button class="btn dark press" data-go="compare">선택한 ${picked}개 비교하기</button></div>` : ''}`;
}

/* 사실 서술만. 판단하지 않는다. */
function searchSummary(f) {
  const d = DETAIL[f.id] || {}, n = d.nutrient || {};
  const bits = [];
  const first = (d.ingr || [])[0];
  if (first) bits.push(`첫 원료가 ${first.name}`);
  if (n.protein) bits.push(`조단백 ${n.protein}%`);
  if (!bits.length && f.price?.pKg) bits.push(`100g당 ${won(per100g(f))}원`);
  if (!bits.length) return '원료표를 확보하는 중이에요';
  return bits.join(' · ');
}

/* E1 — 검색 결과 없음 */
function renderEmptySearch() {
  const q = state.query.trim();
  const near = FOODS.filter(f => analysisState(f) === 'analyzed').slice(0, 3);
  return `<div class="empty">
    <div class="orb">${icon('search', 38)}</div>
    <h2>${q ? `'${esc(q)}'${josa(q, '은', '는')}\n아직 분석하지 못했어요` : '조건을 다 만족하는\n사료가 없어요'}</h2>
    <p>원료표를 구하는 대로 올려드릴게요.
요청하시면 우선순위로 올라가요.</p>
    <div class="acts">
      <button class="btn pri press" data-request="analysis">이 사료 분석 요청하기</button>
      <button class="btn ghost press" data-clear-search>다른 이름으로 검색</button>
    </div>
    ${near.length ? `<div style="width:100%;margin-top:30px;text-align:left">
      <div class="t-sub" style="margin-bottom:10px">혹시 이걸 찾으셨나요?</div>
      ${near.map(f => `<button class="row press" data-go-detail="${f.id}">
        ${well(f, 44)}<span class="row-b"><span class="row-name" style="display:block">${esc(f.brand)} ${esc(f.name)}</span></span>
        ${icon('chevronRight', 16, 'chev')}</button>`).join('')}
    </div>` : ''}
  </div>`;
}

/* ═══════════════════════════════════════════════════════
   03 / 07 사료 상세 — 성분 분석 · 급여량·가격
   ═══════════════════════════════════════════════════════ */
const RATING_LABEL = { quality: '원료 품질', carb: '탄수화물', additive: '주의성분', value: '가성비' };

function renderDetail() {
  const f = FOODS.find(x => x.id === state.detailId);
  if (!f) return renderHome();
  const pend = analysisState(f) === 'pending';
  const s = cautionState(f);
  const d = DETAIL[f.id] || {};
  const attrs = [
    foodTags(f)[0], typeKo(f.type),
    f.price?.pKg ? `${won(per100g(f))}원/100g` : null
  ].filter(Boolean);

  return `
  <div style="background:${pend ? 'var(--ink70)' : 'var(--purple900)'};color:#fff;padding:14px 18px 30px">
    <div style="display:flex;align-items:center">
      <button class="iconbtn press" data-back style="color:#fff">${icon('chevronRight', 24, 'ui')}</button>
      <div style="flex:1"></div>
      <button class="iconbtn press" style="color:#fff" data-share>${icon('refresh', 22, 'ui')}</button>
    </div>
    <div style="display:flex;align-items:flex-start;gap:14px;margin-top:10px;padding:0 4px">
      ${well(f, 64)}
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--purple300)">${esc(f.brand)} · ${esc(ageLabel(f))}</div>
        <h1 class="t-product" style="margin-top:4px">${esc(f.name)}</h1>
      </div>
      <div class="cbadge-lg ${s.k}">${s.k === 'none' ? icon('check', 22) : s.k === 'has' ? '!' : '·'}</div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:14px;padding:0 4px">
      ${attrs.map(a => `<span style="height:26px;padding:0 10px;border-radius:999px;background:rgba(255,255,255,.14);color:#fff;font-size:12px;font-weight:700;display:inline-flex;align-items:center">${esc(a)}</span>`).join('')}
    </div>
  </div>

  <div style="margin-top:-18px;border-radius:var(--rSheet) var(--rSheet) 0 0;background:#fff;position:relative;z-index:1;min-height:60dvh">
    <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:var(--divider)">
      ${[['nutrition', '성분 분석'], ['feeding', '급여량 · 가격']].map(([k, l]) => `
        <button class="press" data-dtab="${k}" style="height:52px;font-size:15px;font-weight:${state.detailTab === k ? 800 : 600};color:${state.detailTab === k ? 'var(--ink)' : 'var(--ink50)'};box-shadow:${state.detailTab === k ? 'inset 0 -2.5px 0 var(--purple700)' : 'none'};transition:box-shadow .22s ease-out">${l}</button>`).join('')}
    </div>
    ${pend ? renderPending(f) : state.detailTab === 'nutrition' ? renderNutritionTab(f, d) : renderFeedingTab(f, d)}
  </div>

  ${pend ? '' : `<div class="dock">
    <button class="btn ghost icon press" data-add-compare="${f.id}">${icon('compare', 18)}비교 담기</button>
    ${/* 급여량·가격 탭까지 온 사람은 사러 가려는 사람이다. 그 탭에서는 구매를 주 버튼으로 둔다.
          링크가 없으면 없는 대로 말해야 한다 — 눌러놓고 아무 일도 없으면 안 된다. */
      state.detailTab === 'nutrition'
        ? `<button class="btn pri press" data-dtab="feeding">급여량 · 가격 보기</button>`
        : buyUrlOf(f)
          ? `<button class="btn pri press" data-buy="${esc(buyUrlOf(f))}">구매하러 가기</button>`
          /* 비활성이라도 읽혀야 한다. opacity 로 흐리면 대비가 1.9:1 까지 떨어진다. */
          : `<button class="btn press" data-request="price" disabled
              style="background:var(--surface);color:var(--ink50);box-shadow:var(--outline)">구매 링크 준비 중</button>`}
  </div>`}`;
}

/* E7 — 분석 준비 중 */
function renderPending(f) {
  return `<div style="padding:8px var(--screenX) 40px">
    <div class="empty" style="padding:34px 8px 24px">
      <div class="orb neutral">${icon('package', 38)}</div>
      <h2>아직 원료표를\n확보하지 못했어요</h2>
      <p>확실하지 않은 정보로 판단하면
안 하느니만 못하다고 생각해요.
제조사에 자료를 요청해둔 상태예요.</p>
    </div>
    <div class="t-sub" style="margin-top:6px">지금 알 수 있는 것</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:12px">
      ${[['분류', (f.rx ? '처방식' : '일반식') + ' · ' + typeKo(f.type)], ['원산지', COUNTRY_KO[f.country] || f.country],
       ['가격', f.price?.p ? `${won(f.price.p)}원 / ${gLabel(f.price.wg)}` : '확인 전'],
       ['성분', '확인 전']].map(([k, v]) => `
        <div style="border-radius:var(--rThumbMd);background:var(--surface);padding:13px 14px">
          <div class="t-micro c-mute">${k}</div>
          <div style="margin-top:4px;font-size:15px;font-weight:700;letter-spacing:-.03em">${esc(v)}</div>
        </div>`).join('')}
    </div>
    <div style="display:flex;flex-direction:column;gap:9px;margin-top:24px">
      <button class="btn pri press" data-request="notify">분석되면 알림 받기</button>
      <button class="btn ghost press" data-go="search">비슷한 사료 보기</button>
    </div>
  </div>`;
}

/* 고민별 관련 원료 — 어떤 고민에 도움되는 원료가 몇 종 들어있는지.
   6종을 늘 같은 순서로 보여준다. 0종이면 회색으로 '없음' 이라고 말한다.
   해당되는 것만 보여주면 사료마다 항목이 달라져 비교가 안 된다. */
const FUNC_ROWS = [
  { k: 'skin', fn: ['skin'], icon: 'skin', label: '피부 · 알러지' },
  { k: 'eye_tear', fn: ['eye_tear'], icon: 'tear', label: '눈물자국' },
  { k: 'joint', fn: ['joint'], icon: 'joint', label: '관절' },
  { k: 'digestive', fn: ['digestive'], icon: 'gut', label: '장 · 소화' },
  { k: 'heart', fn: ['heart'], icon: 'senior', label: '심장' },
  { k: 'immune', fn: ['immune'], icon: 'picky', label: '면역 · 활력' }
];

function funcBars(d) {
  const fi = d.funcIngr || {};
  const rows = FUNC_ROWS.map(r => {
    const items = r.fn.flatMap(k => fi[k] || []);
    return { ...r, n: items.length, names: items.map(x => x.n) };
  });
  const max = Math.max(3, ...rows.map(r => r.n));
  return `
  <h2 class="t-section" style="margin-top:30px">고민별 관련 원료</h2>
  <p class="t-caption c-sub" style="margin-top:4px">원료 목록에서 찾은 관련 원료 종류 수예요</p>
  <div style="margin-top:14px">${rows.map(r => `
    <div style="margin-bottom:15px${r.n ? '' : ';opacity:.5'}">
      <div style="display:flex;align-items:center;gap:7px">
        ${cicon(r.icon, 17)}
        <span style="font-size:13.5px;font-weight:700;letter-spacing:-.02em">${r.label}</span>
        <span style="flex:1"></span>
        <span class="t-caption ${r.n ? 'c-sub' : 'c-mute'}">${r.n ? `관련 원료 ${r.n}종` : '관련 원료 없음'}</span>
      </div>
      <div style="height:6px;border-radius:99px;background:var(--lineSoft);margin-top:7px;overflow:hidden">
        <div style="height:100%;border-radius:99px;background:var(--purple700);width:${r.n / max * 100}%;transition:width .6s ease-out"></div>
      </div>
      ${r.names.length ? `<div class="t-micro c-mute" style="margin-top:5px">${esc(r.names.join(', '))}</div>` : ''}
    </div>`).join('')}</div>`;
}

/* 03 성분 분석 */
function renderNutritionTab(f, d) {
  const v = d.verdict || {};
  const cards = [
    ...(v.pos || []).map(x => ['pos', x]),
    ...(v.cau || []).map(x => ['cau', x]),
    /* 위험 카드는 dan 에 담는다. 예전 데이터가 bad 로 쓰던 시절이 있어 둘 다 받는다 —
       한쪽만 읽던 탓에 '출처가 불투명한 고기 가루' 같은 경고가 화면에서 통째로 빠졌었다. */
    ...(v.dan || v.bad || []).map(x => ['cau', x])   /* 빨강 금지 — 위험도 앰버로 */
  ].slice(0, 5);
  const n = d.nutrient || {};
  const ingr = (d.ingr || []).slice().sort((a, b) => (a.rank || 99) - (b.rank || 99));

  /* 기본 정보는 이 탭의 것이다. 성분을 보러 온 사람이 제일 먼저 확인하는 값이다. */
  const basic = [
    ['분류', (f.rx ? '처방식' : '일반식') + ' · ' + typeKo(f.type)],
    ['원산지', COUNTRY_KO[f.country] || f.country],
    ['단백질 / 지방', `${n.protein ?? '—'}% / ${n.fat ?? '—'}%`],
    ['탄수화물 (추정)', n.dmCarb != null ? n.dmCarb + '%' : '—'],
    ['조섬유', n.fiber != null ? n.fiber + '%' : '—'],
    ['수분', n.moisture != null ? n.moisture + '%' : '—']
  ];

  return `<div style="padding:22px var(--screenX) 40px">
    <h2 class="t-section">기본 정보</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:13px">
      ${basic.map(([k, val]) => `
        <div style="border-radius:var(--rThumbMd);background:var(--surface);padding:13px 14px">
          <div class="t-micro c-mute">${k}</div>
          <div style="margin-top:4px;font-size:15px;font-weight:700;letter-spacing:-.03em">${esc(val)}</div>
        </div>`).join('')}
    </div>

    ${ratingCards(f)}

    ${cards.length ? `<h2 class="t-section" style="margin-top:30px">이 사료를 이렇게 봤어요</h2>
    <div style="margin-top:13px">${cards.map(([k, c]) => `
      <div class="reason ${k}">${icon(k === 'pos' ? 'check' : 'alert', 18)}
        <div style="flex:1;min-width:0"><b>${esc(c.title)}</b><p>${esc(c.body)}</p></div></div>`).join('')}</div>` : ''}

    ${funcBars(d)}

    ${ingr.length ? `<div style="display:flex;align-items:center;justify-content:space-between;margin-top:30px">
      <h2 class="t-section">원료 전체</h2>
      <button class="sec-more press" data-ingr-sheet>${ingr.length}개 모두 보기</button></div>
    <p class="t-bodySm c-sub" style="margin-top:10px;line-height:1.75">${ingr.slice(0, 10).map(i => esc(i.name)).join(', ')}${ingr.length > 10 ? '…' : ''}</p>` : ''}

    <p class="note" style="padding:0">모든 분석은 라벨 표기 성분 기준의 참고용이에요.
건강 문제는 수의사와 상담해주세요.</p>
  </div>`;
}

/* 별점 4카드 — 종합 점수는 노출하지 않지만 항목별 판단 재료는 남긴다.
   동그라미로는 몇 점인지 한눈에 안 들어와서 별로 바꿨다.
   채운 별은 보라, 빈 별은 윤곽만 — 색 없이도 개수로 읽힌다. */
const STAR_PATH = 'M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95z';
function stars(v) {
  return [1, 2, 3, 4, 5].map(i => `<svg width="15" height="15" viewBox="0 0 24 24" style="display:block">
    <path d="${STAR_PATH}" fill="${i <= v ? 'var(--purple700)' : 'none'}"
      stroke="${i <= v ? 'none' : 'var(--ink20)'}" stroke-width="1.6" stroke-linejoin="round"></path></svg>`).join('');
}
function ratingCards(f) {
  const r = f.ratings;
  if (!r) return '';
  return `<h2 class="t-section" style="margin-top:30px">항목별로 보면</h2>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:13px">
    ${Object.entries(RATING_LABEL).map(([k, label]) => r[k] == null ? '' : `
      <div style="border-radius:var(--rThumbMd);background:var(--surface);padding:13px 14px">
        <div class="t-micro c-mute">${label}</div>
        <div style="display:flex;gap:2px;margin-top:8px;align-items:center">${stars(r[k])}</div>
      </div>`).join('')}
  </div>`;
}

/* 급여량 계산 — 성견 유지 기준 RER×1.6 */
function feedingNumbers(f) {
  const w = Math.max(0.5, Math.min(90, Number(state.feeding.weightKg) || 5));
  const meals = state.feeding.meals || 2;
  const kcal = kcalPerKg(f);
  const rer = 70 * Math.pow(w, 0.75);
  const daily = Math.round(rer * 1.6 / kcal.v * 1000);
  const bagG = state.feeding.bagG || f.price?.wg || 2000;
  const days = daily > 0 ? Math.round(bagG / daily) : 0;
  const monthCost = f.price?.pKg ? Math.round(daily * 30 / 1000 * f.price.pKg) : null;
  return {
    daily, perMeal: Math.round(daily / meals), days, bagG, kcal, monthCost,
    bagLabel: `${gLabel(bagG)} 한 봉지로 약 ${days}일` + (monthCost ? ` · 월 약 ${won(monthCost)}원` : '')
  };
}

/* 07 급여량 · 가격 */
function renderFeedingTab(f, d) {
  const n = d.nutrient || {};
  const feed = feedingNumbers(f);
  const opts = (f.price?.wgOptions || [f.price?.wg]).filter(Boolean);
  const prices = (d.prices && d.prices.length) ? d.prices
    : (f.price?.p ? [{ wg: f.price.wg, shop: f.price.shop, price: f.price.p, pKg: f.price.pKg, url: buyUrlOf(f) }] : []);

  /* 이 탭에 들어온 사람은 대개 '얼마인지'와 '어디서 사는지'를 먼저 본다.
     그래서 최저가·구매 링크를 맨 위에 둔다. */
  const priceBlock = `
    <h2 class="t-section">구매하러 가기</h2>
    <div style="margin-top:13px">
      ${prices.length ? prices.map((p, i) => `
        <div class="card" style="display:flex;align-items:center;gap:12px;padding:14px 16px;margin-bottom:9px">
          <div style="flex:1;min-width:0">
            <div class="t-micro c-mute">${esc(SHOP_KO[p.shop] || p.shop || '판매처')} · ${gLabel(p.wg)}</div>
            <div style="margin-top:3px"><b style="font-size:18px;font-weight:800;letter-spacing:-.04em">${won(p.price)}원</b>
              <span class="t-caption c-sub" style="margin-left:5px">(kg당 ${won(p.pKg)}원)</span></div>
          </div>
          ${p.url ? `<button class="press" data-buy="${esc(p.url)}" style="height:40px;padding:0 18px;border-radius:var(--rSegment);font-size:14px;font-weight:700;${i === 0 ? 'background:var(--purple700);color:#fff' : 'box-shadow:var(--outline);color:var(--ink70)'}">구매</button>`
        : `<span class="t-caption c-cap">링크 준비 중</span>`}
        </div>`).join('') : `<p class="t-bodySm c-sub">등록된 판매처 가격이 없어요.</p>`}
    </div>
    <p class="partners">이 페이지의 구매 링크는 쿠팡 파트너스 활동의 일환으로, 이에 따라 일정액의 수수료를 제공받습니다. 수수료는 발사탕의 성분 분석에 영향을 주지 않아요.</p>`;

  return `<div style="padding:22px var(--screenX) 40px">
    ${priceBlock}

    <div class="card" style="margin-top:26px;border-radius:var(--rCardLg);padding:20px 18px">
      <h2 class="t-sub">하루에 얼마나 줄까요?</h2>
      <p class="t-caption c-cap" style="margin-top:4px">몸무게와 하루 끼니 수를 입력해주세요</p>

      <div class="t-caption c-sub" style="margin-top:18px">우리 아이 몸무게</div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
        <div style="width:96px;height:52px;border-radius:14px;background:var(--surfaceInput);display:grid;place-items:center">
          <input id="fw" type="number" inputmode="decimal" min="0.5" max="90" step="0.1" value="${state.feeding.weightKg}"
            style="width:100%;text-align:center;font-size:22px;font-weight:800;letter-spacing:-.04em">
        </div>
        <span class="t-caption c-sub">kg</span>
        <input id="fwr" type="range" min="1" max="40" step="0.5" value="${Math.min(40, state.feeding.weightKg)}" style="flex:1">
      </div>

      <div class="t-caption c-sub" style="margin-top:18px">하루 끼니 수</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:8px">
        ${[1, 2, 3, 4].map(m => `<button class="press" data-meals="${m}" style="height:44px;border-radius:var(--rSegment);font-size:14px;font-weight:700;${state.feeding.meals === m ? 'background:var(--purple700);color:#fff' : 'box-shadow:var(--outline);color:var(--ink70)'}">${m}끼</button>`).join('')}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;border-radius:var(--rInput);background:var(--surface);margin-top:16px;overflow:hidden">
        <div style="padding:15px 10px;text-align:center;border-right:var(--divider)">
          <div class="t-caption c-sub">하루 권장량</div>
          <div style="font-size:26px;font-weight:800;letter-spacing:-.04em;color:var(--purple700);margin-top:3px">${feed.daily}g</div>
        </div>
        <div style="padding:15px 10px;text-align:center">
          <div class="t-caption c-sub">1회 (하루 ${state.feeding.meals}끼)</div>
          <div style="font-size:26px;font-weight:800;letter-spacing:-.04em;margin-top:3px">${feed.perMeal}g</div>
        </div>
      </div>

      ${opts.length ? `<div class="t-caption c-sub" style="margin-top:18px">봉지 용량</div>
      <div style="display:flex;gap:7px;margin-top:8px;flex-wrap:wrap">
        ${opts.map(g => `<button class="press" data-bag="${g}" style="flex:1;min-width:88px;height:44px;border-radius:var(--rSegment);font-size:14px;font-weight:700;${feed.bagG === g ? 'background:var(--purple900);color:#fff' : 'box-shadow:var(--outline);color:var(--ink70)'}">${gLabel(g)}</button>`).join('')}
      </div>` : ''}
      <div style="display:flex;align-items:center;gap:12px;margin-top:14px;padding:16px 18px;
                  border-radius:var(--rInput);background:var(--purple900);color:#fff">
        <div style="flex:1;min-width:0;font-size:12.5px;font-weight:600;letter-spacing:-.02em;line-height:1.5;color:var(--purple300)">
          ${gLabel(feed.bagG)} 한 봉지 · 하루 ${state.feeding.meals}끼 기준${feed.monthCost ? `<br>월 예상 약 ${won(feed.monthCost)}원` : ''}
        </div>
        <div style="font-size:30px;font-weight:800;letter-spacing:-.04em">${feed.days}<span style="font-size:17px;margin-left:1px">일</span></div>
      </div>

      <p class="t-micro" style="margin-top:14px;color:#A8A2B0;font-weight:500;line-height:1.6">성견 유지 기준(RER×1.6) 계산값이에요. 활동량·나이에 따라 달라져요.${feed.kcal.est ? `<br>이 사료는 칼로리 표기가 없어 영양성분으로 추정한 값(약 ${won(feed.kcal.v)}kcal/kg)을 썼어요.` : ''}</p>
    </div>

    <button class="card dark press" style="width:100%;margin-top:22px;display:flex;align-items:center;gap:12px;padding:18px;border-radius:var(--rCard);text-align:left" data-go="compare">
      ${icon('compare', 20)}
      <span style="flex:1"><b style="display:block;font-size:15px;font-weight:700">지금 먹는 사료와 비교하기</b>
      <span style="font-size:12.5px;color:var(--purple300)">성분을 나란히 놓고 비교해드려요</span></span>
      ${icon('chevronRight', 18)}
    </button>

  </div>`;
}

/* ═══════════════════════════════════════════════════════
   08 / 09 비교 — A/B 구분 시스템
   ═══════════════════════════════════════════════════════
   브랜드가 아니라 A/B 로 부른다. 같은 브랜드끼리 비교하는 일이 흔해서
   양쪽 라벨이 같아지면 표가 무용지물이 된다.
   색만으로 구분하면 색각 이상 사용자가 못 읽으므로 A/B 문자를 항상 함께 둔다. */

/* 두 이름에서 가장 짧은 구별어를 뽑는다. 사람이 실제로 그렇게 부른다 — '벤슨', '램'. */
function abLabels(a, b) {
  if (a.brand !== b.brand) return [a.brand, b.brand];
  const wa = a.name.split(/\s+/), wb = b.name.split(/\s+/);
  let p = 0; while (p < wa.length && p < wb.length && wa[p] === wb[p]) p++;
  let s = 0; while (s < wa.length - p && s < wb.length - p && wa[wa.length - 1 - s] === wb[wb.length - 1 - s]) s++;
  const ra = wa.slice(p, wa.length - s).join(' '), rb = wb.slice(p, wb.length - s).join(' ');
  if (ra.length >= 2 && rb.length >= 2) return [ra, rb];
  if (a.name !== b.name) return [a.name, b.name];
  const diff = k => a[k] !== b[k];
  if (diff('price') && a.price?.wg !== b.price?.wg) return [gLabel(a.price.wg), gLabel(b.price.wg)];
  if (String(a.ages) !== String(b.ages)) return [String(a.ages), String(b.ages)];
  return [COUNTRY_KO[a.country] || a.country, COUNTRY_KO[b.country] || b.country];
}

function slotView(f, side) {
  const color = side === 'A' ? 'var(--purple700)' : 'var(--blue700)';
  const chipBg = side === 'A' ? 'var(--purple100)' : 'var(--blue100)';
  if (!f) return `<button class="press" data-pick-slot="${side === 'A' ? 0 : 1}" style="flex:1;min-width:0;border-radius:var(--rCard);padding:16px 12px;display:flex;flex-direction:column;align-items:center;gap:10px;box-shadow:inset 0 0 0 1.5px var(--line);border:1.5px dashed transparent">
    <div style="width:88px;height:88px;border-radius:14px;border:1.5px dashed var(--ink20);display:grid;place-items:center;color:var(--ink20);font-size:28px;font-weight:300">＋</div>
    <div class="t-caption c-cap" style="text-align:center;white-space:pre-line">비교할 사료를\n하나 더 골라주세요</div>
  </button>`;
  const other = state.compare.map(id => FOODS.find(x => x.id === id)).filter(Boolean).find(x => x.id !== f.id);
  const label = other ? abLabels(side === 'A' ? f : other, side === 'A' ? other : f)[side === 'A' ? 0 : 1] : f.brand;
  const slot = side === 'A' ? 0 : 1;
  /* 썸네일을 눌러도 다른 사료를 고를 수 있게 한다. '바꾸기' 글자만 있으면
     누를 수 있는 줄 모른다 — 실제로 그래서 못 찾는다는 말을 들었다. */
  return `<div style="flex:1;min-width:0;border-radius:var(--rCard);padding:14px 12px;box-shadow:inset 0 0 0 2px ${color};display:flex;flex-direction:column;align-items:center;gap:9px">
    <span style="align-self:flex-start;height:22px;padding:0 9px;border-radius:999px;background:${chipBg};color:${color};font-size:11px;font-weight:800;display:inline-flex;align-items:center">${side} · ${esc(label)}</span>
    <button class="press" data-pick-slot="${slot}" style="position:relative;display:block" aria-label="다른 사료로 바꾸기">
      ${well(f, 88)}
      <span style="position:absolute;right:-3px;bottom:-3px;width:28px;height:28px;border-radius:50%;
        background:${color};color:#fff;display:grid;place-items:center;box-shadow:0 0 0 3px #fff">
        ${icon('compare', 14)}</span>
    </button>
    <div style="width:100%;text-align:center">
      <div class="t-micro c-mute">${esc(f.brand)}</div>
      <div style="font-size:14px;font-weight:700;letter-spacing:-.03em;margin-top:2px">${esc(f.name)}</div>
      <button class="press" data-pick-slot="${slot}" style="margin-top:9px;width:100%;height:34px;border-radius:var(--rChip);
        font-size:12.5px;font-weight:700;letter-spacing:-.02em;color:${color};background:${chipBg}">다른 사료로 바꾸기</button>
    </div>
  </div>`;
}

/* 상황별 판단 — 사실 서술만. 우열을 단정하지 않는다. */
const CASES = [
  { key: 'tear', label: '눈물이 많은 아이라면', fn: 'eye_tear' },
  { key: 'joint', label: '관절이 걱정된다면', fn: 'joint' },
  { key: 'weight', label: '체중 관리 중이라면', metric: f => (DETAIL[f.id]?.nutrient?.dmCarb ?? 99), lower: true,
    say: (w, l) => `${w.n}가 탄수화물이 ${Math.abs(Math.round((l.v - w.v) * 10) / 10)}%p 낮아요.` },
  { key: 'skin', label: '알러지가 의심된다면', metric: f => (DETAIL[f.id]?.ingr || []).filter(i => i.allergen).length, lower: true,
    say: (w, l) => `${w.n} 쪽에 알러지 유발 가능 원료가 ${l.v - w.v}개 적어요.` },
  { key: 'gut', label: '장이 약하다면', fn: 'digestive' }
];
function compareCases(A, B, la, lb) {
  const out = [];
  for (const c of CASES) {
    let win = null, body = '';
    if (c.fn) {
      const na = (DETAIL[A.id]?.funcIngr?.[c.fn] || []).length, nb = (DETAIL[B.id]?.funcIngr?.[c.fn] || []).length;
      if (na === nb) { out.push({ key: c.key, label: c.label, win: null, body: '두 사료 모두 이 기준으론 차이가 없어요.' }); continue; }
      win = na > nb ? 'A' : 'B';
      const w = win === 'A' ? A : B, items = (DETAIL[w.id]?.funcIngr?.[c.fn] || []).map(x => x.n).join(', ');
      body = `${win === 'A' ? la : lb}에 ${items} 원료가 들어있어요.`;
    } else {
      const va = c.metric(A), vb = c.metric(B);
      if (va === vb || va == null || vb == null) { out.push({ key: c.key, label: c.label, win: null, body: '두 사료 모두 이 기준으론 차이가 없어요.' }); continue; }
      win = (c.lower ? va < vb : va > vb) ? 'A' : 'B';
      const w = win === 'A' ? { n: la, v: va } : { n: lb, v: vb };
      const l = win === 'A' ? { n: lb, v: vb } : { n: la, v: va };
      body = c.say(w, l);
    }
    out.push({ key: c.key, label: c.label, win, body });
  }
  return out;
}

const CMP_ROWS = [
  { label: '주의성분', get: f => f.warnN ?? 0, fmt: v => v ? `${v}종` : '없음', lower: true },
  { label: '조단백', get: f => DETAIL[f.id]?.nutrient?.protein, fmt: v => v != null ? v + '%' : '표기 없음', higher: true },
  { label: '조지방', get: f => DETAIL[f.id]?.nutrient?.fat, fmt: v => v != null ? v + '%' : '표기 없음' },  /* 방향이 갈려 강조 안 함 */
  { label: '탄수화물 (추정)', get: f => DETAIL[f.id]?.nutrient?.dmCarb, fmt: v => v != null ? v + '%' : '표기 없음', lower: true },
  { label: '생육 함량', get: f => DETAIL[f.id]?.nutrient?.meat, fmt: v => v != null ? v + '%' : '표기 없음', higher: true },
  { label: 'kg당 가격', get: f => f.price?.pKg, fmt: v => v != null ? won(v) + '원' : '표기 없음', lower: true }
];

function renderCompare() {
  const [A, B] = [0, 1].map(i => FOODS.find(x => x.id === state.compare[i]));
  if (!A || !B) return renderCompareEmpty(A || B);
  const [la, lb] = abLabels(A, B);
  const cases = compareCases(A, B, la, lb);
  const sameBrand = A.brand === B.brand;

  return `
  <div class="top" style="padding-top:18px">
    <h1 class="t-page">두 사료, 이렇게 달라요</h1>
    <div style="flex:1"></div>
    <button class="sec-more press" data-reset-compare>초기화</button>
  </div>
  <p class="t-bodySm c-sub" style="padding:6px var(--screenX) 0">우열이 아니라, 우리 아이 상황에 맞는 쪽을 찾아드려요</p>

  ${sameBrand ? `<div style="margin:16px var(--screenX) 0;border-radius:14px;background:var(--purple100);padding:11px 13px;font-size:12.5px;font-weight:600;color:var(--purple700);letter-spacing:-.02em">같은 <b>${esc(A.brand)}</b> 제품이라 <b>맛 이름</b>으로 구분해드려요.</div>` : ''}

  <div style="display:flex;align-items:center;gap:9px;padding:18px var(--screenX) 0">
    ${slotView(A, 'A')}
    <span style="width:30px;height:30px;border-radius:50%;background:var(--purple900);color:#fff;font-size:11px;font-weight:800;display:grid;place-items:center;flex-shrink:0">VS</span>
    ${slotView(B, 'B')}
  </div>

  <div class="sec lg">
    <h2 class="t-section">상황별로 보면 이래요</h2>
    <div style="margin-top:13px;display:flex;flex-direction:column;gap:9px">
      ${cases.map(c => `<div class="card soft" style="padding:15px 16px">
        <div class="t-caption" style="color:var(--ink50);display:flex;align-items:center;gap:6px">${cicon(c.key, 17)}${c.label}</div>
        <div style="display:flex;align-items:center;gap:7px;margin-top:8px;flex-wrap:wrap">
          ${c.win
      ? `<span style="height:24px;padding:0 9px;border-radius:999px;background:${c.win === 'A' ? 'var(--purple700)' : 'var(--blue700)'};color:#fff;font-size:11px;font-weight:800;display:inline-flex;align-items:center">${c.win} · ${esc(c.win === 'A' ? la : lb)}</span>
             <b style="font-size:15px;font-weight:700;letter-spacing:-.03em">쪽이 더 맞아요</b>`
      : `<span class="chip neutral" style="height:24px;font-size:11px;padding:0 9px">차이 없음</span>`}
        </div>
        <p class="t-bodySm c-sub" style="margin-top:8px">${esc(c.body)}</p>
      </div>`).join('')}
    </div>
  </div>

  <div class="sec lg">
    <h2 class="t-section">숫자로 자세히 비교하기</h2>
    <div style="margin-top:13px;border-radius:var(--rInput);box-shadow:inset 0 0 0 1px var(--line);overflow:hidden">
      <div style="display:flex;background:#FAF9FB">
        <div style="flex:1;padding:12px 14px;font-size:12px;font-weight:800;color:var(--purple700)">Ⓐ ${esc(la)}</div>
        <div style="width:88px;text-align:center;padding:12px 4px;font-size:12px;font-weight:600;color:var(--ink50)">항목</div>
        <div style="flex:1;padding:12px 14px;text-align:right;font-size:12px;font-weight:800;color:var(--blue700)">${esc(lb)} Ⓑ</div>
      </div>
      ${CMP_ROWS.map(r => {
        const va = r.get(A), vb = r.get(B);
        let winA = false, winB = false;
        if (va != null && vb != null && va !== vb && (r.lower || r.higher)) {
          const aWins = r.lower ? va < vb : va > vb;
          winA = aWins; winB = !aWins;
        }
        const cell = (v, win, color, align) =>
          `<div style="flex:1;padding:14px;text-align:${align};background:${color === 'A' ? 'var(--purple50)' : 'var(--blue50)'};
            font-size:15px;font-weight:${win ? 800 : 600};letter-spacing:-.03em;
            color:${win ? (color === 'A' ? 'var(--purple700)' : 'var(--blue700)') : 'var(--ink70)'}">${esc(r.fmt(v))}</div>`;
        return `<div style="display:flex;border-top:var(--divider)">
          ${cell(va, winA, 'A', 'left')}
          <div style="width:88px;padding:14px 4px;text-align:center;font-size:12px;font-weight:600;color:var(--ink50)">${r.label}</div>
          ${cell(vb, winB, 'B', 'right')}</div>`;
      }).join('')}
    </div>
    <p class="t-micro c-mute" style="margin-top:10px;font-weight:500">진하게 표시된 값이 해당 항목에서 더 나은 쪽이에요.</p>
  </div>

  <div class="sec lg">
    <h2 class="t-section">각 사료 자세히 보기</h2>
    <div style="display:flex;gap:9px;margin-top:13px">
      ${[[A, la], [B, lb]].map(([f, l]) => `<button class="press" data-go-detail="${f.id}" style="flex:1;min-width:0;border-radius:var(--rThumbMd);box-shadow:var(--outline);padding:13px;text-align:left">
        <div class="t-micro c-mute">${esc(f.brand)}</div>
        <div style="font-size:14px;font-weight:700;letter-spacing:-.03em;margin-top:3px">${esc(f.name)} ›</div></button>`).join('')}
    </div>
  </div>
  <p class="note">비교 결과는 라벨 표기 성분 기준 참고용이에요.
건강 문제는 수의사와 상담해주세요.</p>`;
}

/* E5 — 슬롯이 덜 찼을 때 */
function renderCompareEmpty(one) {
  const recent = state.recent.map(id => FOODS.find(f => f.id === id)).filter(Boolean).filter(f => !state.compare.includes(f.id)).slice(0, 3);
  return `
  <div class="top" style="padding-top:18px"><h1 class="t-page">비교하기</h1></div>
  ${one ? `<div style="display:flex;align-items:center;gap:9px;padding:20px var(--screenX) 0">
    ${slotView(one, 'A')}
    <span style="width:30px;height:30px;border-radius:50%;background:var(--purple900);color:#fff;font-size:11px;font-weight:800;display:grid;place-items:center;flex-shrink:0">VS</span>
    ${slotView(null, 'B')}
  </div>` : ''}
  <div class="empty">
    ${one ? '' : `<div class="orb">${icon('compare', 38)}</div>`}
    <h2>하나만 있으면 비교가 안 돼요</h2>
    <p>지금 먹는 사료를 골라두면
바꿀 때마다 바로 비교할 수 있어요.</p>
    <div class="acts">
      <button class="btn pri press" data-pick-slot="${state.compare.length}">비교할 사료 고르기</button>
      ${recent.length ? `<button class="btn ghost press" data-recent-sheet>최근 본 사료에서 고르기</button>` : ''}
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════════
   05 맞춤 추천 입력 — 한 화면
   ═══════════════════════════════════════════════════════
   5스텝으로 나눴더니 뎁스가 깊어 되돌아가기가 번거로웠다.
   입력 항목이 일곱 개뿐이라 한 화면에 다 놓고 스크롤로 훑게 한다.
   값은 바꿀 때마다 draft 에 들어가고, '추천 받기' 를 눌러야 확정된다. */
const CONCERN_OPTS = [
  ['skin', '피부가 자주 붉어져요'], ['eye_tear', '눈물자국이 심해요'], ['digestive', '변이 무르고 잦아요'],
  ['weight', '체중이 늘고 있어요'], ['joint', '관절이 약해요'], ['senior', '나이가 많아요'],
  ['picky_eater', '잘 안 먹어요'], ['value', '가성비가 중요해요'], ['none', '딱히 없어요']
];
const ALLERGEN_OPTS = ['닭', '소고기', '양고기', '연어', '오리', '옥수수', '밀', '대두', '유제품'];
const ACTIVITY_OPTS = [['low', '거의 실내'], ['mid', '하루 30분~1시간'], ['high', '한 시간 이상']];
const AGE_OPTS = [['puppy', '퍼피 ~1세'], ['adult', '성견 1~7세'], ['senior', '시니어 7세+']];

function renderWizard() {
  const d = state.wizard.data;
  const chips = (opts, key, multi) => {
    const cur = multi ? new Set(d[key] || []) : new Set(d[key] ? [d[key]] : []);
    return `<div class="concerns">${opts.map(o => {
      const [k, label] = Array.isArray(o) ? o : [o, o];
      return `<button class="chip press${cur.has(k) ? ' on' : ''}" data-wz-set="${key}" data-wz-val="${esc(k)}" data-wz-multi="${multi ? 1 : ''}">${esc(label)}</button>`;
    }).join('')}</div>`;
  };
  const label = (t, sub) => `<div style="margin-top:26px">
    <div class="t-sub">${t}${sub ? ` <span class="t-caption c-cap" style="font-weight:600">${sub}</span>` : ''}</div></div>`;

  return `
  <div class="top icons" style="align-items:center">
    <button class="iconbtn press" data-back>${icon('chevronRight', 24, 'ui')}</button>
    <h1 class="t-page" style="flex:1">우리 아이를 알려주세요</h1>
  </div>
  <div style="padding:8px var(--screenX) 0">
    <p class="t-bodySm c-sub">몇 가지만 알려주시면 맞는 사료를 골라드려요. 회원가입 없이도 돼요.</p>

    ${label('아이 이름', '선택')}
    <input class="wz-in" id="wz-name" style="margin-top:9px" placeholder="이름 (선택)" value="${esc(d.name || '')}">

    ${label('견종', '선택')}
    <input class="wz-in" id="wz-breed" style="margin-top:9px" placeholder="예) 말티즈 (선택)" value="${esc(d.breed || '')}">

    ${label('나이')}
    <div style="margin-top:9px">${chips(AGE_OPTS, 'ageGroup', false)}</div>

    ${label('몸무게')}
    <div style="display:flex;align-items:center;gap:10px;margin-top:9px">
      <div style="width:110px;height:52px;border-radius:14px;background:var(--surfaceInput);display:grid;place-items:center">
        <input id="wz-kg" type="number" inputmode="decimal" step="0.1" min="0.5" max="90" value="${esc(d.kg ?? '')}"
          placeholder="5.0" style="width:100%;text-align:center;font-size:20px;font-weight:800;letter-spacing:-.04em">
      </div>
      <span class="t-caption c-sub">kg</span>
      <span class="t-caption c-cap" id="wz-kg-msg" style="flex:1">0.5~90kg 사이로 적어주세요</span>
    </div>

    ${label('지금 고민', '여러 개 선택 가능')}
    <div style="margin-top:9px">${chips(CONCERN_OPTS, 'concerns', true)}</div>

    ${label('활동량', '급여량 계산에 써요')}
    <div style="margin-top:9px">${chips(ACTIVITY_OPTS, 'activity', false)}</div>

    ${label('피해야 할 원료', '고른 원료가 든 사료는 빼드려요')}
    <div style="margin-top:9px">${chips(ALLERGEN_OPTS, 'allergens', true)}</div>
  </div>
  <div class="dock col">
    <!-- 결과 화면의 '다시 분석하기' 와 같은 말을 쓰면 이 버튼이 초기화처럼 읽힌다.
         이건 입력을 확정하고 결과로 가는 버튼이라 그렇게 말해야 한다. -->
    <button class="btn dark press" data-wz-submit>${state.pet ? '이 조건으로 다시 찾기' : '맞춤 사료 추천받기'}</button>
    <p class="t-caption c-cap" style="text-align:center">입력한 정보는 맞춤 추천에만 사용해요</p>
  </div>`;
}

/* ═══ 06 추천 결과 ═══ */
/* kg당 가격을 0~1 로 환산한다. 1 이 가장 싸다.
   구간은 루브릭의 가성비 기준과 같은 눈금을 쓴다(1만/1.6만/3.2만/4.5만). */
function valueScale(pKg) {
  if (pKg == null) return null;
  if (pKg <= 10000) return 1;
  if (pKg <= 16000) return 0.75;
  if (pKg <= 32000) return 0.5;
  if (pKg <= 45000) return 0.25;
  return 0;
}

function matchScore(f, pet) {
  let s = 50;
  const d = DETAIL[f.id] || {};
  const concerns = (pet.concerns || []).filter(c => c !== 'none');
  for (const c of concerns) {
    if (c === 'value') continue;                  /* 가격은 아래에서 따로 본다 */
    if ((d.funcIngr?.[c] || []).length) s += 12;
    if ((f.concerns || []).includes(c)) s += 6;
  }
  if ((pet.allergens || []).some(a => a !== 'none' && (d.ingr || []).some(i => i.name.includes(a)))) s -= 40;
  if (cautionState(f).k === 'none') s += 10;
  s += Math.round((f.score ?? 0) * 1.5);          /* 내부 점수는 가중치로만 */

  /* 가성비를 고민으로 골랐으면 kg당 가격을 크게 본다.
     이게 없으면 점수만 높은 비싼 사료가 늘 1등이 된다 — 실제로 그랬다.
     가격을 모르는 사료는 올려줄 근거가 없으니 중간으로 둔다. */
  if (concerns.includes('value')) {
    const v = valueScale(f.price?.pKg);
    s += v == null ? -6 : Math.round((v - 0.5) * 44);
  }
  return Math.max(5, Math.min(99, s));
}
function renderResult() {
  const pet = state.pet;
  if (!pet) return renderProfileEmpty();
  const ranked = FOODS.filter(f => analysisState(f) === 'analyzed')
    .map(f => ({ f, m: matchScore(f, pet) })).sort((a, b) => b.m - a.m);
  const [top, ...rest] = ranked;
  if (!top) return renderProfileEmpty();
  const reasons = matchReasons(top.f, pet);

  return `
  <div class="top" style="padding-top:18px;align-items:center;gap:11px">
    <div style="width:44px;height:44px;border-radius:50%;background:var(--surface);display:grid;place-items:center;color:var(--ink25)">${icon('dog', 22)}</div>
    <div style="flex:1;min-width:0">
      <div class="t-item">${esc(pet.name || '우리 아이')}</div>
      <div class="t-micro c-mute" style="font-weight:600">${[pet.breed, pet.age ? pet.age + '살' : null, pet.kg ? pet.kg + 'kg' : null].filter(Boolean).join(' · ')}</div>
    </div>
    <button class="chip press" data-edit-pet>다시 분석하기</button>
  </div>

  <div style="padding:24px var(--screenX) 0">
    <h1 class="t-product" style="white-space:pre-line">${esc(headline(pet))}</h1>
  </div>

  <div class="sec">
    <button class="press" data-go-detail="${top.f.id}" style="width:100%;text-align:left;border-radius:var(--rCardLg);box-shadow:var(--outline);overflow:hidden">
      <div style="background:#fff;height:180px;display:grid;place-items:center;position:relative;box-shadow:var(--imageWell)">
        ${/^https?:/.test(top.f.thumb || '') ? `<img src="${esc(top.f.thumb)}" alt="" style="height:150px;object-fit:contain">` : ''}
        <span style="position:absolute;top:12px;left:12px;height:26px;padding:0 11px;border-radius:999px;background:var(--purple900);color:#fff;font-size:11px;font-weight:800;display:inline-flex;align-items:center">${esc(pet.name || '우리 아이')} 맞춤 1위</span>
      </div>
      <div style="padding:16px">
        <div class="t-micro c-mute">${esc(top.f.brand)}</div>
        <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin-top:3px">
          <div style="font-size:18px;font-weight:800;letter-spacing:-.04em;min-width:0">${esc(top.f.name)}</div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:22px;font-weight:800;letter-spacing:-.04em;color:var(--purple700);line-height:1">${top.m}%</div>
            <div class="t-tag c-mute" style="margin-top:3px">${esc(pet.name || '우리 아이')} 매칭</div>
          </div>
        </div>
        <div style="margin-top:14px;display:flex;flex-direction:column;gap:8px">
          ${reasons.map(r => `<div style="display:flex;gap:8px;align-items:flex-start">
            <span style="width:16px;height:16px;border-radius:50%;background:var(--purple100);color:var(--purple700);display:grid;place-items:center;flex-shrink:0;margin-top:2px">${icon('check', 10)}</span>
            <span class="t-bodySm">${esc(r)}</span></div>`).join('')}
        </div>
      </div>
    </button>
  </div>

  <div class="sec lg">
    <h2 class="t-section">다음 후보</h2>
    <div style="margin-top:8px">
      ${rest.slice(0, 2).map(({ f, m }) => `<button class="row press" data-go-detail="${f.id}">
        ${well(f, 44)}
        <span class="row-b"><span class="row-name" style="display:block">${esc(f.brand)} ${esc(f.name)}</span>
        <span class="row-meta">매칭 ${m}% · ${esc(nextReason(f, top.f))}</span></span>
        ${icon('chevronRight', 16, 'chev')}</button>`).join('')}
    </div>
  </div>
  <p class="note">모든 분석은 라벨 표기 성분 기준의 참고용이에요.
건강 문제는 수의사와 상담해주세요.</p>`;
}
function headline(pet) {
  const cs = (pet.concerns || []).filter(c => c !== 'none');
  const KO = { skin: '피부', eye_tear: '눈물', digestive: '소화', weight: '체중', joint: '관절' };
  if (!cs.length) return '주의성분이 적고\n영양이 고른 사료예요';
  /* '눈물와 관절를' 처럼 조사가 어긋나면 문장이 대번에 어색해진다 */
  const words = cs.slice(0, 2).map(c => KO[c] || c);
  const joined = words.length === 2
    ? `${words[0]}${josa(words[0], '과', '와')} ${words[1]}`
    : words[0];
  return `${joined}${josa(joined, '을', '를')} 함께 보면\n이 사료가 가장 맞아요`;
}
function matchReasons(f, pet) {
  const d = DETAIL[f.id] || {}, out = [];
  for (const c of (pet.concerns || [])) {
    const items = d.funcIngr?.[c] || [];
    if (items.length) {
      const names = items.map(x => x.n).join('·');
      out.push(`${names}${josa(names, '이', '가')} 들어 있어 도움될 수 있어요`);
    }
  }
  if ((pet.concerns || []).includes('value') && f.price?.pKg) {
    const v = valueScale(f.price.pKg);
    out.unshift(v >= 0.75 ? `kg당 ${won(f.price.pKg)}원으로 저렴한 편이에요`
      : v >= 0.5 ? `kg당 ${won(f.price.pKg)}원으로 보통 수준이에요`
        : `kg당 ${won(f.price.pKg)}원이라 가격은 높은 편이에요`);
  }
  if (cautionState(f).k === 'none') out.push('주의성분으로 볼 원료가 없어요');
  if (f.price?.pKg) out.push(`100g당 ${won(per100g(f))}원 · 하루 약 ${feedingNumbers(f).daily}g`);
  return out.slice(0, 3);
}
function nextReason(f, top) {
  if ((f.price?.pKg ?? 9e9) < (top.price?.pKg ?? 9e9)) return '가격이 조금 더 낮아요';
  if (cautionState(f).k === 'none') return '주의성분이 없어요';
  return '성분 구성이 비슷해요';
}
/* E6 */
function renderProfileEmpty() {
  return `<div class="top" style="padding-top:18px"><h1 class="t-page">맞춤 추천</h1></div>
  <div class="empty">
    <div class="orb">${icon('dog', 38)}</div>
    <h2>우리 아이를 아직\n모르고 있어요</h2>
    <p>몸무게·나이·고민 다섯 가지만 알려주시면
맞는 사료를 골라드릴게요. 1분이면 돼요.</p>
    <div class="acts">
      <button class="btn pri press" data-edit-pet>우리 아이 등록하기</button>
      <button class="btn ghost press" data-go="search">등록 없이 둘러보기</button>
    </div>
  </div>`;
}

/* ═══ 콘텐츠 ═══ */
const articles = () => (typeof ARTICLES !== 'undefined' ? ARTICLES : []);

/* 읽는 데 걸리는 시간 — 한국어는 분당 500자 정도로 잡는다 */
function readMin(a) { return Math.max(1, Math.round((a.body || '').length / 500)); }

function renderContent() {
  const list = articles();
  const cats = [...new Set(list.map(a => a.cat).filter(Boolean))];
  const cur = state.articleCat;
  const shown = cur ? list.filter(a => a.cat === cur) : list;

  const chips = [`<button class="chip press${cur ? '' : ' on'}" data-acat="">전체<em>${list.length}</em></button>`,
  ...cats.map(c => `<button class="chip press${cur === c ? ' on' : ''}" data-acat="${esc(c)}">${esc(c)}</button>`)].join('');

  return `<div class="top" style="padding-top:18px"><h1 class="t-page">사료, 제대로 알기</h1></div>
  <p class="t-bodySm c-sub" style="padding:6px var(--screenX) 0">헷갈렸던 것들을 쉽게 풀어드려요</p>
  <div class="chiprow" style="margin-top:16px">${chips}</div>
  <div class="sec">
    ${shown.length ? shown.map(a => `<button class="row press" data-article="${esc(a.id)}" style="align-items:flex-start">
      <span style="width:56px;height:56px;border-radius:var(--rThumbMd);background:var(--purple100);display:grid;place-items:center;color:var(--purple700);flex-shrink:0">${icon('book', 22)}</span>
      <span class="row-b">
        <span class="t-micro" style="color:var(--purple700)">${esc(a.cat || '읽을거리')}</span>
        <span class="row-name" style="display:block;margin-top:3px">${esc(a.title)}</span>
        <span class="row-meta">${esc((a.excerpt || '').slice(0, 52))}</span>
        <span class="t-micro c-mute" style="display:block;margin-top:5px">약 ${readMin(a)}분</span>
      </span></button>`).join('')
      : `<div class="empty"><div class="orb neutral">${icon('book', 38)}</div>
         <h2>준비 중이에요</h2><p>사료를 고를 때 도움되는 글을 쓰고 있어요.</p></div>`}
  </div>`;
}

/* 본문은 마크다운의 아주 좁은 갈래만 쓴다 — ###, -, >, 1., **강조**.
   라이브러리를 붙이는 대신 쓰는 문법만 직접 옮긴다. 값을 먼저 이스케이프하고
   그 다음에 태그를 만들기 때문에 본문에 태그를 적어도 그대로 글자로 나온다. */
function mdToHtml(src) {
  const inline = t => esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
  const out = [];
  let list = null;                       /* 'ul' | 'ol' | null */
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };

  for (const raw of String(src || '').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); continue; }

    const h = line.match(/^(#{2,4})\s+(.*)$/);
    if (h) { closeList(); out.push(`<h3 class="t-section" style="margin:26px 0 10px">${inline(h[2])}</h3>`); continue; }

    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) {
      if (list !== 'ul') { closeList(); out.push('<ul class="md-list">'); list = 'ul'; }
      out.push(`<li>${inline(ul[1])}</li>`); continue;
    }
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      if (list !== 'ol') { closeList(); out.push('<ol class="md-list">'); list = 'ol'; }
      out.push(`<li>${inline(ol[1])}</li>`); continue;
    }
    const q = line.match(/^>\s?(.*)$/);
    if (q) { closeList(); out.push(`<blockquote class="md-quote">${inline(q[1])}</blockquote>`); continue; }

    closeList();
    out.push(`<p class="md-p">${inline(line)}</p>`);
  }
  closeList();
  return out.join('');
}

/* 03-1 콘텐츠 상세 */
function renderArticle() {
  const a = articles().find(x => x.id === state.articleId);
  if (!a) return renderContent();

  /* 글마다 '어떤 사료가 여기 해당하는지' 판별식을 들고 있다. 그걸로 실제 사료를 잇는다. */
  let related = [];
  try { related = FOODS.filter(f => { try { return a.match?.(f); } catch { return false; } }).slice(0, 3); }
  catch { related = []; }

  return `
  <div class="top icons">
    <button class="iconbtn press" data-back>${icon('chevronRight', 24, 'ui')}</button>
    <h1 class="t-item" style="flex:1">콘텐츠</h1>
  </div>
  <div style="padding:14px var(--screenX) 0">
    <div class="t-micro" style="color:var(--purple700);font-weight:800">${esc(a.cat || '읽을거리')} · 약 ${readMin(a)}분</div>
    <h2 class="t-product" style="margin-top:8px">${esc(a.title)}</h2>
    ${a.excerpt ? `<p class="t-bodySm c-sub" style="margin-top:10px">${esc(a.excerpt)}</p>` : ''}
  </div>
  <div class="sec md">${mdToHtml(a.body)}</div>
  ${related.length ? `<div class="sec">
    <h2 class="t-section">이 글과 관련된 사료</h2>
    <div style="margin-top:13px">${related.map(f => `
      <button class="row press" data-go-detail="${f.id}">
        ${well(f, 44)}
        <span class="row-b">
          <span class="row-brand">${esc(f.brand)}</span>
          <span class="row-name" style="display:block">${esc(f.name)}</span>
        </span>${icon('chevronRight', 16, 'chev')}</button>`).join('')}</div>
  </div>` : ''}
  <div class="sec">
    <p class="t-caption c-cap">이 글은 일반적인 정보예요. 아이가 아프거나 처방식을 먹고 있다면 수의사와 상의해 주세요.</p>
  </div>`;
}

/* ═══════════════════════════════════════════════════════
   렌더 + 이벤트
   ═══════════════════════════════════════════════════════ */
const VIEW = {
  home: renderHome, search: renderSearch, detail: renderDetail,
  compare: renderCompare, custom: () => state.pet ? renderResult() : renderProfileEmpty(),
  wizard: renderWizard, content: renderContent, article: renderArticle
};
const TAB_META = [['home', '홈', 'house'], ['compare', '비교', 'compare'], ['content', '콘텐츠', 'book'], ['custom', '맞춤', 'paw']];


/* 검색 결과 영역만 다시 그렸을 때 그 안의 버튼을 다시 잇는다.
   검색 입력칸은 이 영역 밖에 있어서 건드리지 않는다 — 한글 조합이 끊기면 안 된다. */
function wireSearchResults() {
  const b = $('#s-body');
  if (!b) return;
  const on = (sel, fn) => $$(sel, b).forEach(el => el.addEventListener('click', fn));
  on('[data-go-detail]', e => go('detail', { id: e.currentTarget.dataset.goDetail }));
  on('[data-filter]', e => {
    const k = e.currentTarget.dataset.filter;
    if (!k) state.filters.clear();
    else state.filters.has(k) ? state.filters.delete(k) : state.filters.add(k);
    repaintSearchResults();
  });
  on('[data-sort]', () => openSortSheet());
  on('[data-request]', e => submitRequest(e.currentTarget.dataset.request, { query: state.query, id: state.detailId }));
  on('[data-clear-search]', () => { state.query = ''; state.filters.clear(); const q = $('#q'); if (q) q.value = ''; repaintSearchResults(); q?.focus(); });
  on('[data-go]', e => go(e.currentTarget.dataset.go));
}

/* 검색 화면은 결과만 갈아끼운다.

   #view 를 통째로 다시 그리면 입력칸이 문서에서 잠깐 떨어져 나간다. 노드를
   붙잡았다가 도로 꽂아도 소용없다 — 떨어지는 순간 브라우저가 한글 조합을
   취소해서 'ㅈㅣㅇㅜㅍㅣㄱ' 처럼 자모가 흩어진다.
   그래서 검색어가 바뀔 때는 결과 영역만 새로 그린다. */
function repaintSearchResults() {
  const body = $('#s-body');
  if (!body) { render(); return; }
  body.innerHTML = searchBodyHtml();
  wireSearchResults();
}

function render() {
  const s = state.screen || 'home';
  const view = $('#view');
  view.innerHTML = (VIEW[s] || renderHome)();
  const bar = $('#tabbar');
  const showTabs = ['home', 'compare', 'content', 'custom'].includes(s);
  bar.hidden = !showTabs;
  /* 본문 끝이 고정 바 아래로 숨지 않게 그만큼 여백을 준다 */
  view.classList.toggle('has-tabbar', showTabs);
  view.classList.toggle('has-dock', !showTabs && !!$('.dock', view));
  bar.innerHTML = TAB_META.map(([k, l, ic]) =>
    `<button data-tab="${k}" class="${state.tab === k ? 'on' : ''}">${icon(ic, 22, 'ui')}<span>${l}</span></button>`).join('');
  wire();
}

function wire() {
  const v = $('#view');
  const on = (sel, ev, fn) => $$(sel, v).forEach(el => el.addEventListener(ev, fn));

  on('[data-go]', 'click', e => {
    const t = e.currentTarget.dataset.go;
    if (t === 'custom' && !state.pet) { go('wizard'); return; }
    if (t === 'search') { state.query = ''; state.filters.clear(); }
    go(t);
  });
  on('[data-go-detail]', 'click', e => go('detail', { id: e.currentTarget.dataset.goDetail }));
  on('[data-edit-pet]', 'click', () => { state.wizard = { step: 0, data: { ...(state.pet || {}) } }; go('wizard'); });
  on('[data-back]', 'click', () => history.back());
  on('[data-article]', 'click', e => go('article', { articleId: e.currentTarget.dataset.article }));
  on('[data-acat]', 'click', e => { state.articleCat = e.currentTarget.dataset.acat || null; render(); });
  on('[data-search]', 'click', e => { state.query = e.currentTarget.dataset.search; go('search'); });
  on('[data-concern]', 'click', e => {
    const c = CONCERNS.find(x => x.key === e.currentTarget.dataset.concern);
    state.query = c.key === 'rx' ? '처방식' : c.label.split('·')[0];
    state.filters.clear(); go('search');
  });
  on('[data-filter]', 'click', e => {
    const k = e.currentTarget.dataset.filter;
    if (!k) state.filters.clear();
    else state.filters.has(k) ? state.filters.delete(k) : state.filters.add(k);
    state.screen === 'search' ? repaintSearchResults() : render();
  });
  on('[data-sort]', 'click', () => openSortSheet());
  if (state.screen === 'search') wireSearchResults();
  on('[data-clear-search]', 'click', () => { state.query = ''; state.filters.clear(); render(); $('#q')?.focus(); });
  on('[data-add-compare]', 'click', e => addCompare(e.currentTarget.dataset.addCompare));
  on('[data-drop]', 'click', e => { state.compare = state.compare.filter(x => x !== e.currentTarget.dataset.drop); save(); render(); });
  on('[data-reset-compare]', 'click', () => { state.compare = []; save(); render(); });
  on('[data-dtab]', 'click', e => { state.detailTab = e.currentTarget.dataset.dtab; render(); });
  on('[data-buy]', 'click', e => window.open(e.currentTarget.dataset.buy, '_blank', 'noopener'));
  on('[data-request]', 'click', e => submitRequest(e.currentTarget.dataset.request, { query: state.query, id: state.detailId }));
  on('[data-ingr-sheet]', 'click', () => openIngrSheet());
  on('[data-recent-sheet]', 'click', () => openRecentSheet());
  on('[data-pick-slot]', 'click', e => openPicker(+e.currentTarget.dataset.pickSlot));
  on('[data-share]', 'click', () => {
    const f = FOODS.find(x => x.id === state.detailId);
    if (navigator.share) navigator.share({ title: `${f.brand} ${f.name} — 발사탕`, url: location.href }).catch(() => { });
    else toast('링크를 복사했어요');
  });

  const q = $('#q', v);
  if (q) {
    let t;
    const apply = () => {
      clearTimeout(t);
      t = setTimeout(() => { state.query = q.value; repaintSearchResults(); }, 220);
    };
    q.addEventListener('input', apply);
    q.addEventListener('compositionend', apply);
    if (state.screen === 'search' && !state.query) setTimeout(() => q.focus(), 60);
  }

  /* 급여량 계산기 */
  const fw = $('#fw', v), fwr = $('#fwr', v);
  const setW = val => {
    const n = Math.max(0.5, Math.min(90, Number(val) || 5));
    state.feeding.weightKg = Math.round(n * 10) / 10; save(); render();
  };
  if (fw) fw.addEventListener('change', () => setW(fw.value));
  if (fwr) fwr.addEventListener('change', () => setW(fwr.value));
  on('[data-meals]', 'click', e => { state.feeding.meals = +e.currentTarget.dataset.meals; save(); render(); });
  on('[data-bag]', 'click', e => { state.feeding.bagG = +e.currentTarget.dataset.bag; save(); render(); });

  /* 맞춤 입력 — 한 화면이라 값이 바뀔 때마다 draft 에 담고, 제출할 때 확정한다 */
  const keepText = () => {
    const d = state.wizard.data;
    d.name = $('#wz-name')?.value.trim() ?? d.name;
    d.breed = $('#wz-breed')?.value.trim() ?? d.breed;
    const kg = $('#wz-kg')?.value;
    if (kg !== undefined && kg !== '') d.kg = Number(kg);
  };
  on('[data-wz-set]', 'click', e => {
    keepText();
    const { wzSet: key, wzVal: val, wzMulti: multi } = e.currentTarget.dataset;
    const d = state.wizard.data;
    if (multi) {
      const cur = new Set(d[key] || []);
      if (val === 'none') d[key] = cur.has('none') ? [] : ['none'];
      else { cur.delete('none'); cur.has(val) ? cur.delete(val) : cur.add(val); d[key] = [...cur]; }
    } else d[key] = d[key] === val ? null : val;
    const y = window.scrollY; render(); window.scrollTo(0, y);
  });
  on('[data-wz-submit]', 'click', () => {
    keepText();
    const d = state.wizard.data;
    const kg = Number(d.kg);
    if (!(kg >= 0.5 && kg <= 90)) {
      toast('몸무게를 0.5kg에서 90kg 사이로 적어주세요');
      $('#wz-kg')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      $('#wz-kg')?.focus();
      return;
    }
    state.pet = { ...d, kg };
    state.feeding.weightKg = kg;
    save(); go('custom');
  });

  $$('#tabbar button').forEach(b => b.onclick = () => {
    const k = b.dataset.tab;
    if (k === 'custom' && !state.pet) { go('wizard'); return; }
    go(k);
  });
}

/* ═══ 바텀시트 ═══ */
function sheet(title, bodyHtml, onWire) {
  const dim = $('#dim'), sh = $('#sheet');
  $('.sh-h', sh).textContent = title;
  $('.sh-b', sh).innerHTML = bodyHtml;
  dim.classList.add('on'); sh.classList.add('on'); document.body.classList.add('noscroll');
  onWire?.($('.sh-b', sh));
}
function closeSheet() {
  $('#dim').classList.remove('on'); $('#sheet').classList.remove('on');
  document.body.classList.remove('noscroll');
}
function openSortSheet() {
  sheet('정렬', Object.entries(SORT_LABEL).map(([k, l]) =>
    `<button class="press" data-s="${k}" style="display:flex;align-items:center;justify-content:space-between;width:100%;height:54px;font-size:15px;font-weight:${state.sort === k ? 800 : 500};color:${state.sort === k ? 'var(--purple700)' : 'var(--ink70)'};border-bottom:var(--divider)">${l}${state.sort === k ? icon('check', 18) : ''}</button>`).join(''),
    el => $$('[data-s]', el).forEach(b => b.onclick = () => { state.sort = b.dataset.s; closeSheet(); state.screen === 'search' ? repaintSearchResults() : render(); }));
}
function openIngrSheet() {
  const d = DETAIL[state.detailId] || {};
  const list = (d.ingr || []).slice().sort((a, b) => (a.rank || 99) - (b.rank || 99));
  sheet(`원료 ${list.length}개`, list.map(i => `
    <div style="display:flex;gap:10px;align-items:flex-start;padding:11px 0;border-bottom:var(--divider)">
      <span class="t-micro c-mute" style="width:20px;flex-shrink:0">${i.rank}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:${i.main ? 700 : 500};letter-spacing:-.03em">${esc(i.name)}
          ${i.safe === 'caution' ? '<span class="tag caution" style="margin-left:5px">주의</span>'
      : i.safe === 'danger' ? '<span class="tag caution" style="margin-left:5px">주의</span>'
        : i.safe === 'unknown' ? '<span class="tag pending" style="margin-left:5px">분류 전</span>' : ''}</div>
        ${i.basis ? `<p class="t-caption c-sub" style="margin-top:3px;font-weight:500">${esc(i.basis)}</p>` : ''}
      </div></div>`).join(''));
}
function openRecentSheet() {
  const list = state.recent.map(id => FOODS.find(f => f.id === id)).filter(Boolean).filter(f => !state.compare.includes(f.id));
  sheet('최근 본 사료', list.map(f => `<button class="row press" data-pick="${f.id}">
    ${well(f, 44)}<span class="row-b"><span class="row-name" style="display:block">${esc(f.brand)} ${esc(f.name)}</span></span>
    ${icon('plus', 18, 'chev')}</button>`).join('') || '<p class="t-bodySm c-sub" style="padding:20px 0">최근 본 사료가 없어요.</p>',
    el => $$('[data-pick]', el).forEach(b => b.onclick = () => { closeSheet(); addCompare(b.dataset.pick, false); }));
}

/* ═══ 시작 ═══ */
load();
state.screen = 'home';
render();
history.replaceState({ screen: 'home' }, '');
$('#dim').addEventListener('click', closeSheet);
