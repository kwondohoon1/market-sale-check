import test from 'node:test';
import assert from 'node:assert/strict';
import { judge } from '../site/src/judge.js';

const sell = (list, shown) => ({ found: true, selling: true, status: '판매중', listPrice: list, shownPrice: shown });

test('코드가 없으면 코드 없음', () => {
  assert.equal(judge({ code: '', expected: { list: 1 }, result: undefined }).verdict, 'noCode');
});

test('결과 전이면 대기', () => {
  assert.equal(judge({ code: '1', expected: {}, result: undefined }).verdict, 'pending');
});

test('10원 이하 차이는 정상(옥션 100원 단위 반올림)', () => {
  const r = judge({ code: '1', expected: { list: 3296290, shown: 2670000 }, result: sell(3296300, 2669990) });
  assert.equal(r.verdict, 'ok');
  assert.deepEqual(r.diffs.map((d) => d.diff), [10, -10]);
});

test('11원 넘게 다르면 불일치', () => {
  const r = judge({ code: '1', expected: { list: 1000, shown: 900 }, result: sell(1000, 911) });
  assert.equal(r.verdict, 'mismatch');
  assert.equal(r.diffs.find((d) => !d.ok).label, '노출가');
});

test('페이지에서 가격을 못 읽으면 불일치', () => {
  assert.equal(judge({ code: '1', expected: { list: 1000 }, result: sell(null, 1000) }).verdict, 'mismatch');
});

test('품절·없음·실패를 구분', () => {
  assert.equal(judge({ code: '1', expected: {}, result: { found: true, selling: false, status: '품절' } }).verdict, 'notSelling');
  assert.equal(judge({ code: '1', expected: {}, result: { found: false, status: '상품 없음' } }).verdict, 'notFound');
  assert.equal(judge({ code: '1', expected: {}, result: { found: false, error: true, status: '봇 확인' } }).verdict, 'failed');
});

test('기준값이 없으면 판매중 · 기준 없음', () => {
  assert.equal(judge({ code: '1', expected: undefined, result: sell(1, 1) }).verdict, 'noExpected');
});
