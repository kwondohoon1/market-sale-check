// 수집 결과 한 칸(상품 × 마켓)을 판정한다. 화면과 내려받기가 같은 판정을 쓴다.

export const TOLERANCE = 10; // 원. 엑셀 반올림·옥션 100원 단위 차이(실측 10원)를 일치로 본다

export const VERDICTS = {
  ok: { label: '정상', rank: 0 },
  mismatch: { label: '가격 불일치', rank: 3 },
  notSelling: { label: '판매 안 함', rank: 4 },
  notFound: { label: '페이지 없음', rank: 4 },
  failed: { label: '수집 실패', rank: 2 },
  noExpected: { label: '판매중 · 기준 없음', rank: 1 },
  noCode: { label: '코드 없음', rank: -1 },
  pending: { label: '대기', rank: -1 },
};

// expected: { list, shown, max } | undefined, result: 확장이 돌려준 값 | undefined
export function judge({ code, expected, result }) {
  if (!code) return { verdict: 'noCode', diffs: [] };
  if (!result) return { verdict: 'pending', diffs: [] };
  if (result.error) return { verdict: 'failed', diffs: [], note: result.status };
  if (!result.found) return { verdict: 'notFound', diffs: [], note: result.status };
  if (!result.selling) return { verdict: 'notSelling', diffs: [], note: result.status };
  if (!expected || (expected.list == null && expected.shown == null)) return { verdict: 'noExpected', diffs: [] };

  const diffs = [];
  const check = (key, label, want, got) => {
    if (want == null) return;
    const diff = got == null ? null : got - want;
    diffs.push({ key, label, want, got, diff, ok: diff != null && Math.abs(diff) <= TOLERANCE });
  };
  check('list', '등재가', expected.list, result.listPrice);
  check('shown', '노출가', expected.shown, result.shownPrice);
  return { verdict: diffs.every((d) => d.ok) ? 'ok' : 'mismatch', diffs };
}

export const won = (n) => (n == null ? '–' : Math.round(n).toLocaleString('ko-KR'));
export const signed = (n) => (n == null ? '–' : (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(Math.round(n)).toLocaleString('ko-KR'));
