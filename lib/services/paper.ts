// 모의투자 주문 체결 (F9, D5) — 장중=시장가 즉시 체결, 장외=예약주문→다음 개장 시초가.
// 금액은 최소 단위 정수. 잔고/보유 부족은 거부(cash_not_negative 제약과 이중 방어).
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Stock } from '@/types';
import { DomainError, ValidationError } from '@/lib/errors';
import { regionOf, isMarketOpen } from '@/lib/utils/market-hours';
import { resolveQuoteSource } from '@/lib/providers/quote-source';
import { getCachedQuote } from '@/lib/providers/quote-cache';
import { parseToMinorUnits } from '@/lib/utils/money';
import { shouldFillLimitOrder } from '@/lib/utils/paper-order';
import {
  ensureSeason,
  getAccount,
  getAccountById,
  setCash,
  getPositionQty,
  insertTrade,
  fillTrade,
  listPendingLimitOrders,
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
  params: {
    side: 'buy' | 'sell';
    qty: number;
    orderType?: 'market' | 'limit';
    limitPrice?: string | null;
    memo?: string | null;
  },
  now: Date = new Date(),
): Promise<OrderResult> {
  try {
    const season = await ensureSeason(db, userId);
    const account = await getAccount(db, season.id, stock.currency);
    if (!account) throw new ValidationError('계좌를 찾을 수 없습니다.');

    // 지정가 주문 → 조건 충족 시 즉시 체결, 아니면 예약(다음 폴링에 체결 감시)
    if ((params.orderType ?? 'market') === 'limit') {
      if (params.limitPrice == null) throw new ValidationError('지정가를 입력해주세요.');
      const limitMinor = parseToMinorUnits(params.limitPrice, stock.currency);
      const source = await resolveQuoteSource(db, userId);
      const quote = await getCachedQuote(source, stock.ticker, stock.market);

      if (shouldFillLimitOrder(params.side, quote.price, limitMinor)) {
        const price = quote.price; // 체결가 = 체결 시점 현재가
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
          orderType: 'limit',
          status: 'done',
          memo: params.memo,
          executedAt: now.toISOString(),
        });
        return { status: 'executed', price };
      }

      // 예약 등록 — price에 지정가 저장(체결 감시가 조건 판단에 사용)
      await insertTrade(db, {
        accountId: account.id,
        stockId: stock.id,
        side: params.side,
        qty: params.qty,
        price: limitMinor,
        orderType: 'limit',
        status: 'pending',
        memo: params.memo,
        reservedAt: now.toISOString(),
      });
      return { status: 'reserved', price: limitMinor };
    }

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

/**
 * 지정가 예약 주문 체결 감시 — pending limit 주문을 순회하며 조건 충족분을 체결.
 * 체결가 = 체결 시점 현재가. 중복 체결 방지를 위해 상태 전이(fillTrade)를 먼저 수행하고,
 * 성공한 경우에만 잔고를 반영한다. 개별 주문 실패는 건너뛰어 다음 폴링에 재시도된다.
 * 클라이언트가 앱 실행 중 주기적으로 트리거한다(서버 크론 미사용 — 데스크톱 standalone).
 */
export async function checkLimitOrders(
  db: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<{ filled: number }> {
  const orders = await listPendingLimitOrders(db, userId);
  if (orders.length === 0) return { filled: 0 };

  const source = await resolveQuoteSource(db, userId);
  let filled = 0;

  for (const o of orders) {
    try {
      const quote = await getCachedQuote(source, o.ticker, o.market);
      if (!shouldFillLimitOrder(o.side, quote.price, o.limitPrice)) continue;

      const account = await getAccountById(db, o.accountId);
      if (!account) continue;
      const price = quote.price;

      if (o.side === 'buy') {
        const cost = o.qty * price;
        if (account.cashBalance < cost) continue; // 잔고 부족 → 다음 기회로 보류
        if (!(await fillTrade(db, o.tradeId, now.toISOString(), price))) continue; // 이미 처리됨
        await setCash(db, account.id, account.cashBalance - cost);
      } else {
        const posQty = await getPositionQty(db, account.id, o.stockId);
        if (posQty < o.qty) continue;
        if (!(await fillTrade(db, o.tradeId, now.toISOString(), price))) continue;
        await setCash(db, account.id, account.cashBalance + o.qty * price);
      }
      filled++;
    } catch {
      // 개별 종목 시세 실패 등은 건너뛴다(다음 폴링 재시도)
      continue;
    }
  }
  return { filled };
}

/** 시즌 리셋 — 현재 시즌 아카이브 후 새 시즌 생성(D5) */
export async function resetSeason(db: SupabaseClient, userId: string, now: Date = new Date()): Promise<void> {
  const season = await ensureSeason(db, userId);
  await archiveSeason(db, season.id, now.toISOString());
  await ensureSeason(db, userId); // 새 시즌 생성
}
