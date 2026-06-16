// 모의투자 DB 쿼리 (F9) — 시즌/계좌/포지션/거래. 본인 행만(RLS 체인). 금액은 최소 단위 정수.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeRealized } from '@/lib/utils/portfolio';
import type { ArchivedSeason, Currency, Market, PaperState, PaperTrade, RealTrade } from '@/types';

interface SeasonRow {
  id: string;
  season_no: number;
  start_date: string | null;
  end_date: string | null;
}
interface AccountRow {
  id: string;
  currency: string;
  cash_balance: number | string;
}

const num = (v: number | string | null | undefined) => (v == null ? 0 : Number(v));

/** 활성 시즌 보장 — 없으면 user_settings 시드로 시즌+계좌 생성 */
type SeasonHandle = { id: string; seasonNo: number; startDate: string | null; endDate: string | null };

export async function ensureSeason(db: SupabaseClient, userId: string): Promise<SeasonHandle> {
  const { data: existing } = await db
    .from('paper_seasons')
    .select('id, season_no, start_date, end_date')
    .eq('user_id', userId)
    .is('ended_at', null)
    .order('season_no', { ascending: false })
    .limit(1)
    .maybeSingle<SeasonRow>();
  if (existing)
    return { id: existing.id, seasonNo: existing.season_no, startDate: existing.start_date, endDate: existing.end_date };

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
    .select('id, season_no, start_date, end_date')
    .single<SeasonRow>();
  if (error || !season) throw new Error(`시즌 생성 실패: ${error?.message}`);

  const { error: accErr } = await db.from('paper_accounts').insert([
    { season_id: season.id, currency: 'KRW', cash_balance: seedKrw },
    { season_id: season.id, currency: 'USD', cash_balance: seedUsd },
  ]);
  if (accErr) throw new Error(`계좌 생성 실패: ${accErr.message}`);
  return { id: season.id, seasonNo: season.season_no, startDate: season.start_date, endDate: season.end_date };
}

/**
 * 새 시즌 시작 — 현재 활성 시즌 종료(아카이브) 후 지정 시드·기간으로 새 시즌 생성.
 * 시드는 user_settings에도 반영해 이후 자동 생성과 일관성을 맞춘다. 기간은 표시·기록용.
 */
export async function startNewSeason(
  db: SupabaseClient,
  userId: string,
  opts: { seedKrw: number; seedUsdCents: number; startDate?: string | null; endDate?: string | null },
  endedAt: string,
): Promise<void> {
  await db
    .from('user_settings')
    .update({ seed_krw: opts.seedKrw, seed_usd_cents: opts.seedUsdCents })
    .eq('user_id', userId);

  const { data: active } = await db
    .from('paper_seasons')
    .select('id')
    .eq('user_id', userId)
    .is('ended_at', null)
    .order('season_no', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (active) {
    const { error } = await db.from('paper_seasons').update({ ended_at: endedAt }).eq('id', active.id);
    if (error) throw new Error(`시즌 종료 실패: ${error.message}`);
  }

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
    .insert({
      user_id: userId,
      season_no: seasonNo,
      seed_krw: opts.seedKrw,
      seed_usd_cents: opts.seedUsdCents,
      start_date: opts.startDate ?? null,
      end_date: opts.endDate ?? null,
    })
    .select('id')
    .single<{ id: string }>();
  if (error || !season) throw new Error(`시즌 생성 실패: ${error?.message}`);

  const { error: accErr } = await db.from('paper_accounts').insert([
    { season_id: season.id, currency: 'KRW', cash_balance: opts.seedKrw },
    { season_id: season.id, currency: 'USD', cash_balance: opts.seedUsdCents },
  ]);
  if (accErr) throw new Error(`계좌 생성 실패: ${accErr.message}`);
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

/** accountId로 잔고 조회 — 지정가 체결 시 최신 잔고 확인용 */
export async function getAccountById(
  db: SupabaseClient,
  accountId: string,
): Promise<{ id: string; cashBalance: number } | null> {
  const { data } = await db
    .from('paper_accounts')
    .select('id, currency, cash_balance')
    .eq('id', accountId)
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
    orderType: 'market' | 'reserved' | 'limit';
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

export interface PendingLimitOrder {
  tradeId: string;
  accountId: string;
  stockId: string;
  ticker: string;
  market: Market;
  currency: Currency;
  side: 'buy' | 'sell';
  qty: number;
  limitPrice: number;
}

/** 본인의 pending 지정가 주문 목록 — 체결 감시용 (RLS로 본인 행만). */
export async function listPendingLimitOrders(
  db: SupabaseClient,
  userId: string,
): Promise<PendingLimitOrder[]> {
  // RLS(trades_select)가 본인 계좌 거래만 노출하나, season→user_id를 명시해 이중 방어.
  const { data, error } = await db
    .from('paper_trades')
    .select(
      'id, account_id, side, qty, price, stock_id, stocks!inner(ticker, market, currency), paper_accounts!inner(season_id, paper_seasons!inner(user_id))',
    )
    .eq('status', 'pending')
    .eq('order_type', 'limit')
    .eq('paper_accounts.paper_seasons.user_id', userId);
  if (error) throw new Error(`지정가 주문 조회 실패: ${error.message}`);

  type Row = {
    id: string;
    account_id: string;
    side: string;
    qty: number | string;
    price: number | string | null;
    stock_id: string;
    stocks: { ticker: string; market: string; currency: string } | null;
  };
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.stocks && r.price != null)
    .map((r) => ({
      tradeId: r.id,
      accountId: r.account_id,
      stockId: r.stock_id,
      ticker: r.stocks!.ticker,
      market: r.stocks!.market as Market,
      currency: r.stocks!.currency as Currency,
      side: r.side as 'buy' | 'sell',
      qty: num(r.qty),
      limitPrice: num(r.price),
    }));
}

/**
 * 예약(pending) 주문을 체결 처리 — status='done' + executed_at + price(체결가).
 * status='pending' 조건으로 한 번만 전이(중복 체결 방지). 반환 false면 이미 처리된 행.
 */
export async function fillTrade(
  db: SupabaseClient,
  tradeId: string,
  executedAt: string,
  fillPrice: number,
): Promise<boolean> {
  const { data, error } = await db
    .from('paper_trades')
    .update({ status: 'done', executed_at: executedAt, price: fillPrice })
    .eq('id', tradeId)
    .eq('status', 'pending') // 이미 체결·취소된 행은 보호
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`체결 처리 실패: ${error.message}`);
  return data != null;
}

/** 예약(pending) 주문 취소 — status='canceled'. pending이 아니면 false. */
export async function cancelTrade(db: SupabaseClient, tradeId: string): Promise<boolean> {
  const { data, error } = await db
    .from('paper_trades')
    .update({ status: 'canceled' })
    .eq('id', tradeId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`주문 취소 실패: ${error.message}`);
  return data != null;
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
    seasonStartDate: season.startDate,
    seasonEndDate: season.endDate,
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

/** 종료(아카이브)된 시즌 목록 — 시즌별 거래내역 + 실현손익(computeRealized 재사용). 보존된 기록 열람용. */
export async function listArchivedSeasons(db: SupabaseClient, userId: string): Promise<ArchivedSeason[]> {
  const { data: seasonRows } = await db
    .from('paper_seasons')
    .select('id, season_no, seed_krw, seed_usd_cents, start_date, end_date, ended_at')
    .eq('user_id', userId)
    .not('ended_at', 'is', null)
    .order('season_no', { ascending: false });
  type SRow = {
    id: string;
    season_no: number;
    seed_krw: number | string;
    seed_usd_cents: number | string;
    start_date: string | null;
    end_date: string | null;
    ended_at: string;
  };
  const seasons = (seasonRows ?? []) as SRow[];
  if (seasons.length === 0) return [];

  const seasonIds = seasons.map((s) => s.id);
  const { data: accRows } = await db.from('paper_accounts').select('id, season_id').in('season_id', seasonIds);
  const accs = (accRows ?? []) as Array<{ id: string; season_id: string }>;
  const seasonByAcc = new Map(accs.map((a) => [a.id, a.season_id]));
  const accIds = accs.map((a) => a.id);

  const { data: tradeRows } = accIds.length
    ? await db
        .from('paper_trades')
        .select(
          'id, account_id, side, qty, price, order_type, status, memo, created_at, executed_at, stock_id, stocks(ticker, name_kr, name_en, market, currency)',
        )
        .in('account_id', accIds)
        .order('created_at', { ascending: false })
    : { data: [] };
  type TRow = {
    id: string;
    account_id: string;
    side: string;
    qty: number | string;
    price: number | string | null;
    order_type: string;
    status: string;
    memo: string | null;
    created_at: string;
    executed_at: string | null;
    stock_id: string;
    stocks: { ticker: string; name_kr: string | null; name_en: string | null; market: string; currency: string } | null;
  };
  const rows = ((tradeRows ?? []) as unknown as TRow[]).filter((r) => r.stocks);

  return seasons.map((s): ArchivedSeason => {
    const own = rows.filter((r) => seasonByAcc.get(r.account_id) === s.id);
    const nameOf = (r: TRow) => r.stocks!.name_kr ?? r.stocks!.name_en ?? r.stocks!.ticker;

    const trades: PaperTrade[] = own.map((t) => ({
      id: t.id,
      ticker: t.stocks!.ticker,
      name: nameOf(t),
      side: t.side as 'buy' | 'sell',
      qty: num(t.qty),
      price: t.price == null ? null : num(t.price),
      currency: t.stocks!.currency as Currency,
      orderType: t.order_type as 'market' | 'reserved' | 'limit',
      status: t.status as 'pending' | 'done' | 'canceled',
      memo: t.memo,
      createdAt: t.created_at,
      executedAt: t.executed_at,
    }));

    // 체결분만 RealTrade로 매핑 → 평균법 실현손익(통화별)
    const realTrades: RealTrade[] = own
      .filter((t) => t.status === 'done' && t.price != null)
      .map((t) => ({
        id: t.id,
        stockId: t.stock_id,
        ticker: t.stocks!.ticker,
        name: nameOf(t),
        market: t.stocks!.market as Market,
        currency: t.stocks!.currency as Currency,
        side: t.side as 'buy' | 'sell',
        qty: num(t.qty),
        price: num(t.price),
        tradeDate: (t.executed_at ?? t.created_at).slice(0, 10),
        memo: t.memo,
        createdAt: t.created_at,
      }));
    const realized = computeRealized(realTrades);
    const realizedKrw = realized.filter((r) => r.currency === 'KRW').reduce((a, r) => a + r.realizedPnl, 0);
    const realizedUsdCents = realized.filter((r) => r.currency === 'USD').reduce((a, r) => a + r.realizedPnl, 0);

    return {
      id: s.id,
      seasonNo: s.season_no,
      seedKrw: num(s.seed_krw),
      seedUsdCents: num(s.seed_usd_cents),
      startDate: s.start_date,
      endDate: s.end_date,
      endedAt: s.ended_at,
      realizedKrw,
      realizedUsdCents,
      trades,
    };
  });
}
