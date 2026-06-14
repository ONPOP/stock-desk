'use client';

// 주가 차트 (F6) + 기술지표 (F14) — TradingView Lightweight Charts v5.
// 캔들 + 거래량 + 이동평균선(5/20/60/120) + RSI(별도 pane). 기간·지표 토글.
import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type LineData,
  type UTCTimestamp,
} from 'lightweight-charts';
import { Button } from '@/components/ui/button';
import { minorToMajorNumber } from '@/lib/utils/money';
import { sma, rsi } from '@/lib/utils/indicators';
import type { Candle, CandleInterval, Currency, Market } from '@/types';

interface Period {
  label: string;
  interval: CandleInterval;
  count: number;
}

// PRD F6: 1일(분봉)/1주/1개월/3개월/1년/5년
const PERIODS: Period[] = [
  { label: '1일', interval: '1m', count: 400 },
  { label: '1주', interval: '1d', count: 7 },
  { label: '1개월', interval: '1d', count: 22 },
  { label: '3개월', interval: '1d', count: 66 },
  { label: '1년', interval: '1d', count: 252 },
  { label: '5년', interval: '1w', count: 260 },
];

// 이동평균선 (F14)
const MA_CONFIGS = [
  { period: 5, color: '#f59e0b' },
  { period: 20, color: '#3b82f6' },
  { period: 60, color: '#a855f7' },
  { period: 120, color: '#9ca3af' },
];

// 상승 빨강 / 하락 파랑 (한국 관습)
const UP = '#ef4444';
const DOWN = '#3b82f6';

export interface PriceChartProps {
  ticker: string;
  market: Market;
  currency: Currency;
  /** F17 뉴스↔주가 오버레이 — 발행일(ISO) 기준 차트 마커 */
  newsMarkers?: Array<{ date: string | null; title: string }>;
}

export function PriceChart({ ticker, market, currency, newsMarkers }: PriceChartProps) {
  const [period, setPeriod] = useState<Period>(PERIODS[3]); // 기본 3개월
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMa, setShowMa] = useState(false);
  const [showRsi, setShowRsi] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const maSeriesRef = useRef<ISeriesApi<'Line'>[]>([]);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  // 차트 1회 생성
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#71717a' },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(120,120,120,0.12)' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: period.interval === '1m' },
      crosshair: { horzLine: { labelBackgroundColor: '#6b7280' }, vertLine: { labelBackgroundColor: '#6b7280' } },
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });
    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    // 이동평균선 (메인 pane, 초기 숨김)
    const maSeries = MA_CONFIGS.map((cfg) =>
      chart.addSeries(LineSeries, {
        color: cfg.color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        visible: false,
      }),
    );
    // RSI (pane 1, 초기 숨김)
    const rsiSeries = chart.addSeries(LineSeries, { color: '#8b5cf6', lineWidth: 1, priceLineVisible: false, visible: false }, 1);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volSeriesRef.current = volSeries;
    maSeriesRef.current = maSeries;
    rsiSeriesRef.current = rsiSeries;
    markersRef.current = createSeriesMarkers(candleSeries, []);

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volSeriesRef.current = null;
      maSeriesRef.current = [];
      rsiSeriesRef.current = null;
      markersRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 기간/종목 변경 시 캔들 조회
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const url = `/api/candles?ticker=${encodeURIComponent(ticker)}&market=${encodeURIComponent(
      market,
    )}&interval=${period.interval}&count=${period.count}`;
    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '차트 데이터를 불러오지 못했습니다.');
        setCandles(data.candles ?? []);
      })
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [ticker, market, period]);

  // 캔들 → 차트 반영 (캔들·거래량·이평선·RSI)
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volSeries = volSeriesRef.current;
    if (!candleSeries || !volSeries) return;

    const toTime = (ts: string) => Math.floor(new Date(ts).getTime() / 1000) as UTCTimestamp;
    const times = candles.map((c) => toTime(c.ts));
    candleSeries.setData(
      candles.map((c) => ({
        time: toTime(c.ts),
        open: minorToMajorNumber(c.o, currency),
        high: minorToMajorNumber(c.h, currency),
        low: minorToMajorNumber(c.l, currency),
        close: minorToMajorNumber(c.c, currency),
      })),
    );
    volSeries.setData(
      candles.map((c) => ({
        time: toTime(c.ts),
        value: c.volume,
        color: c.c >= c.o ? 'rgba(239,68,68,0.35)' : 'rgba(59,130,246,0.35)',
      })),
    );

    // 이평선·RSI (표시용 종가 기준)
    const closes = candles.map((c) => minorToMajorNumber(c.c, currency));
    const toLine = (vals: Array<number | null>): LineData[] =>
      vals
        .map((v, i) => (v === null ? null : { time: times[i], value: v }))
        .filter((x): x is { time: UTCTimestamp; value: number } => x !== null);
    MA_CONFIGS.forEach((cfg, idx) => maSeriesRef.current[idx]?.setData(toLine(sma(closes, cfg.period))));
    rsiSeriesRef.current?.setData(toLine(rsi(closes, 14)));

    // 뉴스 마커 (F17) — 일/주봉만, 기간 내 뉴스를 가장 가까운 거래일에 표시
    if (markersRef.current) {
      if (period.interval === '1m' || times.length === 0) {
        markersRef.current.setMarkers([]);
      } else {
        const minT = times[0] as number;
        const maxT = times[times.length - 1] as number;
        const asc = [...times].map((t) => t as number).sort((a, b) => a - b);
        const snap = (t: number): number => {
          let best = asc[0];
          for (const ct of asc) {
            if (ct <= t) best = ct;
            else break;
          }
          return best;
        };
        const seen = new Set<number>();
        const markers: SeriesMarker<Time>[] = (newsMarkers ?? [])
          .map((m) => (m.date ? Math.floor(new Date(m.date).getTime() / 1000) : null))
          .filter((t): t is number => t !== null && Number.isFinite(t) && t >= minT && t <= maxT)
          .map(snap)
          .filter((t) => {
            if (seen.has(t)) return false;
            seen.add(t);
            return true;
          })
          .sort((a, b) => a - b)
          .map((t) => ({ time: t as UTCTimestamp, position: 'aboveBar', color: '#f59e0b', shape: 'circle', text: '뉴스' }));
        markersRef.current.setMarkers(markers);
      }
    }

    chartRef.current?.timeScale().fitContent();
  }, [candles, currency, newsMarkers, period.interval]);

  // 지표 토글
  useEffect(() => {
    maSeriesRef.current.forEach((s) => s.applyOptions({ visible: showMa }));
  }, [showMa]);
  useEffect(() => {
    rsiSeriesRef.current?.applyOptions({ visible: showRsi });
  }, [showRsi]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        {PERIODS.map((p) => (
          <Button
            key={p.label}
            size="sm"
            variant={p.label === period.label ? 'default' : 'ghost'}
            onClick={() => setPeriod(p)}
          >
            {p.label}
          </Button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <Button size="sm" variant={showMa ? 'default' : 'ghost'} onClick={() => setShowMa((v) => !v)}>
          이평선
        </Button>
        <Button size="sm" variant={showRsi ? 'default' : 'ghost'} onClick={() => setShowRsi((v) => !v)}>
          RSI
        </Button>
      </div>
      <div className="relative">
        <div ref={containerRef} className="h-[360px] w-full" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            불러오는 중…
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
