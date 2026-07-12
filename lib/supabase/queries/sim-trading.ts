// 모의투자 테스트 매매 DB 쿼리 (Phase 2) — sim_sessions·sim_trades. RLS: 본인 세션만.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SimSession, SimTrade } from '@/types/sim';

interface SessionRow {
  id: string;
  seed_usd_cents: number;
  start_date: string;
  cur_date: string;
}

interface TradeRow {
  id: string;
  ticker: string;
  side: 'buy' | 'sell';
  qty: number;
  price_cents: number;
  trade_date: string;
  created_at: string;
}

const SESSION_COLS = 'id, seed_usd_cents, start_date, cur_date';
const TRADE_COLS = 'id, ticker, side, qty, price_cents, trade_date, created_at';

function toSession(r: SessionRow): SimSession {
  return { id: r.id, seedUsdCents: r.seed_usd_cents, startDate: r.start_date, curDate: r.cur_date };
}
function toTrade(r: TradeRow): SimTrade {
  return {
    id: r.id,
    ticker: r.ticker,
    side: r.side,
    qty: r.qty,
    priceCents: r.price_cents,
    tradeDate: r.trade_date,
    createdAt: r.created_at,
  };
}

/** 활성 세션(ended_at null) 조회 — 없으면 null */
export async function getActiveSession(db: SupabaseClient, userId: string): Promise<SimSession | null> {
  const { data, error } = await db
    .from('sim_sessions')
    .select(SESSION_COLS)
    .eq('user_id', userId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`세션 조회 실패: ${error.message}`);
  return data?.[0] ? toSession(data[0] as SessionRow) : null;
}

/** 기존 활성 세션 종료 후 새 세션 시작 */
export async function startSession(
  db: SupabaseClient,
  userId: string,
  input: { seedUsdCents: number; startDate: string },
  nowIso: string,
): Promise<SimSession> {
  await db.from('sim_sessions').update({ ended_at: nowIso }).eq('user_id', userId).is('ended_at', null);
  const { data, error } = await db
    .from('sim_sessions')
    .insert({
      user_id: userId,
      seed_usd_cents: input.seedUsdCents,
      start_date: input.startDate,
      cur_date: input.startDate,
    })
    .select(SESSION_COLS)
    .single();
  if (error) throw new Error(`세션 생성 실패: ${error.message}`);
  return toSession(data as SessionRow);
}

export async function updateCurDate(db: SupabaseClient, sessionId: string, curDate: string): Promise<void> {
  const { error } = await db.from('sim_sessions').update({ cur_date: curDate }).eq('id', sessionId);
  if (error) throw new Error(`세션 갱신 실패: ${error.message}`);
}

export async function listTrades(db: SupabaseClient, sessionId: string): Promise<SimTrade[]> {
  const { data, error } = await db
    .from('sim_trades')
    .select(TRADE_COLS)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`거래 조회 실패: ${error.message}`);
  return (data ?? []).map((r) => toTrade(r as TradeRow));
}

export async function insertTrade(
  db: SupabaseClient,
  input: { sessionId: string; ticker: string; side: 'buy' | 'sell'; qty: number; priceCents: number; tradeDate: string },
): Promise<void> {
  const { error } = await db.from('sim_trades').insert({
    session_id: input.sessionId,
    ticker: input.ticker,
    side: input.side,
    qty: input.qty,
    price_cents: input.priceCents,
    trade_date: input.tradeDate,
  });
  if (error) throw new Error(`거래 기록 실패: ${error.message}`);
}

/** 특정 거래일(이전 포함)의 종가(센트) — 동결 sim_candles 기준. 없으면 null */
export async function getCloseAt(db: SupabaseClient, ticker: string, date: string): Promise<number | null> {
  const { data, error } = await db
    .from('sim_candles')
    .select('c')
    .eq('ticker', ticker)
    .lte('ts', date)
    .order('ts', { ascending: false })
    .limit(1);
  if (error) throw new Error(`시세 조회 실패: ${error.message}`);
  return data?.[0] ? (data[0].c as number) : null;
}

/** 여러 종목의 특정 시점 종가 맵 (보유 평가용) */
export async function getClosesAt(
  db: SupabaseClient,
  tickers: string[],
  date: string,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await Promise.all(
    tickers.map(async (t) => {
      const c = await getCloseAt(db, t, date);
      if (c != null) out[t] = c;
    }),
  );
  return out;
}
