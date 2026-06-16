// 포트폴리오 계산 (V2) — 순수 함수(서버·클라이언트 공용). 매매 기록에서 보유·실현·평가손익 파생.
// 평균법: 매수는 가중평균 평단가, 매도는 매도 시점 평단가 기준 실현손익. 금액은 최소 단위 정수.
import Decimal from 'decimal.js';
import type {
  Currency,
  PortfolioSummary,
  RealHolding,
  RealizedTrade,
  RealTrade,
} from '@/types';

function groupByStock(trades: RealTrade[]): Map<string, RealTrade[]> {
  const map = new Map<string, RealTrade[]>();
  for (const t of trades) {
    const arr = map.get(t.stockId);
    if (arr) arr.push(t);
    else map.set(t.stockId, [t]);
  }
  return map;
}

// 시간순(과거→현재): 거래일 → 생성시각
function chronological(a: RealTrade, b: RealTrade): number {
  if (a.tradeDate !== b.tradeDate) return a.tradeDate < b.tradeDate ? -1 : 1;
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

const round = (d: Decimal): number => d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

/** 종목별 현재 보유 현황(순수량>0인 종목만) */
export function computeHoldings(trades: RealTrade[]): RealHolding[] {
  const holdings: RealHolding[] = [];
  for (const [stockId, list] of groupByStock(trades)) {
    const sorted = [...list].sort(chronological);
    const meta = sorted[0];
    let qty = 0;
    let avg = new Decimal(0);
    let realized = new Decimal(0);
    for (const t of sorted) {
      if (t.side === 'buy') {
        const newQty = qty + t.qty;
        avg = avg.mul(qty).plus(new Decimal(t.price).mul(t.qty)).div(newQty);
        qty = newQty;
      } else {
        const sellQty = Math.min(t.qty, qty); // 보유 초과 매도분은 실현손익에서 제외
        realized = realized.plus(new Decimal(t.price).minus(avg).mul(sellQty));
        qty = Math.max(0, qty - t.qty);
        if (qty === 0) avg = new Decimal(0);
      }
    }
    if (qty > 0) {
      const avgInt = round(avg);
      holdings.push({
        stockId,
        ticker: meta.ticker,
        name: meta.name,
        market: meta.market,
        currency: meta.currency,
        qty,
        avgBuyPrice: avgInt,
        buyAmount: avgInt * qty,
        realizedPnl: round(realized),
      });
    }
  }
  return holdings;
}

/** 매도 1건씩의 실현 손익(기간별 수익률용). 최신순 정렬 반환. */
export function computeRealized(trades: RealTrade[]): RealizedTrade[] {
  const out: RealizedTrade[] = [];
  for (const [stockId, list] of groupByStock(trades)) {
    const sorted = [...list].sort(chronological);
    let qty = 0;
    let avg = new Decimal(0);
    for (const t of sorted) {
      if (t.side === 'buy') {
        const newQty = qty + t.qty;
        avg = avg.mul(qty).plus(new Decimal(t.price).mul(t.qty)).div(newQty);
        qty = newQty;
      } else {
        const avgInt = round(avg);
        const sellQty = qty > 0 ? Math.min(t.qty, qty) : t.qty;
        const pnl = round(new Decimal(t.price).minus(avg).mul(sellQty));
        const rate = avgInt > 0 ? new Decimal(t.price).minus(avgInt).div(avgInt).mul(100).toDecimalPlaces(2).toNumber() : 0;
        out.push({
          id: t.id,
          stockId,
          ticker: t.ticker,
          name: t.name,
          market: t.market,
          currency: t.currency,
          qty: t.qty,
          sellPrice: t.price,
          avgBuyPrice: avgInt,
          realizedPnl: pnl,
          realizedRate: rate,
          tradeDate: t.tradeDate,
        });
        qty = Math.max(0, qty - t.qty);
        if (qty === 0) avg = new Decimal(0);
      }
    }
  }
  return out.sort((a, b) => (a.tradeDate < b.tradeDate ? 1 : a.tradeDate > b.tradeDate ? -1 : 0));
}

/** 보유 종목 1건의 현재가 기준 평가 */
export function evalHolding(
  holding: RealHolding,
  currentPriceMinor: number,
): { currentValue: number; evalPnl: number; evalRate: number } {
  const currentValue = currentPriceMinor * holding.qty;
  const evalPnl = currentValue - holding.buyAmount;
  const evalRate = holding.buyAmount > 0 ? new Decimal(evalPnl).div(holding.buyAmount).mul(100).toDecimalPlaces(2).toNumber() : 0;
  return { currentValue, evalPnl, evalRate };
}

/** USD(센트) → KRW(원) 환산. usdKrw = 1달러당 원. */
function usdCentsToKrw(cents: number, usdKrw: number): number {
  return Math.round((cents / 100) * usdKrw);
}

function toKrw(minor: number, currency: Currency, usdKrw: number): number {
  return currency === 'USD' ? usdCentsToKrw(minor, usdKrw) : minor;
}

/**
 * 포트폴리오 요약 — 통화별 분리 + 원화 환산 통합(하이브리드).
 * priceMap: stockId → 현재가(최소 단위). realized: 전체 실현손익. usdKrw: 원/달러 환율.
 */
export function summarizePortfolio(
  holdings: RealHolding[],
  priceMap: Record<string, number | undefined>,
  realized: RealizedTrade[],
  usdKrw: number,
): PortfolioSummary {
  const acc: Record<Currency, CurrencyAcc> = {
    KRW: { buyAmount: 0, currentValue: 0, evalPnl: 0, realizedPnl: 0 },
    USD: { buyAmount: 0, currentValue: 0, evalPnl: 0, realizedPnl: 0 },
  };
  for (const h of holdings) {
    const price = priceMap[h.stockId];
    const cur = price != null ? evalHolding(h, price) : { currentValue: h.buyAmount, evalPnl: 0, evalRate: 0 };
    acc[h.currency].buyAmount += h.buyAmount;
    acc[h.currency].currentValue += cur.currentValue;
    acc[h.currency].evalPnl += cur.evalPnl;
  }
  for (const r of realized) {
    acc[r.currency].realizedPnl += r.realizedPnl;
  }

  const byCurrency = (['KRW', 'USD'] as Currency[])
    .filter((c) => acc[c].buyAmount !== 0 || acc[c].realizedPnl !== 0)
    .map((c) => ({ currency: c, ...acc[c] }));

  const buyAmount = toKrw(acc.KRW.buyAmount, 'KRW', usdKrw) + usdCentsToKrw(acc.USD.buyAmount, usdKrw);
  const currentValue = acc.KRW.currentValue + usdCentsToKrw(acc.USD.currentValue, usdKrw);
  const evalPnl = currentValue - buyAmount;
  const realizedPnl = acc.KRW.realizedPnl + usdCentsToKrw(acc.USD.realizedPnl, usdKrw);
  const evalRate = buyAmount > 0 ? new Decimal(evalPnl).div(buyAmount).mul(100).toDecimalPlaces(2).toNumber() : 0;

  return { byCurrency, krwUnified: { buyAmount, currentValue, evalPnl, evalRate, realizedPnl } };
}

interface CurrencyAcc {
  buyAmount: number;
  currentValue: number;
  evalPnl: number;
  realizedPnl: number;
}
