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
  debitCash,
  creditCash,
  getPositionQty,
  insertTrade,
  fillTrade,
  listPendingLimitOrders,
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
        await settleFill(db, account.id, stock.id, params.side, params.qty, price, 'limit', params.memo, now);
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

    await settleFill(db, account.id, stock.id, params.side, params.qty, price, 'market', params.memo, now);
    return { status: 'executed', price };
  } catch (e) {
    return { status: 'error', reason: errMsg(e) };
  }
}

/**
 * 체결 확정 — 잔고 원자 증감 후 거래 기록. 매수는 원자 조건부 차감(잔고 부족이면 거부),
 * 매도는 보유 확인 후 원자 입금. 동시 주문의 잔고 이중지출(TOCTOU)을 DB 레벨에서 차단한다.
 * 차감 성공 후 기록 실패 시 환불해 잔고-거래 정합을 유지한다.
 */
async function settleFill(
  db: SupabaseClient,
  accountId: string,
  stockId: string,
  side: 'buy' | 'sell',
  qty: number,
  price: number,
  orderType: 'market' | 'limit',
  memo: string | null | undefined,
  now: Date,
): Promise<void> {
  if (side === 'buy') {
    const remaining = await debitCash(db, accountId, qty * price);
    if (remaining === null) throw new ValidationError('잔고가 부족합니다.');
    try {
      await insertTrade(db, {
        accountId, stockId, side, qty, price, orderType, status: 'done', memo, executedAt: now.toISOString(),
      });
    } catch (e) {
      await creditCash(db, accountId, qty * price); // 기록 실패 → 차감 환불
      throw e;
    }
  } else {
    const posQty = await getPositionQty(db, accountId, stockId);
    if (posQty < qty) throw new ValidationError('보유 수량이 부족합니다.');
    await insertTrade(db, {
      accountId, stockId, side, qty, price, orderType, status: 'done', memo, executedAt: now.toISOString(),
    });
    await creditCash(db, accountId, qty * price);
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
      const price = quote.price;

      if (o.side === 'buy') {
        // 원자 차감을 먼저 시도(성공해야 체결). 잔고 부족이면 null → 보류.
        const remaining = await debitCash(db, o.accountId, o.qty * price);
        if (remaining === null) continue;
        // fillTrade가 이미 처리됨(false)이면 방금 차감분 환불(이중 체결·차감 방지)
        if (!(await fillTrade(db, o.tradeId, now.toISOString(), price))) {
          await creditCash(db, o.accountId, o.qty * price);
          continue;
        }
      } else {
        const posQty = await getPositionQty(db, o.accountId, o.stockId);
        if (posQty < o.qty) continue;
        if (!(await fillTrade(db, o.tradeId, now.toISOString(), price))) continue;
        await creditCash(db, o.accountId, o.qty * price);
      }
      filled++;
    } catch {
      // 개별 종목 시세 실패 등은 건너뛴다(다음 폴링 재시도)
      continue;
    }
  }
  return { filled };
}
