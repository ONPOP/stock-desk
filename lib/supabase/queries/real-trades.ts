// 실거래 매매 기록 CRUD (V2) — real_trades. 본인 행만(RLS). 금액은 최소 단위 정수.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ValidationError } from '@/lib/errors';
import type { Currency, Market, RealTrade, TradeSide } from '@/types';

interface TradeRow {
  id: string;
  side: string;
  qty: number | string;
  price: number | string;
  trade_date: string;
  memo: string | null;
  is_etf: boolean | null;
  created_at: string;
  stock_id: string;
  stocks: { ticker: string; name_kr: string | null; name_en: string | null; market: Market; currency: Currency } | null;
}

function rowToTrade(r: TradeRow): RealTrade | null {
  if (!r.stocks) return null;
  return {
    id: r.id,
    stockId: r.stock_id,
    ticker: r.stocks.ticker,
    name: r.stocks.name_kr ?? r.stocks.name_en ?? r.stocks.ticker,
    market: r.stocks.market,
    currency: r.stocks.currency,
    side: r.side as TradeSide,
    qty: Number(r.qty),
    price: Number(r.price),
    tradeDate: r.trade_date,
    memo: r.memo,
    isEtf: r.is_etf ?? false,
    createdAt: r.created_at,
  };
}

const COLS =
  'id, side, qty, price, trade_date, memo, is_etf, created_at, stock_id, stocks!inner(ticker, name_kr, name_en, market, currency)';

/** 사용자 전체 매매 기록(포트폴리오·기간별 수익률용) */
export async function listAllTrades(db: SupabaseClient, userId: string): Promise<RealTrade[]> {
  const { data, error } = await db
    .from('real_trades')
    .select(COLS)
    .eq('user_id', userId)
    .order('trade_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(`매매 기록 조회 실패: ${error.message}`);
  return (data as unknown as TradeRow[]).map(rowToTrade).filter((t): t is RealTrade => t !== null);
}

/** 특정 종목 매매 기록 */
export async function listTradesByStock(db: SupabaseClient, userId: string, stockId: string): Promise<RealTrade[]> {
  const { data, error } = await db
    .from('real_trades')
    .select(COLS)
    .eq('user_id', userId)
    .eq('stock_id', stockId)
    .order('trade_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(`매매 기록 조회 실패: ${error.message}`);
  return (data as unknown as TradeRow[]).map(rowToTrade).filter((t): t is RealTrade => t !== null);
}

export interface InsertTradeInput {
  stockId: string;
  side: TradeSide;
  qty: number;
  price: number;
  tradeDate: string;
  memo?: string | null;
  isEtf?: boolean;
}

export async function insertTrade(db: SupabaseClient, userId: string, input: InsertTradeInput): Promise<RealTrade> {
  if (input.qty <= 0) throw new ValidationError('수량은 0보다 커야 합니다.');
  if (input.price <= 0) throw new ValidationError('단가는 0보다 커야 합니다.');
  const { data, error } = await db
    .from('real_trades')
    .insert({
      user_id: userId,
      stock_id: input.stockId,
      side: input.side,
      qty: input.qty,
      price: input.price,
      trade_date: input.tradeDate,
      memo: input.memo ?? null,
      is_etf: input.isEtf ?? false,
    })
    .select(COLS)
    .single();
  if (error) throw new Error(`매매 기록 저장 실패: ${error.message}`);
  const trade = rowToTrade(data as unknown as TradeRow);
  if (!trade) throw new Error('매매 기록 저장 후 조회에 실패했습니다.');
  return trade;
}

export async function deleteTrade(db: SupabaseClient, userId: string, id: string): Promise<void> {
  const { error } = await db.from('real_trades').delete().eq('user_id', userId).eq('id', id);
  if (error) throw new Error(`매매 기록 삭제 실패: ${error.message}`);
}
