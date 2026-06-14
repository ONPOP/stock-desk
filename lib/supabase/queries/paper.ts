// 모의투자 DB 쿼리 (F9) — 시즌/계좌/포지션/거래. 본인 행만(RLS 체인). 금액은 최소 단위 정수.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Currency, Market, PaperState, PaperTrade } from '@/types';

interface SeasonRow {
  id: string;
  season_no: number;
}
interface AccountRow {
  id: string;
  currency: string;
  cash_balance: number | string;
}

const num = (v: number | string | null | undefined) => (v == null ? 0 : Number(v));

/** 활성 시즌 보장 — 없으면 user_settings 시드로 시즌+계좌 생성 */
export async function ensureSeason(db: SupabaseClient, userId: string): Promise<{ id: string; seasonNo: number }> {
  const { data: existing } = await db
    .from('paper_seasons')
    .select('id, season_no')
    .eq('user_id', userId)
    .is('ended_at', null)
    .order('season_no', { ascending: false })
    .limit(1)
    .maybeSingle<SeasonRow>();
  if (existing) return { id: existing.id, seasonNo: existing.season_no };

  const { data: settings } = await db
    .from('user_settings')
    .select('seed_krw, seed_usd_cents')
    .eq('user_id', userId)
    .maybeSingle<{ seed_krw: number; seed_usd_cents: number }>();
  const seedKrw = num(settings?.seed_krw) || 10_000_000;
  const seedUsd = num(settings?.seed_usd_cents) || 1_000_000;

  const { data: maxRow } = await db
    .from('paper_seasons')
    .select('season_no')
    .eq('user_id', userId)
    .order('season_no', { ascending: false })
    .limit(1)
    .maybeSingle<{ season_no: number }>();
  const seasonNo = (maxRow?.season_no ?? 0) + 1;

  const { data: season, error } = await db
    .from('paper_seasons')
    .insert({ user_id: userId, season_no: seasonNo, seed_krw: seedKrw, seed_usd_cents: seedUsd })
    .select('id, season_no')
    .single<SeasonRow>();
  if (error || !season) throw new Error(`시즌 생성 실패: ${error?.message}`);

  const { error: accErr } = await db.from('paper_accounts').insert([
    { season_id: season.id, currency: 'KRW', cash_balance: seedKrw },
    { season_id: season.id, currency: 'USD', cash_balance: seedUsd },
  ]);
  if (accErr) throw new Error(`계좌 생성 실패: ${accErr.message}`);
  return { id: season.id, seasonNo: season.season_no };
}

export async function getAccount(
  db: SupabaseClient,
  seasonId: string,
  currency: Currency,
): Promise<{ id: string; cashBalance: number } | null> {
  const { data } = await db
    .from('paper_accounts')
    .select('id, currency, cash_balance')
    .eq('season_id', seasonId)
    .eq('currency', currency)
    .maybeSingle<AccountRow>();
  return data ? { id: data.id, cashBalance: num(data.cash_balance) } : null;
}

export async function setCash(db: SupabaseClient, accountId: string, newCash: number): Promise<void> {
  const { error } = await db.from('paper_accounts').update({ cash_balance: newCash }).eq('id', accountId);
  if (error) throw new Error(`잔고 갱신 실패: ${error.message}`);
}

export async function getPositionQty(db: SupabaseClient, accountId: string, stockId: string): Promise<number> {
  const { data } = await db
    .from('paper_positions')
    .select('qty')
    .eq('account_id', accountId)
    .eq('stock_id', stockId)
    .maybeSingle<{ qty: number | string }>();
  return num(data?.qty);
}

export async function insertTrade(
  db: SupabaseClient,
  input: {
    accountId: string;
    stockId: string;
    side: 'buy' | 'sell';
    qty: number;
    price: number | null;
    orderType: 'market' | 'reserved';
    status: 'pending' | 'done';
    memo?: string | null;
    executedAt?: string | null;
    reservedAt?: string | null;
  },
): Promise<void> {
  const { error } = await db.from('paper_trades').insert({
    account_id: input.accountId,
    stock_id: input.stockId,
    side: input.side,
    qty: input.qty,
    price: input.price,
    order_type: input.orderType,
    status: input.status,
    memo: input.memo ?? null,
    executed_at: input.executedAt ?? null,
    reserved_at: input.reservedAt ?? null,
  });
  if (error) throw new Error(`주문 기록 실패: ${error.message}`);
}

export async function archiveSeason(db: SupabaseClient, seasonId: string, endedAt: string): Promise<void> {
  const { error } = await db.from('paper_seasons').update({ ended_at: endedAt }).eq('id', seasonId);
  if (error) throw new Error(`시즌 종료 실패: ${error.message}`);
}

/** 시즌 전체 상태 (계좌·포지션·거래) */
export async function getPaperState(db: SupabaseClient, userId: string): Promise<PaperState> {
  const season = await ensureSeason(db, userId);

  const { data: accRows } = await db
    .from('paper_accounts')
    .select('id, currency, cash_balance')
    .eq('season_id', season.id);
  const accounts = (accRows ?? []) as AccountRow[];
  const accIds = accounts.map((a) => a.id);

  const { data: posRows } = await db
    .from('paper_positions')
    .select('account_id, stock_id, qty, avg_price, stocks(ticker, name_kr, name_en, market, currency)')
    .eq('season_id', season.id);

  const { data: tradeRows } = accIds.length
    ? await db
        .from('paper_trades')
        .select('id, side, qty, price, order_type, status, memo, created_at, executed_at, account_id, stocks(ticker, name_kr, name_en, currency)')
        .in('account_id', accIds)
        .order('created_at', { ascending: false })
        .limit(50)
    : { data: [] };

  type PosRow = {
    stock_id: string;
    qty: number | string;
    avg_price: number | string | null;
    stocks: { ticker: string; name_kr: string | null; name_en: string | null; market: string; currency: string } | null;
  };
  type TradeRow = {
    id: string;
    side: string;
    qty: number | string;
    price: number | string | null;
    order_type: string;
    status: string;
    memo: string | null;
    created_at: string;
    executed_at: string | null;
    stocks: { ticker: string; name_kr: string | null; name_en: string | null; currency: string } | null;
  };

  return {
    seasonNo: season.seasonNo,
    accounts: accounts.map((a) => ({ currency: a.currency as Currency, cashBalance: num(a.cash_balance) })),
    positions: ((posRows ?? []) as unknown as PosRow[])
      .filter((p) => p.stocks)
      .map((p) => ({
        stockId: p.stock_id,
        ticker: p.stocks!.ticker,
        name: p.stocks!.name_kr ?? p.stocks!.name_en ?? p.stocks!.ticker,
        market: p.stocks!.market as Market,
        currency: p.stocks!.currency as Currency,
        qty: num(p.qty),
        avgPrice: p.avg_price == null ? null : num(p.avg_price),
      })),
    trades: ((tradeRows ?? []) as unknown as TradeRow[]).map(
      (t): PaperTrade => ({
        id: t.id,
        ticker: t.stocks?.ticker ?? '',
        name: t.stocks?.name_kr ?? t.stocks?.name_en ?? t.stocks?.ticker ?? '',
        side: t.side as 'buy' | 'sell',
        qty: num(t.qty),
        price: t.price == null ? null : num(t.price),
        currency: (t.stocks?.currency as Currency) ?? 'KRW',
        orderType: t.order_type as 'market' | 'reserved',
        status: t.status as 'pending' | 'done' | 'canceled',
        memo: t.memo,
        createdAt: t.created_at,
        executedAt: t.executed_at,
      }),
    ),
  };
}
