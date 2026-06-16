'use client';

// F9 모의투자 — 계좌 요약 + 포지션 카드 + 주문 폼 + 거래 타임라인 + 시즌 리셋.
// 시장가=장중 즉시·장외 시초가 예약, 지정가=조건 도달 시 체결(예약 후 감시). 금액은 최소 단위 정수.
// 주문 폼에 실시간 시장가 표시·지정가 입력·예상금액, 거래내역에 예약 취소 버튼.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CompanyLogo } from '@/components/ui/company-logo';
import { StockPicker, type SelectedStock } from './stock-picker';
import { NewSeasonDialog, type NewSeasonValues } from './new-season-dialog';
import { ArchivedSeasons } from './archived-seasons';
import { PortfolioSummaryBar, type AllocationSlice } from '@/components/stocks/portfolio-summary-bar';
import { useQuote } from '@/lib/hooks/use-quote';
import { useUsdKrw } from '@/lib/hooks/use-usd-krw';
import { summarizePortfolio, evalHolding } from '@/lib/utils/portfolio';
import { formatMoney, minorToMajorNumber } from '@/lib/utils/money';
import type { Currency, Market, PaperPosition, PaperState, RealHolding } from '@/types';

const KRW_MARKETS: Market[] = ['KOSPI', 'KOSDAQ'];

type OrderType = 'market' | 'limit';

/** 표시 단위 입력 → 최소 단위 정수(표시·예상금액용 근사). KRW=원, USD=센트. */
function toMinorApprox(input: string, currency: Currency): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return currency === 'USD' ? Math.round(n * 100) : Math.round(n);
}

export function PaperClient({ initialState }: { initialState: PaperState }) {
  const [state, setState] = useState<PaperState>(initialState);
  const [selected, setSelected] = useState<SelectedStock | null>(null);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [qty, setQty] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showNewSeason, setShowNewSeason] = useState(false);
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});

  const ticker = selected?.ticker ?? '';
  const market: Market = selected?.market ?? 'KOSPI';
  const currency: Currency = KRW_MARKETS.includes(market) ? 'KRW' : 'USD';
  const symbol = currency === 'USD' ? '$' : '₩';

  const { usdKrw, ready } = useUsdKrw();
  const handlePrice = useCallback(
    (stockId: string, priceMinor: number) =>
      setPriceMap((prev) => (prev[stockId] === priceMinor ? prev : { ...prev, [stockId]: priceMinor })),
    [],
  );

  // 실시간 시장가 — 종목이 선택됐을 때만 폴링
  const { quote, loading: quoteLoading, error: quoteError } = useQuote(ticker, market, {
    enabled: !!selected,
  });

  // 예상 주문금액(수량 × 단가) — 지정가는 입력값, 시장가는 현재가 기준
  const estimateMinor = useMemo(() => {
    const q = Number(qty);
    if (!Number.isInteger(q) || q <= 0) return 0;
    const unit = orderType === 'limit' ? toMinorApprox(limitPrice, currency) : (quote?.price ?? 0);
    return unit * q;
  }, [qty, orderType, limitPrice, currency, quote]);

  // 지정가 모드로 전환 시 현재가를 기본값으로 채움(비어있을 때만)
  function chooseOrderType(t: OrderType) {
    setOrderType(t);
    if (t === 'limit' && !limitPrice && quote) {
      setLimitPrice(String(minorToMajorNumber(quote.price, currency)));
    }
  }

  const hasPendingLimit = useMemo(
    () => state.trades.some((t) => t.status === 'pending' && t.orderType === 'limit'),
    [state.trades],
  );

  // 보유 종목 평가 — PaperPosition을 RealHolding으로 보고 현재가(priceMap) 기준 요약
  const holdings = useMemo<RealHolding[]>(
    () =>
      state.positions
        .filter((p) => p.qty > 0)
        .map((p) => {
          const avg = p.avgPrice ?? 0;
          return {
            stockId: p.stockId,
            ticker: p.ticker,
            name: p.name,
            market: p.market,
            currency: p.currency,
            qty: p.qty,
            avgBuyPrice: avg,
            buyAmount: avg * p.qty,
            realizedPnl: 0,
          };
        }),
    [state.positions],
  );
  const summary = useMemo(
    () => summarizePortfolio(holdings, priceMap, [], ready ? usdKrw : 0),
    [holdings, priceMap, ready, usdKrw],
  );
  const allocation = useMemo<AllocationSlice[]>(
    () =>
      holdings
        .map((h) => {
          const price = priceMap[h.stockId];
          const value = price != null ? evalHolding(h, price).currentValue : h.buyAmount;
          const krw = h.currency === 'USD' ? Math.round((value / 100) * (ready ? usdKrw : 0)) : value;
          return { name: h.name, value: krw };
        })
        .filter((s) => s.value > 0),
    [holdings, priceMap, ready, usdKrw],
  );

  // 지정가 예약 체결 감시 — pending 지정가가 있을 때만 8초 주기로 트리거
  useEffect(() => {
    if (!hasPendingLimit) return;
    let stop = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/paper/check-limits', { method: 'POST' });
        const data = await res.json();
        if (!stop && res.ok && data.filled > 0 && data.state) {
          setState(data.state);
          toast.success(`지정가 ${data.filled}건이 체결되었습니다.`);
        }
      } catch {
        /* 폴링 실패는 다음 주기에 재시도 */
      }
    };
    const id = setInterval(tick, 8000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [hasPendingLimit]);

  async function submit() {
    const q = Number(qty);
    if (!selected || !Number.isInteger(q) || q <= 0) {
      toast.error('종목과 수량을 올바르게 입력해주세요.');
      return;
    }
    if (orderType === 'limit' && (!limitPrice.trim() || Number(limitPrice) <= 0)) {
      toast.error('지정가를 입력해주세요.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/paper', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ticker: ticker.trim().toUpperCase(),
          market,
          side,
          qty: q,
          orderType,
          ...(orderType === 'limit' ? { limitPrice: limitPrice.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? '주문에 실패했습니다.');
        return;
      }
      setState(data.state);
      const r = data.result;
      if (r?.status === 'error') toast.error(r.reason ?? '주문 실패');
      else if (r?.status === 'reserved')
        toast.success(
          orderType === 'limit'
            ? '지정가 예약 접수 — 시세가 지정가에 도달하면 체결됩니다.'
            : '장외 — 예약주문 접수(다음 개장 시초가 체결).',
        );
      else toast.success('체결되었습니다.');
      setQty('');
      setLimitPrice('');
    } catch {
      toast.error('네트워크 오류로 주문하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrder(tradeId: string) {
    if (!confirm('이 예약 주문을 취소할까요?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/paper?tradeId=${encodeURIComponent(tradeId)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? '취소에 실패했습니다.');
        return;
      }
      setState(data.state);
      toast.success('예약 주문을 취소했습니다.');
    } catch {
      toast.error('네트워크 오류로 취소하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function submitNewSeason(v: NewSeasonValues) {
    setBusy(true);
    try {
      const res = await fetch('/api/paper?reset=true', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          seedKrw: v.seedKrw,
          seedUsd: v.seedUsd,
          ...(v.startDate ? { startDate: v.startDate } : {}),
          ...(v.endDate ? { endDate: v.endDate } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? '시즌 시작에 실패했습니다.');
        return;
      }
      setState(data.state);
      setShowNewSeason(false);
      toast.success('새 시즌을 시작했습니다.');
    } catch {
      toast.error('네트워크 오류');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* 계좌 요약 타일 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-0 bg-accent text-accent-foreground">시즌 {state.seasonNo}</Badge>
          {(state.seasonStartDate || state.seasonEndDate) && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {state.seasonStartDate ?? '—'} ~ {state.seasonEndDate ?? '—'}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowNewSeason(true)} disabled={busy}>
          새 시즌 시작
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {state.accounts.map((a) => (
          <Card key={a.currency} className="gap-1.5 p-4">
            <span className="text-xs text-muted-foreground">{a.currency} 현금</span>
            <span className="text-[22px] font-bold tabular-nums">{formatMoney(a.cashBalance, a.currency)}</span>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        {/* 주문 폼 */}
        <Card className="gap-4 p-[18px]">
          <h2 className="font-semibold">주문</h2>

          {/* 매수/매도 */}
          <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-[3px]">
            <button
              type="button"
              onClick={() => setSide('buy')}
              className={`rounded-full py-1.5 text-sm font-medium transition-all ${
                side === 'buy' ? 'bg-background text-up shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              매수
            </button>
            <button
              type="button"
              onClick={() => setSide('sell')}
              className={`rounded-full py-1.5 text-sm font-medium transition-all ${
                side === 'sell' ? 'bg-background text-down shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              매도
            </button>
          </div>

          <StockPicker selected={selected} onSelect={setSelected} onClear={() => setSelected(null)} />

          {/* 실시간 시장가 */}
          <div className="flex items-center justify-between rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">실시간 시장가</span>
            <span className="font-mono font-semibold tabular-nums">
              {!selected
                ? '종목 선택'
                : quote
                  ? formatMoney(quote.price, currency)
                  : quoteError
                    ? '시세 없음'
                    : quoteLoading
                      ? '불러오는 중…'
                      : '—'}
            </span>
          </div>

          {/* 시장가/지정가 */}
          <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-[3px]">
            {(['market', 'limit'] as OrderType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => chooseOrderType(t)}
                className={`rounded-full py-1.5 text-sm font-medium transition-all ${
                  orderType === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'market' ? '시장가' : '지정가'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input type="number" placeholder="수량" value={qty} onChange={(e) => setQty(e.target.value)} min={1} />
            {orderType === 'limit' ? (
              <Input
                type="number"
                placeholder={`지정가 (${symbol})`}
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                min={0}
                step="any"
              />
            ) : (
              <div className="flex h-8 items-center rounded-lg border border-dashed border-input px-2.5 text-xs text-muted-foreground">
                현재가로 즉시 체결
              </div>
            )}
          </div>

          {/* 예상 주문금액 */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">예상 주문금액</span>
            <span className="font-mono tabular-nums">{estimateMinor > 0 ? formatMoney(estimateMinor, currency) : '—'}</span>
          </div>

          <Button
            onClick={submit}
            disabled={busy}
            className={`h-10 border-0 text-white ${side === 'buy' ? 'bg-up hover:bg-up/90' : 'bg-down hover:bg-down/90'}`}
          >
            {orderType === 'limit' ? '지정가' : '시장가'} {side === 'buy' ? '매수' : '매도'} 주문
          </Button>
          <p className="text-[11px] text-muted-foreground">
            {orderType === 'limit'
              ? '지정가에 도달하면 자동 체결됩니다(앱 실행 중 감시). 매수=현재가 ≤ 지정가, 매도=현재가 ≥ 지정가.'
              : '장중이면 시장가 즉시 체결, 장외면 예약주문으로 접수되어 다음 개장 시초가에 체결됩니다.'}
          </p>
        </Card>

        {/* 포지션 */}
        <Card className="gap-3 p-[18px]">
          <h2 className="font-semibold">보유 종목</h2>
          {state.positions.length === 0 ? (
            <p className="text-sm text-muted-foreground">보유 종목이 없습니다.</p>
          ) : (
            <ul className="divide-y">
              {state.positions.map((p) => (
                <li key={p.stockId} className="flex items-center gap-2.5 py-2.5 text-sm">
                  <CompanyLogo ticker={p.ticker} name={p.name} size={30} />
                  <div className="min-w-0">
                    <div className="font-medium">{p.name}</div>
                    <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {p.qty.toLocaleString()}주 · 평단 {p.avgPrice != null ? formatMoney(p.avgPrice, p.currency) : '—'}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* 거래 타임라인 */}
      <Card className="gap-3 p-[18px]">
        <h2 className="font-semibold">거래 내역</h2>
        {state.trades.length === 0 ? (
          <p className="text-sm text-muted-foreground">거래 내역이 없습니다.</p>
        ) : (
          <ul className="divide-y">
            {state.trades.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <Badge variant="outline" className={`border-0 ${t.side === 'buy' ? 'bg-up-soft text-up' : 'bg-down-soft text-down'}`}>
                    {t.side === 'buy' ? '매수' : '매도'}
                  </Badge>
                  <span className="truncate font-medium">{t.name || t.ticker}</span>
                  {t.status === 'pending' && (
                    <Badge variant="outline" className="border-0 bg-amber-500/15 text-[11px] text-amber-600">
                      {t.orderType === 'limit' ? '지정가 예약' : '예약'}
                    </Badge>
                  )}
                  {t.status === 'canceled' && <span className="text-[11px] text-muted-foreground">취소됨</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2.5">
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {t.qty.toLocaleString()}주 {t.price != null ? `@ ${formatMoney(t.price, t.currency)}` : ''} ·{' '}
                    {new Date(t.createdAt).toLocaleDateString('ko-KR')}
                  </span>
                  {t.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => cancelOrder(t.id)}
                      disabled={busy}
                      className="rounded-md border border-input px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      취소
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ArchivedSeasons />

      {/* 보유 종목 현재가 폴링(숨김) → 하단 수익 요약바 */}
      {state.positions.map((p) => (
        <PositionPricePoller key={p.stockId} position={p} onPrice={handlePrice} />
      ))}
      {holdings.length > 0 && <PortfolioSummaryBar summary={summary} allocation={allocation} ready={ready} />}

      {showNewSeason && (
        <NewSeasonDialog
          defaultKrw={10_000_000}
          defaultUsd={10_000}
          busy={busy}
          onClose={() => setShowNewSeason(false)}
          onSubmit={submitNewSeason}
        />
      )}
    </div>
  );
}

function PositionPricePoller({
  position,
  onPrice,
}: {
  position: PaperPosition;
  onPrice: (stockId: string, priceMinor: number) => void;
}) {
  const { quote } = useQuote(position.ticker, position.market, { enabled: true });
  useEffect(() => {
    if (quote) onPrice(position.stockId, quote.price);
  }, [quote, position.stockId, onPrice]);
  return null;
}
