// Finnhub 미국 재무 지표 (F4). profile2(시총) + metric(밸류) + financials-reported(분기 매출·영익·순익·CAPEX) 조합.
// 파싱은 순수 함수(buildFinnhubMetrics)로 분리해 픽스처 테스트가 가능하게 한다.
import { ValidationError } from '@/lib/errors';
import type { StockMetrics } from '@/types';
import type { FinnhubClient } from '@/lib/providers/finnhub/client';

export interface FinnhubProfile {
  marketCapitalization?: number; // 백만 USD
}
export interface FinnhubMetricResp {
  metric?: Record<string, number | null | undefined>;
}
interface ReportLine {
  concept?: string;
  label?: string;
  value?: number;
}
interface FinancialReport {
  year?: number;
  quarter?: number;
  endDate?: string;
  report?: { ic?: ReportLine[]; bs?: ReportLine[]; cf?: ReportLine[] };
}
export interface FinnhubFinancials {
  data?: FinancialReport[];
}

/** USD 금액 → 센트 정수. overflow/비유한은 null. */
export function usdToCents(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** 백만 USD → 센트 정수 */
export function usdMillionsToCents(million: number | null | undefined): number | null {
  if (million === null || million === undefined || !Number.isFinite(million)) return null;
  const cents = Math.round(million * 1e8);
  return Number.isSafeInteger(cents) ? cents : null;
}

function pickMetric(metric: Record<string, number | null | undefined> | undefined, keys: string[]): number | null {
  if (!metric) return null;
  for (const k of keys) {
    const v = metric[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

function extractLine(lines: ReportLine[] | undefined, matcher: (concept: string, label: string) => boolean): number | null {
  if (!lines) return null;
  for (const l of lines) {
    if (typeof l.value !== 'number' || !Number.isFinite(l.value)) continue;
    if (matcher((l.concept ?? '').toLowerCase(), (l.label ?? '').toLowerCase())) return l.value;
  }
  return null;
}

const isRevenue = (c: string, l: string) =>
  /revenue|netsales/.test(c.replace(/[^a-z]/g, '')) || /^(total )?(net sales|revenues?|total revenue)/.test(l);
const isOperatingIncome = (c: string, l: string) => /operatingincomeloss/.test(c.replace(/[^a-z]/g, '')) || /^operating income/.test(l);
const isNetIncome = (c: string, l: string) => /netincomeloss$/.test(c.replace(/[^a-z]/g, '')) || /^net income/.test(l);
const isCapex = (c: string, l: string) =>
  /paymentstoacquirepropertyplantandequipment/.test(c.replace(/[^a-z]/g, '')) || /capital expenditure|property.*equipment/.test(l);

/**
 * 순수 변환: profile + metric + financials → StockMetrics[] (최신순).
 * @param asOf financials가 없을 때 스냅샷 행의 기준일(YYYY-MM-DD).
 */
export function buildFinnhubMetrics(
  input: { profile?: FinnhubProfile; metric?: FinnhubMetricResp; financials?: FinnhubFinancials },
  asOf: string,
): StockMetrics[] {
  const m = input.metric?.metric;
  const marketCap = usdMillionsToCents(input.profile?.marketCapitalization);
  const per = pickMetric(m, ['peTTM', 'peBasicExclExtraTTM', 'peNormalizedAnnual']);
  const pbr = pickMetric(m, ['pb', 'pbQuarterly', 'pbAnnual']);
  const roe = pickMetric(m, ['roeTTM', 'roeRfy']);
  const eps = pickMetric(m, ['epsTTM', 'epsBasicExclExtraItemsTTM', 'epsInclExtraItemsTTM']);
  const dividendYield = pickMetric(m, ['currentDividendYieldTTM', 'dividendYieldIndicatedAnnual']);
  const debtRatioRaw = pickMetric(m, ['totalDebt/totalEquityQuarterly', 'totalDebt/totalEquityAnnual', 'longTermDebt/equityQuarterly']);
  const debtRatio = debtRatioRaw === null ? null : Math.round(debtRatioRaw * 100 * 100) / 100; // 배수→% (소수 2자리)

  // financials-reported(10-Q)의 IS는 YTD 누적치 → 같은 회계연도 인접 분기 차분으로 분기 단독 환산.
  // (Q1=누적=단독, Q2단독=Q2누적−Q1누적, …; 직전 분기 결측 시 누적 근사)
  interface Cum {
    year: number;
    quarter: number;
    endDate: string;
    revenue: number | null;
    op: number | null;
    net: number | null;
    capex: number | null;
  }
  const cum: Cum[] = (input.financials?.data ?? [])
    .filter((d) => typeof d.quarter === 'number' && (d.quarter ?? 0) > 0 && d.endDate)
    .map((d) => ({
      year: d.year as number,
      quarter: d.quarter as number,
      endDate: (d.endDate as string).slice(0, 10),
      revenue: extractLine(d.report?.ic, isRevenue),
      op: extractLine(d.report?.ic, isOperatingIncome),
      net: extractLine(d.report?.ic, isNetIncome),
      capex: absOrNull(extractLine(d.report?.cf, isCapex)),
    }));
  const byKey = new Map(cum.map((c) => [`${c.year}-${c.quarter}`, c]));
  const quarterly = (c: Cum, field: 'revenue' | 'op' | 'net' | 'capex'): number | null => {
    const v = c[field];
    if (v === null) return null;
    if (c.quarter === 1) return v; // 회계연도 첫 분기: 누적=단독
    const prev = byKey.get(`${c.year}-${c.quarter - 1}`);
    if (!prev || prev[field] === null) return v; // 직전 분기 결측 → 누적 근사
    return v - (prev[field] as number);
  };

  const valueRows: StockMetrics[] = [...cum]
    .sort((a, b) => b.endDate.localeCompare(a.endDate))
    .slice(0, 4)
    .map((c) => ({
      marketCap: null,
      per: null,
      pbr: null,
      roe: null,
      eps: null,
      revenueQ: usdToCents(quarterly(c, 'revenue')),
      operatingIncomeQ: usdToCents(quarterly(c, 'op')),
      netIncomeQ: usdToCents(quarterly(c, 'net')),
      capex: usdToCents(quarterly(c, 'capex')),
      debtRatio: null,
      dividendYield: null,
      fiscalQuarter: `${c.year}Q${c.quarter}`,
      asOfDate: c.endDate,
      source: 'finnhub',
    }));

  if (valueRows.length > 0) {
    // 최신 분기 행에 밸류에이션·시총 부착
    Object.assign(valueRows[0], { marketCap, per, pbr, roe, eps, dividendYield, debtRatio });
    return valueRows;
  }

  // 분기 재무가 없어도 밸류 지표만으로 스냅샷 1행 (graceful)
  if (marketCap === null && per === null && pbr === null && roe === null && eps === null) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new ValidationError('asOf 형식 오류', `buildFinnhubMetrics asOf=${asOf}`);
  return [
    {
      marketCap,
      per,
      pbr,
      roe,
      eps,
      revenueQ: null,
      operatingIncomeQ: null,
      netIncomeQ: null,
      capex: null,
      debtRatio,
      dividendYield,
      fiscalQuarter: null,
      asOfDate: asOf,
      source: 'finnhub',
    },
  ];
}

function absOrNull(v: number | null): number | null {
  return v === null ? null : Math.abs(v);
}

export async function getFinnhubMetrics(client: FinnhubClient, ticker: string): Promise<StockMetrics[]> {
  const sym = ticker.toUpperCase();
  const [profile, metric, financials] = await Promise.all([
    client.getJson<FinnhubProfile>('stock/profile2', { symbol: sym }).catch(() => undefined),
    client.getJson<FinnhubMetricResp>('stock/metric', { symbol: sym, metric: 'all' }).catch(() => undefined),
    client.getJson<FinnhubFinancials>('stock/financials-reported', { symbol: sym, freq: 'quarterly' }).catch(() => undefined),
  ]);
  const asOf = new Date().toISOString().slice(0, 10);
  return buildFinnhubMetrics({ profile, metric, financials }, asOf);
}
