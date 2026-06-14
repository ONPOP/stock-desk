// 모의투자 주문 체결 (F9, D5) — 장중=시장가 즉시 체결, 장외=예약주문→다음 개장 시초가.
// 금액은 최소 단위 정수. 잔고/보유 부족은 거부(cash_not_negative 제약과 이중 방어).
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Stock } from '@/types';
import { DomainError, ValidationError } from '@/lib/errors';
import { regionOf, isMarketOpen } from '@/lib/utils/market-hours';
import { resolveQuoteSource } from '@/lib/providers/quote-source';
import { getCachedQuote } from '@/lib/providers/quote-cache';
import {
  ensureSeason,
  getAccount,
  setCash,
  getPositionQty,
  insertTrade,
  archiveSeason,
} from '@/lib/supabase/queries/paper';

export interface OrderResult {
  status: 'executed' | 'reserved' | 'error';
  price?: number;
  reason?: string;
}

function errMsg(e: unknown): string {
  if (e instanceof DomainError) return e.userMessage;
  return e instanceof Error ? e.message : '알 수 없는 오류';
}

export async function placeOrder(
  db: SupabaseClient,
  userId: string,
  stock: Stock,
  params: { side: 'buy' | 'sell'; qty: number; memo?: string | null },
  now: Date = new Date(),
): Promise<OrderResult> {
  try {
    const season = await ensureSeason(db, userId);
    const account = await getAccount(db, season.id, stock.currency);
    if (!account) throw new ValidationError('계좌를 찾을 수 없습니다.');

    const open = isMarketOpen(regionOf(stock.market), now);

    // 장외 → 예약주문 (체결은 다음 개장 시초가)
    if (!open) {
      await insertTrade(db, {
        accountId: account.id,
        stockId: stock.id,
        side: params.side,
        qty: params.qty,
        price: null,
        orderType: 'reserved',
        status: 'pending',
        memo: params.memo,
        reservedAt: now.toISOString(),
      });
      return { status: 'reserved' };
    }

    // 장중 → 시장가 즉시 체결
    const source = await resolveQuoteSource(db, userId);
    const quote = await getCachedQuote(source, stock.ticker, stock.market);
    const price = quote.price;

    if (params.side === 'buy') {
      const cost = params.qty * price;
      if (account.cashBalance < cost) throw new ValidationError('잔고가 부족합니다.');
      await setCash(db, account.id, account.cashBalance - cost);
    } else {
      const posQty = await getPositionQty(db, account.id, stock.id);
      if (posQty < params.qty) throw new ValidationError('보유 수량이 부족합니다.');
      await setCash(db, account.id, account.cashBalance + params.qty * price);
    }
    await insertTrade(db, {
      accountId: account.id,
      stockId: stock.id,
      side: params.side,
      qty: params.qty,
      price,
      orderType: 'market',
      status: 'done',
      memo: params.memo,
      executedAt: now.toISOString(),
    });
    return { status: 'executed', price };
  } catch (e) {
    return { status: 'error', reason: errMsg(e) };
  }
}

/** 시즌 리셋 — 현재 시즌 아카이브 후 새 시즌 생성(D5) */
export async function resetSeason(db: SupabaseClient, userId: string, now: Date = new Date()): Promise<void> {
  const season = await ensureSeason(db, userId);
  await archiveSeason(db, season.id, now.toISOString());
  await ensureSeason(db, userId); // 새 시즌 생성
}
