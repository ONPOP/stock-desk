// 모의투자 테스트 포트폴리오 계산 — 시드(USD 센트) + 체결 거래 → 현금·보유·실현손익.
// 금액은 모두 USD 센트 정수. 평단가는 매수 가중평균(정수 반올림).
export interface SimTradeLite {
  ticker: string;
  side: 'buy' | 'sell';
  qty: number;
  priceCents: number;
}

export interface SimPositionCalc {
  ticker: string;
  qty: number;
  avgCostCents: number; // 평단가(센트)
}

export interface SimPortfolioCalc {
  cashCents: number;
  positions: SimPositionCalc[];
  realizedPnlCents: number;
}

/**
 * 시드 + 시간순 거래 목록으로 현금·보유 포지션·실현손익을 계산.
 * @param trades 반드시 체결 시간 오름차순으로 전달.
 */
export function computeSimPortfolio(seedCents: number, trades: SimTradeLite[]): SimPortfolioCalc {
  let cash = seedCents;
  let realized = 0;
  const pos = new Map<string, { qty: number; avgCost: number }>();

  for (const t of trades) {
    const amount = t.qty * t.priceCents;
    if (t.side === 'buy') {
      cash -= amount;
      const p = pos.get(t.ticker) ?? { qty: 0, avgCost: 0 };
      const newQty = p.qty + t.qty;
      const newAvg = newQty > 0 ? Math.round((p.qty * p.avgCost + amount) / newQty) : 0;
      pos.set(t.ticker, { qty: newQty, avgCost: newAvg });
    } else {
      cash += amount;
      const p = pos.get(t.ticker) ?? { qty: 0, avgCost: 0 };
      realized += t.qty * (t.priceCents - p.avgCost);
      const newQty = p.qty - t.qty;
      if (newQty > 0) pos.set(t.ticker, { qty: newQty, avgCost: p.avgCost });
      else pos.delete(t.ticker);
    }
  }

  return {
    cashCents: cash,
    realizedPnlCents: realized,
    positions: [...pos.entries()]
      .map(([ticker, p]) => ({ ticker, qty: p.qty, avgCostCents: p.avgCost }))
      .sort((a, b) => a.ticker.localeCompare(b.ticker)),
  };
}
