#!/usr/bin/env node
/* 판매자 상세 이미지에서 원재료·등록성분 패널을 찾아 잘라낸다.

   국내 쇼핑몰은 상품 상세를 통째로 이미지로 만든다. 그 이미지는 보통 세로로 매우 길어
   (수천~2만 px) 통째로 보면 글자가 뭉갠다. 그래서:
     1) 세로를 여러 구간으로 잘라 축소본 시트를 만들고 (어디에 표가 있는지 눈으로 찾기 위함)
     2) 지정한 구간만 원본 해상도에서 잘라 확대 저장한다
   판독 자체는 사람 또는 모델이 이미지를 보고 한다. OCR 은 쓰지 않는다.

   사용:
     node scripts/scan-label-images.mjs --url <이미지URL> --out <디렉터리>
     node scripts/scan-label-images.mjs --url <URL> --band 0.28-0.32   특정 구간만 확대
*/
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

const run = promisify(execFile);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const arg = (name, def = null) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

const url = arg('--url');
const outDir = arg('--out', '/tmp/label-scan');
const band = arg('--band');
if (!url) { console.error('--url 이 필요합니다'); process.exit(2); }

await mkdir(outDir, { recursive: true });
const src = join(outDir, 'src.jpg');
await run('curl', ['-sL', '-m', '40', '-A', UA, url, '-o', src]);

/* Pillow 로 자르고 확대한다. 이미지 처리는 파이썬이 간결하다. */
const py = `
from PIL import Image
import sys, json
src, out, band = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(src); w, h = im.size
res = {"size": [w, h], "files": []}

def save(name, a, b, width=2000):
    c = im.crop((0, int(h*a), w, int(h*b)))
    if c.height < 4: return
    s = width / c.width
    c = c.resize((width, max(4, int(c.height*s))), Image.LANCZOS)
    p = f"{out}/{name}.png"; c.save(p)
    res["files"].append({"name": name, "band": [round(a,3), round(b,3)], "size": list(c.size), "path": p})

if band and band != "none":
    a, b = [float(x) for x in band.split("-")]
    save("band", a, b, 2200)
else:
    # 세로가 길수록 구간을 잘게 나눈다. 지도 시트로 표 위치를 먼저 찾는다.
    n = 6 if h < 4000 else (12 if h < 12000 else 20)
    cols = 6
    strips = []
    for i in range(n):
        c = im.crop((0, int(h*i/n), w, int(h*(i+1)/n)))
        c = c.resize((200, max(4, int(c.height*200/c.width))), Image.LANCZOS)
        strips.append(c)
    rows = (n + cols - 1)//cols
    sh = max(s.height for s in strips)
    sheet = Image.new("RGB", (200*cols, sh*rows), "white")
    for i, s in enumerate(strips):
        sheet.paste(s, ((i%cols)*200, (i//cols)*sh))
    sheet.save(f"{out}/_map.png")
    res["map"] = {"path": f"{out}/_map.png", "sections": n, "cols": cols,
                  "bandPerSection": round(1.0/n, 4)}
print(json.dumps(res, ensure_ascii=False))
`;

const { stdout } = await run('python3', ['-c', py, src, outDir, band ?? 'none']);
const res = JSON.parse(stdout);
await writeFile(join(outDir, 'scan.json'), JSON.stringify({ url, ...res }, null, 2));

console.log(`\n이미지 ${res.size[0]} x ${res.size[1]}`);
if (res.map) {
  console.log(`  구간 지도 → ${res.map.path}`);
  console.log(`  ${res.map.sections}구간 (한 구간 = 전체의 ${(res.map.bandPerSection*100).toFixed(1)}%)`);
  console.log(`  표를 찾으면 --band 로 그 구간만 확대하세요. 예: --band 0.28-0.32`);
} else {
  for (const f of res.files) console.log(`  ${f.name}  ${f.size.join('x')}  → ${f.path}`);
}
