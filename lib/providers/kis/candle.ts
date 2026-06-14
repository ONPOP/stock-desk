// KIS 캔들(기간별 시세) 조회 — 국내/해외, 1m/1d/1w (W1)
import { ExternalApiError } from '@/lib/errors';
import type { KisClient } from '@/lib/providers/kis/client';
import { KIS_EXCD } from '@/lib/providers/kis/quote';
import { kisLocalToUtc, EST_TZ, KST_TZ, dateInTz } from '@/lib/utils/date';
import { regionOf } from '@/lib/utils/market-hours';
import { parseToMinorUnits } from '@/lib/utils/money';
import type { Candle, CandleInterval, Currency, Market } from '@/types';

function toCandle(
  row: Record<string, string>,
  map: { date: string; time?: string; o: string; h: string; l: string; c: string; v: string },
  currency: Currency,
  tz: string,
): Candle | null {
  const date = row[map.date];
  const close = row[map.c];
  // KIS는 휴장일·빈 행을 빈 문자열로 채워 보내는 경우가 있음 → 스킵
  if (!date || !close) return null;
  return {
    ts: kisLocalToUtc(date, map.time ? (row[map.time] ?? '000000').padStart(6, '0') : '000000', tz),
    o: parseToMinorUnits(row[map.o] || close, currency),
    h: parseToMinorUnits(row[map.h] || close, currency),
    l: parseToMinorUnits(row[map.l] || close, currency),
    c: parseToMinorUnits(close, currency),
    volume: Number(row[map.v] || 0),
  };
}

async function getDomesticDailyCandles(
  client: KisClient,
  ticker: string,
  interval: '1d' | '1w',
  count: number,
): Promise<Candle[]> {
  // 기간별시세는 1회 최대 100건 — count만큼 구간을 나눠 조회
  const candles: Candle[] = [];
  const daysPerCandle = interval === '1w' ? 7 : 1;
  let end = new Date();
  while (candles.length < count) {
    const start = new Date(end.getTime() - 140 * daysPerCandle * 24 * 3600 * 1000);
    const data = await client.request<{ output2?: Array<Record<string, string>> }>({
      path: '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
      trId: 'FHKST03010100',
      params: {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: ticker,
        FID_INPUT_DATE_1: dateInTz(start, KST_TZ).replaceAll('-', ''),
        FID_INPUT_DATE_2: dateInTz(end, KST_TZ).replaceAll('-', ''),
        FID_PERIOD_DIV_CODE: interval === '1w' ? 'W' : 'D',
        FID_ORG_ADJ_PRC: '0', // 수정주가 반영
      },
    });
    const rows = (data.output2 ?? []).filter((r) => r && Object.keys(r).length > 0);
    if (rows.length === 0) break;
    for (const row of rows) {
      const c = toCandle(
        row,
        { date: 'stck_bsop_date', o: 'stck_oprc', h: 'stck_hgpr', l: 'stck_lwpr', c: 'stck_clpr', v: 'acml_vol' },
        'KRW',
        KST_TZ,
      );
      if (c) candles.push(c);
    }
    end = new Date(start.getTime() - 24 * 3600 * 1000);
  }
  return candles.slice(0, count).reverse(); // 과거 → 최신 순
}

async function getDomesticMinuteCandles(client: KisClient, ticker: string, count: number): Promise<Candle[]> {
  // 당일 분봉 — 1회 30건, 시각을 거슬러가며 조회
  const candles: Candle[] = [];
  let hour = '153000';
  for (let i = 0; i < Math.ceil(count / 30) && candles.length < count; i++) {
    const data = await client.request<{ output2?: Array<Record<string, string>> }>({
      path: '/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice',
      trId: 'FHKST03010200',
      params: {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: ticker,
        FID_INPUT_HOUR_1: hour,
        FID_PW_DATA_INCU_YN: 'N',
        FID_ETC_CLS_CODE: '',
      },
    });
    const rows = data.output2 ?? [];
    if (rows.length === 0) break;
    for (const row of rows) {
      const c = toCandle(
        row,
        { date: 'stck_bsop_date', time: 'stck_cntg_hour', o: 'stck_oprc', h: 'stck_hgpr', l: 'stck_lwpr', c: 'stck_prpr', v: 'cntg_vol' },
        'KRW',
        KST_TZ,
      );
      if (c) candles.push(c);
    }
    const last = rows[rows.length - 1]?.stck_cntg_hour;
    if (!last || last <= '090000') break;
    hour = last;
  }
  return candles.slice(0, count).reverse();
}

async function getOverseasDailyCandles(
  client: KisClient,
  ticker: string,
  market: Market,
  interval: '1d' | '1w',
  count: number,
): Promise<Candle[]> {
  const excd = KIS_EXCD[market];
  const candles: Candle[] = [];
  let bymd = ''; // ''=오늘부터
  // 1회 최대 100건 — KEYB(BYMD) 페이지네이션
  while (candles.length < count) {
    const data = await client.request<{ output2?: Array<Record<string, string>> }>({
      path: '/uapi/overseas-price/v1/quotations/dailyprice',
      trId: 'HHDFS76240000',
      params: {
        AUTH: '',
        EXCD: excd,
        SYMB: ticker,
        GUBN: interval === '1w' ? '1' : '0',
        BYMD: bymd,
        MODP: '1', // 수정주가 반영
      },
    });
    const rows = (data.output2 ?? []).filter((r) => r?.xymd);
    if (rows.length === 0) break;
    for (const row of rows) {
      const c = toCandle(row, { date: 'xymd', o: 'open', h: 'high', l: 'low', c: 'clos', v: 'tvol' }, 'USD', EST_TZ);
      if (c) candles.push(c);
    }
    const oldest = rows[rows.length - 1].xymd;
    const prevDay = new Date(
      Date.UTC(Number(oldest.slice(0, 4)), Number(oldest.slice(4, 6)) - 1, Number(oldest.slice(6, 8)) - 1),
    );
    bymd = prevDay.toISOString().slice(0, 10).replaceAll('-', '');
  }
  return candles.slice(0, count).reverse();
}

async function getOverseasMinuteCandles(client: KisClient, ticker: string, market: Market, count: number): Promise<Candle[]> {
  const excd = KIS_EXCD[market];
  const data = await client.request<{ output2?: Array<Record<string, string>> }>({
    path: '/uapi/overseas-price/v1/quotations/inquire-time-itemchartprice',
    trId: 'HHDFS76950200',
    params: {
      AUTH: '',
      EXCD: excd,
      SYMB: ticker,
      NMIN: '1',
      PINC: '1',
      NEXT: '',
      NREC: String(Math.min(count, 120)),
      FILL: '',
      KEYB: '',
    },
  });
  const candles: Candle[] = [];
  for (const row of data.output2 ?? []) {
    const c = toCandle(
      row,
      { date: 'xymd', time: 'xhms', o: 'open', h: 'high', l: 'low', c: 'last', v: 'evol' },
      'USD',
      EST_TZ,
    );
    if (c) candles.push(c);
  }
  return candles.slice(0, count).reverse();
}

export async function getCandles(
  client: KisClient,
  ticker: string,
  market: Market,
  interval: CandleInterval,
  count: number,
): Promise<Candle[]> {
  if (!Number.isInteger(count) || count < 1 || count > 2000) {
    throw new ExternalApiError('kis', '조회 개수는 1~2000 사이여야 합니다.', `count: ${count}`);
  }
  if (regionOf(market) === 'KR') {
    if (!/^\d{6}$/.test(ticker)) {
      throw new ExternalApiError('kis', '국내 종목코드는 6자리 숫자여야 합니다.', `invalid ticker: ${ticker}`);
    }
    return interval === '1m'
      ? getDomesticMinuteCandles(client, ticker, count)
      : getDomesticDailyCandles(client, ticker, interval, count);
  }
  if (!KIS_EXCD[market]) {
    throw new ExternalApiError('kis', '지원하지 않는 해외 거래소입니다.', `market: ${market}`);
  }
  return interval === '1m'
    ? getOverseasMinuteCandles(client, ticker, market, count)
    : getOverseasDailyCandles(client, ticker, market, interval, count);
}
