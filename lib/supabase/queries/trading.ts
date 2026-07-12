// 자동매매 DB 쿼리 (D15) — 설정·시그널 로그. 본인 행만(RLS). 금액은 최소 단위 정수.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_PARAMS } from '@/lib/trading/strategy';
import { strategyParamsSchema, universeSchema } from '@/lib/validation/trading';
import type { AutoTradingConfig, Market, StrategyParams, TradeSignalRow, TradingUniverseItem } from '@/types';

interface ConfigRow {
  enabled: boolean;
  kill_switch: boolean;
  params: Partial<StrategyParams> | null;
  universe: TradingUniverseItem[] | null;
  updated_at: string | null;
}

/**
 * 설정 조회 — 없으면 기본값 반환(행 생성은 첫 저장 시).
 * DB jsonb는 신뢰 경계 밖으로 취급: RLS가 본인 행 직접 쓰기(PostgREST)를 허용하므로
 * API를 우회해 심어둔 악성 params/universe가 엔진에 그대로 흘러들지 않게 여기서 재검증한다.
 * params는 DEFAULT 병합 후 무효면 DEFAULT로 폴백, universe는 스키마 위반 시 빈 목록.
 */
export async function getTradingConfig(db: SupabaseClient, userId: string): Promise<AutoTradingConfig> {
  const { data, error } = await db
    .from('auto_trading_configs')
    .select('enabled, kill_switch, params, universe, updated_at')
    .eq('user_id', userId)
    .maybeSingle<ConfigRow>();
  if (error) throw new Error(`자동매매 설정 조회 실패: ${error.message}`);

  const mergedParams = strategyParamsSchema.safeParse({ ...DEFAULT_PARAMS, ...(data?.params ?? {}) });
  const universe = universeSchema.safeParse(data?.universe ?? []);
  return {
    enabled: data?.enabled ?? false,
    killSwitch: data?.kill_switch ?? false,
    params: mergedParams.success ? mergedParams.data : { ...DEFAULT_PARAMS },
    universe: universe.success ? universe.data : [],
    updatedAt: data?.updated_at ?? null,
  };
}

export async function patchTradingConfig(
  db: SupabaseClient,
  userId: string,
  patch: Partial<{ enabled: boolean; killSwitch: boolean; params: StrategyParams; universe: TradingUniverseItem[] }>,
): Promise<void> {
  const row: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };
  if (patch.enabled !== undefined) row.enabled = patch.enabled;
  if (patch.killSwitch !== undefined) row.kill_switch = patch.killSwitch;
  if (patch.params !== undefined) row.params = patch.params;
  if (patch.universe !== undefined) row.universe = patch.universe;
  const { error } = await db.from('auto_trading_configs').upsert(row, { onConflict: 'user_id' });
  if (error) throw new Error(`자동매매 설정 저장 실패: ${error.message}`);
}

export interface SignalInsert {
  ticker: string;
  market: Market;
  action: 'buy' | 'sell';
  reason: string;
  indicators: Record<string, number | null> | null;
  executed: boolean;
  rejectReason?: string | null;
  price?: number | null;
  qty?: number | null;
  pnl?: number | null;
  decidedAt: string;
}

export async function insertSignal(db: SupabaseClient, userId: string, s: SignalInsert): Promise<void> {
  const { error } = await db.from('trade_signals').insert({
    user_id: userId,
    ticker: s.ticker,
    market: s.market,
    action: s.action,
    reason: s.reason,
    indicators: s.indicators,
    executed: s.executed,
    reject_reason: s.rejectReason ?? null,
    price: s.price ?? null,
    qty: s.qty ?? null,
    pnl: s.pnl ?? null,
    decided_at: s.decidedAt,
  });
  if (error) throw new Error(`시그널 기록 실패: ${error.message}`);
}

interface SignalRowDb {
  id: string;
  ticker: string;
  market: string;
  action: string;
  reason: string;
  indicators: Record<string, number | null> | null;
  executed: boolean;
  reject_reason: string | null;
  price: number | string | null;
  qty: number | null;
  pnl: number | string | null;
  decided_at: string;
}

const toSignal = (r: SignalRowDb): TradeSignalRow => ({
  id: r.id,
  ticker: r.ticker,
  market: r.market as Market,
  action: r.action as 'buy' | 'sell',
  reason: r.reason,
  indicators: r.indicators,
  executed: r.executed,
  rejectReason: r.reject_reason,
  price: r.price == null ? null : Number(r.price),
  qty: r.qty,
  pnl: r.pnl == null ? null : Number(r.pnl),
  decidedAt: r.decided_at,
});

export async function listSignals(db: SupabaseClient, userId: string, limit = 50): Promise<TradeSignalRow[]> {
  const { data, error } = await db
    .from('trade_signals')
    .select('*')
    .eq('user_id', userId)
    .order('decided_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`시그널 조회 실패: ${error.message}`);
  return ((data ?? []) as SignalRowDb[]).map(toSignal);
}

/** 지정 시각 이후(=KST 오늘) 시그널 — 엔진이 일간 상태(진입 횟수·손절 쿨다운·실현손익)를 산출하는 원천 */
export async function listSignalsSince(db: SupabaseClient, userId: string, sinceIso: string): Promise<TradeSignalRow[]> {
  const { data, error } = await db
    .from('trade_signals')
    .select('*')
    .eq('user_id', userId)
    .gte('decided_at', sinceIso)
    .order('decided_at', { ascending: true });
  if (error) throw new Error(`시그널 조회 실패: ${error.message}`);
  return ((data ?? []) as SignalRowDb[]).map(toSignal);
}

export interface AutoPosition {
  stockId: string;
  ticker: string;
  market: Market;
  qty: number;
  avgPrice: number;
}

/** KRW 계좌 보유 포지션 (모의투자 뷰 재사용) — 자동매매 전략 입력 */
export async function listKrwPositions(db: SupabaseClient, accountId: string): Promise<AutoPosition[]> {
  const { data, error } = await db
    .from('paper_positions')
    .select('stock_id, qty, avg_price, stocks(ticker, market)')
    .eq('account_id', accountId);
  if (error) throw new Error(`포지션 조회 실패: ${error.message}`);
  type Row = {
    stock_id: string;
    qty: number | string;
    avg_price: number | string | null;
    stocks: { ticker: string; market: string } | null;
  };
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.stocks && r.avg_price != null && Number(r.qty) > 0)
    .map((r) => ({
      stockId: r.stock_id,
      ticker: r.stocks!.ticker,
      market: r.stocks!.market as Market,
      qty: Number(r.qty),
      avgPrice: Number(r.avg_price),
    }));
}
