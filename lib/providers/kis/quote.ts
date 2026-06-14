// KIS 현재가 조회 — 국내/해외 (W1)
import { ExternalApiError } from '@/lib/errors';
import type { KisClient } from '@/lib/providers/kis/client';
import { parseToMinorUnits } from '@/lib/utils/money';
import type { Market, Quote } from '@/types';
import { regionOf } from '@/lib/utils/market-hours';

/** KIS 해외 거래소 코드 매핑 */
export const KIS_EXCD: Record<string, string> = {
  NASDAQ: 'NAS',
  NYSE: 'NYS',
  AMEX: 'AMS',
};

interface DomesticPriceOutput {
  stck_prpr: string; // 현재가
  prdy_vrss: string; // 전일 대비
  prdy_ctrt: string; // 등락률
  acml_vol: string; // 누적 거래량
}

interface OverseasPriceOutput {
  last: string;
  diff: string;
  rate: string;
  tvol: string;
}

function requireFields<T extends object>(output: T | undefined, fields: string[], context: string): T {
  if (!output) {
    throw new ExternalApiError('kis', 'KIS 시세 응답이 비어 있습니다.', `${context}: empty output`);
  }
  for (const f of fields) {
    const v = (output as Record<string, unknown>)[f];
    if (v === undefined || v === null || v === '') {
      throw new ExternalApiError('kis', 'KIS 시세 응답에 필요한 값이 없습니다.', `${context}: missing ${f}`);
    }
  }
  return output;
}

export async function getDomesticQuote(client: KisClient, ticker: string): Promise<Quote> {
  if (!/^\d{6}$/.test(ticker)) {
    throw new ExternalApiError('kis', '국내 종목코드는 6자리 숫자여야 합니다.', `invalid ticker: ${ticker}`);
  }
  const data = await client.request<{ output?: DomesticPriceOutput }>({
    path: '/uapi/domestic-stock/v1/quotations/inquire-price',
    trId: 'FHKST01010100',
    params: { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: ticker },
  });
  const out = requireFields(data.output, ['stck_prpr'], `domestic quote ${ticker}`);
  return {
    ticker,
    market: 'KOSPI', // 시장 구분은 호출부의 stocks 마스터 기준으로 덮어씀
    currency: 'KRW',
    price: parseToMinorUnits(out.stck_prpr, 'KRW'),
    change: parseToMinorUnits(out.prdy_vrss ?? '0', 'KRW'),
    changeRate: (out.prdy_ctrt ?? '0').trim(),
    volume: Number(out.acml_vol ?? 0),
    asOf: new Date().toISOString(),
  };
}

export async function getOverseasQuote(client: KisClient, ticker: string, market: Market): Promise<Quote> {
  const excd = KIS_EXCD[market];
  if (!excd) {
    throw new ExternalApiError('kis', '지원하지 않는 해외 거래소입니다.', `market: ${market}`);
  }
  if (!/^[A-Z][A-Z0-9.\-]{0,15}$/.test(ticker)) {
    throw new ExternalApiError('kis', '해외 티커 형식이 올바르지 않습니다.', `invalid ticker: ${ticker}`);
  }
  const data = await client.request<{ output?: OverseasPriceOutput }>({
    path: '/uapi/overseas-price/v1/quotations/price',
    trId: 'HHDFS00000300',
    params: { AUTH: '', EXCD: excd, SYMB: ticker },
  });
  const out = requireFields(data.output, ['last'], `overseas quote ${ticker}`);
  return {
    ticker,
    market,
    currency: 'USD',
    price: parseToMinorUnits(out.last, 'USD'),
    change: parseToMinorUnits(out.diff ?? '0', 'USD'),
    changeRate: (out.rate ?? '0').trim(),
    volume: Number(out.tvol ?? 0),
    asOf: new Date().toISOString(),
  };
}

export async function getQuote(client: KisClient, ticker: string, market: Market): Promise<Quote> {
  if (regionOf(market) === 'KR') {
    const q = await getDomesticQuote(client, ticker);
    return { ...q, market };
  }
  return getOverseasQuote(client, ticker, market);
}
