'use client';

// 투자 기록 > 매매 (D21) — 종목 검색 → 실시간 시세 → 매수·매도 기록(매매비용 포함).
// 입력 폼은 종목 상세와 같은 HoldingsTradesPanel이고 같은 real_trades에 저장하므로 두 화면이 자동으로 연동된다.
// 아래에는 전 종목 보유 현황과 매매 내역을 보여준다(행을 누르면 그 종목으로 매매).
import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ExternalLink, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CompanyLogo } from '@/components/ui/company-logo';
import { StockPicker, type SelectedStock } from '@/components/paper/stock-picker';
import { HoldingsTradesPanel } from '@/components/stocks/holdings-trades-panel';
import { PricePoller } from '@/components/stocks/price-poller';
import { useQuote } from '@/lib/hooks/use-quote';
import { computeHoldings, evalHolding } from '@/lib/utils/portfolio';
import { formatMoney } from '@/lib/utils/money';
import type { RealHolding, RealTrade, Stock } from '@/types';

const HISTORY_LIMIT = 50;

function pnlColor(n: number): string {
  return n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted-foreground';
}
function detailHref(ticker: string, market: string): string {
  return `/stocks/${encodeURIComponent(ticker)}?market=${market}`;
}

/** 선택한 종목의 실시간 시세 헤더 + 매매 입력 패널 */
function SelectedStockTrade({
  stock,
  trades,
  onTradesChange,
}: {
  stock: Stock;
  trades: RealTrade[];
  onTradesChange: (stockId: string, next: RealTrade[]) => void;
}) {
  const { quote, loading } = useQuote(stock.ticker, stock.market);
  const change = quote?.change ?? 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border bg-secondary/40 px-4 py-3">
        <span className="text-xs text-muted-foreground">현재가</span>
        <span className="text-xl font-bold tabular-nums">
          {quote ? formatMoney(quote.price, stock.currency) : loading ? '불러오는 중…' : '—'}
        </span>
        {quote && (
          <span className={`text-sm font-medium tabular-nums ${pnlColor(change)}`}>
            {change > 0 ? '▲' : change < 0 ? '▼' : ''} {formatMoney(Math.abs(change), stock.currency)} ({quote.changeRate}%)
          </span>
        )}
        <Link href={detailHref(stock.ticker, stock.market)} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          종목 상세 <ExternalLink className="size-3" />
        </Link>
      </div>
      <HoldingsTradesPanel
        key={stock.id}
        stock={stock}
        initialTrades={trades}
        currentPriceMinor={quote?.price ?? null}
        onTradesChange={onTradesChange}
      />
    </div>
  );
}

export function TradePanel({ initialTrades }: { initialTrades: RealTrade[] }) {
  const router = useRouter();
  const [trades, setTrades] = useState(initialTrades);
  const [selected, setSelected] = useState<Stock | null>(null);
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  // 아래 내역에서 삭제하면 입력 패널(자체 상태 보유)을 새 기록으로 다시 마운트한다
  const [panelVersion, setPanelVersion] = useState(0);

  const holdings = useMemo(() => computeHoldings(trades), [trades]);
  const handlePrice = useCallback((stockId: string, price: number) => {
    setPriceMap((prev) => (prev[stockId] === price ? prev : { ...prev, [stockId]: price }));
  }, []);

  const onTradesChange = useCallback(
    (stockId: string, next: RealTrade[]) => {
      setTrades((prev) => [...prev.filter((t) => t.stockId !== stockId), ...next].sort(latestFirst));
      router.refresh(); // 대시보드·목표 등 서버 렌더 값 갱신
    },
    [router],
  );

  function pick(s: SelectedStock) {
    if (!s.id || !s.currency) {
      toast.error('종목 정보를 불러오지 못했습니다. 다시 검색해 주세요.');
      return;
    }
    setSelected({
      id: s.id,
      ticker: s.ticker,
      market: s.market,
      currency: s.currency,
      name_kr: s.nameKr ?? s.name,
      name_en: s.nameEn ?? null,
      sector: null,
    });
  }

  function pickHolding(h: RealHolding | RealTrade) {
    setSelected({ id: h.stockId, ticker: h.ticker, market: h.market, currency: h.currency, name_kr: h.name, name_en: null, sector: null });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function remove(t: RealTrade) {
    const prev = trades;
    setTrades((p) => p.filter((x) => x.id !== t.id));
    try {
      const res = await fetch(`/api/trades?id=${encodeURIComponent(t.id)}`, { method: 'DELETE' });
      if (!res.ok) {
        setTrades(prev);
        toast.error('삭제에 실패했습니다.');
        return;
      }
      // 선택 중인 종목이면 입력 패널도 새 기록으로 다시 그린다
      if (selected?.id === t.stockId) setPanelVersion((v) => v + 1);
      router.refresh();
    } catch {
      setTrades(prev);
      toast.error('네트워크 오류로 삭제하지 못했습니다.');
    }
  }

  const selectedPicker: SelectedStock | null = selected
    ? { ticker: selected.ticker, market: selected.market, name: selected.name_kr ?? selected.ticker }
    : null;

  return (
    <div className="space-y-5">
      {holdings.map((h) => (
        <PricePoller key={h.stockId} stockId={h.stockId} ticker={h.ticker} market={h.market} onPrice={handlePrice} />
      ))}

      <Card className="gap-4 p-4">
        <div>
          <h3 className="font-semibold">매수·매도 기록</h3>
          <p className="text-[11px] text-muted-foreground">
            종목을 검색해 바로 기록합니다. 종목 상세의 매매일지와 같은 기록이라 양쪽에 함께 반영됩니다.
          </p>
        </div>
        <StockPicker selected={selectedPicker} onSelect={pick} onClear={() => setSelected(null)} />
        {selected && (
          <SelectedStockTrade
            key={`${selected.id}:${panelVersion}`}
            stock={selected}
            trades={trades.filter((t) => t.stockId === selected.id)}
            onTradesChange={onTradesChange}
          />
        )}
      </Card>

      <Card className="gap-3 p-4">
        <h3 className="font-semibold">보유 현황 {holdings.length > 0 && <span className="text-sm font-normal text-muted-foreground">{holdings.length}종목</span>}</h3>
        {holdings.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">보유 중인 종목이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 pr-3 text-left font-medium">종목</th>
                  <th className="px-3 py-2 text-right font-medium">수량</th>
                  <th className="px-3 py-2 text-right font-medium">평단</th>
                  <th className="px-3 py-2 text-right font-medium">현재가</th>
                  <th className="px-3 py-2 text-right font-medium">평가손익</th>
                  <th className="py-2 pl-3 text-right font-medium">수익률</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  const price = priceMap[h.stockId];
                  const ev = price != null ? evalHolding(h, price) : null;
                  return (
                    <tr
                      key={h.stockId}
                      className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-muted/40"
                      onClick={() => pickHolding(h)}
                    >
                      <td className="py-2.5 pr-3">
                        <span className="flex items-center gap-2">
                          <CompanyLogo ticker={h.ticker} name={h.name} size={22} />
                          <span className="font-medium">{h.name}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{h.qty.toLocaleString()}주</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(h.avgBuyPrice, h.currency)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{price != null ? formatMoney(price, h.currency) : '—'}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${ev ? pnlColor(ev.evalPnl) : ''}`}>
                        {ev ? `${ev.evalPnl > 0 ? '+' : ''}${formatMoney(ev.evalPnl, h.currency)}` : '—'}
                      </td>
                      <td className={`py-2.5 pl-3 text-right font-medium tabular-nums ${ev ? pnlColor(ev.evalPnl) : ''}`}>
                        {ev ? `${ev.evalRate > 0 ? '+' : ''}${ev.evalRate}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="gap-3 p-4">
        <h3 className="font-semibold">
          매매 내역{' '}
          {trades.length > HISTORY_LIMIT && (
            <span className="text-sm font-normal text-muted-foreground">최근 {HISTORY_LIMIT}건 / 전체 {trades.length}건</span>
          )}
        </h3>
        {trades.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">매매 기록이 없습니다.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {trades.slice(0, HISTORY_LIMIT).map((t) => (
              <div key={t.id} className="flex items-center gap-3 py-2.5">
                <Badge
                  variant="outline"
                  className={t.side === 'buy' ? 'border-up/30 bg-up-soft text-up' : 'border-down/30 bg-down-soft text-down'}
                >
                  {t.side === 'buy' ? '매수' : '매도'}
                </Badge>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => pickHolding(t)}>
                  <div className="truncate text-sm font-medium">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {t.tradeDate} · {formatMoney(t.price, t.currency)} × {t.qty.toLocaleString()}주 ={' '}
                    {formatMoney(t.price * t.qty, t.currency)}
                    {t.side === 'sell' && t.fee > 0 && ` · 비용 ${formatMoney(t.fee, t.currency)}`}
                  </div>
                </button>
                <Button size="icon-xs" variant="ghost" className="text-muted-foreground" aria-label="기록 삭제" onClick={() => remove(t)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function latestFirst(a: RealTrade, b: RealTrade): number {
  if (a.tradeDate !== b.tradeDate) return a.tradeDate < b.tradeDate ? 1 : -1;
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}
