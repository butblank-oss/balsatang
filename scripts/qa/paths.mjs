/* QA 가 보는 두 저장소의 위치.

   어드민은 balsatang-admin 으로 떨어져 나가 옆 폴더에 있다. 그 사실을 아는 곳이
   여럿이면 한쪽만 고쳐져 또 '여기 없음' 으로 건너뛴다 — 실제로 그렇게 네 묶음이
   통째로 안 돌고 있었다. 그래서 위치는 여기 한 곳에만 적는다.

   다른 데 받아 뒀다면 QA_ADMIN_ROOT 로 알려준다. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ADMIN = process.env.QA_ADMIN_ROOT || path.resolve(ROOT, '../balsatang-admin');

/* 한 서버에 두 저장소를 붙이는 자리.

   ⚠ '/app/' 은 아무렇게나 고른 이름이 아니다. 어드민 화면은 열린 주소를 보고 갈라서,
   balsatang.com 이 아니면 '../app/' 에서 engine·data 를 읽는다(foods.html·index.html 의
   base()). 즉 로컬에서 쓰라고 만들어 둔 길이 이미 있다. 그 자리에 프론트를 붙여 주면
   화면이 손대지 않은 채로 돈다. 이름을 바꾸면 어드민이 엔진을 못 읽어 화면이 멈춘다. */
export const ADMIN_MOUNT = '/admin/';
export const APP_MOUNT = '/app/';
