// 워치리스트 CRUD (F3) — RLS가 user_id로 격리하나 쿼리에도 명시해 이중 방어.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NotFoundError, ValidationError } from '@/lib/errors';
import type { Currency, Market, WatchlistItem } from '@/types';

interface JoinedRow {
  stock_id: string;
  group_name: string;
  auto_analysis: boolean;
  stocks: {
    ticker: string;
    name_kr: string | null;
    name_en: string | null;
    market: Market;
    currency: Currency;
  } | null;
}

function flatten(row: JoinedRow): WatchlistItem | null {
  if (!row.stocks) return null; // 종목이 삭제된 고아 행은 제외
  return {
    stock_id: row.stock_id,
    ticker: row.stocks.ticker,
    name_kr: row.stocks.name_kr,
    name_en: row.stocks.name_en,
    market: row.stocks.market,
    currency: row.stocks.currency,
    group_name: row.group_name,
    auto_analysis: row.auto_analysis,
  };
}

export async function listWatchlist(db: SupabaseClient, userId: string): Promise<WatchlistItem[]> {
  const { data, error } = await db
    .from('watchlist_items')
    .select('stock_id, group_name, auto_analysis, stocks!inner(ticker, name_kr, name_en, market, currency)')
    .eq('user_id', userId)
    .order('group_name', { ascending: true });
  if (error) throw new Error(`워치리스트 조회 실패: ${error.message}`);
  return (data as unknown as JoinedRow[]).map(flatten).filter((x): x is WatchlistItem => x !== null);
}

const GROUP_MAX = 30;

export async function addToWatchlist(
  db: SupabaseClient,
  userId: string,
  ticker: string,
  market: Market,
  groupName = '기본',
): Promise<WatchlistItem> {
  const group = groupName.trim() || '기본';
  if (group.length > GROUP_MAX) throw new ValidationError('그룹명이 너무 깁니다.');

  const { data: stock, error: stockErr } = await db
    .from('stocks')
    .select('id, ticker, name_kr, name_en, market, currency, is_active')
    .eq('ticker', ticker)
    .eq('market', market)
    .maybeSingle();
  if (stockErr) throw new Error(`종목 조회 실패: ${stockErr.message}`);
  if (!stock) throw new NotFoundError('해당 종목을 찾을 수 없습니다.');
  if (stock.is_active === false) throw new ValidationError('거래정지 또는 상장폐지된 종목입니다.');

  const { error: insErr } = await db
    .from('watchlist_items')
    .upsert(
      { user_id: userId, stock_id: stock.id, group_name: group },
      { onConflict: 'user_id,stock_id', ignoreDuplicates: true },
    );
  if (insErr) throw new Error(`워치리스트 추가 실패: ${insErr.message}`);

  return {
    stock_id: stock.id,
    ticker: stock.ticker,
    name_kr: stock.name_kr,
    name_en: stock.name_en,
    market: stock.market,
    currency: stock.currency,
    group_name: group,
    auto_analysis: false,
  };
}

export async function removeFromWatchlist(db: SupabaseClient, userId: string, stockId: string): Promise<void> {
  const { error } = await db
    .from('watchlist_items')
    .delete()
    .eq('user_id', userId)
    .eq('stock_id', stockId);
  if (error) throw new Error(`워치리스트 삭제 실패: ${error.message}`);
}
