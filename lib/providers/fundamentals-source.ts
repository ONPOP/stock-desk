// 펀더멘털 소스 팩토리 — 시장별로 적절한 어댑터를 선택해 종목에 바인딩된 thunk를 반환.
// 한국=DART(+KIS 시세지표 보강), 미국 재무=Finnhub, 미국 배당=FMP, 미국 공시=SEC EDGAR.
// 키 미설정/식별자 미매핑 시 해당 thunk는 null(설정 유도) — 빈 배열(데이터 없음)과 구분한다.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DisclosureItem, DividendInfo, Stock, StockMetrics } from '@/types';
import { regionOf } from '@/lib/utils/market-hours';
import { getDartKey, getFinnhubKey, getFmpKey, getKisCredentials } from '@/lib/supabase/queries/settings';
import { DartClient } from '@/lib/providers/dart/client';
import { getDartMetrics } from '@/lib/providers/dart/metrics';
import { getDartDividends } from '@/lib/providers/dart/dividend';
import { getDartDisclosures } from '@/lib/providers/dart/disclosure';
import { FinnhubClient } from '@/lib/providers/finnhub/client';
import { getFinnhubMetrics } from '@/lib/providers/finnhub/metrics';
import { FmpClient } from '@/lib/providers/fmp/client';
import { getFmpDividends } from '@/lib/providers/fmp/dividend';
import { EdgarClient } from '@/lib/providers/edgar/client';
import { getEdgarDisclosures } from '@/lib/providers/edgar/disclosure';
import { KisClient } from '@/lib/providers/kis/client';
import { SupabaseTokenStore } from '@/lib/providers/kis/supabase-token-store';
import { getKisDomesticMetrics, type KisDomesticMetrics } from '@/lib/providers/kis/metrics';

export interface FundamentalsThunks {
  metrics: (() => Promise<StockMetrics[]>) | null;
  dividends: (() => Promise<DividendInfo[]>) | null;
  disclosures: (() => Promise<DisclosureItem[]>) | null;
}

/** DART 재무 행에 KIS 시세지표(PER/PBR/EPS/시총)를 머지. DART가 없으면 KIS만으로 스냅샷 1행. */
function mergeKisMetrics(dartRows: StockMetrics[], kis: KisDomesticMetrics | null, today: string): StockMetrics[] {
  if (!kis) return dartRows;
  const valuation = { per: kis.per, pbr: kis.pbr, eps: kis.eps, marketCap: kis.marketCap };
  if (dartRows.length > 0) {
    const head = dartRows[0];
    head.per ??= valuation.per;
    head.pbr ??= valuation.pbr;
    head.eps ??= valuation.eps;
    head.marketCap ??= valuation.marketCap;
    return dartRows;
  }
  if (valuation.per === null && valuation.pbr === null && valuation.eps === null && valuation.marketCap === null) {
    return dartRows;
  }
  return [
    {
      ...valuation,
      roe: null,
      revenueQ: null,
      operatingIncomeQ: null,
      netIncomeQ: null,
      capex: null,
      debtRatio: null,
      dividendYield: null,
      fiscalQuarter: null,
      asOfDate: today,
      source: 'kis',
    } as StockMetrics,
  ];
}

async function loadKisDomestic(db: SupabaseClient, userId: string, ticker: string): Promise<KisDomesticMetrics | null> {
  try {
    const creds = await getKisCredentials(db, userId);
    const client = new KisClient(creds, { tokenStore: new SupabaseTokenStore() });
    return await getKisDomesticMetrics(client, ticker);
  } catch {
    return null; // KIS 키 미설정/조회 실패 — 보강 생략(graceful)
  }
}

export async function resolveFundamentalsSources(
  db: SupabaseClient,
  userId: string,
  stock: Stock,
): Promise<FundamentalsThunks> {
  const { data } = await db.from('stocks').select('corp_code, cik').eq('id', stock.id).maybeSingle<{
    corp_code: string | null;
    cik: string | null;
  }>();
  const corpCode = data?.corp_code ?? null;
  const cik = data?.cik ?? null;

  if (regionOf(stock.market) === 'KR') {
    const dartKey = await getDartKey(db, userId);
    const hasDart = Boolean(dartKey && corpCode);
    return {
      // 지표는 항상 시도(KIS 시세지표 보강). DART·KIS 둘 다 없으면 thunk가 빈 배열 반환.
      metrics: async () => {
        const dartRows = hasDart ? await getDartMetrics(new DartClient(dartKey!), corpCode!) : [];
        const kis = await loadKisDomestic(db, userId, stock.ticker);
        return mergeKisMetrics(dartRows, kis, todayIso());
      },
      dividends: hasDart ? async () => getDartDividends(new DartClient(dartKey!), corpCode!) : null,
      disclosures: hasDart ? async () => getDartDisclosures(new DartClient(dartKey!), corpCode!) : null,
    };
  }

  // 미국
  const [finnhubKey, fmpKey] = await Promise.all([getFinnhubKey(db, userId), getFmpKey(db, userId)]);
  return {
    metrics: finnhubKey ? async () => getFinnhubMetrics(new FinnhubClient(finnhubKey), stock.ticker) : null,
    dividends: fmpKey ? async () => getFmpDividends(new FmpClient(fmpKey), stock.ticker) : null,
    disclosures: cik ? async () => getEdgarDisclosures(new EdgarClient(), cik) : null,
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
