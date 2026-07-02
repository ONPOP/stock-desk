'use client';

// 모의투자 테스트 콕핏 (Phase 2~4) — 테스트 세션 + 포트폴리오/성과 + 거래내역(변동 원인) + 분야별 시장 매매 팝업.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FlaskConical, BarChart3, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/utils/money';
import { getEventsAround } from '@/lib/sim/events';
import { findSimStock, SIM_STOCKS, SIM_THEMES } from '@/lib/sim/universe';
import { SimMarketDialog } from '@/components/sim/sim-market-dialog';
import type { SimTradingState } from '@/types/sim';

const STARTS = [
  { label: '10년 전', y: 10 },
  { label: '5년 전', y: 5 },
  { label: '3년 전', y: 3 },
  { label: '1년 전', y: 1 },
];

function yearsAgoDate(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}
function pnlColor(n: number): string {
  return n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted-foreground';
}
function signed(cents: number): string {
  return `${cents > 0 ? '+' : ''}${formatMoney(cents, 'USD')}`;
}
function nameOf(ticker: string): string {
  const s = findSimStock(ticker);
  return s?.nameKr ?? s?.nameEn ?? ticker;
}

export function SimTestPanel() {
  const [state, setState] = useState<SimTradingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [seedUsd, setSeedUsd] = useState('10000');
  const [startYearsAgo, setStartYearsAgo] = useState(10);
  const [starting, setStarting] = useState(false);
  const [showStart, setShowStart] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [valuationDate, setValuationDate] = useState('');
  const [prices, setPrices] = useState<Record<string, number>>({});

  const loadState = useCallback(async () => {
    try {
      const res = await fetch('/api/sim/session');
      const d = await res.json();
      if (res.ok) {
        setState(d.state as SimTradingState);
        if (d.state.session) setValuationDate(d.state.session.curDate);
      }
    } catch {
      toast.error('상태를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const positions = useMemo(() => state?.positions ?? [], [state]);
  const posKey = positions.map((p) => p.ticker).join(',');

  // 보유 종목 평가 시세 (평가 시점 기준)
  useEffect(() => {
    if (!valuationDate || !posKey) {
      setPrices({});
      return;
    }
    let cancel = false;
    fetch(`/api/sim/prices?date=${valuationDate}&tickers=${encodeURIComponent(posKey)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancel && d.prices) setPrices(d.prices);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [valuationDate, posKey]);

  async function startSession() {
    const seed = Number(seedUsd);
    if (!Number.isFinite(seed) || seed <= 0) {
      toast.error('초기 자금을 입력하세요.');
      return;
    }
    setStarting(true);
    try {
      const res = await fetch('/api/sim/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seedUsd: seed, startDate: yearsAgoDate(startYearsAgo) }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error ?? '시작에 실패했습니다.');
        return;
      }
      setState(d.state as SimTradingState);
      setValuationDate(d.state.session?.curDate ?? '');
      setShowStart(false);
      toast.success('새 테스트 세션을 시작했습니다.');
    } catch {
      toast.error('네트워크 오류가 발생했습니다.');
    } finally {
      setStarting(false);
    }
  }

  const session = state?.session ?? null;
  const cash = state?.cashCents ?? 0;
  const realized = state?.realizedPnlCents ?? 0;
  const trades = state?.trades ?? [];

  const summary = useMemo(() => {
    let value = 0;
    let cost = 0;
    for (const p of positions) {
      const price = prices[p.ticker];
      if (price != null) value += p.qty * price;
      cost += p.qty * p.avgCostCents;
    }
    const seed = session?.seedUsdCents ?? 0;
    const totalAsset = cash + value;
    return {
      value,
      evalPnl: value - cost,
      totalAsset,
      totalReturn: seed > 0 ? ((totalAsset - seed) / seed) * 100 : 0,
    };
  }, [positions, prices, cash, session]);

  const intro = (
    <Card className="gap-2 p-4">
      <div className="flex items-center gap-2">
        <FlaskConical className="size-4 text-primary" />
        <h2 className="text-base font-semibold">모의투자 테스트 (과거 10년 백테스트)</h2>
      </div>
      <p className="text-[13px] text-muted-foreground">
        과거 미국 시장을 빨리감기로 재생하며 매매하고, 거래마다 그 시기의 변동 원인을 학습하는 샌드박스입니다. 종목 {SIM_STOCKS.length}개 · {SIM_THEMES.length}개 분야.
      </p>
    </Card>
  );

  const startForm = (
    <Card className="gap-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{session ? '새 테스트 세션 (현재 세션 종료)' : '테스트 세션 시작'}</h3>
        {session && (
          <Button size="xs" variant="ghost" onClick={() => setShowStart(false)}>
            취소
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">초기 자금 (USD $)</span>
          <Input type="number" min={1} step="any" value={seedUsd} onChange={(e) => setSeedUsd(e.target.value)} />
        </label>
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">시작 시점</span>
          <div className="flex flex-wrap gap-1.5">
            {STARTS.map((s) => (
              <button
                key={s.y}
                type="button"
                onClick={() => setStartYearsAgo(s.y)}
                aria-pressed={startYearsAgo === s.y}
                className={cn(
                  'rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                  startYearsAgo === s.y ? 'bg-primary text-primary-foreground' : 'bg-secondary/60 text-muted-foreground hover:bg-muted',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {session && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[12px] font-medium text-red-600">
          ⚠️ 새 세션을 시작하면 현재 세션의 보유·거래가 초기화됩니다.
        </p>
      )}
      <div>
        <Button onClick={startSession} disabled={starting}>
          {starting ? '시작 중…' : session ? '기존 세션 종료 & 새 세션 시작' : '테스트 시작'}
        </Button>
      </div>
    </Card>
  );

  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중…</p>;

  // 세션 없음 → 시작 폼만
  if (!session) {
    return (
      <div className="space-y-5">
        {intro}
        {startForm}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {intro}

      {showStart ? (
        startForm
      ) : (
        <>
          {/* 성과 요약 */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="gap-1 p-3.5">
              <span className="text-[11px] text-muted-foreground">총자산</span>
              <span className="text-lg font-bold tabular-nums">{formatMoney(summary.totalAsset, 'USD')}</span>
              <span className={cn('text-[12px] font-medium tabular-nums', pnlColor(summary.totalReturn))}>
                {summary.totalReturn > 0 ? '+' : ''}
                {summary.totalReturn.toFixed(2)}%
              </span>
            </Card>
            <Card className="gap-1 p-3.5">
              <span className="text-[11px] text-muted-foreground">현금</span>
              <span className="text-lg font-bold tabular-nums">{formatMoney(cash, 'USD')}</span>
            </Card>
            <Card className="gap-1 p-3.5">
              <span className="text-[11px] text-muted-foreground">평가손익</span>
              <span className={cn('text-lg font-bold tabular-nums', pnlColor(summary.evalPnl))}>{signed(summary.evalPnl)}</span>
            </Card>
            <Card className="gap-1 p-3.5">
              <span className="text-[11px] text-muted-foreground">실현손익</span>
              <span className={cn('text-lg font-bold tabular-nums', pnlColor(realized))}>{signed(realized)}</span>
            </Card>
          </div>

          {/* 세션·평가 시점·액션 */}
          <Card className="flex flex-wrap items-end justify-between gap-3 p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="text-sm">
                <p className="text-[11px] text-muted-foreground">세션 시드 · 시작</p>
                <p className="font-medium tabular-nums">
                  {formatMoney(session.seedUsdCents, 'USD')} · {session.startDate}
                </p>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[11px] text-muted-foreground">평가 시점</span>
                <Input
                  type="date"
                  value={valuationDate}
                  min={session.startDate}
                  onChange={(e) => setValuationDate(e.target.value)}
                  className="h-9 w-40"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setMarketOpen(true)}>
                <BarChart3 data-icon="inline-start" /> 분야별 시장 · 매매
              </Button>
              <Button variant="outline" onClick={() => setShowStart(true)}>
                <RotateCcw data-icon="inline-start" /> 새 테스트
              </Button>
            </div>
          </Card>

          {/* 보유 종목 */}
          <div>
            <h3 className="mb-2 text-sm font-semibold">보유 종목</h3>
            {positions.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-2.5 text-[13px] text-muted-foreground">
                보유 종목이 없습니다. ‘분야별 시장 · 매매’에서 매수해 보세요.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-[11px] text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">종목</th>
                      <th className="px-3 py-2 text-right font-medium">수량</th>
                      <th className="px-3 py-2 text-right font-medium">평단</th>
                      <th className="px-3 py-2 text-right font-medium">현재가</th>
                      <th className="px-3 py-2 text-right font-medium">평가손익</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p) => {
                      const price = prices[p.ticker];
                      const pnl = price != null ? p.qty * (price - p.avgCostCents) : 0;
                      return (
                        <tr key={p.ticker} className="border-t">
                          <td className="px-3 py-2">
                            <span className="font-medium">{nameOf(p.ticker)}</span>{' '}
                            <span className="font-mono text-[11px] text-muted-foreground">{p.ticker}</span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{p.qty.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(p.avgCostCents, 'USD')}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{price != null ? formatMoney(price, 'USD') : '—'}</td>
                          <td className={cn('px-3 py-2 text-right font-medium tabular-nums', pnlColor(pnl))}>
                            {price != null ? signed(pnl) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 거래 내역 + 변동 원인 */}
          <div>
            <h3 className="mb-2 text-sm font-semibold">거래 내역 · 변동 원인</h3>
            {trades.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-2.5 text-[13px] text-muted-foreground">아직 거래가 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {[...trades].reverse().map((t) => {
                  const causes = getEventsAround(t.tradeDate, 5, t.ticker);
                  return (
                    <li key={t.id} className="rounded-xl border bg-card p-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="secondary" className={t.side === 'buy' ? 'text-up' : 'text-down'}>
                          {t.side === 'buy' ? '매수' : '매도'}
                        </Badge>
                        <span className="font-medium">{nameOf(t.ticker)}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {t.qty.toLocaleString()}주 · {formatMoney(t.priceCents, 'USD')}
                        </span>
                        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{t.tradeDate}</span>
                      </div>
                      {causes.length > 0 && (
                        <div className="mt-2 space-y-1 border-t pt-2">
                          {causes.map((e, i) => (
                            <p key={`${e.date}-${i}`} className="text-[12px] text-muted-foreground">
                              <span
                                className={cn(
                                  'font-medium',
                                  e.impact === 'up' ? 'text-up' : e.impact === 'down' ? 'text-down' : '',
                                )}
                              >
                                {e.ticker ?? '시장'} · {e.title}
                              </span>{' '}
                              ({e.date}) — {e.detail}
                            </p>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {marketOpen && (
        <SimMarketDialog
          initialYearsAgo={startYearsAgo}
          onClose={() => {
            setMarketOpen(false);
            loadState();
          }}
          onTraded={(date) => {
            setValuationDate(date);
            loadState();
          }}
        />
      )}
    </div>
  );
}
