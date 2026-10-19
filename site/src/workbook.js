// 가격세팅 xlsx에서 점검에 필요한 것만 읽는다: 상품명, 마켓별 코드, 마켓별 기대 가격(등재가·노출가).
// 원가·마진은 읽지 않는다. 셀 값은 엑셀이 저장해 둔 계산 결과(<v>)를 그대로 쓴다.

export const MARKETS = [
  { key: 'gmarket', label: 'G마켓', codeHeader: ['지마켓', 'G마켓'], block: 'G마켓·옥션' },
  { key: 'auction', label: '옥션', codeHeader: ['옥션'], block: 'G마켓·옥션' },
  { key: 'superstore', label: '자사몰', codeHeader: ['자사몰'], block: '자사몰' },
  { key: 'himart', label: '하이마트', codeHeader: ['하이마트온라인상품'], block: '하이마트' },
  { key: 'smartstore', label: '스마트스토어', codeHeader: ['스마트스토어'], block: '스마트스토어' },
  { key: 'coupang', label: '쿠팡', codeHeader: ['쿠팡'], block: '쿠팡' },
  { key: 'compuzone', label: '컴퓨존', codeHeader: ['컴퓨존'], block: '컴퓨존' },
];

const CODE_SHEET = '마켓별상품코드';
const PRICE_SHEET = '정산가세팅';

// ---------------------------------------------------------------- xlsx 열기

export async function openWorkbook(JSZip, data) {
  const zip = await JSZip.loadAsync(data);
  const read = async (p) => { const f = zip.file(p); return f ? f.async('string') : null; };
  const wbXml = await read('xl/workbook.xml');
  if (!wbXml) throw new Error('엑셀(xlsx) 파일이 아닙니다.');
  const rels = new Map();
  for (const m of (await read('xl/_rels/workbook.xml.rels') || '').matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    rels.set(attr(m[1], 'Id'), attr(m[1], 'Target'));
  }
  const sst = parseSharedStrings(await read('xl/sharedStrings.xml'));
  const fillOf = parseStyleFills(await read('xl/styles.xml'));
  const sheets = new Map();
  for (const m of wbXml.matchAll(/<sheet\b([^>]*?)\/>/g)) {
    const name = unesc(attr(m[1], 'name'));
    let target = rels.get(attr(m[1], 'r:id')) || '';
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    const xml = await read(target);
    if (xml) sheets.set(name, parseCells(xml, sst));
  }
  return { sheets, fillOf };
}

function attr(s, k) {
  const m = new RegExp(`(?:^|\\s)${k.replace(':', '\\:')}="([^"]*)"`).exec(s);
  return m ? m[1] : undefined;
}

function unesc(s) {
  return String(s ?? '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    // 서식이 섞인 문자열(<r>)도 있으니 <t> 를 전부 이어 붙인다. 윗주(<rPh>)는 뺀다
    const body = si[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
    out.push([...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unesc(t[1])).join(''));
  }
  return out;
}

// 셀 서식 번호 → 채우기 XML(같은 색이면 같은 문자열). 채우기 없음이면 ''.
function parseStyleFills(xml) {
  if (!xml) return () => '';
  const fillsBody = /<fills\b[^>]*>([\s\S]*?)<\/fills>/.exec(xml);
  const fills = fillsBody ? [...fillsBody[1].matchAll(/<fill>([\s\S]*?)<\/fill>|<fill\/>/g)].map((m) => m[1] || '') : [];
  const xfsBody = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  const xfs = xfsBody ? [...xfsBody[1].matchAll(/<xf\b([^>]*?)(?:\/>|>[\s\S]*?<\/xf>)/g)].map((m) => +(attr(m[1], 'fillId') || 0)) : [];
  return (s) => {
    const f = fills[xfs[+s || 0]] || '';
    return /patternType="(none|gray125)"/.test(f) || !/patternType=/.test(f) ? '' : f;
  };
}

function parseCells(xml, sst) {
  const cells = new Map();
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const a = m[1];
    const ref = attr(a, 'r');
    if (!ref) continue;
    const t = attr(a, 't');
    const body = m[2] || '';
    const vm = /<v>([\s\S]*?)<\/v>/.exec(body);
    let v = null;
    if (t === 's') v = vm ? sst[+vm[1]] ?? '' : null;
    else if (t === 'inlineStr') v = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => unesc(x[1])).join('');
    else if (t === 'str' || t === 'e') v = vm ? unesc(vm[1]) : null;
    else if (t === 'b') v = vm ? vm[1] === '1' : null;
    else if (vm) v = +vm[1];
    cells.set(ref, { v, s: attr(a, 's') });
  }
  return cells;
}

// ---------------------------------------------------------------- 좌표 도구

export const colName = (n) => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

function rowsOf(cells) {
  const rows = new Map(); // row → Map(col → cell)
  for (const [ref, c] of cells) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref);
    let col = 0;
    for (const ch of m[1]) col = col * 26 + ch.charCodeAt(0) - 64;
    const r = +m[2];
    if (!rows.has(r)) rows.set(r, new Map());
    rows.get(r).set(col, c);
  }
  return rows;
}

const val = (row, col) => (row && row.get(col) ? row.get(col).v : null);
const text = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
const normName = (s) => text(s).toUpperCase().replace(/\s+/g, '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && /^-?[\d,.]+$/.test(v.trim()) ? +v.replace(/,/g, '') : null));

// ---------------------------------------------------------------- 상품 목록

export function extractProducts(book) {
  const notes = [];
  const codeSheet = findSheet(book, CODE_SHEET);
  if (!codeSheet) throw new Error(`'${CODE_SHEET}' 시트를 찾지 못했습니다.`);
  const rows = rowsOf(codeSheet);
  const rowNums = [...rows.keys()].sort((a, b) => a - b);

  // 머리글 행: '모델명' 이 있는 첫 행
  const headRow = rowNums.find((r) => [...rows.get(r).values()].some((c) => text(c.v) === '모델명'));
  if (!headRow) throw new Error(`'${CODE_SHEET}' 시트에서 '모델명' 머리글을 찾지 못했습니다.`);
  const head = rows.get(headRow);
  const colOf = (names) => {
    for (const [col, c] of head) if (names.includes(text(c.v))) return col;
    return null;
  };
  const nameCol = colOf(['모델명']);
  const catCol = colOf(['카테고리']);
  const brandCol = colOf(['브랜드']);
  const codeCols = Object.fromEntries(MARKETS.map((m) => [m.key, colOf(m.codeHeader)]));
  for (const m of MARKETS) if (!codeCols[m.key]) notes.push(`${m.label} 코드 열을 찾지 못해 이 마켓은 '코드 없음'으로 둡니다.`);

  // 스마트스토어 칸 색: '에이서계정 등록' 표시 칸과 같은 채우기면 에이서 스토어
  let acerFill = null;
  for (const r of rowNums) for (const c of rows.get(r).values()) if (/에이서\s*계정/.test(text(c.v))) acerFill = book.fillOf(c.s) || null;

  const expected = extractExpected(book, notes);

  const products = [];
  for (const r of rowNums) {
    if (r <= headRow) continue;
    const row = rows.get(r);
    const name = text(val(row, nameCol));
    if (!name) continue;
    const codes = {};
    for (const m of MARKETS) {
      const v = codeCols[m.key] ? text(val(row, codeCols[m.key])) : '';
      codes[m.key] = /^[A-Za-z0-9_-]+$/.test(v) ? v : '';
    }
    let naverStore = 'ihansung';
    const ssCell = codeCols.smartstore && row.get(codeCols.smartstore);
    if (ssCell) {
      const f = book.fillOf(ssCell.s);
      if (f && (acerFill == null || f === acerFill)) naverStore = 'acerstore';
    }
    const exp = expected.get(normName(name));
    if (!exp) notes.push(`'${name}' 의 기대 가격을 ${PRICE_SHEET}에서 찾지 못했습니다.`);
    products.push({
      row: r,
      name,
      category: text(val(row, catCol)),
      brand: text(val(row, brandCol)),
      codes,
      naverStore,
      expected: exp || {},
    });
  }
  if (!products.length) throw new Error(`'${CODE_SHEET}' 시트에 상품이 없습니다.`);
  return { products, notes };
}

function findSheet(book, name) {
  for (const [n, cells] of book.sheets) if (n.replace(/\s+/g, '') === name) return cells;
  return null;
}

// 정산가세팅에서 상품마다 기준 표를 골라 마켓별 등재가(세팅)·노출가를 읽는다.
// 표가 여럿(G마켓 기준·자사몰 기준·하이마트 기준)이면, 그 상품 행의 '상태'가 '세팅'(또는 노란색 FFFF00)인 표가 실제 세팅이다.
// 어느 표에서든 상태가 '단종'이면 가격은 비교하지 않는다.
// 노란색이 없으면 'G마켓 기준' 표(없으면 첫 표). 각 표의 마켓 묶음은 그 표의 정산가를 내는 마켓별 가격이다.
// G마켓 기준 표에서는 G마켓·옥션 페이지 쿠폰 적용가가 '노출가 (2차혜택가)' 열과 같아서 그 값을 노출가 기대값으로 쓴다.
const YELLOW = /rgb="(?:FF)?FFFF00"/i;
function extractExpected(book, notes) {
  const out = new Map();
  const cells = findSheet(book, PRICE_SHEET);
  if (!cells) { notes.push(`'${PRICE_SHEET}' 시트가 없어 가격은 비교하지 않습니다.`); return out; }
  const rows = rowsOf(cells);
  const rowNums = [...rows.keys()].sort((a, b) => a - b);
  const isHead = (r) => {
    const vals = [...rows.get(r).values()].map((c) => text(c.v));
    return vals.includes('카테고리') && vals.includes('모델명');
  };
  const heads = rowNums.filter(isHead);
  if (!heads.length) { notes.push(`'${PRICE_SHEET}' 에서 표 머리글을 찾지 못했습니다.`); return out; }
  const groupText = (r) => [...(rows.get(r - 1) || new Map()).values()].map((c) => text(c.v)).join(' ');

  const tables = heads.map((head, i) => {
    const hRow = rows.get(head);
    const gRow = rows.get(head - 1) || new Map();
    const hText = (col) => text(val(hRow, col));
    const label = (/(G마켓|자사몰|하이마트)\s*기준/.exec(groupText(head)) || [])[0]?.replace(/\s+/g, ' ') || `표 ${i + 1}`;
    const isG = /G마켓/.test(label);
    let nameCol = null, shown2Col = null, maxCol = null, stateCol = null;
    for (const [col] of hRow) {
      const t = hText(col);
      if (t === '모델명') nameCol = col;
      else if (t === '상태') stateCol = col;            // 세팅 / 단종 / 보류 (드롭다운)
      else if (/^노출가\s*\(2차혜택가\)/.test(t) && shown2Col == null) shown2Col = col;
      else if (t === '최대혜택가' && maxCol == null) maxCol = col;
    }
    // 위 행의 마켓 이름 아래 4칸: 등재가(세팅) · 노출가 · 정산액 · 차이
    const blocks = new Map();
    for (const [col, c] of gRow) {
      const lb = text(c.v);
      if (!MARKETS.some((m) => m.block === lb)) continue;
      if (/^등재가/.test(hText(col)) && hText(col + 1) === '노출가') blocks.set(lb, { list: col, shown: col + 1 });
    }
    const end = heads[i + 1] ?? Infinity;
    const byName = new Map();
    for (const r of rowNums) {
      if (r <= head || r >= end - 1) continue;
      const row = rows.get(r);
      const name = text(val(row, nameCol));
      if (!name) continue;
      const exp = {};
      for (const m of MARKETS) {
        const b = blocks.get(m.block);
        if (!b) continue;
        let list = num(val(row, b.list));
        let shown = num(val(row, b.shown));
        let max = null;
        if (m.block === 'G마켓·옥션' && isG) {
          if (shown2Col) shown = num(val(row, shown2Col));
          if (maxCol) max = num(val(row, maxCol));
        }
        if (list != null || shown != null) exp[m.key] = { list: round(list), shown: round(shown), max: round(max) };
      }
      const status = stateCol ? text(val(row, stateCol)) : '';
      const yellow = status === '세팅' || [...row.values()].some((c) => YELLOW.test(book.fillOf(c.s)));
      byName.set(normName(name), { exp, yellow, status, name });
    }
    return { label, isG, byName };
  });

  const base = tables.find((t) => t.isG) ?? tables[0];
  const names = new Set(tables.flatMap((t) => [...t.byName.keys()]));
  for (const n of names) {
    const marked = tables.filter((t) => t.byName.get(n)?.yellow);
    const t = marked[0] ?? (base.byName.has(n) ? base : tables.find((x) => x.byName.has(n)));
    if (marked.length > 1) notes.push(`'세팅' 표시가 여러 표에 있어 '${marked[0].label}'을 썼습니다: ${marked[0].byName.get(n).name}`);
    const gone = tables.some((x) => x.byName.get(n)?.status === '단종');
    if (gone) notes.push(`상태 '단종': ${t.byName.get(n).name} — 가격은 비교하지 않습니다.`);
    out.set(n, gone ? { _basis: t.label, _marked: false, _gone: true } : { ...t.byName.get(n).exp, _basis: t.label, _marked: marked.length > 0 });
  }
  return out;
}

const round = (n) => (n == null ? null : Math.round(n));
