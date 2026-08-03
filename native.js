/* 네이티브 앱(Capacitor)에서만 동작하는 보정.
   웹 브라우저에서는 아무것도 하지 않으므로 같은 index.html 을 웹·앱이 공유한다. */
(function () {
  'use strict';
  const cap = window.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return;

  const P = cap.Plugins || {};
  document.documentElement.classList.add('native');

  /* 상태바 — 밝은 배경이므로 아이콘을 어둡게 */
  if (P.StatusBar) {
    P.StatusBar.setStyle({ style: 'LIGHT' }).catch(() => {});
    if (cap.getPlatform && cap.getPlatform() === 'android') {
      P.StatusBar.setBackgroundColor({ color: '#FAFAF8' }).catch(() => {});
    }
  }

  /* 안드로이드 하드웨어 뒤로가기 —
     앱 안에 되돌아갈 화면이 있으면 그쪽으로, 없으면 두 번 눌러야 종료. */
  if (P.App) {
    let exitArmed = false;
    let exitTimer = 0;
    P.App.addListener('backButton', () => {
      const depth = typeof navStack !== 'undefined' && Array.isArray(navStack) ? navStack.length : 0;
      if (depth > 0) { history.back(); return; }
      if (exitArmed) { P.App.exitApp(); return; }
      exitArmed = true;
      if (typeof toast === 'function') toast('한 번 더 누르면 종료돼요');
      clearTimeout(exitTimer);
      exitTimer = setTimeout(() => { exitArmed = false; }, 1800);
    }).catch(() => {});
  }
})();
