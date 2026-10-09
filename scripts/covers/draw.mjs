/* 콘텐츠 표지 그리기 — 파스텔 평면 강아지 일러스트 (대표 확정 그림체, 2026-10-09).
   쓰는 법: node scripts/covers/draw.mjs [글id ...]   (없으면 전부)
   → assets/covers/<id>.webp (1200px, 품질 86). 새 글은 아래 S 에 한 줄 추가하고 app.js COVER_IMG 에 등록.
   규칙: 바탕은 단색 파스텔 1색, 카드·글자·별 장식 없음, 강아지(dog)와 물건 1~3개, 그림체 함수는 그대로 재사용. */
import { chromium } from 'playwright';
import fs from 'fs';
import { execFileSync } from 'child_process';
const OUT = new URL('../../assets/covers/', import.meta.url).pathname;
const ONLY = process.argv.slice(2);
const W=1376,H=768,G=560;
const sh=(x,y,rx)=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${rx*.12}" fill="#000" opacity=".07"/>`;
function dog({x,s=1,fur='#F2E6D8',ear='#E0CDB6',mz='#FBF6F0',chub=1,grey=false,pointy=false,tail=true}){
  const g=grey?'#D8D2CC':mz;
  const ears=pointy
   ? `<path d="M-52 -200 L-40 -268 L-12 -222Z" fill="${fur}"/><path d="M-44 -210 L-38 -250 L-22 -224Z" fill="#F7C9C0"/>
      <path d="M52 -200 L40 -268 L12 -222Z" fill="${fur}"/><path d="M44 -210 L38 -250 L22 -224Z" fill="#F7C9C0"/>`
   : `<ellipse cx="-54" cy="-168" rx="20" ry="42" transform="rotate(14 -54 -168)" fill="${ear}"/>
      <ellipse cx="54" cy="-168" rx="20" ry="42" transform="rotate(-14 54 -168)" fill="${ear}"/>`;
  return `<g transform="translate(${x} ${G}) scale(${s})">
  ${sh(0,0,95*chub)}
  ${tail?`<path d="M${50*chub} -46 Q${100*chub} -70 ${92*chub} -118" stroke="${fur}" stroke-width="18" fill="none" stroke-linecap="round"/>`:''}
  <ellipse cx="0" cy="-82" rx="${62*chub}" ry="80" fill="${fur}"/>
  <ellipse cx="${20*chub}" cy="-82" rx="${42*chub}" ry="72" fill="#000" opacity=".045"/>
  <ellipse cx="0" cy="-66" rx="${32*chub}" ry="50" fill="${mz}"/>
  <rect x="-34" y="-62" width="24" height="62" rx="12" fill="${fur}"/><rect x="10" y="-62" width="24" height="62" rx="12" fill="${fur}"/>
  <ellipse cx="-22" cy="-4" rx="16" ry="8" fill="${mz}"/><ellipse cx="22" cy="-4" rx="16" ry="8" fill="${mz}"/>
  <circle cx="0" cy="-178" r="60" fill="${fur}"/>
  ${ears}
  ${pointy?`<path d="M-8 -228 Q0 -236 8 -228 L22 -150 L-22 -150Z" fill="${mz}"/>`:''}<ellipse cx="0" cy="-150" rx="32" ry="24" fill="${g}"/>
  ${grey?`<path d="M-34 -204 q12 -8 22 0 M12 -204 q12 -8 22 0" stroke="#CFC8C1" stroke-width="7" fill="none" stroke-linecap="round"/>`:''}
  <ellipse cx="0" cy="-161" rx="10" ry="7.5" fill="#3A2D29"/>
  <path d="M-10 -146 q10 9 20 0" stroke="#3A2D29" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <circle cx="-22" cy="-186" r="6.5" fill="#2A211F"/><circle cx="22" cy="-186" r="6.5" fill="#2A211F"/>
  <circle cx="-20" cy="-188" r="2" fill="#fff"/><circle cx="24" cy="-188" r="2" fill="#fff"/>
  <ellipse cx="-38" cy="-160" rx="9" ry="5" fill="#F4A9A0" opacity=".35"/><ellipse cx="38" cy="-160" rx="9" ry="5" fill="#F4A9A0" opacity=".35"/>
  </g>`;
}
function bowl(x,w=150,col='#C9C6CF',food='#9A6A44',kind='kibble'){
  const h=w*.34, t=G-h, r=w/2;
  let f='';
  if(kind==='kibble'){for(let i=0;i<9;i++){const a=i/8; f+=`<ellipse cx="${x-r*.7+a*r*1.4}" cy="${t-6-Math.sin(a*Math.PI)*14}" rx="${w*.07}" ry="${w*.05}" fill="${food}"/>`;}}
  if(kind==='wet') f=`<ellipse cx="${x}" cy="${t-2}" rx="${r*.85}" ry="${w*.09}" fill="${food}"/>`;
  if(kind==='chunk'){for(let i=0;i<6;i++){const a=i/5; f+=`<rect x="${x-r*.65+a*r*1.1}" y="${t-18-Math.sin(a*Math.PI)*12}" width="${w*.14}" height="${w*.1}" rx="4" transform="rotate(${i*17} ${x} ${t})" fill="${food}"/>`;}}
  return `${sh(x,G,r*1.05)}${f}<path d="M${x-r} ${t} L${x+r} ${t} L${x+r*.78} ${G} L${x-r*.78} ${G}Z" fill="${col}"/>
  <ellipse cx="${x}" cy="${t}" rx="${r}" ry="${w*.07}" fill="${col}"/><path d="M${x-r*.6} ${t+h*.45} L${x+r*.6} ${t+h*.45}" stroke="#fff" stroke-width="5" opacity=".35" stroke-linecap="round"/>`;
}
const jar=(x,w,hh,liq,lid)=>`${sh(x,G,w*.6)}<rect x="${x-w/2}" y="${G-hh}" width="${w}" height="${hh}" rx="${w*.22}" fill="#fff" opacity=".75"/>
 <rect x="${x-w/2+8}" y="${G-hh*.55}" width="${w-16}" height="${hh*.55-8}" rx="${w*.16}" fill="${liq}"/>
 <rect x="${x-w/2-4}" y="${G-hh-22}" width="${w+8}" height="26" rx="8" fill="${lid}"/>
 <rect x="${x-w/2+12}" y="${G-hh+16}" width="8" height="${hh*.3}" rx="4" fill="#fff" opacity=".8"/>`;
const bag=(x,w,hh,col)=>`${sh(x,G,w*.6)}<path d="M${x-w/2} ${G} L${x-w/2+8} ${G-hh} L${x+w/2-8} ${G-hh} L${x+w/2} ${G}Z" fill="${col}"/>
 <path d="M${x-w/2+8} ${G-hh} l10 -18 h${w-36} l10 18Z" fill="${col}" opacity=".8"/><path d="M${x-w/2+6} ${G-hh-18}h${w-12}" stroke="#000" opacity=".08" stroke-width="6"/>
 <rect x="${x-w*.28}" y="${G-hh*.62}" width="${w*.56}" height="${hh*.34}" rx="14" fill="#fff" opacity=".55"/>
 <path d="M${x+w*.18} ${G-hh} L${x+w/2} ${G}" stroke="#000" opacity=".05" stroke-width="${w*.25}"/>`;
const coins=(x,n)=>{let s=sh(x,G,62);for(let i=0;i<n;i++){const y=G-12-i*16;s+=`<ellipse cx="${x}" cy="${y+6}" rx="54" ry="14" fill="#D9A23A"/><ellipse cx="${x}" cy="${y}" rx="54" ry="14" fill="#F2C35A"/>`;}return s+`<ellipse cx="${x}" cy="${G-12-(n-1)*16}" rx="30" ry="7" fill="#E6B04A"/>`;};
const wheat=(x,hh)=>{let s=`<path d="M${x} ${G} Q${x-10} ${G-hh/2} ${x+6} ${G-hh}" stroke="#C9A55E" stroke-width="6" fill="none" stroke-linecap="round"/>`;
 for(let i=0;i<6;i++){const y=G-hh+14+i*20;s+=`<ellipse cx="${x-12}" cy="${y}" rx="9" ry="16" transform="rotate(-30 ${x-12} ${y})" fill="#E3C47A"/><ellipse cx="${x+14}" cy="${y-6}" rx="9" ry="16" transform="rotate(30 ${x+14} ${y-6})" fill="#E3C47A"/>`;}return s;};
const fish=(x,y)=>`<g transform="translate(${x} ${y})"><ellipse cx="0" cy="0" rx="78" ry="34" fill="#9FC3E0"/><path d="M66 0 L112 -30 L112 30Z" fill="#8AB2D3"/>
 <ellipse cx="-6" cy="8" rx="56" ry="16" fill="#fff" opacity=".35"/><circle cx="-48" cy="-8" r="6" fill="#2A3A4A"/></g>`;
const meat=(x,y)=>`<g transform="translate(${x} ${y})"><path d="M-60 0 C-60 -50 40 -60 60 -20 C76 14 30 42 -10 40 C-44 38 -60 24 -60 0Z" fill="#E7958A"/>
 <path d="M-30 4 C-10 -20 30 -18 40 -4" stroke="#F7D3CC" stroke-width="10" fill="none" stroke-linecap="round"/><circle cx="-40" cy="20" r="12" fill="#FBEDE9"/></g>`;
const scaleRound=(x,w)=>`${sh(x,G,w*.55)}<rect x="${x-w/2}" y="${G-34}" width="${w}" height="34" rx="17" fill="#FFFFFF"/><rect x="${x-w/2}" y="${G-14}" width="${w}" height="14" rx="7" fill="#000" opacity=".05"/>
 <rect x="${x-34}" y="${G-28}" width="68" height="18" rx="6" fill="#CFE6DB"/>`;
const kscale=(x)=>`${sh(x,G,80)}<rect x="${x-70}" y="${G-70}" width="140" height="70" rx="18" fill="#fff"/><rect x="${x-80}" y="${G-92}" width="160" height="24" rx="12" fill="#E9E6EF"/>
 <circle cx="${x}" cy="${G-36}" r="22" fill="#F4F2F7"/><path d="M${x} ${G-36} L${x+12} ${G-48}" stroke="#E07A5F" stroke-width="5" stroke-linecap="round"/>`;
const steth=(x)=>`<g transform="translate(${x} ${G})">${sh(0,0,110)}<path d="M-80 -6 C-120 -10 -110 -110 -60 -120 M-30 -6 C10 -10 0 -110 -50 -120" stroke="#7D8AA6" stroke-width="9" fill="none" stroke-linecap="round"/>
 <path d="M-55 -8 C-40 30 60 40 80 -10" stroke="#7D8AA6" stroke-width="9" fill="none" stroke-linecap="round"/><circle cx="86" cy="-22" r="26" fill="#B7C1D6"/><circle cx="86" cy="-22" r="14" fill="#E8ECF4"/>
 <circle cx="-80" cy="-6" r="8" fill="#5D6A86"/><circle cx="-30" cy="-6" r="8" fill="#5D6A86"/></g>`;
const dropper=(x)=>`${sh(x,G,30)}<rect x="${x-9}" y="${G-120}" width="18" height="110" rx="9" fill="#fff" opacity=".8"/><rect x="${x-14}" y="${G-150}" width="28" height="40" rx="12" fill="#F2A65A"/><circle cx="${x}" cy="${G-4}" r="6" fill="#9CC9E8"/>`;
const blob=(x,y,r,c)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity=".35"/>`;
const leaf=(x,y,r,c='#3E9B6E')=>`<ellipse cx="${x}" cy="${y}" rx="12" ry="24" transform="rotate(${r} ${x} ${y})" fill="${c}"/><path d="M${x} ${y-18} L${x} ${y+18}" transform="rotate(${r} ${x} ${y})" stroke="#fff" stroke-width="2" opacity=".5"/>`;
const towel=(x)=>`${sh(x,G,90)}<rect x="${x-90}" y="${G-34}" width="180" height="34" rx="12" fill="#FFFFFF"/><rect x="${x-90}" y="${G-48}" width="160" height="22" rx="10" fill="#F1F4FA"/><path d="M${x-70} ${G-12} h140" stroke="#C9D6EE" stroke-width="5"/>`;
const tear=(x,y)=>`<path d="M${x} ${y} q14 22 0 30 q-14 -8 0 -30Z" fill="#9FD3F5"/>`;
const mag=(x,y)=>`<circle cx="${x}" cy="${y}" r="78" fill="#fff" opacity=".35"/><circle cx="${x}" cy="${y}" r="78" fill="none" stroke="#24324A" stroke-width="16"/><path d="M${x-56} ${y+56} L${x-130} ${y+130}" stroke="#24324A" stroke-width="22" stroke-linecap="round"/><path d="M${x-40} ${y-30} q20 -30 50 -30" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" opacity=".8"/>`;
const balance=(x)=>`${sh(x,G,70)}<rect x="${x-8}" y="${G-200}" width="16" height="200" rx="8" fill="#2E3A55"/><rect x="${x-60}" y="${G-16}" width="120" height="16" rx="8" fill="#2E3A55"/>
 <path d="M${x-130} ${G-180} L${x+130} ${G-200}" stroke="#2E3A55" stroke-width="10" stroke-linecap="round"/><circle cx="${x}" cy="${G-192}" r="14" fill="#F2C35A"/>
 <path d="M${x-130} ${G-180} l-34 70 h68Z M${x+130} ${G-200} l-34 70 h68Z" fill="none" stroke="#2E3A55" stroke-width="4"/><path d="M${x-170} ${G-110} h80 a40 16 0 0 1 -80 0Z M${x+90} ${G-130} h80 a40 16 0 0 1 -80 0Z" fill="#F2C35A"/>`;

const S={
 'senior-vs':['#F7E4D7', bowl(470,170,'#C8C3D3','#A06C48')+bowl(906,170,'#E4C7B8','#C99566')+dog({x:688,s:1.08,fur:'#E9D7C2',ear:'#D2B898',grey:true})],
 'additives':['#DCEAF8', jar(430,90,150,'#F5C2C7','#8FB4DA')+jar(540,80,120,'#FCE2A4','#8FB4DA')+dropper(630)+bowl(800,170,'#C6CCDA','#9A6A44')+dog({x:1000,s:.86,fur:'#C79A6E',ear:'#A87A52',mz:'#F3E3D2'})],
 'carb-grainfree':['#DDF1E6', wheat(380,230)+wheat(440,200)+wheat(320,180)+`<g>${[0,1,2,3,4,5,6].map(i=>`<ellipse cx="${360+i*22}" cy="${G-6}" rx="9" ry="5" fill="#F4ECD8"/>`).join('')}</g>`+bowl(688,190,'#C5CDD0','#9A6A44')+fish(970,G-120)+meat(990,G-30)],
 'life-stage':['#F9E2E8', dog({x:430,s:.55,fur:'#F5E8DA',ear:'#E6CFB3'})+dog({x:688,s:.9,fur:'#E9C9A4',ear:'#CFA77A'})+dog({x:980,s:1.05,fur:'#E6DACB',ear:'#CDBBA5',grey:true})],
 'price-per-kg':['#FAE7D3', bag(470,210,280,'#B9C9E6')+kscale(720)+coins(940,6)],
 'weight-manage':['#E7E2F6', scaleRound(688,300)+`<g transform="translate(0 -34)">${dog({x:688,s:1,fur:'#EBA866',ear:'#EBA866',mz:'#FFF7EE',chub:1.32,pointy:true})}</g>`],
 'rx-when':['#EDE4F4', steth(450)+dog({x:740,s:.95,fur:'#F4EEE6',ear:'#DCCDBB'})+bowl(980,150,'#CFC7DD','#B58A63')],
 'label-read':['#D6EAFA', bag(600,230,310,'#F2E4CC')+mag(570,G-200)+dog({x:840,s:.8,fur:'#F7F1EA',ear:'#E2D3C0'})],
 'tear-stain':['#E9E2F7', towel(900)+dog({x:640,s:1.25,fur:'#F7F1EA',ear:'#E2D3C0'})+tear(590,G-222)],
 'allergy':['#F6ECDD', leaf(480,300,-30,'#8CC5A3')+leaf(560,250,20,'#A9D6BA')+leaf(880,280,35,'#8CC5A3')+leaf(820,230,-15,'#A9D6BA')+leaf(940,360,60,'#A9D6BA')+dog({x:688,s:1.05,fur:'#F2DFC6',ear:'#E3C49E'})+`<path d="M600 300 l-14 -10 M590 330 l-18 -4 M780 300 l14 -10 M790 330 l18 -4" stroke="#E8A39A" stroke-width="6" stroke-linecap="round"/>`],
 'food-types':['#E2E6F6', bowl(400,160,'#C8CDE0','#9A6A44','kibble')+bowl(600,160,'#D8CFE6','#B0714A','wet')+bowl(800,160,'#E6D7C6','#D9A066','chunk')+dog({x:990,s:.8,fur:'#E3CCAE',ear:'#C9A983'})],
 'price-gap':['#FBEFD6', bag(400,140,190,'#B9C9E6')+balance(688).replace(/#2E3A55/g,'#8A93AE').replace(/#F2C35A/g,'#EDCB77')+bag(980,220,300,'#B7DCC6')+dog({x:688,s:.5,fur:'#F7F1EA',ear:'#E2D3C0'})],
 'label-anatomy-1':['#F3ECDF', bag(560,250,330,'#EADCC6')+`<rect x="490" y="${G-250}" width="140" height="110" rx="14" fill="#FBF8F2"/>`+[0,1,2,3,4].map(i=>`<rect x="500" y="${G-218+i*16}" width="75" height="7" rx="3.5" fill="#C9B79B"/><rect x="585" y="${G-218+i*16}" width="35" height="7" rx="3.5" fill="#E8A87C"/>`).join('')+dog({x:830,s:.95,fur:'#F7F1EA',ear:'#E2D3C0'})],
 'cat-guide':['#D6EAFA', bag(560,230,300,'#F2E4CC')+dog({x:820,s:.95,fur:'#F7F1EA',ear:'#E2D3C0'})],
 'cat-life':['#F9E2E8', dog({x:560,s:.6,fur:'#F5E8DA',ear:'#E6CFB3'})+dog({x:800,s:1,fur:'#E9C9A4',ear:'#CFA77A'})],
 'cat-nutri':['#DDF1E6', wheat(420,200)+wheat(470,170)+bowl(688,190,'#C5CDD0','#9A6A44')+fish(950,G-50)],
 'cat-health':['#E9E2F7', dog({x:640,s:1.05,fur:'#F7F1EA',ear:'#E2D3C0'})+`<g transform="translate(860 ${G-170}) scale(1.1)"><path d="M0 30 C-70 -10 -50 -80 -12 -70 C-4 -68 0 -62 0 -56 C0 -62 4 -68 12 -70 C50 -80 70 -10 0 30Z" fill="#F2A7A0"/></g>`],
 'cat-types':['#E2E6F6', bowl(470,170,'#C8CDE0','#9A6A44','kibble')+bowl(688,170,'#D8CFE6','#B0714A','wet')+bowl(906,170,'#E6D7C6','#D9A066','chunk')],
 'cat-buy':['#FAE7D3', bag(560,210,280,'#B9C9E6')+coins(800,6)+dog({x:1000,s:.7,fur:'#F7F1EA',ear:'#E2D3C0'})],
};
const grain=`<filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .06 0"/></filter>`;
const b=await chromium.launch();const p=await b.newPage({viewport:{width:W,height:H}});
const TMP=fs.mkdtempSync('/tmp/covers-');
for(const [id,[bg,body]] of Object.entries(S)){
  if(ONLY.length&&!ONLY.includes(id)) continue;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${grain}</defs><rect width="${W}" height="${H}" fill="${bg}"/><g transform="translate(688 400) scale(1.4) translate(-688 -440)">${body}</g><rect width="${W}" height="${H}" filter="url(#n)"/></svg>`;
  await p.setContent(`<body style="margin:0">${svg}</body>`);const png=`${TMP}/${id}.png`;await p.screenshot({path:png});
  execFileSync('convert',[png,'-resize','1200x','-quality','86',OUT+id+'.webp']);console.log('✓',id);
}
await b.close();
