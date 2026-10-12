// 실측 도구: 실제 크롬(CDP)으로 가격세팅의 상품 페이지를 열고, 확장과 같은 읽기 함수로 판정까지 돌린다.
// 사용: node tools/live-check.mjs <가격세팅.xlsx> [마켓,마켓…] [최대 상품 수]
// Playwright 는 PLAYWRIGHT_FROM(package.json 경로) 의 node_modules 에서 빌려 쓴다.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import JSZip from 'jszip';
import { MARKETS } from '../extension/markets.js';
import { openWorkbook, extractProducts } from '../site/src/workbook.js';
import { judge, VERDICTS, won, signed } from '../site/src/judge.js';

const [file, marketArg, limitArg] = process.argv.slice(2);
if (!file) { console.error('사용: node tools/live-check.mjs <가격세팅.xlsx> [마켓,…] [개수]'); process.exit(1); }
const require = createRequire(process.env.PLAYWRIGHT_FROM || 'C:/Users/user/Downloads/데스크탑프로젝트/package.json');
const { chromium } = require('playwright');

const PORT = 9333;
async function connect() {
  try { return await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); } catch { /* 새로 띄운다 */ }
  spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [`--remote-debugging-port=${PORT}`,
    `--user-data-dir=${process.env.TEMP}\\claude\\probe-profile`, '--no-first-run', 'about:blank'], { detached: true, stdio: 'ignore' }).unref();
  await new Promise((r) => setTimeout(r, 3000));
  return chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
}

const { products } = extractProducts(await openWorkbook(JSZip, await readFile(file)));
const markets = marketArg ? marketArg.split(',') : Object.keys(MARKETS);
const list = products.slice(0, limitArg ? +limitArg : undefined);
const browser = await connect();
const page = await browser.contexts()[0].newPage();
const lastAt = {};
const tally = {};

for (const market of markets) {
  const m = MARKETS[market];
  for (const p of list) {
    const code = p.codes[market];
    let result;
    if (code) {
      for (const url of m.urls({ code, store: p.naverStore })) {
        const wait = (lastAt[market] || 0) + m.gap - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        try {
          await page.goto(url, { waitUntil: 'load', timeout: 20000 }).catch(() => {}); // 확장과 같이: 늦으면 그대로 읽는다
          for (const d of [1200, 2500, 4000]) {
            await page.waitForTimeout(d);
            result = await page.evaluate(`(${m.read.toString()})()`);
            if (result && result.found && !result.partial) break;
          }
        } catch (e) { result = { found: false, error: true, status: e.message.split('\n')[0] }; }
        lastAt[market] = Date.now();
        result = { ...result, url };
        if (result.found) break;
      }
    }
    const j = judge({ code, expected: p.expected[market], result });
    tally[market] = tally[market] || {};
    tally[market][j.verdict] = (tally[market][j.verdict] || 0) + 1;
    const d = j.diffs.map((x) => `${x.label} ${won(x.got)}(${signed(x.diff)})`).join(' ');
    console.log(`${market.padEnd(10)} ${VERDICTS[j.verdict].label.padEnd(8)} ${p.name.slice(0, 42).padEnd(42)} ${d} ${j.note || ''} ${result && result.found ? '| ' + String(result.name).slice(0, 40) : ''}`);
  }
}
console.log(JSON.stringify(tally));
await page.close();
process.exit(0);
