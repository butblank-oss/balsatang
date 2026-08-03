/* QA 공용 도구 — 서버, 브라우저, 자동 점검기 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

/* 저장소 뿌리와 결과 폴더. 어디서 실행하든 같은 곳을 본다. */
export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
export const OUT = process.env.QA_OUT || path.join(ROOT, '.qa-out');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json' };

export function serve(port) {
  const srv = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(fs.readFileSync(p));
  });
  return new Promise(r => srv.listen(port, () => r(srv)));
}

export const launch = () => chromium.launch({
  executablePath: process.env.QA_CHROME || undefined, args: ['--no-sandbox']
});

/* 발견 사항 모음 */
export const findings = [];
export function bug(surface, tc, severity, what) {
  findings.push({ surface, tc, severity, what });
  console.log(`  ${severity === 'P1' ? '🔴' : severity === 'P2' ? '🟠' : '🟡'} [${tc}] ${what}`);
}
export function pass(tc, what) { console.log(`  ✅ [${tc}] ${what}`); }

/* 페이지에 감시를 붙인다 — JS 오류, 404, 콘솔 에러 */
export function watch(pg, surface) {
  const log = { errors: [], missing: [], console: [] };
  pg.on('pageerror', e => log.errors.push(e.message));
  pg.on('console', m => { if (m.type() === 'error') log.console.push(m.text()); });
  pg.on('response', r => { if (r.status() >= 400 && new URL(r.url()).hostname === 'localhost') log.missing.push(`${r.status()} ${r.url()}`); });
  return log;
}

/* ── 자동 점검기 ─────────────────────────────────────── */

/* 가로 스크롤이 생겼는지 (본문이 화면 밖으로 삐져나감) */
export const overflowX = pg => pg.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);

/* 고정 바에 가려 못 읽는 요소 — 마지막 의미있는 요소가 하단 바 밑에 깔렸는지 */
export const hiddenUnderBar = pg => pg.evaluate(() => {
  const bar = document.querySelector('.tabbar:not([hidden]), .dock, .tabbar');
  if (!bar || bar.hidden) return null;
  const b = bar.getBoundingClientRect();
  if (b.height === 0) return null;
  window.scrollTo(0, document.body.scrollHeight);
  const els = [...document.querySelectorAll('#view *')].filter(e => {
    if (!e.textContent.trim()) return false;
    if (e.children.length) return false;
    /* 고정 바 자신의 내용물은 가려진 게 아니다 */
    if (e.closest('.dock, .tabbar')) return false;
    const r = e.getBoundingClientRect();
    return r.height > 0 && r.bottom > b.top + 2 && r.top < window.innerHeight;
  });
  return els.length ? els.map(e => e.textContent.trim().slice(0, 30)) : null;
});

/* 글자 대비 — WCAG AA. 본문 4.5:1, 큰 글자(24px 이상 또는 18.66px 이상 볼드) 3:1.
   반투명 배경은 아래 색과 합성해야 실제로 보이는 색이 나온다. 합성하지 않으면
   보라 위의 흰 반투명 배지가 '흰 배경에 흰 글자' 로 잘못 잡힌다. */
export const lowContrast = pg => pg.evaluate(() => {
  const lum = ([r, g, b]) => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const rgba = s => {
    const n = (s.match(/[\d.]+/g) || []).map(Number);
    return n.length ? { c: n.slice(0, 3), a: n.length > 3 ? n[3] : 1 } : null;
  };
  const over = (fg, bg) => fg.c.map((v, i) => Math.round(v * fg.a + bg[i] * (1 - fg.a)));

  /* 위에서부터 쌓인 배경을 순서대로 합성한다. 그림·그라데이션을 만나면 포기한다. */
  const bgOf = el => {
    const stack = [];
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const st = getComputedStyle(e);
      if (st.backgroundImage && st.backgroundImage !== 'none') return null;
      const c = rgba(st.backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; }
    }
    let base = [255, 255, 255];
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return base;
  };

  const out = [];
  for (const el of document.querySelectorAll('#view *, .tabbar *, .dock *, #wrap *, .panel *')) {
    if (el.children.length || !el.textContent.trim()) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || +st.opacity === 0) continue;
    const bg = bgOf(el);
    if (!bg) continue;
    const f = rgba(st.color);
    if (!f) continue;
    const fg = over(f, bg);
    const l1 = lum(fg), l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const px = parseFloat(st.fontSize), w = +st.fontWeight || 400;
    const big = px >= 24 || (px >= 18.66 && w >= 700);
    if (ratio < (big ? 3 : 4.5))
      out.push({
        text: el.textContent.trim().slice(0, 24), ratio: Math.round(ratio * 10) / 10,
        px: Math.round(px), fg: `rgb(${fg})`, bg: `rgb(${bg})`,
        sel: el.className || el.tagName
      });
  }
  return out;
});

/* 깨진 이미지 — 주소는 있는데 안 불러와진 것 */
export const brokenImages = pg => pg.evaluate(() =>
  [...document.images]
    .filter(i => i.currentSrc && i.complete && i.naturalWidth === 0)
    .map(i => i.getAttribute('src')));

/* 눌러도 아무 일 없는 요소 — 화면·URL·DOM·토스트 어느 것도 안 바뀜 */
export async function deadClicks(pg, selector = '[data-go],[data-go-detail],[data-tab],button,a') {
  const dead = [];
  const n = await pg.locator(selector).count();
  for (let i = 0; i < n; i++) {
    const el = pg.locator(selector).nth(i);
    if (!await el.isVisible().catch(() => false)) continue;
    const label = (await el.textContent().catch(() => '') || '').trim().slice(0, 26)
      || (await el.getAttribute('aria-label').catch(() => '')) || `#${i}`;
    const before = await pg.evaluate(() => ({
      html: document.body.innerHTML.length, url: location.href,
      screen: typeof state !== 'undefined' ? state.screen : null,
      toast: document.querySelector('.toast')?.classList.contains('on')
    }));
    await el.click({ timeout: 1500 }).catch(() => { });
    await pg.waitForTimeout(260);
    const after = await pg.evaluate(() => ({
      html: document.body.innerHTML.length, url: location.href,
      screen: typeof state !== 'undefined' ? state.screen : null,
      toast: document.querySelector('.toast')?.classList.contains('on')
    }));
    const changed = before.html !== after.html || before.url !== after.url
      || before.screen !== after.screen || (!before.toast && after.toast);
    if (!changed) dead.push(label);
    /* 화면이 바뀌었으면 더 훑을 수 없다 — 호출한 쪽이 다시 세팅한다 */
    if (before.screen !== after.screen || before.url !== after.url) return { dead, navigated: true };
  }
  return { dead, navigated: false };
}
