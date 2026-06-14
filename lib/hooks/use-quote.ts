'use client';

// 시세 폴링 훅 (PRD D3: MVP REST 폴링 5~10초). 탭이 숨겨지면 폴링을 멈춰 불필요한 호출을 줄인다.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Market, Quote } from '@/types';

interface UseQuoteOptions {
  intervalMs?: number;
  enabled?: boolean;
}

interface UseQuoteResult {
  quote: Quote | null;
  source: string | null;
  error: string | null;
  loading: boolean;
  refetch: () => void;
}

export function useQuote(ticker: string, market: Market, opts: UseQuoteOptions = {}): UseQuoteResult {
  const { intervalMs = 7000, enabled = true } = opts;
  const [quote, setQuote] = useState<Quote | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const fetchQuote = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(
        `/api/quote?ticker=${encodeURIComponent(ticker)}&market=${encodeURIComponent(market)}`,
        { signal: controller.signal },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '시세를 불러오지 못했습니다.');
      setQuote(data.quote);
      setSource(data.source);
      setError(null);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [ticker, market]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      fetchQuote();
      timer = setInterval(fetchQuote, intervalMs);
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
      abortRef.current?.abort();
    };
  }, [enabled, intervalMs, fetchQuote]);

  return { quote, source, error, loading, refetch: fetchQuote };
}
