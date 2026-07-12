'use client';

// 모의투자 테스트 시장 뷰 — 테마 선택 → 동결 일봉을 '빨리감기'로 재생(요구 1·3).
// 일봉 단위 재생 + 배속 컨트롤(일시정지/0.5·1·2·5·20·100배). 현재 시각 근방의 사전 이벤트로
// 주가 변동 원인을 함께 보여준다(요구 5). 매매·포트폴리오는 Phase 2.
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Pause, Play, SkipBack, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CompanyLogo } from '@/components/ui/company-logo';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/utils/money';
import { getEventsAround } from '@/lib/sim/events';
import type { SimSeriesResponse, SimTheme } from '@/types/sim';

const SPEEDS = [0.5, 1, 2, 5, 20, 100];

function tickParams(speed: number): { delay: number; step: number } {
  if (speed <= 50) return { delay: Math.max(20, Math.round(1000 / speed)), step: 1 };
  return { delay: 20, step: Math.max(1, Math.round(speed / 50)) };
}

function changeColor(n: number): string {
  return n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted-foreground';
}

function signedUsd(cents: number): string {
  return `${cents > 0 ? '+' : ''}${formatMoney(cents, 'USD')}`;
}

function fmtDate(iso: string): string {
  return iso.replaceAll('-', '.');
}

export function SimMarketClient({
  themes,
  initialYearsAgo = 10,
  tradingEnabled = false,
  onTraded,
}: {
  themes: SimTheme[];
  /** 진입 시 시작 시점(N년 전). 10=가장 과거부터, 0=최근(오늘). */
  initialYearsAgo?: number;
  /** 카드에 매수/매도 컨트롤 표시(현재 시각 종가로 주문) */
  tradingEnabled?: boolean;
  /** 주문 체결 시 콜백(체결 거래일 전달) */
  onTraded?: (date: string) => void;
}) {
  const [theme, setTheme] = useState(themes[0]?.slug ?? '');
  const [data, setData] = useState<SimSeriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [ordering, setOrdering] = useState<string | null>(null);
  const lastIdx = useRef(0);

  // 테마 전환 시 동결 시계열 로드
  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError(null);
    setPlaying(false);
    fetch(`/api/sim/series?theme=${encodeURIComponent(theme)}`)
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => {
        if (cancel) return;
        if (!ok) {
          setError(typeof body?.message === 'string' ? body.message : '데이터를 불러오지 못했습니다.');
          setData(null);
          return;
        }
        const loaded = body as SimSeriesResponse;
        setData(loaded);
        const n = loaded.dates.length;
        const start = initialYearsAgo <= 0 ? n - 1 : n - 1 - Math.round(initialYearsAgo * 252);
        setDayIndex(Math.min(Math.max(0, start), Math.max(0, n - 1)));
      })
      .catch(() => !cancel && setError('네트워크 오류가 발생했습니다.'))
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [theme, initialYearsAgo]);

  const len = data?.dates.length ?? 0;

  // 빨리감기 시계
  useEffect(() => {
    if (!playing || len === 0) return;
    const { delay, step } = tickParams(speed);
    const id = setInterval(() => {
      setDayIndex((i) => Math.min(i + step, len - 1));
    }, delay);
    return () => clearInterval(id);
  }, [playing, speed, len]);

  // 끝(오늘) 도달 시 정지
  useEffect(() => {
    if (len > 0 && dayIndex >= len - 1) setPlaying(false);
    lastIdx.current = dayIndex;
  }, [dayIndex, len]);

  const currentDate = data?.dates[dayIndex] ?? '';
  const events = useMemo(
    () => (currentDate ? getEventsAround(currentDate, 3) : []),
    [currentDate],
  );

  const atEnd = len > 0 && dayIndex >= len - 1;

  function jumpYearsAgo(years: number) {
    // 거래일 ≈ 252/년 기준 인덱스 산출
    setPlaying(false);
    setDayIndex(years === 0 ? len - 1 : Math.max(0, len - 1 - Math.round(years * 252)));
  }

  async function order(ticker: string, side: 'buy' | 'sell') {
    const n = Number(qty[ticker]);
    if (!Number.isInteger(n) || n <= 0) {
      toast.error('수량을 입력하세요.');
      return;
    }
    const simDate = currentDate;
    setOrdering(`${ticker}:${side}`);
    try {
      const res = await fetch('/api/sim/order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ticker, side, qty: n, simDate }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error ?? '주문에 실패했습니다.');
        return;
      }
      toast.success(`${ticker} ${n}주 ${side === 'buy' ? '매수' : '매도'} (${simDate})`);
      setQty((q) => ({ ...q, [ticker]: '' }));
      onTraded?.(simDate);
    } catch {
      toast.error('네트워크 오류로 주문하지 못했습니다.');
    } finally {
      setOrdering(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* 테마 탭 */}
      <div className="flex flex-wrap gap-1.5">
        {themes.map((t) => (
          <button
            key={t.slug}
            type="button"
            onClick={() => setTheme(t.slug)}
            aria-pressed={theme === t.slug}
            className={cn(
              'rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors',
              theme === t.slug
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'bg-secondary/60 text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {t.name}
          </button>
        ))}
      </div>

      {/* 컨트롤 바 */}
      <Card className="gap-3 p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {/* 재생 컨트롤 */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => jumpYearsAgo(10)}
              className="flex size-9 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted"
              aria-label="처음으로(10년 전)"
              disabled={len === 0}
            >
              <SkipBack className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => (atEnd ? jumpYearsAgo(10) : setPlaying((p) => !p))}
              className="flex size-11 items-center justify-center rounded-lg bg-ink text-ink-foreground shadow hover:opacity-90 disabled:opacity-40"
              aria-label={playing ? '일시정지' : '재생'}
              disabled={len === 0}
            >
              {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
            </button>
          </div>

          {/* 배속 */}
          <div className="flex items-center gap-1">
            <span className="mr-1 text-[11px] font-medium text-muted-foreground">배속</span>
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                aria-pressed={speed === s}
                className={cn(
                  'rounded-md px-2 py-1 text-[12px] font-semibold tabular-nums transition-colors',
                  speed === s ? 'bg-primary text-primary-foreground' : 'bg-secondary/60 text-muted-foreground hover:bg-muted',
                )}
              >
                {s}×
              </button>
            ))}
          </div>

          {/* 시작점 */}
          <div className="flex items-center gap-1">
            <span className="mr-1 text-[11px] font-medium text-muted-foreground">이동</span>
            {[
              { label: '10년 전', y: 10 },
              { label: '5년 전', y: 5 },
              { label: '1년 전', y: 1 },
              { label: '오늘', y: 0 },
            ].map((b) => (
              <button
                key={b.label}
                type="button"
                onClick={() => jumpYearsAgo(b.y)}
                disabled={len === 0}
                className="rounded-md bg-secondary/60 px-2 py-1 text-[12px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                {b.label}
              </button>
            ))}
          </div>

          {/* 현재 시각 */}
          <div className="ml-auto text-right">
            <p className="text-lg font-bold tabular-nums">{currentDate ? fmtDate(currentDate) : '—'}</p>
            <p className="text-[11px] text-muted-foreground">
              {len > 0 ? `${dayIndex + 1} / ${len}일${atEnd ? ' · 최신' : ''}` : '데이터 없음'}
            </p>
          </div>
        </div>

        {/* 스크러버 */}
        <input
          type="range"
          min={0}
          max={Math.max(0, len - 1)}
          value={dayIndex}
          onChange={(e) => {
            setPlaying(false);
            setDayIndex(Number(e.target.value));
          }}
          disabled={len === 0}
          className="w-full accent-[var(--color-primary)]"
          aria-label="재생 위치"
        />
      </Card>

      {/* 이벤트 패널 — 현재 시각 근방의 주가 변동 원인 (요구 5) */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">이 시기의 시장 이슈</h2>
        {events.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-2.5 text-[13px] text-muted-foreground">
            이 시기에 기록된 주요 이슈가 없습니다. 차트 흐름과 거래량으로 시장을 읽어보세요.
          </p>
        ) : (
          <div className="space-y-1.5">
            {events.map((e, i) => (
              <div key={`${e.date}-${i}`} className="flex items-start gap-2.5 rounded-lg border bg-card px-3 py-2">
                <Badge
                  variant="secondary"
                  className={cn(
                    'mt-0.5 shrink-0',
                    e.impact === 'up' ? 'text-up' : e.impact === 'down' ? 'text-down' : 'text-muted-foreground',
                  )}
                >
                  {e.ticker ?? '시장'}
                </Badge>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold">
                    {e.title}
                    <span className="ml-1.5 font-normal text-muted-foreground">{fmtDate(e.date)}</span>
                  </p>
                  <p className="text-[12px] text-muted-foreground">{e.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 종목 그리드 */}
      {error ? (
        <Card className="flex items-center gap-2 p-4 text-sm text-down">
          <AlertCircle className="size-4" /> {error}
        </Card>
      ) : loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중…</p>
      ) : data?.empty ? (
        <Card className="space-y-1.5 p-5 text-sm">
          <p className="font-semibold">아직 시뮬레이션 데이터가 없습니다.</p>
          <p className="text-muted-foreground">
            터미널에서 <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px]">npm run sim:ingest</code> 를 한 번
            실행해 10년치 일봉을 수집하세요. (Yahoo Finance, 1회성·동결)
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data?.series.map((s) => {
            const close = s.closes[dayIndex];
            const prev = dayIndex > 0 ? s.closes[dayIndex - 1] : null;
            const change = close != null && prev != null ? close - prev : 0;
            const pct = close != null && prev != null && prev !== 0 ? (change / prev) * 100 : 0;
            const listed = close != null;
            return (
              <Card key={s.ticker} className="gap-0 p-3.5">
                <div className="flex items-center gap-2.5">
                  <CompanyLogo ticker={s.ticker} name={s.nameKr ?? s.nameEn} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[14px] font-semibold">{s.nameKr ?? s.nameEn}</span>
                      <Badge variant="secondary" className="shrink-0">{s.market}</Badge>
                    </div>
                    <p className="font-mono text-[11px] text-muted-foreground">{s.ticker}</p>
                  </div>
                </div>
                <div className="mt-2.5">
                  {listed ? (
                    <>
                      <p className="text-lg font-bold tabular-nums">{formatMoney(close!, 'USD')}</p>
                      <p className={cn('text-[13px] font-medium tabular-nums', changeColor(change))}>
                        {signedUsd(change)} ({pct > 0 ? '+' : ''}
                        {pct.toFixed(2)}%)
                      </p>
                    </>
                  ) : (
                    <p className="py-1 text-[13px] text-muted-foreground">상장 전</p>
                  )}
                </div>
                {tradingEnabled && listed && (
                  <div className="mt-2.5 flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={qty[s.ticker] ?? ''}
                      onChange={(e) => setQty((q) => ({ ...q, [s.ticker]: e.target.value }))}
                      placeholder="수량"
                      aria-label={`${s.ticker} 수량`}
                      className="h-8 w-16 rounded-md border bg-transparent px-2 text-[13px] tabular-nums outline-none focus-visible:border-ring"
                    />
                    <Button
                      size="xs"
                      className="flex-1 border-0 bg-up text-white hover:bg-up/90"
                      disabled={ordering === `${s.ticker}:buy`}
                      onClick={() => order(s.ticker, 'buy')}
                    >
                      매수
                    </Button>
                    <Button
                      size="xs"
                      className="flex-1 border-0 bg-down text-white hover:bg-down/90"
                      disabled={ordering === `${s.ticker}:sell`}
                      onClick={() => order(s.ticker, 'sell')}
                    >
                      매도
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
