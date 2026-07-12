'use client';

// 자동매매 컨트롤 패널 (D15) — 상태·kill switch·유니버스·파라미터·시그널 로그·백테스트.
// tick 드라이버: 활성 상태에서 10초 주기 POST /api/trading/tick (서버가 개장·리스크 재검증).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useRealtimeQuote } from '@/lib/hooks/use-realtime-quote';
import { formatMoney } from '@/lib/utils/money';
import { formatKst, dateInTz, KST_TZ } from '@/lib/utils/date';
import { cn } from '@/lib/utils';
import type { AutoTradingConfig, BacktestResult, StrategyParams, TradeSignalRow, WatchlistItem } from '@/types';

const TICK_MS = 10_000;

// 유니버스 칩 실시간 시세 — on(감시 중)일 때만 마운트되어 구독(우선순위 normal, 폴링 폴백 없음).
function ChipLivePrice({ item }: { item: WatchlistItem }) {
  const { quote, realtime } = useRealtimeQuote(item.ticker, item.market, item.currency, {
    priority: 'normal',
    fallbackPolling: false,
  });
  if (!quote) return null;
  return (
    <span className="ml-1 inline-flex items-center gap-1 tabular-nums opacity-90">
      {realtime && <span className="size-1 animate-pulse rounded-full bg-current" />}
      {formatMoney(quote.price, item.currency)}
    </span>
  );
}

// 파라미터 편집 필드 정의 — 라벨·그룹만 UI 관심사, 범위 검증은 서버(zod) 단일 원천
const PARAM_GROUPS: Array<{ title: string; fields: Array<{ key: keyof StrategyParams; label: string }> }> = [
  {
    title: '진입',
    fields: [
      { key: 'vwapHoldBars', label: 'VWAP 상방 유지(봉)' },
      { key: 'macdCrossWithinBars', label: 'MACD 전환 창(봉)' },
      { key: 'rsiEntryMin', label: 'RSI 하한' },
      { key: 'rsiEntryMax', label: 'RSI 상한' },
      { key: 'volMultiplier', label: '거래량 배수' },
      { key: 'volAvgBars', label: '거래량 평균(봉)' },
    ],
  },
  {
    title: '청산',
    fields: [
      { key: 'stopLossPct', label: '손절 %' },
      { key: 'takeProfitPct', label: '익절 %' },
      { key: 'rsiExit', label: 'RSI 과열' },
      { key: 'vwapExitBars', label: 'VWAP 이탈(봉)' },
      { key: 'exitTimeKst', label: '청산 시각(KST)' },
    ],
  },
  {
    title: '리스크',
    fields: [
      { key: 'orderPct', label: '1회 주문(시드 %)' },
      { key: 'maxPositions', label: '동시 보유 종목' },
      { key: 'dailyLossLimitPct', label: '일 손실 한도 %' },
      { key: 'maxEntriesPerDay', label: '종목당 일 진입' },
      { key: 'reentryCooldownMin', label: '손절 후 대기(분)' },
    ],
  },
  {
    title: '지표',
    fields: [
      { key: 'rsiPeriod', label: 'RSI 기간' },
      { key: 'macdFast', label: 'MACD fast' },
      { key: 'macdSlow', label: 'MACD slow' },
      { key: 'macdSignal', label: 'MACD signal' },
    ],
  },
];

export function AutoTradePanel({
  items,
  initialConfig,
  initialSignals,
  selected,
}: {
  items: WatchlistItem[];
  initialConfig: AutoTradingConfig;
  initialSignals: TradeSignalRow[];
  selected: WatchlistItem | null;
}) {
  const [config, setConfig] = useState(initialConfig);
  const [signals, setSignals] = useState(initialSignals);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [showParams, setShowParams] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [btInterval, setBtInterval] = useState<'1m' | '1d'>('1m');
  const [btRunning, setBtRunning] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/trading');
      const data = await res.json();
      if (res.ok) {
        setConfig(data.config);
        setSignals(data.signals);
      }
    } catch {
      // 폴링 실패는 다음 주기에 재시도
    }
  }, []);

  const patch = useCallback(
    async (body: Record<string, unknown>, successMsg?: string) => {
      setSaving(true);
      try {
        const res = await fetch('/api/trading', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '저장에 실패했습니다.');
        setConfig(data.config);
        if (successMsg) toast.success(successMsg);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  // tick 드라이버 — 활성 시 10초 주기, 탭 숨김 시 중단
  useEffect(() => {
    if (!config.enabled || config.killSwitch) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      try {
        const res = await fetch('/api/trading/tick', { method: 'POST' });
        const data = await res.json();
        if (res.ok && data.signals > 0) await refresh();
      } catch {
        // 다음 tick에 재시도
      }
    };
    const start = () => {
      if (timer) return;
      tick();
      timer = setInterval(tick, TICK_MS);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [config.enabled, config.killSwitch, refresh]);

  const todayPnl = useMemo(() => {
    const todayKst = dateInTz(new Date(), KST_TZ);
    return signals
      .filter((s) => s.executed && dateInTz(s.decidedAt, KST_TZ) === todayKst)
      .reduce((a, s) => a + (s.pnl ?? 0), 0);
  }, [signals]);

  const inUniverse = (ticker: string) => config.universe.some((u) => u.ticker === ticker);
  const toggleUniverse = (item: WatchlistItem) => {
    const next = inUniverse(item.ticker)
      ? config.universe.filter((u) => u.ticker !== item.ticker)
      : [...config.universe, { ticker: item.ticker, market: item.market as 'KOSPI' | 'KOSDAQ' }];
    if (next.length > 10) {
      toast.error('감시 종목은 최대 10개입니다.');
      return;
    }
    patch({ universe: next });
  };

  const saveParams = () => {
    const params: Record<string, number | string> = {};
    for (const [k, v] of Object.entries(draft)) {
      if (v.trim() === '') continue;
      params[k] = k === 'exitTimeKst' ? v.trim() : Number(v);
    }
    if (Object.keys(params).length === 0) {
      toast.info('변경된 파라미터가 없습니다.');
      return;
    }
    patch({ params }, '파라미터를 저장했습니다.').then(() => setDraft({}));
  };

  const runBacktest = async () => {
    if (!selected) return;
    setBtRunning(true);
    setBacktest(null);
    try {
      const res = await fetch('/api/trading/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: selected.ticker,
          market: selected.market,
          interval: btInterval,
          count: btInterval === '1m' ? 400 : 250,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '백테스트에 실패했습니다.');
      setBacktest(data.result);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBtRunning(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      {/* 상태 헤더 */}
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-base font-bold">자동매매 (모의투자)</h3>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={config.enabled} onCheckedChange={(v: boolean) => patch({ enabled: v })} disabled={saving} />
          {config.enabled ? '작동 중' : '꺼짐'}
        </label>
        <Badge variant={config.killSwitch ? 'destructive' : config.enabled ? 'default' : 'secondary'}>
          {config.killSwitch ? 'KILL SWITCH' : config.enabled ? 'LIVE' : 'OFF'}
        </Badge>
        <span className={cn('text-sm font-semibold tabular-nums', todayPnl > 0 ? 'text-up' : todayPnl < 0 ? 'text-down' : 'text-muted-foreground')}>
          오늘 실현손익 {formatMoney(todayPnl, 'KRW')}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowParams((v) => !v)}>
            파라미터 {showParams ? '접기' : '편집'}
          </Button>
          <Button
            size="sm"
            variant={config.killSwitch ? 'outline' : 'destructive'}
            disabled={saving}
            onClick={() =>
              patch({ killSwitch: !config.killSwitch }, config.killSwitch ? 'Kill switch 해제' : '전체 매매 즉시 중지')
            }
          >
            {config.killSwitch ? 'Kill Switch 해제' : '긴급 정지'}
          </Button>
        </div>
      </div>

      {/* 유니버스 선택 */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          감시 종목 ({config.universe.length}/10)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => {
            const on = inUniverse(item.ticker);
            return (
              <button
                key={item.stock_id}
                type="button"
                disabled={saving}
                onClick={() => toggleUniverse(item)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs transition-colors',
                  on ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {item.name_kr ?? item.ticker}
                {on && <ChipLivePrice item={item} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 파라미터 편집 */}
      {showParams && (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
          {PARAM_GROUPS.map((g) => (
            <div key={g.title}>
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{g.title}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {g.fields.map((f) => (
                  <label key={f.key} className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
                    {f.label}
                    <Input
                      className="h-8 text-xs tabular-nums"
                      value={draft[f.key] ?? String(config.params[f.key])}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDraft({})}>
              되돌리기
            </Button>
            <Button size="sm" disabled={saving} onClick={saveParams}>
              저장
            </Button>
          </div>
        </div>
      )}

      {/* 백테스트 */}
      <div className="space-y-2 rounded-lg border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            백테스트{selected ? ` — ${selected.name_kr ?? selected.ticker}` : ''}
          </p>
          <div className="flex gap-1">
            {(['1m', '1d'] as const).map((iv) => (
              <Button key={iv} size="sm" variant={btInterval === iv ? 'default' : 'ghost'} className="h-7 rounded-full text-xs" onClick={() => setBtInterval(iv)}>
                {iv === '1m' ? '당일 분봉' : '일봉(참고)'}
              </Button>
            ))}
          </div>
          <Button size="sm" className="h-7" disabled={!selected || btRunning} onClick={runBacktest}>
            {btRunning ? '실행 중…' : '현재 파라미터로 실행'}
          </Button>
        </div>
        {backtest && (
          <p className="text-sm tabular-nums">
            매매 {backtest.stats.tradeCount}회 · 승률 {backtest.stats.winRate.toFixed(1)}% ·{' '}
            <span className={cn(backtest.stats.totalPnl > 0 ? 'text-up' : backtest.stats.totalPnl < 0 ? 'text-down' : '')}>
              손익 {formatMoney(backtest.stats.totalPnl, 'KRW')} ({backtest.stats.returnPct.toFixed(2)}%)
            </span>{' '}
            · MDD {formatMoney(backtest.stats.maxDrawdown, 'KRW')}
          </p>
        )}
      </div>

      {/* 시그널 로그 */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">시그널 로그</p>
        {signals.length === 0 ? (
          <p className="text-xs text-muted-foreground">아직 시그널이 없습니다. 자동매매를 켜면 판단·주문 기록이 여기에 쌓입니다.</p>
        ) : (
          <div className="max-h-64 overflow-y-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
                <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-medium">
                  <th>시각(KST)</th>
                  <th>종목</th>
                  <th>구분</th>
                  <th className="text-right!">체결</th>
                  <th className="text-right!">손익</th>
                  <th>사유</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((s) => (
                  <tr key={s.id} className="border-t [&>td]:px-2 [&>td]:py-1.5">
                    <td className="whitespace-nowrap tabular-nums">{formatKst(s.decidedAt)}</td>
                    <td className="whitespace-nowrap">{s.ticker}</td>
                    <td>
                      <Badge variant={s.executed ? 'default' : 'secondary'} className={cn('text-[10px]', s.executed && (s.action === 'buy' ? 'bg-up' : 'bg-down'))}>
                        {s.action === 'buy' ? '매수' : '매도'}
                        {!s.executed && ' 거부'}
                      </Badge>
                    </td>
                    <td className="text-right tabular-nums whitespace-nowrap">
                      {s.executed && s.price != null ? `${s.qty}주 @ ${formatMoney(s.price, 'KRW')}` : '—'}
                    </td>
                    <td className={cn('text-right tabular-nums whitespace-nowrap', (s.pnl ?? 0) > 0 ? 'text-up' : (s.pnl ?? 0) < 0 ? 'text-down' : 'text-muted-foreground')}>
                      {s.pnl != null ? formatMoney(s.pnl, 'KRW') : '—'}
                    </td>
                    <td className="max-w-[280px] truncate text-muted-foreground" title={s.rejectReason ?? s.reason}>
                      {s.rejectReason ? `⛔ ${s.rejectReason}` : s.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
