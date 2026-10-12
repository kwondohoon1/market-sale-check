// 마켓별 상품 주소 규칙과 읽기 함수. 백그라운드와 실측 도구(tools/live-check.mjs)가 함께 쓴다.
import { readGmarket, readAuction, readSuperstore, readHimart, readNaver, readCoupang } from './readers.js';

export const NAVER_STORES = { ihansung: 'https://brand.naver.com/ihansung', acerstore: 'https://smartstore.naver.com/acerstore' };

// gap: 이 마켓 상품 사이에 쉬는 시간(ms). G마켓·옥션은 하루 수백 번 열면 봇확인이 붙어서 길게 둔다.
export const MARKETS = {
  gmarket: { gap: 7000, read: readGmarket, urls: (j) => [`https://item.gmarket.co.kr/Item?goodscode=${j.code}`] },
  auction: { gap: 7000, read: readAuction, urls: (j) => [`https://itempage3.auction.co.kr/DetailView.aspx?itemno=${j.code}`] },
  superstore: { gap: 1500, read: readSuperstore, urls: (j) => [`https://www.superstore.co.kr/item/item.html?pn=${j.code}`] },
  himart: { gap: 2500, read: readHimart, urls: (j) => [`https://www.e-himart.co.kr/app/goods/goodsDetail?goodsNo=${j.code}`] },
  smartstore: {
    gap: 3000,
    read: readNaver,
    // 표시된 스토어를 먼저, 없으면 다른 스토어도 열어 본다
    urls: (j) => {
      const first = NAVER_STORES[j.store] ? j.store : 'ihansung';
      const order = [first, ...Object.keys(NAVER_STORES).filter((s) => s !== first)];
      return order.map((s) => `${NAVER_STORES[s]}/products/${j.code}`);
    },
  },
  coupang: { gap: 4000, read: readCoupang, urls: (j) => [`https://www.coupang.com/vp/products/${j.code}`] },
};
