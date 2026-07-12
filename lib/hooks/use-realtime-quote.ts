'use client';

// 실시간 시세 훅 — 릴레이 연결 시 WS 틱, 아니면 useQuote(폴링)로 자동 폴백.
// 데스크톱(릴레이 가동)에선 틱 실시간, 그 외(웹)에선 기존 7초 폴링으로 무중단 동작.
import { useEffect, useState } from 'react';
import { useRealtime } from '@/lib/realtime/provider';
import { useQuote } from '@/lib/hooks/use-quote';
import type { Currency, Market, Quote, RealtimeTick } from '@/types';

interface Options {
  priority?: 'high' | 'normal';
  /** 실시간 미확보 시 폴링 폴백 여부. 선택종목=true, 유니버스 칩=false(웹은 이름만). 기본 true */
  fallbackPolling?: boolean;
}

export function useRealtimeQuote(
  ticker: string,
  market: Market,
  currency: Currency,
  opts: Options = {},
): { quote: Quote | null; source: string | null; realtime: boolean } {
  const rt = useRealtime();
  const priority = opts.priority ?? 'normal';
  const [tick, setTick] = useState<RealtimeTick | null>(null);

  // 관심 종목 등록(구독집합에 포함) + 틱 수신
  useEffect(() => {
    if (!rt) return;
    rt.register(ticker, priority);
    setTick(rt.getTick(ticker));
    const off = rt.subscribeTick(ticker, setTick);
    return () => {
      off();
      rt.unregister(ticker, priority);
    };
  }, [rt, ticker, priority]);

  const usingRealtime = !!rt && rt.connected && !!tick && tick.ticker === ticker;
  const fallbackPolling = opts.fallbackPolling ?? true;
  // 실시간 확보 전까지는 폴링 유지(끊기면 자동 복귀). 폴백 비활성 시 폴링 안 함.
  const poll = useQuote(ticker, market, { enabled: fallbackPolling && !usingRealtime });

  if (usingRealtime && tick) {
    const quote: Quote = {
      ticker,
      market,
      currency,
      price: tick.price,
      change: tick.change,
      changeRate: tick.changeRate,
      volume: tick.volume,
      asOf: tick.asOf,
    };
    return { quote, source: 'KIS·실시간', realtime: true };
  }
  return { quote: poll.quote, source: poll.source, realtime: false };
}
