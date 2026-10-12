// 점검 페이지가 보낸 (마켓, 코드) 목록을 받아 상품 페이지를 하나씩 열고 값을 읽는다.
// 주소는 markets.js 에 정해진 형식으로만 만든다 — 페이지가 임의 주소를 열게 할 수 없다.
import { MARKETS } from './markets.js';

const CODE_RE = /^[A-Za-z0-9_-]{1,40}$/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let running = null; // { cancelled }

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'msc') return;
  port.onMessage.addListener((msg) => {
    if (msg.type === 'cancel') { if (running) running.cancelled = true; return; }
    if (msg.type !== 'check') return;
    if (running) { port.postMessage({ type: 'error', message: '이미 수집 중입니다.' }); return; }
    const jobs = (Array.isArray(msg.jobs) ? msg.jobs : []).filter((j) => j && MARKETS[j.market] && CODE_RE.test(String(j.code)));
    running = { cancelled: false };
    runJobs(jobs, port, running).finally(() => { running = null; });
  });
  port.onDisconnect.addListener(() => { if (running) running.cancelled = true; });
});

async function runJobs(jobs, port, state) {
  const send = (m) => { try { port.postMessage(m); } catch (e) { state.cancelled = true; } };
  send({ type: 'start', total: jobs.length });
  let tab = null;
  const lastAt = {};
  try {
    for (let i = 0; i < jobs.length && !state.cancelled; i++) {
      const job = jobs[i];
      const m = MARKETS[job.market];
      const wait = (lastAt[job.market] || 0) + m.gap - Date.now();
      if (wait > 0) await sleep(wait);
      if (state.cancelled) break;
      let result = null;
      for (const url of m.urls(job)) {
        if (!tab) tab = await chrome.tabs.create({ url: 'about:blank', active: false });
        try {
          const r = await openAndRead(tab.id, url, m.read);
          result = { ...r, url };
        } catch (e) {
          if (/No tab with id/i.test(String(e && e.message))) tab = null; // 사용자가 탭을 닫았으면 새로 연다
          result = { found: false, error: true, status: `수집 실패: ${(e && e.message) || e}`, url };
        }
        lastAt[job.market] = Date.now();
        if (result.found) break;
      }
      send({ type: 'result', index: i, id: job.id, market: job.market, result, at: new Date().toISOString() });
    }
  } finally {
    if (tab) chrome.tabs.remove(tab.id).catch(() => {});
    send({ type: 'done', cancelled: state.cancelled });
  }
}

async function openAndRead(tabId, url, read) {
  const loaded = waitComplete(tabId, 20000);
  loaded.catch(() => {}); // update 가 먼저 실패해도 처리되지 않은 거부로 남지 않게
  await chrome.tabs.update(tabId, { url });
  await loaded;
  // 가격 영역이 스크립트로 늦게 채워지는 페이지가 있어 잠깐 기다렸다가, 못 읽으면 한 번 더 본다
  let r = null;
  for (const delay of [1200, 2500, 4000]) {
    await sleep(delay);
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: read });
    r = res && res.result;
    if (r && r.found && !r.partial) break;
  }
  const t = await chrome.tabs.get(tabId);
  const blocked = /잠시만 기다리십시오|captcha|robot|보안 확인/i.test(t.title || '');
  if (r && !r.found && blocked) return { found: false, error: true, status: '봇 확인 화면에 막힘 — 잠시 뒤 다시 시도' };
  return r || { found: false, error: true, status: '읽기 실패' };
}

function waitComplete(tabId, timeout) {
  return new Promise((resolve, reject) => {
    // 광고·추적 스크립트 때문에 'complete' 가 늦게 오는 페이지가 있다 — 시간이 지나면 그대로 읽어 본다
    const timer = setTimeout(() => { done(); resolve(); }, timeout);
    const onUpd = (id, info) => { if (id === tabId && info.status === 'complete') { done(); resolve(); } };
    const onRem = (id) => { if (id === tabId) { done(); reject(new Error('No tab with id')); } };
    function done() { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(onUpd); chrome.tabs.onRemoved.removeListener(onRem); }
    chrome.tabs.onUpdated.addListener(onUpd);
    chrome.tabs.onRemoved.addListener(onRem);
  });
}
