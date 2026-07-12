// KIS 국내 호가 조회 (D15 실시간 탭) — 매도/매수 10호가 + 총잔량.
// REST 폴링 전용 (WebSocket 실시간 호가는 V-next — 연결당 20건 제한·다중연결 필요).
import { ExternalApiError } from '@/lib/errors';
import type { KisClient } from '@/lib/providers/kis/client';
import { parseToMinorUnits } from '@/lib/utils/money';
import type { Orderbook, OrderbookLevel } from '@/types';

type AskingPriceOutput = Record<string, string>;

/** KIS output1 → Orderbook. 빈 값/0은 필터. asOf는 호출부가 주입(순수 함수·테스트 용이) */
export function parseOrderbook(out: AskingPriceOutput, ticker: string, asOf: string): Orderbook {
  const level = (prefix: 'askp' | 'bidp', n: number): OrderbookLevel => ({
    price: parseToMinorUnits(out[`${prefix}${n}`] || '0', 'KRW'),
    qty: Number(out[`${prefix}_rsqn${n}`] || 0),
  });
  const levels = (prefix: 'askp' | 'bidp'): OrderbookLevel[] =>
    Array.from({ length: 10 }, (_, i) => level(prefix, i + 1)).filter((l) => l.price > 0);

  return {
    ticker,
    asks: levels('askp'),
    bids: levels('bidp'),
    totalAskQty: Number(out.total_askp_rsqn || 0),
    totalBidQty: Number(out.total_bidp_rsqn || 0),
    asOf,
  };
}

export async function getDomesticOrderbook(client: KisClient, ticker: string): Promise<Orderbook> {
  if (!/^\d{6}$/.test(ticker)) {
    throw new ExternalApiError('kis', '국내 종목코드는 6자리 숫자여야 합니다.', `invalid ticker: ${ticker}`);
  }
  const data = await client.request<{ output1?: AskingPriceOutput }>({
    path: '/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn',
    trId: 'FHKST01010200',
    params: { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: ticker },
  });
  const out = data.output1;
  // output1 자체가 없으면 실제 API 오류 → 502. 있으나 호가가 비면(휴장·장외) 빈 호가로 정상 반환.
  // (주말/휴장에 매 폴링마다 502를 던지지 않도록 — 클라이언트는 '호가 없음'을 표시)
  if (!out) {
    throw new ExternalApiError('kis', '호가 정보를 불러오지 못했습니다.', `orderbook ${ticker}: no output1`);
  }
  return parseOrderbook(out, ticker, new Date().toISOString());
}
