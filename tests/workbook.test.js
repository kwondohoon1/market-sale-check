import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { openWorkbook, extractProducts, colName } from '../site/src/workbook.js';

// 가격세팅과 같은 모양의 작은 워크북을 만든다(실제 파일은 레포에 두지 않는다)
function sheetXml(rows, styleOf = () => 0) {
  const body = rows.map((cells, i) => {
    const r = i + 1;
    const cs = cells.map((v, j) => {
      if (v == null) return '';
      const ref = colName(j + 1) + r;
      const s = styleOf(ref);
      return typeof v === 'number'
        ? `<c r="${ref}" s="${s}"><v>${v}</v></c>`
        : `<c r="${ref}" s="${s}" t="inlineStr"><is><t>${v}</t></is></c>`;
    }).join('');
    return `<row r="${r}">${cs}</row>`;
  }).join('');
  return `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

async function makeBook() {
  const zip = new JSZip();
  zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="정산가세팅" sheetId="1" r:id="rId1"/><sheet name="마켓별상품코드" sheetId="2" r:id="rId2"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="x/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="x/worksheet" Target="worksheets/sheet2.xml"/></Relationships>');
  zip.file('xl/styles.xml', '<styleSheet><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor theme="9"/></patternFill></fill></fills>'
    + '<cellXfs count="2"><xf fillId="0"/><xf fillId="2"/></cellXfs></styleSheet>');
  const groups = [null, null, null, 'G마켓 기준', null, null, null, '정산', null, null, null, 'G마켓·옥션', null, null, null, '자사몰', null, null, null, '스마트스토어'];
  const head = ['카테고리', '브랜드', '모델명', '기준', '입력가', '노출가 \n(2차혜택가)', '최대혜택가', '정산가', '원가', '마진', '마진율',
    '등재가(세팅)', '노출가', '정산액', '차이', '등재가(세팅)', '노출가', '정산액', '차이', '등재가(세팅)', '노출가', '정산액', '차이'];
  zip.file('xl/worksheets/sheet1.xml', sheetXml([
    ['마켓 조건'],
    groups,
    head,
    ['VGA', 'PNY', 'PNY 5080', '노출가', 2670000, 2670000, 2520000, 1, 999, 1, 1, 3296290, 3230370, 1, 0, 2630070, 2630070, 1, 0, 2737990, 2737990.4, 1, 0],
    ['SSD', 'Acer', 'GM9000 2TB', '노출가', 584640, 584640, 543720, 1, 999, 1, 1, 721770, 707340, 1, 0, 571700, 571700, 1, 0, 624710, 612220, 1, 0],
    [],
    [null, null, null, '자사몰 기준'],
    head,
    ['VGA', 'PNY', 'PNY 5080', '노출가', 1, 1, 1, 1, 1, 1, 1, 9, 9, 1, 0, 9, 9, 1, 0, 9, 9, 1, 0],
  ]));
  zip.file('xl/worksheets/sheet2.xml', sheetXml([
    ['카테고리', '브랜드', '모델명', '노출가', '지마켓', '옥션', '자사몰', '하이마트', '하이마트온라인상품', '스마트스토어', '쿠팡', '컴퓨존'],
    ['VGA', 'PNY', 'PNY 5080', 1, '4839706626', 'F647013940', '194986', 'MW41545_1', '0070022172', '13734906965', null, ''],
    ['SSD', 'Acer', 'GM9000 2TB', 1, '4691332268', 'F496764418', '219568', 'MW41545_2', '0063833265', '13199585289', 16370161234, ''],
    [],
    [null, null, null, null, null, null, null, null, null, '에이서계정 등록'],
  ], (ref) => (ref === 'J3' || ref === 'J5' ? 1 : 0)));
  return zip.generateAsync({ type: 'uint8array' });
}

test('상품·코드·기대 가격을 읽는다', async () => {
  const book = await openWorkbook(JSZip, await makeBook());
  const { products, notes } = extractProducts(book);
  assert.deepEqual(notes, []);
  assert.equal(products.length, 2);
  const [a, b] = products;
  assert.equal(a.name, 'PNY 5080');
  assert.equal(a.codes.gmarket, '4839706626');
  assert.equal(a.codes.himart, '0070022172', '하이마트는 온라인상품 코드를 쓴다');
  assert.equal(a.codes.coupang, '');
  assert.equal(b.codes.coupang, '16370161234');
  // G마켓·옥션 노출가는 '노출가(2차혜택가)' 열, 최대혜택가도 함께
  assert.deepEqual(a.expected.gmarket, { list: 3296290, shown: 2670000, max: 2520000 });
  assert.deepEqual(a.expected.auction, a.expected.gmarket);
  assert.deepEqual(a.expected.superstore, { list: 2630070, shown: 2630070, max: null });
  assert.deepEqual(a.expected.smartstore, { list: 2737990, shown: 2737990, max: null });
  assert.equal(a.expected.himart, undefined, '표에 없는 마켓은 기대값 없음');
});

test('스마트스토어 칸 색이 에이서계정 표시와 같으면 에이서 스토어', async () => {
  const book = await openWorkbook(JSZip, await makeBook());
  const { products } = extractProducts(book);
  assert.equal(products[0].naverStore, 'ihansung');
  assert.equal(products[1].naverStore, 'acerstore');
});

// 실제 가격세팅 파일 시험: MSC_FIXTURE=레포 밖 경로 npm test
test('실제 가격세팅 파일', { skip: !process.env.MSC_FIXTURE }, async () => {
  const book = await openWorkbook(JSZip, await readFile(process.env.MSC_FIXTURE));
  const { products, notes } = extractProducts(book);
  console.log(`상품 ${products.length}개, 알림 ${notes.length}개`, notes);
  assert.ok(products.length > 0);
  const p = products.find((x) => /5080 ARGB/.test(x.name));
  if (p) {
    assert.deepEqual(p.expected.gmarket, { list: 3296290, shown: 2670000, max: 2520000 });
    assert.equal(p.expected.superstore.list, 2630070);
    assert.equal(p.expected.himart.shown, 2770430);
    assert.equal(p.expected.smartstore.list, 2737990);
  }
  const acer = products.filter((x) => x.naverStore === 'acerstore').map((x) => x.name);
  console.log('에이서 스토어:', acer);
});
