# 마켓 판매 점검

가격세팅 xlsx를 넣으면 컴포넌트가 마켓마다 **판매중인지**, 판매중이면 **가격이 세팅대로 들어가 있는지** 확인하는 페이지.

- 페이지: https://kwondohoon1.github.io/market-sale-check/
- 엑셀은 브라우저 안에서만 읽는다(CSP `connect-src 'none'`). 레포에는 코드만 올라간다(허용 목록 `.gitignore` + `.githooks/pre-commit`).
- 마켓 페이지는 G마켓·옥션·쿠팡이 서버 요청을 막아서(403) **크롬 확장**이 사용자 크롬의 뒤쪽 탭에서 열고 읽는다.

## 구성

| 경로 | 하는 일 |
| --- | --- |
| `site/` | GitHub Pages 페이지. `src/workbook.js` 가 가격세팅을 읽고 `src/judge.js` 가 칸마다 판정 |
| `extension/` | 크롬 확장(MV3). `bridge.js` 가 페이지와 연결, `background.js` 가 탭을 열고, `readers.js` 가 마켓별 값을 읽음. 주소 규칙은 `markets.js` |
| `tools/live-check.mjs` | 실제 크롬(CDP)으로 같은 읽기 함수를 돌려 보는 실측 도구 |
| `tools/e2e.mjs` | 확장을 설치한 크로미움으로 페이지 → 확장 → 마켓 수집을 끝까지 시험 |

## 읽는 값

| 마켓 | 코드 열 | 주소 | 등재가 | 노출가 |
| --- | --- | --- | --- | --- |
| G마켓 | 지마켓 | `item.gmarket.co.kr/Item?goodscode=` | `GmktItem.OrderSet.SellPrice` | 쿠폰 적용가 = 정산가세팅 `노출가(2차혜택가)` |
| 옥션 | 옥션 | `itempage3.auction.co.kr/DetailView.aspx?itemno=` | `SellingPrice` | `optimalPrice` (100원 단위라 10원 차이가 남) |
| 자사몰 | 자사몰 | `superstore.co.kr/item/item.html?pn=` | ld+json `offers.price` | 같은 값 |
| 하이마트 | 하이마트온라인상품 | `e-himart.co.kr/app/goods/goodsDetail?goodsNo=` | `[originprice]` | `[price]`, 판매 여부는 `eg:state=T` |
| 스마트스토어 | 스마트스토어 | 칸 색이 '에이서계정 등록'과 같으면 `smartstore.naver.com/acerstore`, 아니면 `brand.naver.com/ihansung` (없으면 다른 쪽도 열어 봄) | `salePrice` | `benefitsView.discountedSalePrice` |
| 쿠팡 | 쿠팡 | `coupang.com/vp/products/` | 시험 단계 — 엑셀 코드가 상품 페이지 번호가 아님(윙 등록상품ID로 보임) | |

기대값은 `정산가세팅` 의 **G마켓 기준** 표에서 마켓별 `등재가(세팅)`·`노출가`. 차이가 10원 이하면 정상.

## 확장 설치

1. 페이지의 **확장 내려받기** 로 zip을 받아 압축을 푼다(배포 때 `extension/` 을 묶는다).
2. `chrome://extensions` → 개발자 모드 → **압축해제된 확장 프로그램 로드** → 푼 폴더.

## 시험

```bash
npm test
MSC_FIXTURE=레포밖/가격세팅.xlsx npm test
node tools/live-check.mjs 가격세팅.xlsx superstore,himart,smartstore
```
