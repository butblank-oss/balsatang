#!/usr/bin/env node
/* 검색엔진이 읽을 수 있는 사료·콘텐츠 페이지를 만든다.

   ── 왜 필요한가 ──
   화면 주소가 '#/food/…' 다. 검색엔진은 # 뒤를 다른 페이지로 보지 않아서,
   사료가 몇 종이든 홈 한 장만 색인한다. '오리젠 성분' 으로 검색해도 나올 수가 없다.
   그래서 사료·글마다 진짜 주소(/food/<id>/, /content/<id>/)를 가진 HTML 을 만든다.

   ── 사람이 열면 ──
   같은 앱이 그대로 뜬다. index.html 을 본으로 쓰고 <base href="/"> 만 넣어
   스크립트·스타일을 루트에서 읽는다. 앱이 켜지기 전에 주소를 '/#/food/<id>' 로
   바꿔 두면 앱은 평소처럼 그 화면을 연다. 앱이 그리는 내용과 이 파일에 적힌
   내용은 같은 데이터에서 나온다 — 검색엔진에만 다른 걸 보여 주지 않는다.

   ── 무엇을 만드나 ──
   · 분석이 끝난 사료만 (DETAIL 에 원료가 있는 것). '분석 준비 중' 은 내용이 없어 뺀다
   · 모든 콘텐츠 글
   · sitemap.xml — 위 페이지 전부 + 홈
   food/ · content/ 는 이 스크립트가 통째로 지우고 다시 만든다. 손으로 고치지 않는다.

   실행: node scripts/build-pages.mjs   (main 에 data.js·articles.js 가 바뀌면 Actions 가 돌린다) */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SITE_URL = 'https://balsatang.com';
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ── 데이터 — 화면과 같은 파일을 읽는다 ── */
const ctx = {};
vm.createContext(ctx);
for (const f of ['data.js', 'articles.js']) vm.runInContext(read(f).replace(/^const /gm, 'var '), ctx);
const { FOODS, DETAIL, ARTICLES } = ctx;

/* 본문 마크다운은 화면의 mdToHtml 을 그대로 빌려 쓴다. 옮겨 적으면 두 벌이 된다. */
const appSrc = read('app.js');
const grab = re => { const m = appSrc.match(re); if (!m) throw new Error('app.js 에서 찾지 못함: ' + re); return m[0]; };
vm.runInContext(
  grab(/^const esc = .*$/m).replace(/^const /, 'var ') + '\n' +
  grab(/^function mdToHtml\(src\) \{[\s\S]*?\n\}/m), ctx);
const { esc, mdToHtml } = ctx;

const TYPE_KO = { dry: '건식', wet: '습식', freeze_dried: '동결건조', air_dried: '에어드라이', raw: '화식', topping: '토핑' };
const AGE_KO = { all: '전연령', puppy: '퍼피', adult: '성견', senior: '시니어' };
const NUT = [['protein', '조단백'], ['fat', '조지방'], ['fiber', '조섬유'], ['moisture', '수분'], ['ash', '조회분'], ['carb', '탄수화물(추정)']];
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

/* ── 페이지 틀 ── */
const shell = read('index.html');
function page({ url, title, desc, image, type = 'website', hash, body, jsonld }) {
  let h = shell;
  const swap = (re, to) => { if (!re.test(h)) throw new Error('index.html 에서 찾지 못함: ' + re); h = h.replace(re, to); };
  swap(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  swap(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`);
  swap(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`);
  swap(/<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="${type}">`);
  swap(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`);
  swap(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`);
  swap(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
  if (image) h = h.replace(/(<meta name="twitter:card" content=")summary(">)/,
    `$1summary_large_image$2\n<meta property="og:image" content="${esc(image)}">`);
  /* 스크립트·스타일을 루트에서 읽게. 앱이 켜지기 전에 화면 주소를 맞춘다. */
  swap(/<meta charset="utf-8">/, `<meta charset="utf-8">\n<base href="/">\n<script>if(!location.hash)history.replaceState(null,'','/${hash}')</script>`);
  if (jsonld) h = h.replace('</head>', `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>\n</head>`);
  swap(/<main id="view"><\/main>/, `<main id="view"><article class="seo" style="padding:24px 20px 120px;line-height:1.7">${body}</article></main>`);
  return h;
}

function foodBody(f, d) {
  const n = d.nutrient || {};
  const ingr = (d.ingr || []).slice().sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const warns = ingr.filter(i => i.safe === 'caution' || i.safe === 'danger');
  const rows = NUT.filter(([k]) => n[k] != null).map(([k, l]) => `<tr><th>${l}</th><td>${n[k]}%</td></tr>`).join('');
  return `
  <p>${esc(f.brand)}</p>
  <h1>${esc(f.name)} 성분 분석</h1>
  <p>${[TYPE_KO[f.type] || f.type, (f.ages || []).map(a => AGE_KO[a] || a).join('·') || '전연령',
    f.rx ? '수의사 처방식' : (f.score != null ? `발사탕 점수 ${f.score}` : null), f.warnN ? `주의성분 ${f.warnN}종` : '주의성분 없음']
    .filter(Boolean).map(esc).join(' · ')}</p>${f.specOrigin === 'overseas' ? `
  <p>${esc(String(f.specNote || '').trim()
    || `※ ${f.brand} 글로벌에서 제시되는 기본 정보로서, 국내 사료관리법에 따른 제품 표시사항과 일부 다를 수 있습니다.`)}</p>` : ''}
  ${rows ? `<h2>보장성분</h2><table>${rows}</table>` : ''}
  ${ingr.length ? `<h2>원재료 (표기 순서)</h2><ol>${ingr.map(i => `<li>${esc(i.name)}${i.desc ? ` — ${esc(i.desc)}` : ''}</li>`).join('')}</ol>` : ''}
  ${warns.length ? `<h2>주의할 원료</h2><ul>${warns.map(i => `<li><b>${esc(i.name)}</b>${i.basis ? ` — ${esc(i.basis)}` : ''}</li>`).join('')}</ul>` : ''}
  <p><a href="/#/food/${encodeURIComponent(f.id)}">발사탕에서 급여량·가격까지 보기</a></p>`;
}

function foodDesc(f, d) {
  const n = d.nutrient || {};
  const top = (d.ingr || []).slice().sort((a, b) => (a.rank || 99) - (b.rank || 99)).slice(0, 3).map(i => i.name).join(', ');
  return cut(`${f.brand} ${f.name} 성분표 분석. ${top ? `주원료 ${top}. ` : ''}` +
    `${n.protein != null ? `조단백 ${n.protein}% · 조지방 ${n.fat}%. ` : ''}` +
    `${f.warnN ? `주의성분 ${f.warnN}종.` : '주의성분 없음.'} 광고 없이 성분표만 보고 정리했어요.`, 150);
}

/* ── 만들기 ── */
for (const dir of ['food', 'content']) fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
const write = (rel, html) => {
  const p = path.join(ROOT, rel, 'index.html');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, html);
};

const urls = [`${SITE_URL}/`];
const foods = FOODS.filter(f => f.status === 'published' && (DETAIL[f.id]?.ingr || []).length);
for (const f of foods) {
  const d = DETAIL[f.id];
  const url = `${SITE_URL}/food/${encodeURIComponent(f.id)}/`;
  write(`food/${f.id}`, page({
    url, hash: `#/food/${encodeURIComponent(f.id)}`,
    title: `${f.brand} ${f.name} 성분 분석 — 발사탕`,
    desc: foodDesc(f, d),
    image: /^https:\/\//.test(f.thumb || '') ? f.thumb : null,
    body: foodBody(f, d)
  }));
  urls.push(url);
}

for (const a of ARTICLES) {
  if (!/^[a-z0-9-]+$/i.test(a.id)) throw new Error(`글 id 를 주소로 쓸 수 없습니다: ${a.id}`);
  const url = `${SITE_URL}/content/${a.id}/`;
  write(`content/${a.id}`, page({
    url, type: 'article', hash: `#/글/${encodeURIComponent(a.id)}`,
    title: `${a.title} — 발사탕`,
    desc: cut(a.excerpt || a.body, 150),
    body: `<p>${esc(a.cat || '')}</p><h1>${esc(a.title)}</h1>${mdToHtml(a.body)}`,
    jsonld: { '@context': 'https://schema.org', '@type': 'Article', headline: a.title,
      description: cut(a.excerpt || a.body, 150), inLanguage: 'ko-KR', mainEntityOfPage: url,
      publisher: { '@type': 'Organization', name: '발사탕', url: `${SITE_URL}/` } }
  }));
  urls.push(url);
}

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n') + '\n</urlset>\n');

console.log(`검색용 페이지 — 사료 ${foods.length}종 (분석 준비 중 ${FOODS.length - foods.length}종 제외) · 글 ${ARTICLES.length}편 · sitemap ${urls.length}개 주소`);
