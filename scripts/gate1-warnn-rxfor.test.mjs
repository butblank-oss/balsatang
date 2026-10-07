/* 게이트1 회귀 — 화면에 그대로 찍히는 두 칸(warnN·rxFor)을 게이트가 지키는지.

   왜 있나: 둘 다 '게이트가 안 보는 칸' 이라 손으로 적은 값이 그대로 사용자에게 나갔다.

   warnN('주의성분 N종') — 아무 데서도 검증되지 않아 두 번 틀렸다.
     ① 수집 쪽이 0 으로 박아, 주의성분 6종인 사료가 '없음' 으로 나올 뻔했다.
     ② 심사 편집(apply-edits.mjs)이 cautionN 만 세어 dangerN 을 잃었다. 위험 성분이 든
        사료가 편집을 거치면 한 종씩 줄어든 채 발행됐다 — 수집·발행 쪽은 맞게 세고
        있어서 편집한 것만 조용히 틀려지는 모양이었다.
     경로를 하나 고쳐도 네 번째 경로가 또 생긴다. 그래서 게이트에서 잡는다.

   rxFor(처방식 용도) — 화면(app.js)이 모르는 키를 조용히 버린다. 그건 화면으로서 맞는
     처리지만(영문 코드를 사용자에게 보이지 않는다), 그 탓에 'kidny' 같은 오타를 넣으면
     게이트도 화면도 아무 말을 하지 않고 용도만 사라진다.

   실행: node scripts/gate1-warnn-rxfor.test.mjs  (npm run check 에 물려 있다) */
import assert from 'node:assert/strict';
import { checkItem } from './lib/shared.mjs';

/* 해당 검사까지 도달하도록 최소만 채운다. 뒤에서 ratings·ga 등으로 다른 fail 이 쌓이지만
   우리가 보는 건 코드 하나뿐이라 영향받지 않는다. */
const mk = proposed => ({
  stagingId: 'test_warn_rx',
  sources: [{ role: 'label', url: 'https://example.kr/a', fetchedAt: '2026-10-07' }],
  proposed: { rx: false, ...proposed },
  evidence: proposed.__ev ?? {}
});
/* ⚠ 코드만 보고 판정하면 안 된다. E_ENUM 은 ages·sizes 같은 다른 칸에서도 나는데,
   이 최소 항목은 그 칸들을 비워 두므로 rxFor 를 전혀 안 봐도 E_ENUM 이 있다 —
   처음에 코드만으로 걸렀더니 '모르는 키를 잡는다' 가 거짓으로 통과했다.
   어느 칸 때문인지 메시지로 좁힌다. */
const has = (proposed, code, msgPart) =>
  checkItem(mk(proposed), [], new Set()).fail
    .some(f => f.code === code && (!msgPart || f.msg.includes(msgPart)));

/* ═══ warnN ═══ */

/* 1. 위험 성분을 빼고 센 값은 탈락 — apply-edits 가 내던 바로 그 상태다. */
assert.ok(has({ facts: { cautionN: 6, dangerN: 1 }, warnN: 6 }, 'E_WARN_N'),
  'warnN 이 dangerN 을 빼고 세어졌으면 E_WARN_N 이 나야 합니다');

/* 2. 둘을 더한 값은 통과. */
assert.ok(!has({ facts: { cautionN: 6, dangerN: 1 }, warnN: 7 }, 'E_WARN_N'),
  'warnN = cautionN + dangerN 이면 통과해야 합니다');

/* 3. 0 으로 박아 둔 것도 탈락 — 수집 쪽이 내던 상태다. */
assert.ok(has({ facts: { cautionN: 6, dangerN: 1 }, warnN: 0 }, 'E_WARN_N'),
  'warnN 을 0 으로 박았으면 E_WARN_N 이 나야 합니다');

/* 4. dangerN 이 없으면 0 으로 센다 — cautionN 만으로 맞으면 통과해야 한다.
   이걸 안 지키면 위험 성분이 없는 사료가 전부 탈락한다. */
assert.ok(!has({ facts: { cautionN: 3 }, warnN: 3 }, 'E_WARN_N'),
  'dangerN 이 없으면 cautionN 만으로 세야 합니다');

/* 5. 주의성분이 정말 없으면 warnN 0 이 맞다. */
assert.ok(!has({ facts: { cautionN: 0, dangerN: 0 }, warnN: 0 }, 'E_WARN_N'),
  'cautionN·dangerN 이 0 이면 warnN 0 이 맞습니다');

/* 6. 아직 원료를 못 구한 항목은 면제 — cautionN 을 셀 수 없으면 warnN 도 검사하지 않는다.
   면제가 없으면 '자료 수집 중' 인 사료가 이 검사로 탈락해 보류 자체를 못 하게 된다. */
assert.ok(!has({ facts: { cautionN: null }, warnN: 0 }, 'E_WARN_N'),
  'cautionN 이 null 이면 warnN 을 검사하지 않아야 합니다');

/* ═══ rxFor ═══ */
const rxEv = { rxFor: { src: 0, quote: '수의사 처방 전용 제품' } };

/* 7. 허용 목록에 없는 키는 탈락 — 화면이 조용히 버리던 그 오타다. */
assert.ok(has({ rx: true, rxFor: ['kidny'], __ev: rxEv }, 'E_ENUM', 'rxFor'),
  'rxFor 에 모르는 키가 있으면 E_ENUM 이 나야 합니다');

/* 8. 허용 키는 통과. */
assert.ok(!has({ rx: true, rxFor: ['kidney'], __ev: rxEv }, 'E_ENUM', 'rxFor'),
  'rxFor 가 허용 키면 통과해야 합니다');

/* 9. 처방식이 아닌데 용도가 붙어 있으면 둘 중 하나가 틀렸다.
   화면은 rx 로만 갈라서 rx:false 면 rxFor 를 아예 읽지 않는다 — 조용히 무시된다. */
assert.ok(has({ rx: false, rxFor: ['kidney'], __ev: rxEv }, 'E_RX_FOR'),
  'rx 가 false 인데 rxFor 에 값이 있으면 E_RX_FOR 이 나야 합니다');

/* 10. 용도는 제조사 공식 문장이 근거다. 제품명을 보고 짐작하지 않는다. */
assert.ok(checkItem(mk({ rx: true, rxFor: ['kidney'] }), [], new Set())
  .fail.some(f => f.code === 'E_EVIDENCE' && f.msg.includes('rxFor')),
  'rxFor 에 값이 있는데 근거가 없으면 근거 누락이 나야 합니다');

/* 11. 공식 문장을 못 찾아 비워 둔 것은 정상이다 — 처방식이어도 용도를 짐작하지 않는다.
   대표 지시: "공식 문장을 못 찾으면 rxFor 를 비워 두고 이유를 적어 주세요." */
assert.ok(!has({ rx: true, rxFor: [] }, 'E_EVIDENCE') && !has({ rx: true, rxFor: [] }, 'E_RX_FOR'),
  'rxFor 가 빈 배열이면 근거를 요구하지 않아야 합니다');

/* 12. rxFor 자체가 없는 것도 정상 — 일반 사료가 대부분이다. */
assert.ok(!has({ rx: false }, 'E_RX_FOR') && !has({ rx: false }, 'E_ENUM', 'rxFor'),
  'rxFor 가 없으면 아무 것도 요구하지 않아야 합니다');

/* 13. 배열이 아니면 탈락 — 문자열 하나로 넣는 실수가 잦다. */
assert.ok(has({ rx: true, rxFor: 'kidney', __ev: rxEv }, 'E_ENUM', 'rxFor'),
  'rxFor 가 배열이 아니면 E_ENUM 이 나야 합니다');

console.log('✅ 게이트1 warnN·rxFor 회귀 통과 — 주의성분 수 일치 / 용도 허용값·모순·근거, 13케이스');
