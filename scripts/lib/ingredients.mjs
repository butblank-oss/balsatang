/* 원료 사전 — 실제 내용은 engine/dict.js 에 있다.
   브라우저(어드민)와 Node 가 같은 사전을 봐야 해서 한 곳에만 둔다.
   이 파일은 예전 경로를 그대로 쓰는 스크립트들을 위한 얇은 통로다. */
export { ALIAS, INGREDIENTS, FUNCTIONAL, normalizeIngredient, lookupIngredient } from './shared.mjs';
