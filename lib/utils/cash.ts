// 예수금 잔고 + 자산 현황 계산 (V2 · D11) — 순수 함수(서버·클라이언트 공용).
// 예수금(통화별) = Σ입금 − Σ출금 − Σ(매수금액+수수료) + Σ(매도금액−수수료). 음수 허용(기록 성격).
import Decimal from 'decimal.js';
import { computeFee } from './fees';
import type {
  AssetSummary,
  CashBalance,
  CashTransaction,
  Currency,
  PortfolioSummary,
  RealTrade,
} from '@/types';

/** 통화별 예수금 잔고(최소 단위 정수, 음수 가능). 입출금 + 매매 자동 연동. */
export function computeCashBalance(txs: CashTransaction[], trades: RealTrade[]): CashBalance {
  const bal: CashBalance = { KRW: 0, USD: 0 };
  for (const t of txs) {
    bal[t.currency] += t.type === 'deposit' ? t.amount : -t.amount;
  }
  for (const tr of trades) {
    const amount = tr.price * tr.qty;
    const fee = computeFee(amount, tr.market, tr.side, tr.isEtf);
    if (tr.side === 'buy') bal[tr.currency] -= amount + fee;
    else bal[tr.currency] += amount - fee;
  }
  return bal;
}

function usdCentsToKrw(cents: number, usdKrw: number): number {
  return Math.round((cents / 100) * usdKrw);
}
function toKrw(minor: number, currency: Currency, usdKrw: number): number {
  return currency === 'USD' ? usdCentsToKrw(minor, usdKrw) : minor;
}

/**
 * 자산 현황 요약 — 통화별 + 원화 환산 통합.
 * 평가·매입금액은 portfolio(보유분)에서, 예수금은 cashBalance에서 합산.
 * 전체 자산 = 예수금(₩환산) + 평가금액(₩환산). usdKrw=0이면 USD 환산 보류.
 */
export function summarizeAssets(
  portfolio: PortfolioSummary,
  cashBalance: CashBalance,
  usdKrw: number,
): AssetSummary {
  const currencies: Currency[] = ['KRW', 'USD'];
  const pcByCur = new Map(portfolio.byCurrency.map((c) => [c.currency, c]));

  const byCurrency = currencies
    .map((currency) => {
      const pc = pcByCur.get(currency);
      return {
        currency,
        cash: cashBalance[currency],
        buyAmount: pc?.buyAmount ?? 0,
        currentValue: pc?.currentValue ?? 0,
        evalPnl: pc?.evalPnl ?? 0,
      };
    })
    .filter((c) => c.cash !== 0 || c.buyAmount !== 0 || c.currentValue !== 0);

  const cash = toKrw(cashBalance.KRW, 'KRW', usdKrw) + usdCentsToKrw(cashBalance.USD, usdKrw);
  const { buyAmount, currentValue, evalPnl } = portfolio.krwUnified;
  const totalAsset = cash + currentValue;
  // 수익률은 보유 주식 기준(예수금 제외) — 포트폴리오 수익률과 일관
  const evalRate =
    buyAmount > 0 ? new Decimal(evalPnl).div(buyAmount).mul(100).toDecimalPlaces(2).toNumber() : 0;

  return {
    byCurrency,
    krwUnified: { totalAsset, cash, buyAmount, currentValue, evalPnl, evalRate },
  };
}
