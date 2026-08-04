/* 브라우저와 Node 가 같은 로직을 쓰게 잇는 다리.

   채점·원료 판정·판정 카드 생성은 engine/engine.js 한 곳에만 있다.
   Node 는 여기서 읽어 내보내고, 어드민(admin.balsatang.com)은 같은 파일을
   https://balsatang.com/engine/ 에서 <script> 로 읽는다. 도메인이 갈려도 한 벌이다.
   두 벌로 나뉘면 반드시 어긋난다 — 예전 어드민이 그렇게 어긋나서
   구매 링크를 통째로 버리는 파일을 내보내고 있었다.

   원료 사전(dict.js)과 문구 템플릿(phrases.js)도 같은 방식으로 공유한다.
   셋 다 선언이 한 줄이라 어드민이 그 줄만 갈아끼워 커밋할 수 있다. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const admin = join(dirname(fileURLToPath(import.meta.url)), '../../engine');
const read = f => readFileSync(join(admin, f), 'utf8');

/* 세 파일을 한 스코프에서 이어 붙여 실행한다. engine 은 dict·phrases 를 참조한다. */
const scope = {};
/* policy 와 gate1 은 engine 의 값을 참조하므로 순서가 중요하다.
   dict → phrases → engine → policy → gate1. */
new Function('globalThis', read('dict.js') + read('phrases.js') + read('engine.js') +
  read('policy.js') + read('gate1.js') + read('label.js') +
  '\n;globalThis.DICT=DICT;globalThis.PHRASES=PHRASES;').call(scope, scope);

export const POLICY = scope.POLICY;
export const GATE1 = scope.GATE1;
export const LABEL = scope.LABEL;
export const { checkItem, draftTodo } = GATE1;
export const DICT = scope.DICT;
export const PHRASES = scope.PHRASES;
export const ENGINE = scope.ENGINE;

export const ALIAS = DICT.alias;
export const INGREDIENTS = DICT.ingredients;
export const FUNCTIONAL = DICT.functional;

export const {
  normalizeIngredient, lookupIngredient,
  rateCarb, rateQuality, rateAdditive, rateValue, rateAll, computeDmCarb,
  computeScore, SCORE_WEIGHT, RUBRIC_TEXT, REQUIRED_FACT_KEYS,
  deriveNutrient, deriveIngredients, deriveDist, deriveFuncIngr,
  deriveVerdict, deriveFit, deriveDetail,
  fillPhrase, phraseVars, FUNC_LABEL,
  strengthOf, strengthMap, publishRecord
} = ENGINE;
