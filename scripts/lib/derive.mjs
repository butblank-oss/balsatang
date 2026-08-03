/* 판정 생성 — 실제 로직은 engine/engine.js 에 있다.
   어드민이 브라우저에서 같은 계산을 하기 때문에 로직을 한 벌만 둔다.
   이 파일은 예전 경로를 그대로 쓰는 스크립트들을 위한 얇은 통로다. */
export {
  deriveNutrient, deriveIngredients, deriveDist, deriveFuncIngr,
  deriveVerdict, deriveFit, deriveDetail, fillPhrase, phraseVars, FUNC_LABEL
} from './shared.mjs';
