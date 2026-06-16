'use client';

// 대시보드 포트폴리오 통합 카드 (V2) — KPI 4칸(관심/신규/오늘/KOSPI)을 대체.
// 4지표(매입금액·평가금액·평가손익·수익률%) + 자산배분 도넛 + 종목별 평가손익 바.
// 보유 종목 시세를 각각 폴링(PricePoller)해 summarizePortfolio로 통합(통화 하이브리드).
import { useCallback, useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { useQuote } from '@/lib/hooks/use-quote';
import { useUsdKrw } from '@/lib/hooks/use-usd-krw';
import { summarizePortfolio, evalHolding } from '@/lib/utils/portfolio';
import { formatMoney, formatCompactMoney } from '@/lib/utils/money';
import type { Currency, Market, RealHolding, RealizedTrade } from '@/types';

const DONUT_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#94a3b8'];
const UP = '#e0364f';
const DOWN = '#2f6fed';
const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--popover)',
  fontSize: 12,
} as const;

function pnlColor(n: number): string {
  return n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted-foreground';
}
function signedKrw(n: number): string {
  return `${n > 0 ? '+' : ''}${formatMoney(n, 'KRW')}`;
}
function toKrw(minor: number, currency: Currency, usdKrw: number): number {
  return currency === 'USD' ? Math.round((minor / 100) * usdKrw) : minor;
}

/** 보유 1종목 시세를 폴링해 부모에 보고만 하는 무표시 컴포넌트 */
function PricePoller({
  stockId,
  ticker,
  market,
  onPrice,
}: {
  stockId: string;
  ticker: string;
  market: Market;
  onPrice: (stockId: string, price: number) => void;
}) {
  const { quote } = useQuote(ticker, market, { intervalMs: 15_000 });
  useEffect(() => {
    if (quote) onPrice(stockId, quote.price);
  }, [quote, stockId, onPrice]);
  return null;
}

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card px-4 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`truncate text-xl font-bold tabular-nums ${className ?? ''}`}>{value}</span>
    </div>
  );
}

export function PortfolioOverview({ holdings, realized }: { holdings: RealHolding[]; realized: RealizedTrade[] }) {
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const { usdKrw, ready } = useUsdKrw();

  const handlePrice = useCallback((stockId: string, price: number) => {
    setPriceMap((prev) => (prev[stockId] === price ? prev : { ...prev, [stockId]: price }));
  }, []);

  const summary = summarizePortfolio(holdings, priceMap, realized, ready ? usdKrw : 0);
  const u = summary.krwUnified;

  // 종목별 평가금액(도넛)·평가손익(바) — 원화 환산
  const perStock = holdings
    .map((h) => {
      const price = priceMap[h.stockId];
      const ev = price != null ? evalHolding(h, price) : { currentValue: h.buyAmount, evalPnl: 0, evalRate: 0 };
      return {
        name: h.name,
        ticker: h.ticker,
        value: toKrw(ev.currentValue, h.currency, ready ? usdKrw : 0),
        pnl: toKrw(ev.evalPnl, h.currency, ready ? usdKrw : 0),
      };
    })
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  const donut = perStock.length > 7 ? [...perStock.slice(0, 6), { name: '기타', ticker: '', value: perStock.slice(6).reduce((a, s) => a + s.value, 0), pnl: 0 }] : perStock;
  const bars = [...perStock].sort((a, b) => b.pnl - a.pnl);

  const empty = holdings.length === 0;

  return (
    <Card className="gap-4 p-5">
      {holdings.map((h) => (
        <PricePoller key={h.stockId} stockId={h.stockId} ticker={h.ticker} market={h.market} onPrice={handlePrice} />
      ))}

      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Wallet className="size-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">내 포트폴리오</h2>
          <p className="text-[11px] text-muted-foreground">실거래 기준 · 원화 환산 통합</p>
        </div>
      </div>

      {empty ? (
        <p className="rounded-xl border border-dashed bg-secondary/40 p-6 text-center text-sm text-muted-foreground">
          보유 종목이 없습니다. 종목 상세 → 매매일지에서 매수를 기록하면 포트폴리오가 집계됩니다.
        </p>
      ) : (
        <>
          {/* 4지표 */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="매입 금액(₩환산)" value={formatMoney(u.buyAmount, 'KRW')} />
            <Metric label="평가 금액(₩환산)" value={formatMoney(u.currentValue, 'KRW')} />
            <Metric label="평가 손익(₩환산)" value={signedKrw(u.evalPnl)} className={pnlColor(u.evalPnl)} />
            <Metric label="수익률" value={`${u.evalRate > 0 ? '+' : ''}${u.evalRate}%`} className={pnlColor(u.evalPnl)} />
          </div>

          {/* 차트: 자산배분 도넛 + 종목별 평가손익 바 */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border p-4">
              <h3 className="mb-2 text-xs font-semibold text-muted-foreground">자산배분</h3>
              <div className="flex items-center gap-4">
                <div className="h-40 w-40 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donut} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2} stroke="none">
                        {donut.map((s, i) => (
                          <Cell key={s.name} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => formatMoney(Number(v) || 0, 'KRW')} contentStyle={TOOLTIP_STYLE} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="min-w-0 flex-1 space-y-1.5">
                  {donut.slice(0, 6).map((s, i) => (
                    <li key={s.name} className="flex items-center gap-2 text-xs">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <span className="font-medium tabular-nums text-muted-foreground">{formatCompactMoney(s.value, 'KRW')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <h3 className="mb-2 text-xs font-semibold text-muted-foreground">종목별 평가손익</h3>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bars} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tickFormatter={(v) => (String(v).length > 6 ? `${String(v).slice(0, 6)}…` : String(v))}
                      tick={{ fontSize: 10 }}
                      stroke="var(--muted-foreground)"
                      interval={0}
                      angle={bars.length > 4 ? -30 : 0}
                      textAnchor={bars.length > 4 ? 'end' : 'middle'}
                      height={bars.length > 4 ? 46 : 22}
                    />
                    <YAxis tickFormatter={(v) => formatCompactMoney(Number(v), 'KRW')} tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" width={52} />
                    <Tooltip formatter={(v) => signedKrw(Number(v) || 0)} contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--muted)' }} />
                    <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                      {bars.map((b) => (
                        <Cell key={b.ticker} fill={b.pnl >= 0 ? UP : DOWN} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {summary.byCurrency.length > 1 && (
            <div className="flex flex-wrap gap-x-5 gap-y-1 border-t pt-3 text-[11.5px] text-muted-foreground">
              {summary.byCurrency.map((c) => (
                <span key={c.currency} className="tabular-nums">
                  <span className="font-medium text-foreground">{c.currency}</span> 평가 {formatMoney(c.currentValue, c.currency)}
                  <span className={`ml-1 ${pnlColor(c.evalPnl)}`}>
                    ({c.evalPnl > 0 ? '+' : ''}
                    {formatMoney(c.evalPnl, c.currency)})
                  </span>
                </span>
              ))}
            </div>
          )}

          {!ready && <p className="text-[11px] text-muted-foreground">환율 불러오는 중 — ₩환산값은 갱신되면 정확해집니다.</p>}
        </>
      )}
    </Card>
  );
}
