/* 사용 기록 — 익명 이벤트를 Supabase 에 쌓는다.

   ── 무엇을 남기나 ──
   이 기기에서 처음 만든 무작위 번호(기기 ID)와, 어떤 화면을 열고 어떤 버튼을
   눌렀는지만 남긴다. 이름·몸무게 같은 아이 정보, IP, 정확한 위치는 보내지 않는다.
   개인정보처리방침(legal.js)이 이 파일과 같은 말을 해야 한다. 여기서 보내는 값을
   늘리면 방침부터 고친다.

   ── 꺼져 있는 조건 ──
   · TRACK_CFG 의 url·key 가 비어 있으면 아무것도 보내지 않는다 (지금 기본값)
   · 사용자가 개인정보처리방침 화면에서 '기록 끄기' 를 누르면 보내지 않는다
   · 브라우저의 '추적 안 함(DNT·GPC)' 이 켜져 있으면 보내지 않는다

   ── 키가 공개돼도 되는 이유 ──
   anon 키는 원래 브라우저에 실리는 값이다. DB 쪽 RLS 가 anon 에게 '넣기' 만
   허락하고 '읽기' 는 막는다. 어드민은 운영자 계정으로 로그인해야 읽는다.
   (설치 방법: balsatang-admin 저장소 analytics/README.md) */
(function (global) {
  'use strict';

  const TRACK_CFG = {
    url: '',      /* 예: 'https://abcd1234.supabase.co' */
    key: ''       /* Supabase anon(public) 키 */
  };

  const K_DEVICE = 'balsatang.did';
  const K_SESSION = 'balsatang.sid';
  const K_OFF = 'balsatang.noTrack';
  const SESSION_IDLE_MS = 30 * 60 * 1000;
  const FLUSH_MS = 4000;
  const MAX_BATCH = 20;

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { } },
    del(k) { try { localStorage.removeItem(k); } catch { } }
  };
  const rid = () => (global.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  const cut = (s, n) => (s == null ? null : String(s).slice(0, n));

  const optedOut = () => ls.get(K_OFF) === '1';
  const dnt = () => navigator.doNotTrack === '1' || global.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  const enabled = () => !!(TRACK_CFG.url && TRACK_CFG.key) && !optedOut() && !dnt();

  /* ── 기기·세션 ── */
  function device() {
    let id = ls.get(K_DEVICE), isNew = false;
    if (!id) {
      id = rid(); isNew = true; ls.set(K_DEVICE, id);
    }
    /* 기록을 붙이기 전부터 쓰던 사람은 신규가 아니다 — 찜·비교함이 이미 있으면 재방문 */
    if (isNew && ls.get('balsatang.v2')) isNew = false;
    return { id, isNew };
  }

  function session() {
    const now = Date.now();
    let s = null;
    try { s = JSON.parse(ls.get(K_SESSION) || 'null'); } catch { }
    const fresh = !s || !s.id || now - (s.last || 0) > SESSION_IDLE_MS;
    if (fresh) s = { id: rid(), start: now, n: 0 };
    s.last = now;
    ls.set(K_SESSION, JSON.stringify(s));
    return { id: s.id, fresh };
  }

  function env() {
    const ua = navigator.userAgent || '';
    const cap = global.Capacitor;
    const app = cap && cap.isNativePlatform && cap.isNativePlatform() ? (cap.getPlatform?.() || 'native') : 'web';
    const os = /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android'
      : /Mac OS X/.test(ua) ? 'mac' : /Windows/.test(ua) ? 'windows' : /Linux/.test(ua) ? 'linux' : 'other';
    const browser = /KAKAOTALK/i.test(ua) ? 'kakaotalk' : /NAVER\(inapp/i.test(ua) ? 'naver'
      : /Instagram/i.test(ua) ? 'instagram' : /FBAN|FBAV/i.test(ua) ? 'facebook'
        : /SamsungBrowser/i.test(ua) ? 'samsung' : /Edg\//.test(ua) ? 'edge'
          : /CriOS|Chrome\//.test(ua) ? 'chrome' : /Firefox|FxiOS/.test(ua) ? 'firefox'
            : /Safari/.test(ua) ? 'safari' : 'other';
    const w = global.innerWidth || 0;
    const kind = /iPad|Tablet/i.test(ua) || (w >= 700 && /Android/.test(ua) && !/Mobile/.test(ua)) ? 'tablet'
      : /Mobi|iPhone|Android/i.test(ua) ? 'mobile' : 'desktop';
    return { app, os, browser, device: kind, lang: cut(navigator.language, 16), vw: w };
  }

  /* 들어온 곳 — 외부 사이트면 호스트만 남긴다. 경로엔 검색어 같은 게 들어 있을 수 있다. */
  function acquisition() {
    const q = new URLSearchParams(location.search);
    let ref = null;
    try {
      const r = document.referrer ? new URL(document.referrer) : null;
      if (r && r.hostname !== location.hostname) ref = r.hostname.replace(/^www\./, '');
    } catch { }
    return {
      ref: cut(ref, 120),
      utm_source: cut(q.get('utm_source'), 100),
      utm_medium: cut(q.get('utm_medium'), 100),
      utm_campaign: cut(q.get('utm_campaign'), 100)
    };
  }

  /* ── 보내기 ── */
  let queue = [];
  let timer = 0;
  let base = null;          /* 세션 내내 같은 값 */

  function send(rows, beacon) {
    if (!rows.length || !enabled()) return;
    try {
      fetch(TRACK_CFG.url.replace(/\/$/, '') + '/rest/v1/events', {
        method: 'POST',
        keepalive: !!beacon,
        headers: {
          'Content-Type': 'application/json',
          apikey: TRACK_CFG.key,
          Authorization: 'Bearer ' + TRACK_CFG.key,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(rows)
      }).catch(() => { });
    } catch { }
  }
  function flush(beacon) {
    clearTimeout(timer); timer = 0;
    const rows = queue; queue = [];
    /* keepalive 는 64KB 까지라 나눠 보낸다 */
    for (let i = 0; i < rows.length; i += MAX_BATCH) send(rows.slice(i, i + MAX_BATCH), beacon);
  }

  function track(name, props) {
    if (!enabled()) return;
    try {
      const s = session();
      if (s.fresh || !base) startSession(s);
      queue.push({
        ...base,
        session_id: s.id,
        name: String(name).slice(0, 40),
        props: props || {},
        screen: cut(location.hash || '#/', 200),
        client_ts: new Date().toISOString()
      });
      if (queue.length >= MAX_BATCH) flush();
      else if (!timer) timer = setTimeout(flush, FLUSH_MS);
    } catch { }
  }

  let starting = false;
  function startSession(s) {
    if (starting) return;
    starting = true;
    const d = device();
    base = { device_id: d.id, ...env(), ...acquisition() };
    if (s.fresh) {
      if (d.isNew) track('first_visit', { landing: cut(location.hash || '#/', 200) });
      track('session_start', { landing: cut(location.hash || '#/', 200) });
    }
    starting = false;
  }

  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
  addEventListener('pagehide', () => flush(true));

  /* ── 화면 · 검색 · 오류 ── */
  let lastScreen = null, lastAt = 0;
  function screenView(screen, extra) {
    const key = screen + '|' + (extra && extra.id || '');
    if (key === lastScreen) return;
    const now = Date.now();
    track('screen_view', { screen, ...(extra || {}), prev: lastScreen ? lastScreen.split('|')[0] : null,
      prev_ms: lastScreen ? now - lastAt : null });
    lastScreen = key; lastAt = now;
  }

  /* 검색어는 치는 도중의 'ㅅ' '사' '사료' 를 다 남기지 않는다. 손을 멈춘 뒤 한 번. */
  let sTimer = 0, sLast = '';
  function search(q, n) {
    clearTimeout(sTimer);
    const t = String(q || '').trim();
    if (!t) return;
    sTimer = setTimeout(() => {
      if (t === sLast) return;
      sLast = t;
      track('search', { q: t.slice(0, 60), n });
    }, 1200);
  }

  let errs = 0;
  addEventListener('error', e => {
    if (errs++ >= 5) return;
    track('js_error', { msg: cut(e.message, 200), src: cut((e.filename || '').split('/').pop(), 80), line: e.lineno || null });
  });

  global.Track = {
    track, screenView, search,
    isOn: () => !optedOut(),
    setOn(on) {
      if (on) { ls.del(K_OFF); track('tracking_on'); }
      else { track('tracking_off'); flush(true); ls.set(K_OFF, '1'); ls.del(K_DEVICE); ls.del(K_SESSION); base = null; }
    }
  };
})(window);
