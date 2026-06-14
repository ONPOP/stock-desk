// SEC EDGAR ticker→CIK 매핑 — company_tickers.json. sync:cik 스크립트에서 사용.
import type { EdgarClient } from '@/lib/providers/edgar/client';

const COMPANY_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';

interface CompanyTickerEntry {
  cik_str?: number;
  ticker?: string;
  title?: string;
}

export interface CikEntry {
  ticker: string;
  cik: string; // 10자리 zero-pad
}

/** CIK 정수 → 10자리 zero-pad 문자열 */
export function padCik(cik: number | string): string {
  return String(cik).replace(/\D/g, '').padStart(10, '0');
}

/** 순수 변환: company_tickers.json 객체 → CikEntry[] */
export function parseCompanyTickers(json: Record<string, CompanyTickerEntry>): CikEntry[] {
  const out: CikEntry[] = [];
  for (const v of Object.values(json)) {
    if (v && typeof v.cik_str === 'number' && v.ticker) {
      out.push({ ticker: v.ticker.toUpperCase(), cik: padCik(v.cik_str) });
    }
  }
  return out;
}

export async function fetchCikMap(client: EdgarClient): Promise<CikEntry[]> {
  const json = await client.getJson<Record<string, CompanyTickerEntry>>(COMPANY_TICKERS_URL);
  return parseCompanyTickers(json);
}
