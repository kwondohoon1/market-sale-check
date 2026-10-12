// 화면: 가격세팅을 읽고 → 확장에 수집을 맡기고 → 칸마다 판정해 보여 준다.
import { openWorkbook, extractProducts, MARKETS } from './workbook.js';
import { judge, VERDICTS, won, signed } from './judge.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 확장이 읽을 수 있는 마켓(컴퓨존은 아직 코드가 없어 읽기 함수가 없다)
const COLLECTABLE = new Set(['gmarket', 'auction', 'superstore', 'himart', 'smartstore', 'coupang']);
const LABEL = Object.fromEntries(MARKETS.map((m) => [m.key, m.key === 'superstore' ? '자사몰(슈퍼스토어)' : m.label]));
const CLASS = { ok: 'ok', mismatch: 'warn', notSelling: 'bad', notFound: 'bad', failed: 'fail', noExpected: 'info', noCode: 'none', pending: 'none' };

const state = {
  ext: null,          // 확장 버전
  products: [],
  fileName: '',
  picked: new Set(['gmarket', 'auction', 'superstore', 'himart', 'smartstore']),
  results: new Map(), // `${i}|${market}` → result
  running: false,
  total: 0,
  doneCount: 0,
  startedAt: 0,
};

// ---------------------------------------------------------------- 확장 연결

window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data || e.data.source !== 'msc-ext') return;
  const m = e.data;
  if (m.type === 'ready') setExt(m.version);
  else if (m.type === 'start') { state.total = m.total; state.doneCount = 0; state.startedAt = Date.now(); renderProgress(); }
  else if (m.type === 'result') {
    const [i, market] = m.id.split('|');
    state.results.set(`${i}|${market}`, { ...m.result, at: m.at });
    state.doneCount++;
    renderProgress(state.products[+i], market);
    renderResults();
  } else if (m.type === 'done') { state.running = false; renderProgress(); renderResults(); }
  else if (m.type === 'error') { $('run-msg').textContent = m.message; }
});

function setExt(version) {
  state.ext = version;
  $('ext-text').textContent = `확장 연결됨 v${version}`;
  $('ext-badge').querySelector('.dot').classList.remove('off');
  $('ext-help').hidden = true;
  renderRun();
}

const post = (msg) => window.postMessage({ source: 'msc-page', ...msg }, location.origin);
post({ type: 'hello' });
setTimeout(() => {
  if (state.ext) return;
  $('ext-text').textContent = '확장 없음';
  $('ext-help').hidden = false;
}, 1200);

// ---------------------------------------------------------------- 파일

const drop = $('drop');
$('picker').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) loadFile(f); e.target.value = ''; });
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault(); drop.classList.remove('over');
  const f = e.dataTransfer.files[0]; if (f) loadFile(f);
});

async function loadFile(file) {
  const msg = $('file-msg');
  msg.className = 'msg busy'; msg.textContent = '읽는 중…';
  $('file-notes').innerHTML = '';
  try {
    const book = await openWorkbook(window.JSZip, await file.arrayBuffer());
    const { products, notes } = extractProducts(book);
    if (state.running) post({ type: 'cancel' });
    Object.assign(state, { products, fileName: file.name, results: new Map(), running: false, total: 0, doneCount: 0 });
    msg.className = 'msg';
    msg.textContent = `${file.name} — 상품 ${products.length}개`;
    if (notes.length) $('file-notes').innerHTML = `<div class="note warn">${notes.length}건 확인 필요<ul>${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>`;
    renderRun();
    renderResults();
  } catch (e) {
    msg.className = 'msg bad';
    msg.textContent = e.message || String(e);
  }
}

// ---------------------------------------------------------------- 수집

function renderRun() {
  const has = state.products.length > 0;
  $('step-run').hidden = !has;
  $('step-result').hidden = !has;
  if (!has) return;
  const counts = Object.fromEntries(MARKETS.map((m) => [m.key, state.products.filter((p) => p.codes[m.key]).length]));
  $('market-picks').innerHTML = MARKETS.map((m) => {
    const can = COLLECTABLE.has(m.key) && counts[m.key] > 0;
    const on = can && state.picked.has(m.key);
    const why = !COLLECTABLE.has(m.key) ? '읽기 미지원' : counts[m.key] ? `${counts[m.key]}개` : '코드 없음';
    return `<button type="button" class="chip ${on ? '' : 'off'}" data-m="${m.key}" ${can ? '' : 'disabled'} aria-pressed="${on}">${esc(LABEL[m.key])} <span class="n">${why}</span></button>`;
  }).join('');
  const jobs = buildJobs(false).length;
  const gm = buildJobs(false).filter((j) => j.market === 'gmarket' || j.market === 'auction').length;
  $('run-sub').textContent = `${jobs}건 · 약 ${Math.max(1, Math.ceil(Math.max(jobs * 5, gm * 7.5) / 60))}분`;
  $('run').disabled = !state.ext || state.running || !jobs;
  $('run').textContent = state.ext ? '수집 시작' : '확장을 설치하면 수집할 수 있어요';
  $('cancel').hidden = !state.running;
  $('retry').hidden = state.running || !retryJobs().length;
}

$('market-picks').addEventListener('click', (e) => {
  const b = e.target.closest('[data-m]');
  if (!b || b.disabled || state.running) return;
  const k = b.dataset.m;
  if (state.picked.has(k)) state.picked.delete(k); else state.picked.add(k);
  renderRun();
  renderResults();
});

// 마켓을 번갈아 섞어 보낸다 — G마켓·옥션이 쉬는 동안 다른 마켓을 읽어 전체 시간이 준다
function buildJobs(onlyRetry) {
  const per = [];
  for (const m of MARKETS) {
    if (!COLLECTABLE.has(m.key) || !state.picked.has(m.key)) continue;
    const list = [];
    state.products.forEach((p, i) => {
      if (!p.codes[m.key]) return;
      const id = `${i}|${m.key}`;
      if (onlyRetry) {
        const v = verdictOf(i, m.key).verdict;
        if (v !== 'failed' && v !== 'notFound') return;
      }
      list.push({ id, market: m.key, code: p.codes[m.key], store: p.naverStore });
    });
    per.push(list);
  }
  const out = [];
  for (let k = 0; per.some((l) => k < l.length); k++) for (const l of per) if (k < l.length) out.push(l[k]);
  return out;
}
const retryJobs = () => buildJobs(true);

function start(jobs) {
  if (!jobs.length || state.running) return;
  for (const j of jobs) state.results.delete(j.id);
  state.running = true;
  state.total = jobs.length;
  state.doneCount = 0;
  state.startedAt = Date.now();
  post({ type: 'check', jobs });
  renderProgress();
  renderResults();
}
$('run').addEventListener('click', () => start(buildJobs(false)));
$('retry').addEventListener('click', () => start(retryJobs()));
$('cancel').addEventListener('click', () => post({ type: 'cancel' }));

function renderProgress(product, market) {
  const { total, doneCount, running } = state;
  $('progress').hidden = !total;
  $('bar-fill').style.width = total ? `${(doneCount / total) * 100}%` : '0';
  const msg = $('run-msg');
  if (running) {
    const per = doneCount ? (Date.now() - state.startedAt) / doneCount : 0;
    const left = per ? Math.ceil((per * (total - doneCount)) / 60000) : null;
    msg.textContent = `${doneCount} / ${total}${product ? ` · 방금: ${LABEL[market]} ${product.name}` : ''}${left != null ? ` · 남은 시간 약 ${left}분` : ''}`;
  } else if (total) {
    msg.textContent = doneCount < total ? `멈춤 — ${doneCount} / ${total}건 읽음` : `끝 — ${total}건 읽음`;
  }
  renderRun();
}

// ---------------------------------------------------------------- 결과

function verdictOf(i, market) {
  const p = state.products[i];
  const code = COLLECTABLE.has(market) ? p.codes[market] : '';
  return judge({ code, expected: p.expected[market], result: state.results.get(`${i}|${market}`) });
}

const shownMarkets = () => MARKETS.filter((m) => state.picked.has(m.key) && COLLECTABLE.has(m.key));

function cellHtml(i, m) {
  const p = state.products[i];
  const j = verdictOf(i, m.key);
  const r = state.results.get(`${i}|${m.key}`);
  let body = '';
  if (j.verdict === 'ok') body = `<b>✓</b><small>${won(r.shownPrice)}</small>`;
  else if (j.verdict === 'mismatch') body = `<b>가격</b><small>${j.diffs.filter((d) => !d.ok).map((d) => `${d.label} ${signed(d.diff)}`).join('<br>')}</small>`;
  else if (j.verdict === 'pending') body = state.running && p.codes[m.key] ? '<small>대기</small>' : '';
  else if (j.verdict === 'noCode') body = '<small>—</small>';
  else body = `<b>${esc(VERDICTS[j.verdict].label)}</b>${j.note ? `<small>${esc(j.note)}</small>` : ''}`;
  const tip = [
    `${LABEL[m.key]} · ${p.name}`,
    p.codes[m.key] ? `코드 ${p.codes[m.key]}` : '코드 없음',
    ...j.diffs.map((d) => `${d.label} 세팅 ${won(d.want)} / 페이지 ${won(d.got)} (${signed(d.diff)})`),
    r && r.found ? `페이지 상품명: ${r.name}` : '',
  ].filter(Boolean).join('\n');
  const link = r && r.url ? `<a class="open" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" title="페이지 열기">↗</a>` : '';
  return `<td class="cell ${CLASS[j.verdict]}" title="${esc(tip)}">${body}${link}</td>`;
}

function renderResults() {
  if (!state.products.length) return;
  const ms = shownMarkets();
  const onlyBad = $('only-bad').checked;

  // 요약
  $('summary').innerHTML = ms.map((m) => {
    const c = { ok: 0, bad: 0, wait: 0 };
    state.products.forEach((p, i) => {
      if (!p.codes[m.key]) return;
      const v = verdictOf(i, m.key).verdict;
      if (v === 'ok' || v === 'noExpected') c.ok++; else if (v === 'pending') c.wait++; else c.bad++;
    });
    return `<div class="stat"><div class="k">${esc(LABEL[m.key])}</div><div class="v">${c.ok}<span class="of"> 정상</span>${c.bad ? ` <span class="badn">${c.bad} 문제</span>` : ''}</div><div class="s">${c.wait ? `${c.wait}건 대기` : '&nbsp;'}</div></div>`;
  }).join('');

  // 상품 × 마켓 표
  const rows = state.products.map((p, i) => {
    const bad = ms.some((m) => VERDICTS[verdictOf(i, m.key).verdict].rank >= 2);
    if (onlyBad && !bad) return '';
    return `<tr><th scope="row" class="pname"><span class="cat">${esc(p.category)}</span>${esc(p.name)}</th>${ms.map((m) => cellHtml(i, m)).join('')}</tr>`;
  }).join('');
  $('matrix').innerHTML = `<thead><tr><th>상품</th>${ms.map((m) => `<th>${esc(LABEL[m.key])}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${ms.length + 1}" class="muted">문제 있는 상품이 없습니다.</td></tr>`}</tbody>`;

  // 확인할 것 목록
  const issues = [];
  state.products.forEach((p, i) => ms.forEach((m) => {
    const j = verdictOf(i, m.key);
    if (VERDICTS[j.verdict].rank < 2) return;
    issues.push({ p, m, j, r: state.results.get(`${i}|${m.key}`) });
  }));
  issues.sort((a, b) => VERDICTS[b.j.verdict].rank - VERDICTS[a.j.verdict].rank);
  $('issue-count').textContent = issues.length ? `${issues.length}건` : '';
  $('issues').innerHTML = issues.length
    ? `<thead><tr><th>판정</th><th>마켓</th><th>상품</th><th class="n">세팅 등재가</th><th class="n">페이지 등재가</th><th class="n">세팅 노출가</th><th class="n">페이지 노출가</th><th>내용</th><th></th></tr></thead><tbody>${issues.map(({ p, m, j, r }) => {
      const d = Object.fromEntries(j.diffs.map((x) => [x.key, x]));
      const cell = (x, k) => (x ? `<td class="n ${x.ok ? '' : 'diff'}">${won(x[k])}</td>` : '<td class="n muted">–</td>');
      const note = j.verdict === 'mismatch'
        ? j.diffs.filter((x) => !x.ok).map((x) => `${x.label} ${signed(x.diff)}`).join(', ')
        : (j.note || '');
      return `<tr><td><span class="sev ${CLASS[j.verdict]}">${esc(VERDICTS[j.verdict].label)}</span></td><td>${esc(LABEL[m.key])}</td><td class="wrap">${esc(p.name)}${r && r.found && r.name ? `<div class="sub">${esc(r.name)}</div>` : ''}</td>${cell(d.list, 'want')}${cell(d.list, 'got')}${cell(d.shown, 'want')}${cell(d.shown, 'got')}<td class="wrap">${esc(note)}</td><td>${r && r.url ? `<a class="open" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">열기 ↗</a>` : ''}</td></tr>`;
    }).join('')}</tbody>`
    : `<tbody><tr><td class="muted">${state.results.size ? '확인할 것이 없습니다.' : '수집을 시작하면 여기에 문제만 모아 보여 줍니다.'}</td></tr></tbody>`;

  $('export').disabled = !state.results.size;
}
$('only-bad').addEventListener('change', renderResults);

// ---------------------------------------------------------------- 내려받기

$('export').addEventListener('click', () => {
  const head = ['상품', '카테고리', '마켓', '코드', '판정', '세팅 등재가', '페이지 등재가', '세팅 노출가', '페이지 노출가', '판매 상태', '페이지 상품명', '주소', '읽은 시각'];
  const lines = [head];
  state.products.forEach((p, i) => shownMarkets().forEach((m) => {
    const j = verdictOf(i, m.key);
    const r = state.results.get(`${i}|${m.key}`) || {};
    const e = p.expected[m.key] || {};
    lines.push([p.name, p.category, LABEL[m.key], p.codes[m.key], VERDICTS[j.verdict].label,
      e.list ?? '', r.listPrice ?? '', e.shown ?? '', r.shownPrice ?? '', r.status ?? '', r.name ?? '', r.url ?? '', r.at ?? '']);
  }));
  const csv = '﻿' + lines.map((l) => l.map((v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const base = state.fileName.replace(/\.xlsx$/i, '');
  a.download = `${base}_판매점검.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
