#!/usr/bin/env node
/* 상세 화면 데이터(DETAIL)가 없는 사료를 채운다.

   merge-approved 가 DETAIL 을 만들게 되기 전에 발행된 사료들은
   상세 화면에서 판정 카드도, 영양 프로파일도, 원재료 목록도 비어 있다.
   그 사료들의 보장성분표와 원재료 목록을 모아 이 파일에 적어 두고 한 번에 채운다.

     node scripts/backfill-detail.mjs --dry   무엇이 채워질지만 본다
     node scripts/backfill-detail.mjs         data.js 에 반영한다

   여기 없는 사료는 건드리지 않는다. 자료가 없으면 비워 두는 게 맞다.
*/
import { readFile, writeFile } from 'node:fs/promises';
import { deriveDetail } from './lib/derive.mjs';
import { loadFoods } from './lib/schema.mjs';

const DATA_JS = 'data.js';
const DRY = process.argv.includes('--dry');

/* 라벨·공식 성분표에서 읽은 값. 원재료는 표기 순서 그대로. */
const SOURCE = {
  '건강백서 건강한 관절': {
    ga: { protein: 27, fat: 15, fiber: 5, ash: 9.5, moisture: 12, kcalPerKg: 3954 },
    ingredients: ['흰살생선어분', '쌀', '옥수수글루텐', '옥수수', '계유', '소맥', '비트펄프',
      '제올라이트', '프락토올리고당', '바나나분말', '연어어분', '프로폴리스', '유카추출물',
      '밀크씨슬', '야채믹스', '토코페롤', '로즈마리 추출물', '향미제', '혼합인산칼슘(MDCP)',
      '석회석분말', '치즈', '계육분', '정제소금', '혼합광물질류합제', '미량광물질 합제',
      '비타민합제', '염화칼륨', '뮤코다당(상어연골)', '염화콜린', '글루코사민', '불활성효모(맥주효모)']
  },
  '건강백서 건강한 피부': {
    ga: { protein: 27, fat: 15, fiber: 5, ash: 9, moisture: 12, kcalPerKg: 3972 },
    ingredients: ['연어 어분(가수분해연어어분)', '쌀', '옥수수', '옥수수글루텐', '계유',
      '흰살생선어분', '연어어분', '비트펄프', '제올라이트', '프락토올리고당', '바나나분말',
      '프로폴리스', '유카추출물', '밀크씨슬', '야채믹스', '토코페롤', '로즈마리 추출물',
      '소맥', '향미제', '혼합인산칼슘(MDCP)', '치즈', '석회석분말', '계육분', '정제소금',
      '혼합광물질류합제', '미량광물질 합제', '비타민합제', '염화칼륨', '염화콜린']
  },
  '식스프리 플러스 인도어 오리고기&연어': {
    ga: { protein: 27, fat: 10, fiber: 6, ash: 8, moisture: 11, kcalPerKg: 3120 },
    ingredients: ['동물성단백질(건조 분쇄된 신선한 오리고기, 연어 그리고 닭고기)', '유기농쌀',
      '유기농옥수수글루텐', '유기농현미', '유기농 귀리', '유기농옥수수', '유기농보리',
      '정제계유', '유기농참깨박', '천연향미제', '유기농아마씨', '유기농해바라기씨',
      '유기농비트펄프', '유기농녹두', '유기농메밀', '유기농고구마', '맥반석', '유기농당근',
      '유기농호박', '유기농호박씨', '혼합인산칼슘', '유기농해바라기박', '비타민프리믹스',
      '미네랄프리믹스', '탄산칼슘', '야채믹스', '염화콜린', '로즈마리 추출물', '비타민C',
      '라이신', '메티오닌', '천일염', '유카추출물']
  },
  '클래식': {
    ga: { protein: 25, fat: 10, fiber: 6, ash: 12, moisture: 10, kcalPerKg: 3090 },
    ingredients: ['닭고기 분말', '곡류', '식물성 단백질류', '가수분해단백질(닭)', '육분', '계유',
      '비트펄프', '맥주효모', 'L-라이신', 'DL-메치오닌', 'L-트레오닌', '프로폴리스',
      '프락토올리고당', '유카추출물', '천연 항산화제', '토코페롤', '로즈마리 오일',
      '비타민 보충제', '염화콜린', '미네랄 보충제']
  },
  '퍼포먼스 어덜트': {
    ga: { protein: 26, fat: 16, fiber: 3, ash: 9, moisture: 12, kcalPerKg: 4170 },
    ingredients: ['생닭고기', '닭고기분', '병아리콩', '렌틸콩', '완두', '고구마', '바나나분말',
      '닭기름', '가수분해 닭고기분(천연향미제)', '계란분말', '가수분해연어', '아마종실',
      '비트펄프', '맥주효모', '프로바이오틱스', '프리바이오틱스', '커큐민', '뷰티르산',
      '글루코사민', '콘드로이틴(뮤코다당)', '키토산', 'L-카르니틴', '한약제제추출물',
      '베타카로틴', '탄산칼슘', '인산칼슘', 'DL-메치오닌', '염화칼륨', '비타민프리믹스',
      '미네랄프리믹스', '유기태미네랄', '페뉴그릭추출물', '유카추출물', '천연항산화제',
      'L-트립토판', '프로테아제', '베리믹스']
  },
  '울트라 초이스': {
    ga: { protein: 20, fat: 7, fiber: 5.5, ash: 10, moisture: 12 },
    ingredients: ['옥수수', '대두박', '소맥', '옥글루텐', '정제 계유', '계육분',
      '비타민 및 미네랄', '비특이성 면역증강제']
  },
  '미니 인도어 시니어': {
    ga: { protein: 22, fat: 12, fiber: 2.8, ash: 6, moisture: 10.5 },
    ingredients: ['옥수수', '쌀', '옥수수 분말', '식물성 단백질 분리물', '탈수 가금 단백질',
      '옥수수글루텐', '동물성지방', '가수분해 동물성 단백질', '사탕무박', '미네랄', '생선오일',
      '대두유', '토마토', '가수분해 효모', '보리지오일', '금잔화 추출물']
  },
  '튼튼한 관절': {
    ga: { protein: 24, fat: 12, fiber: 4, ash: 8, moisture: 10, kcalPerKg: 3330 },
    ingredients: ['닭고기(뼈 바른 신선한 닭고기)', '완두콩', '곡류', '콘글루텐', '아마인', '닭간',
      '병아리콩', '비트식이섬유', '제이인산칼슘', '치킨윙팁', '소기름', '카놀라유', '염화칼륨',
      '정제소금', '탄산칼슘', '맥주효모', '흰색생선분말(대구)', 'DL-메티오닌', 'L-라이신',
      '글루코사민', '염화콜린', '미량광물질류합제', '비타민제합제', '토코페롤', '식이유황',
      '치커리이눌린', '타우린', '로즈마리추출물', '녹차추출물', '초록입홍합분말', '효모추출물',
      'L-카르니틴']
  }
};

const src0 = await readFile(DATA_JS, 'utf-8');
const dm = src0.match(/const DETAIL\s*=\s*(\{[\s\S]*?\});\s*\n/);
const DETAIL = JSON.parse(dm[1]);
const { all } = await loadFoods('.');

const made = [], skipped = [], unmatched = new Set(Object.keys(SOURCE));

for (const f of all) {
  if (f.status !== 'published') continue;
  if (DETAIL[f.id] && (DETAIL[f.id].ingr ?? []).length) continue;   // 이미 있는 건 두 손 뗀다
  const s = SOURCE[f.name];
  if (!s) { skipped.push(f); continue; }
  unmatched.delete(f.name);
  DETAIL[f.id] = deriveDetail({
    ga: s.ga, ingredients: s.ingredients, facts: f.facts,
    price: f.price, weightOptions: f.price?.wgOptions
  });
  made.push([f, DETAIL[f.id]]);
}

if (made.length && !DRY) {
  await writeFile(DATA_JS, src0.replace(dm[1], JSON.stringify(DETAIL)));
}

const line = '─'.repeat(60);
console.log(`\n상세 데이터 채우기${DRY ? ' (모의 실행)' : ''}`);
console.log(line);
for (const [f, d] of made) {
  const v = d.verdict;
  console.log(`\n■ ${f.brand} ${f.name}`);
  console.log(`   영양 조단백 ${d.nutrient.protein} · 탄수(건물) ${d.nutrient.dmCarb} · 열량 ${d.nutrient.calKg ?? '—'}`);
  console.log(`   원료 ${d.dist.total}개 — 양호 ${d.dist.safe} / 주의 ${d.dist.caution} / 위험 ${d.dist.danger} / 미분류 ${d.dist.unknown}`);
  console.log(`   카드 좋음 ${v.pos.length} · 주의 ${v.cau.length} · 위험 ${v.dan.length}`);
  console.log(`   적합 ${d.fit.length} · 주의 ${d.fitCaution.length}`);
}
if (skipped.length) {
  console.log(`\n■ 자료가 없어 건너뛴 사료 ${skipped.length}종`);
  for (const f of skipped.slice(0, 6)) console.log(`   ${f.brand} ${f.name}`);
  if (skipped.length > 6) console.log(`   … 외 ${skipped.length - 6}종`);
}
for (const n of unmatched) console.log(`\n✗ '${n}' — 발행된 사료에서 찾지 못했습니다`);
console.log(`\n${line}\n채움 ${made.length} · 건너뜀 ${skipped.length}\n`);
