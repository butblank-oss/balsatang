/* 채점 기준 — 실제 로직은 engine/engine.js 에 있다.
   AI 가 아니라 코드가 점수를 매긴다. 수집 AI 의 일은 "사실을 출처와 함께
   뽑아오는 것" 까지고, 점수는 엔진이 계산한다. 기준 근거는 DATA-POLICY 4장.

   어드민도 브라우저에서 같은 루브릭으로 재계산하기 때문에 한 벌만 둔다.
   이 파일은 예전 경로를 그대로 쓰는 스크립트들을 위한 얇은 통로다. */
export {
  rateCarb, rateQuality, rateAdditive, rateValue, rateAll,
  computeDmCarb, RUBRIC_TEXT, REQUIRED_FACT_KEYS
} from './shared.mjs';
