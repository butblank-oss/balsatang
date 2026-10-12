#!/usr/bin/env node
/* 콘텐츠 키워드 조사 — 네이버 검색광고(월간 검색 수) + NAVER API HUB 데이터랩(추세).

   쓰는 법
     node scripts/keywords.mjs 강아지사료 사료첨가물 노견사료      (씨앗 검색어, 최대 5개)
     node scripts/keywords.mjs --json 강아지사료                    (결과를 JSON 으로)

   필요한 환경 변수 (클라우드 환경 설정 → Network secrets 또는 환경 변수. 저장소·채팅에 넣지 않는다)
     NAVER_AD_API_KEY       검색광고 '액세스라이선스'
     NAVER_AD_SECRET        검색광고 '비밀키'
     NAVER_AD_CUSTOMER_ID   검색광고 고객 ID(숫자)
     NCP_APIHUB_CLIENT_ID / NCP_APIHUB_CLIENT_SECRET   (선택) NAVER API HUB 앱의 Client ID/Secret — 있으면 최근 3개월 추세도 붙인다

   키가 없으면 무엇이 없는지만 말하고 끝난다. 숫자를 지어내지 않는다.
   검색광고 키워드 도구는 공백 없는 검색어만 받는다 — 씨앗 검색어의 공백은 지우고 보낸다. */
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const seeds = args.filter(a => !a.startsWith('--')).map(s => s.replace(/\s+/g, '')).filter(Boolean).slice(0, 5);
if (!seeds.length) { console.error('씨앗 검색어를 1~5개 주세요. 예: node scripts/keywords.mjs 강아지사료 사료첨가물'); process.exit(1); }

const env = k => (process.env[k] || '').trim();
const AD = { key: env('NAVER_AD_API_KEY'), secret: env('NAVER_AD_SECRET'), customer: env('NAVER_AD_CUSTOMER_ID') };
const HUB = { id: env('NCP_APIHUB_CLIENT_ID'), secret: env('NCP_APIHUB_CLIENT_SECRET') };

/* ── 검색광고 키워드 도구: 월간 검색 수(PC·모바일)와 연관 검색어 ── */
async function keywordTool(hints) {
  const uri = '/keywordstool', ts = String(Date.now());
  const sig = crypto.createHmac('sha256', AD.secret).update(`${ts}.GET.${uri}`).digest('base64');
  const url = `https://api.searchad.naver.com${uri}?hintKeywords=${encodeURIComponent(hints.join(','))}&showDetail=1`;
  const r = await fetch(url, { headers: { 'X-Timestamp': ts, 'X-API-KEY': AD.key, 'X-Customer': AD.customer, 'X-Signature': sig } });
  if (!r.ok) throw new Error(`검색광고 API ${r.status}: ${(await r.text()).slice(0, 300)}`);
  /* 검색 수가 아주 적으면 숫자 대신 "< 10" 문자열이 온다 — 5 로 어림하지 않고 0 으로 두고 표시는 그대로 */
  const n = v => (typeof v === 'number' ? v : 0);
  return ((await r.json()).keywordList || []).map(k => ({
    keyword: k.relKeyword, pc: k.monthlyPcQcCnt, mobile: k.monthlyMobileQcCnt,
    total: n(k.monthlyPcQcCnt) + n(k.monthlyMobileQcCnt), competition: k.compIdx
  }));
}

/* ── NAVER API HUB 데이터랩 검색어 트렌드: 최근 3개월 주간 추세(상대값 0~100) ── */
async function trend(words) {
  const end = new Date(), start = new Date(end - 90 * 864e5), d = x => x.toISOString().slice(0, 10);
  const r = await fetch('https://naverapihub.apigw.ntruss.com/search-trend/v1/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-NCP-APIGW-API-KEY-ID': HUB.id, 'X-NCP-APIGW-API-KEY': HUB.secret },
    body: JSON.stringify({ startDate: d(start), endDate: d(end), timeUnit: 'week',
      keywordGroups: words.slice(0, 5).map(w => ({ groupName: w, keywords: [w] })) })
  });
  if (!r.ok) throw new Error(`API HUB 데이터랩 ${r.status}: ${(await r.text()).slice(0, 300)}`);
  /* 첫 4주 평균 대비 마지막 4주 평균 — 오르는지 내리는지만 본다 */
  return Object.fromEntries(((await r.json()).results || []).map(g => {
    const v = (g.data || []).map(p => p.ratio), avg = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
    const head = avg(v.slice(0, 4)), tail = avg(v.slice(-4));
    return [g.title, { last4: Math.round(tail * 10) / 10, change: head ? Math.round((tail / head - 1) * 100) : null }];
  }));
}

const missing = [!AD.key && 'NAVER_AD_API_KEY', !AD.secret && 'NAVER_AD_SECRET', !AD.customer && 'NAVER_AD_CUSTOMER_ID'].filter(Boolean);
if (missing.length) { console.error(`검색광고 키가 없습니다: ${missing.join(', ')} — 클라우드 환경 설정에 넣고 새 세션에서 다시 실행하세요.`); process.exit(2); }

const list = (await keywordTool(seeds)).sort((a, b) => b.total - a.total);
let tr = null;
if (HUB.id && HUB.secret) {
  try { tr = await trend(list.slice(0, 5).map(k => k.keyword)); }
  catch (e) { console.error('추세는 건너뜀 —', e.message); }
}

if (asJson) { console.log(JSON.stringify({ seeds, at: new Date().toISOString(), keywords: list, trend: tr }, null, 2)); process.exit(0); }
console.log(`씨앗: ${seeds.join(', ')} · 연관 검색어 ${list.length}개 (월간 검색 수 많은 순, 위 30개)\n`);
console.log('검색어'.padEnd(24) + 'PC'.padStart(8) + '모바일'.padStart(8) + '합계'.padStart(9) + '  경쟁');
for (const k of list.slice(0, 30)) console.log(String(k.keyword).padEnd(24) + String(k.pc).padStart(8) + String(k.mobile).padStart(8) + String(k.total).padStart(9) + '  ' + (k.competition || ''));
if (tr) { console.log('\n최근 3개월 추세 (위 5개, 첫 4주 대비 마지막 4주)'); for (const [w, t] of Object.entries(tr)) console.log(`  ${w}: ${t.change == null ? '-' : (t.change > 0 ? '+' : '') + t.change + '%'}`); }
