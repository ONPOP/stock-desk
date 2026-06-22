// 모의투자 테스트 매매 서비스 (Phase 2) — 체결가를 sim_candles 종가로 서버가 결정,
// 현금·보유 검증 후 거래 기록. 평가금액은 클라이언트가 현재 시세로 계산.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ValidationError } from '@/lib/errors';
import { findSimStock } from '@/lib/sim/universe';
import { computeSimPortfolio } from '@/lib/sim/portfolio';
import type { SimOrderInput } from '@/lib/validation/sim';
import type { SimTradingState } from '@/types/sim';
import {
  getActiveSession,
  getCloseAt,
  insertTrade,
  listTrades,
  updateCurDate,
} from '@/lib/supabase/queries/sim-trading';

export async function getSimTradingState(db: SupabaseClient, userId: string): Promise<SimTradingState> {
  const session = await getActiveSession(db, userId);
  if (!session) return { session: null, cashCents: 0, positions: [], realizedPnlCents: 0, trades: [] };
  const trades = await listTrades(db, session.id);
  const pf = computeSimPortfolio(
    session.seedUsdCents,
    trades.map((t) => ({ ticker: t.ticker, side: t.side, qty: t.qty, priceCents: t.priceCents })),
  );
  return {
    session,
    cashCents: pf.cashCents,
    positions: pf.positions,
    realizedPnlCents: pf.realizedPnlCents,
    trades,
  };
}

export async function placeSimOrder(db: SupabaseClient, userId: string, input: SimOrderInput): Promise<SimTradingState> {
  if (!findSimStock(input.ticker)) throw new ValidationError('가상 시장에 없는 종목입니다.');

  const session = await getActiveSession(db, userId);
  if (!session) throw new ValidationError('진행 중인 테스트 세션이 없습니다. 새 테스트를 시작하세요.');

  const today = new Date().toISOString().slice(0, 10);
  if (input.simDate < session.startDate) throw new ValidationError('세션 시작일 이전에는 거래할 수 없습니다.');
  if (input.simDate > today) throw new ValidationError('미래 날짜에는 거래할 수 없습니다.');

  const price = await getCloseAt(db, input.ticker, input.simDate);
  if (price == null) throw new ValidationError('해당 시점의 시세가 없습니다.');

  const trades = await listTrades(db, session.id);
  const pf = computeSimPortfolio(
    session.seedUsdCents,
    trades.map((t) => ({ ticker: t.ticker, side: t.side, qty: t.qty, priceCents: t.priceCents })),
  );

  if (input.side === 'buy') {
    const cost = input.qty * price;
    if (cost > pf.cashCents) throw new ValidationError('현금이 부족합니다.');
  } else {
    const held = pf.positions.find((p) => p.ticker === input.ticker)?.qty ?? 0;
    if (input.qty > held) throw new ValidationError('보유 수량이 부족합니다.');
  }

  await insertTrade(db, {
    sessionId: session.id,
    ticker: input.ticker,
    side: input.side,
    qty: input.qty,
    priceCents: price,
    tradeDate: input.simDate,
  });
  await updateCurDate(db, session.id, input.simDate);

  return getSimTradingState(db, userId);
}
