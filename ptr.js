/* 당겨서 새로고침 — 화면 맨 위에서 아래로 당겼다 놓으면 새로고침한다(대표 요청 2026-10-09).
   홈 화면에 추가한 웹앱·네이티브 앱·인앱 브라우저는 브라우저 기본 기능이 없어서 직접 만든다.
   브라우저 기본 당김과 겹치지 않게 html 에 overscroll-behavior-y:none 을 둔다(app.css). */
(function () {
  'use strict';
  const MAX = 96, READY = 68;           // 표시 이동 최대·새로고침 기준(px)
  const el = document.createElement('div');
  el.className = 'ptr';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><circle class="ptr-c" cx="12" cy="12" r="9" fill="none" stroke-width="2.4" stroke-linecap="round"/></svg>';
  document.body.appendChild(el);

  let y0 = 0, x0 = 0, dist = 0, on = false, busy = false;
  const blocked = t => document.body.classList.contains('noscroll') ||
    (t && t.closest && t.closest('.sheet,.dim,input,textarea,select,[contenteditable],.chiprow,.h-menu'));
  const paint = d => {
    const p = Math.min(d / READY, 1);
    el.style.transform = `translate(-50%, ${Math.min(d, MAX) - 52}px) rotate(${p * 270}deg)`;
    el.style.opacity = String(Math.min(1, d / 24));
    el.style.setProperty('--ptrP', p.toFixed(3));
    el.classList.toggle('ready', d >= READY);
  };
  const reset = () => { el.classList.remove('ready', 'spin'); el.style.transition = 'transform .2s, opacity .2s'; el.style.opacity = '0'; el.style.transform = 'translate(-50%, -52px)'; };

  addEventListener('touchstart', e => {
    if (busy || e.touches.length !== 1 || window.scrollY > 0 || blocked(e.target)) return;
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dist = 0; on = true;
    el.style.transition = 'none';
  }, { passive: true });

  addEventListener('touchmove', e => {
    if (!on) return;
    const dy = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0;
    if (window.scrollY > 0 || dy <= 0 || (dist === 0 && Math.abs(dx) > Math.abs(dy))) { if (dist) reset(); on = false; return; }
    dist = dy * 0.5;                    // 당기는 만큼의 절반만 따라오게(저항감)
    paint(dist);
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  addEventListener('touchend', () => {
    if (!on) return; on = false;
    if (dist < READY) { reset(); return; }
    busy = true;
    el.style.transition = 'transform .2s';
    el.style.transform = `translate(-50%, ${READY - 40}px)`;
    el.classList.add('spin');
    if (window.Track && Track.track) try { Track.track('pull_refresh'); } catch (_) {}
    setTimeout(() => location.reload(), 350);
  });
  addEventListener('touchcancel', () => { if (on) { on = false; reset(); } });
})();
