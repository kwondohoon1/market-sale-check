// 마켓별 상품 페이지에서 판매 상태와 가격을 읽는 함수들.
// chrome.scripting.executeScript({ world: 'MAIN' }) 로 페이지 안에 주입되므로
// 각 함수는 바깥 변수를 쓰지 않고 혼자 돌아가야 한다.
// 돌려주는 값: { found, name, selling, status, listPrice, shownPrice, maxPrice }
//   listPrice  = 등재가(판매가)   shownPrice = 노출가(쿠폰·즉시할인 적용가)   maxPrice = 최대혜택가(있을 때만)

export function readGmarket() {
  const o = window.GmktItem && window.GmktItem.OrderSet;
  const g = window.goods || {};
  if (!o) return { found: false, status: document.title || '상품 정보 없음' };
  const coupon = o.Discount && o.Discount.CouponAppliedPrice;
  const extras = ((coupon && coupon.extraDiscounts) || []).map((x) => +x.extraDiscountPrice).filter((n) => n > 0);
  const text = document.body ? document.body.innerText : '';
  const stopped = /판매가\s*(종료|중지)된\s*상품|판매\s*(종료|중지)\s*상품/.test(text);
  const soldOut = !!g.IsOutOfStock;
  return {
    found: true,
    name: g.GoodsName || o.ItemNm || document.title,
    selling: !soldOut && !stopped,
    status: stopped ? '판매 중지' : soldOut ? '품절' : '판매중',
    listPrice: +o.SellPrice || null,
    shownPrice: +(coupon && coupon.couponAppliedPrice) || +o.SellPrice || null,
    maxPrice: extras.length ? Math.min(...extras) : null,
  };
}

export function readAuction() {
  if (/NoItem/i.test(location.pathname)) return { found: false, status: '상품 없음' };
  const html = document.documentElement.outerHTML;
  const sell = /"SellingPrice"\s*:\s*([\d.]+)/.exec(html);
  if (!sell) return { found: false, status: document.title || '상품 정보 없음' };
  const optimal = /optimalPrice\s*:\s*([\d.]+)/.exec(html);
  const name = (document.title || '').replace(/\s*-\s*옥션\s*$/, '');
  const text = document.body ? document.body.innerText : '';
  const stopped = /판매가\s*(종료|중지)된\s*상품|판매\s*(종료|중지)\s*상품/.test(text);
  const soldOut = /"availability"\s*:\s*"[^"]*OutOfStock"/.test(html);
  return {
    found: true,
    name,
    selling: !stopped && !soldOut,
    status: stopped ? '판매 중지' : soldOut ? '품절' : '판매중',
    listPrice: Math.round(+sell[1]) || null,
    shownPrice: Math.round(+(optimal && optimal[1])) || Math.round(+sell[1]) || null,
    maxPrice: null,
  };
}

export function readSuperstore() {
  if (!/\/item\/item\.html/.test(location.pathname)) return { found: false, status: '상품 없음' };
  let offer = null;
  let name = '';
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const j = JSON.parse(s.textContent);
      for (const it of Array.isArray(j) ? j : [j]) {
        if (it && it['@type'] === 'Product' && it.offers) { offer = it.offers; name = it.name || ''; }
      }
    } catch (e) { /* 다른 ld+json 은 무시 */ }
  }
  if (!offer) return { found: false, status: document.title || '상품 정보 없음' };
  const avail = String(offer.availability || '');
  const inStock = /InStock/i.test(avail);
  const price = Math.round(+offer.price) || null;
  return {
    found: true,
    name: name || document.title.replace(/\s*:\s*한성컴퓨터 슈퍼스토어\s*$/, ''),
    selling: inStock,
    status: inStock ? '판매중' : (avail.split('/').pop() || '판매 안 함'),
    listPrice: price,
    shownPrice: price,
    maxPrice: null,
  };
}

export function readHimart() {
  if (!/goodsDetail/.test(location.pathname)) return { found: false, status: '상품 없음' };
  const meta = (p) => { const m = document.querySelector(`meta[property="${p}"]`); return m ? m.content : ''; };
  const inp = document.querySelector('[originprice][price]');
  if (!inp && !meta('eg:itemId')) return { found: false, status: document.title || '상품 정보 없음' };
  const state = meta('eg:state');
  const list = inp ? +inp.getAttribute('originprice') : null;
  const shown = inp ? +inp.getAttribute('price') : +meta('eg:originalPrice');
  const benefit = +meta('eg:salePrice');
  const selling = state === 'T';
  return {
    found: true,
    name: meta('eg:itemName') || document.title.replace(/^롯데하이마트\s*\|\s*/, ''),
    selling,
    status: selling ? '판매중' : `판매 안 함(상태 ${state || '?'})`,
    listPrice: list || null,
    shownPrice: shown || null,
    maxPrice: benefit || null,
  };
}

export function readNaver() {
  const p = window.__PRELOADED_STATE__ && window.__PRELOADED_STATE__.simpleProductForDetailPage;
  const prod = p && (p.A || p);
  if (!prod || !prod.salePrice) return { found: false, status: document.title || '상품 정보 없음' };
  const st = prod.productStatusType;
  const disp = prod.channelProductDisplayStatusType;
  const selling = st === 'SALE' && (!disp || disp === 'ON');
  const label = { SALE: '판매중', OUTOFSTOCK: '품절', SUSPENSION: '판매 중지', CLOSE: '판매 종료', PROHIBITION: '판매 금지' };
  const b = prod.benefitsView || {};
  return {
    found: true,
    name: prod.name || document.title,
    selling,
    status: selling ? '판매중' : `${label[st] || st || '?'}${disp && disp !== 'ON' ? ` · 전시 ${disp}` : ''}`,
    listPrice: +prod.salePrice || null,
    shownPrice: +b.discountedSalePrice || +prod.salePrice || null,
    maxPrice: null,
  };
}

export function readCoupang() {
  const text = document.body ? document.body.innerText : '';
  if (/상품을 찾을 수 없습니다/.test(text)) return { found: false, status: '상품 없음' };
  const num = (sel) => { const e = document.querySelector(sel); return e ? +e.textContent.replace(/[^\d]/g, '') : null; };
  const list = num('.origin-price') || num('.price-amount.original-price-amount');
  const shown = num('.total-price strong') || num('.final-price-amount') || num('.price-amount.final-price-amount');
  if (!shown && !list) return { found: false, status: document.title || '상품 정보 없음' };
  const soldOut = /일시품절|품절/.test((document.querySelector('.prod-buy-btn, .prod-atf') || document.body).innerText);
  return {
    found: true,
    name: (document.querySelector('.prod-buy-header__title, h1') || {}).textContent || document.title,
    selling: !soldOut,
    status: soldOut ? '품절' : '판매중',
    listPrice: list || shown,
    shownPrice: shown || list,
    maxPrice: null,
  };
}
