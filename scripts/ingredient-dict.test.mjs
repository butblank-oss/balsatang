/* 원료 사전 회귀 테스트 — 사전 alias·산지 수식어를 보강할 때 기존 발행 사료의
   원료 분류가 바뀌지 않는지 기계가 증명한다.

   왜 있나: 수입 사료는 원료마다 원산지('네덜란드 양고기')를 붙이고, 라벨 표기가
   사전 표제어와 글자만 달라도('정제염' vs '정제소금') '모름' 으로 빠진다. 그러면
   deriveDist 가 주의 성분을 못 세어 첨가물 점수가 부풀고, 주재료가 모름이면
   '분류 못한 원료' 카드가 상세 화면을 덮는다. 사전을 넓혀 고치되, 그 변경이
   이미 발행된 사료의 점수를 소급해 바꾸면 안 된다(DATA-POLICY §4.3).

   어떻게 증명하나: 수정 직전(origin/main) 엔진으로 발행 사료 원료를 분류한 결과를
   fixtures/ingredient-baseline.json 에 박제해 두고, 지금 엔진의 분류와 대조한다.
   하나라도 달라지면 재검증 때 그 사료 점수가 움직인다는 뜻이라 실패시킨다.
   (저장값 DETAIL 이 아니라 baseline 과 대조하는 이유: 저장값은 더 과거 엔진이 만든
   것이라 이번 diff 와 무관한 어긋남까지 잡혀 거짓 경보가 난다. baseline 은 '수정
   직전' 이라 오직 이번 diff 만 본다.)

   baseline 갱신: 발행 사료를 재검증해 분류를 의도적으로 바꿀 때만 다시 생성한다.
     git show origin/main:engine/* 로 로드해 발행분 원료를 분류 → fixtures 에 쓴다.

   실행: node scripts/ingredient-dict.test.mjs  (npm run check 에 물려 있다) */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookupIngredient } from './lib/shared.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { foods } = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'scripts/fixtures/ingredient-baseline.json'), 'utf8'));

/* ── 1. 소급 변경 없음 ──
   발행 사료 원료를 지금 엔진으로 분류한 결과가 baseline(수정 직전)과 같아야 한다. */
let drift = 0;
for (const { name, cat, safe } of foods) {
  const r = lookupIngredient(name);
  if (r.cat !== cat || r.safe !== safe) {
    drift++;
    console.log(`  ✗ '${name}': ${cat}/${safe} → ${r.cat}/${r.safe}`);
  }
}
assert.equal(drift, 0, `이번 변경이 발행 사료 원료 ${drift}건의 분류를 바꿨습니다 (소급 변경 금지)`);

/* ── 2. 효과 재현 — 이 PR 이 새로 추가한 매칭만 ──
   정제염(소금↔염 글자차 alias)과 네덜란드·덴마크 산지 수식어. 뉴질랜드·호주 등
   나머지 산지와 통고등어·해조분은 이미 main 에 있으므로 여기서 다루지 않는다. */
const nowKnown = [
  ['정제염', 'other', 'caution'],       // alias 추가 (STRIP 으로는 소금↔염 글자차를 못 잡음)
  ['네덜란드 닭고기', 'meat', 'safe'],   // STRIP 에 네덜란드 추가
  ['덴마크 연어', 'fish', 'safe'],       // STRIP 에 덴마크 추가
];
for (const [raw, cat, safe] of nowKnown) {
  const r = lookupIngredient(raw);
  assert.ok(r.known, `아직 모름: '${raw}' 가 사전에 안 잡힙니다`);
  assert.equal(r.cat, cat, `'${raw}' cat 기대 ${cat}, 실제 ${r.cat}`);
  assert.equal(r.safe, safe, `'${raw}' safe 기대 ${safe}, 실제 ${r.safe}`);
}

/* ── 2-1. 로얄캐닌 라벨에서 '사전에 없음' 으로 빠지던 원료 (2026-10-07 추가) ──
   주의(caution) 로 넣은 것은 출처·종류가 표기되지 않는 원료다. 나머지는 양호. */
for (const [raw, safe] of [
  ['옥수수가루', 'caution'], ['쌀가루', 'caution'], ['밀 글루텐', 'caution'],
  ['동물성 유도단백질(닭, 칠면조)', 'caution'], ['항산화제', 'caution'], ['식물성 유지', 'caution'],
  ['프럭토올리고당', 'safe'], ['차전자피식이섬유', 'safe'], ['낙산나트륨', 'safe'], ['보리지유', 'safe'],
  ['뮤코다당단백(콘드로이틴의 원료)', 'safe'], ['아미노산제 합제', 'safe'], ['철', 'safe'],
  ['L-타이로신', 'safe'], ['산화마그네슘', 'safe'], ['양조효모', 'caution']
]) {
  const r = lookupIngredient(raw);
  assert.ok(r.known, `아직 모름: '${raw}'`);
  assert.equal(r.safe, safe, `'${raw}' safe 기대 ${safe}, 실제 ${r.safe}`);
}

/* ── 3. 기존 소금 표기가 여전히 caution 인지 (정제염 alias 추가가 깨뜨리지 않았나) ── */
for (const raw of ['소금', '염', '정제소금', '정제 소금', '정제염']) {
  assert.equal(lookupIngredient(raw).safe, 'caution', `'${raw}' 가 caution 이 아닙니다`);
}

console.log(`✅ 원료 사전 회귀 통과 — baseline 원료 ${foods.length}개 분류 불변, 신규 매칭 ${nowKnown.length}건, 소금 표기 5종 유지`);
