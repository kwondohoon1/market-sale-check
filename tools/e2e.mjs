// 끝까지 시험: Playwright 크로미움에 확장을 설치하고, 점검 페이지에 가격세팅을 넣어 실제로 수집시킨다.
// 사용: node tools/e2e.mjs <페이지 주소> <가격세팅.xlsx> [마켓,…] [스크린샷.png]
//   예) node tools/e2e.mjs http://localhost:8842/ 가격세팅.xlsx superstore,himart,smartstore
import { createRequire } from 'node:module';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [pageUrl, file, marketArg, shot] = process.argv.slice(2);
const require = createRequire(process.env.PLAYWRIGHT_FROM || 'C:/Users/user/Downloads/데스크탑프로젝트/package.json');
const { chromium } = require('playwright');
const ext = resolve(new URL('../extension', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));

// 정품 크롬은 --load-extension 을 막아서 Playwright 크로미움을 쓴다. 버전이 안 맞으면 MSC_CHROMIUM 에 경로를 준다
const ctx = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), 'msc-e2e-')), {
  headless: false,
  executablePath: process.env.MSC_CHROMIUM || undefined,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  viewport: { width: 1280, height: 900 },
});
const page = await ctx.newPage();
await page.goto(pageUrl);
await page.waitForFunction(() => /확장 연결됨/.test(document.getElementById('ext-text').textContent), null, { timeout: 15000 });
console.log('확장:', await page.textContent('#ext-text'));

await page.setInputFiles('#picker', { name: file.split(/[\\/]/).pop(), mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await readFile(file) });
await page.waitForFunction(() => /상품 \d+개/.test(document.getElementById('file-msg').textContent));
console.log(await page.textContent('#file-msg'));

if (marketArg) {
  const want = new Set(marketArg.split(','));
  // 누를 때마다 단추가 다시 그려지므로 매번 새로 찾는다
  const keys = await page.$$eval('#market-picks [data-m]:not([disabled])', (bs) => bs.map((b) => b.dataset.m));
  for (const k of keys) {
    const sel = `#market-picks [data-m="${k}"]`;
    const on = (await page.getAttribute(sel, 'aria-pressed')) === 'true';
    if (want.has(k) !== on) await page.click(sel);
  }
}
console.log('수집:', await page.textContent('#run-sub'));
await page.click('#run');
const t0 = Date.now();
let last = '';
while (true) {
  await page.waitForTimeout(5000);
  const msg = await page.textContent('#run-msg');
  if (msg !== last) { console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${msg}`); last = msg; }
  if (/^(끝|멈춤)/.test(msg)) break;
}
console.log('요약:', (await page.innerText('#summary')).replace(/\n/g, ' '));
console.log('확인할 것:\n' + await page.innerText('#issues'));
if (shot) await page.screenshot({ path: shot, fullPage: true });
await ctx.close();
