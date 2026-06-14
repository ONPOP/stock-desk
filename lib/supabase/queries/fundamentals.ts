// 펀더멘털 DB 쿼리 (F4/F15/F12) — stock_metrics·dividends·disclosures.
// 읽기는 RSC(authenticated RLS 읽기 허용), 쓰기는 service-role(admin)로 수행.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DisclosureItem, DividendInfo, FundamentalsSource, StockMetrics } from '@/types';

/** PostgREST numeric/int8는 string으로 올 수 있어 안전 변환 */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// ───────────────────────── stock_metrics (F4) ─────────────────────────

interface MetricsRow {
  as_of_date: string;
  market_cap: number | string | null;
  per: number | string | null;
  pbr: number | string | null;
  roe: number | string | null;
  eps: number | string | null;
  revenue_q: number | string | null;
  operating_income_q: number | string | null;
  net_income_q: number | string | null;
  capex: number | string | null;
  debt_ratio: number | string | null;
  dividend_yield: number | string | null;
  fiscal_quarter: string | null;
  source: string;
}

function rowToMetrics(r: MetricsRow): StockMetrics {
  return {
    marketCap: num(r.market_cap),
    per: num(r.per),
    pbr: num(r.pbr),
    roe: num(r.roe),
    eps: num(r.eps),
    revenueQ: num(r.revenue_q),
    operatingIncomeQ: num(r.operating_income_q),
    netIncomeQ: num(r.net_income_q),
    capex: num(r.capex),
    debtRatio: num(r.debt_ratio),
    dividendYield: num(r.dividend_yield),
    fiscalQuarter: r.fiscal_quarter,
    asOfDate: r.as_of_date,
    source: r.source as FundamentalsSource,
  };
}

const METRICS_COLS =
  'as_of_date, market_cap, per, pbr, roe, eps, revenue_q, operating_income_q, net_income_q, capex, debt_ratio, dividend_yield, fiscal_quarter, source';

/** 최신 + 최근 분기 시계열 (as_of_date 내림차순) */
export async function getMetricsSeries(db: SupabaseClient, stockId: string, limit = 8): Promise<StockMetrics[]> {
  const { data, error } = await db
    .from('stock_metrics')
    .select(METRICS_COLS)
    .eq('stock_id', stockId)
    .order('as_of_date', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`지표 조회 실패: ${error.message}`);
  return (data ?? []).map((r) => rowToMetrics(r as MetricsRow));
}

export async function upsertMetrics(admin: SupabaseClient, stockId: string, rows: StockMetrics[]): Promise<number> {
  if (rows.length === 0) return 0;
  const payload = rows.map((m) => ({
    stock_id: stockId,
    as_of_date: m.asOfDate,
    market_cap: m.marketCap,
    per: m.per,
    pbr: m.pbr,
    roe: m.roe,
    eps: m.eps,
    revenue_q: m.revenueQ,
    operating_income_q: m.operatingIncomeQ,
    net_income_q: m.netIncomeQ,
    capex: m.capex,
    debt_ratio: m.debtRatio,
    dividend_yield: m.dividendYield,
    fiscal_quarter: m.fiscalQuarter,
    source: m.source,
  }));
  const { error } = await admin.from('stock_metrics').upsert(payload, { onConflict: 'stock_id,as_of_date' });
  if (error) throw new Error(`지표 저장 실패: ${error.message}`);
  return payload.length;
}

// ───────────────────────── dividends (F15) ─────────────────────────

interface DividendRow {
  fiscal_year: number;
  dps: number | string | null;
  frequency: string | null;
  ex_date: string | null;
  pay_date: string | null;
  yield_at_record: number | string | null;
  source: string;
}

export async function getDividendsByStock(db: SupabaseClient, stockId: string, limit = 24): Promise<DividendInfo[]> {
  const { data, error } = await db
    .from('dividends')
    .select('fiscal_year, dps, frequency, ex_date, pay_date, yield_at_record, source')
    .eq('stock_id', stockId)
    .order('fiscal_year', { ascending: false })
    .order('ex_date', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`배당 조회 실패: ${error.message}`);
  return (data ?? []).map((r) => {
    const row = r as DividendRow;
    return {
      fiscalYear: row.fiscal_year,
      dps: num(row.dps),
      frequency: (row.frequency as DividendInfo['frequency']) ?? null,
      exDate: row.ex_date,
      payDate: row.pay_date,
      yieldAtRecord: num(row.yield_at_record),
      source: row.source as FundamentalsSource,
    };
  });
}

/** 배당은 ex_date null(DART) 케이스의 중복을 막기 위해 소스 단위로 교체(delete→insert). */
export async function replaceDividends(
  admin: SupabaseClient,
  stockId: string,
  source: FundamentalsSource,
  rows: DividendInfo[],
): Promise<number> {
  const { error: delErr } = await admin.from('dividends').delete().eq('stock_id', stockId).eq('source', source);
  if (delErr) throw new Error(`배당 정리 실패: ${delErr.message}`);
  if (rows.length === 0) return 0;
  const payload = rows.map((d) => ({
    stock_id: stockId,
    fiscal_year: d.fiscalYear,
    dps: d.dps,
    frequency: d.frequency,
    ex_date: d.exDate,
    pay_date: d.payDate,
    yield_at_record: d.yieldAtRecord,
    source: d.source,
  }));
  const { error } = await admin.from('dividends').insert(payload);
  if (error) throw new Error(`배당 저장 실패: ${error.message}`);
  return payload.length;
}

// ───────────────────────── disclosures (F12) ─────────────────────────

interface DisclosureRow {
  source: string;
  form_type: string;
  type_label_kr: string | null;
  title: string;
  filed_at: string;
  summary_ai: string | null;
  url: string;
}

export async function getDisclosuresByStock(db: SupabaseClient, stockId: string, limit = 50): Promise<DisclosureItem[]> {
  const { data, error } = await db
    .from('disclosures')
    .select('source, form_type, type_label_kr, title, filed_at, summary_ai, url')
    .eq('stock_id', stockId)
    .order('filed_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`공시 조회 실패: ${error.message}`);
  return (data ?? []).map((r) => {
    const row = r as DisclosureRow;
    return {
      source: row.source as DisclosureItem['source'],
      formType: row.form_type,
      typeLabelKr: row.type_label_kr,
      title: row.title,
      filedAt: row.filed_at,
      url: row.url,
      summaryAi: row.summary_ai,
    };
  });
}

/** 이미 저장된 공시 URL 집합 (AI 요약 중복 호출 방지용) */
export async function getDisclosureUrls(db: SupabaseClient, stockId: string): Promise<Set<string>> {
  const { data, error } = await db.from('disclosures').select('url').eq('stock_id', stockId);
  if (error) throw new Error(`공시 URL 조회 실패: ${error.message}`);
  return new Set((data ?? []).map((r) => (r as { url: string }).url));
}

export async function upsertDisclosures(admin: SupabaseClient, stockId: string, rows: DisclosureItem[]): Promise<number> {
  if (rows.length === 0) return 0;
  const payload = rows.map((d) => ({
    stock_id: stockId,
    source: d.source,
    form_type: d.formType,
    type_label_kr: d.typeLabelKr,
    title: d.title,
    filed_at: d.filedAt,
    summary_ai: d.summaryAi ?? null,
    url: d.url,
  }));
  // 기존 행의 summary_ai(W4에서 채움)를 보존하기 위해 url 충돌 시 무시.
  const { error } = await admin.from('disclosures').upsert(payload, { onConflict: 'source,url', ignoreDuplicates: true });
  if (error) throw new Error(`공시 저장 실패: ${error.message}`);
  return payload.length;
}
