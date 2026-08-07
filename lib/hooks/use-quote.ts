'use client';

// 시세 폴링 훅 (PRD D3: MVP REST 폴링 5~10초).
// 실제 폴링(타이머·요청 중복 제거·탭 가시성 대응)은 use-quote-store.ts가 담당한다.
// 이 훅은 그 스토어의 얇은 구독자일 뿐이다 — 여기서 setInterval이나 AbortController를 새로 두지 않는다.
import { useCallback, useEffect, useState } from 'react';
import type { Market, Quote } from '@/types';
import { peekQuote, refetchQuote, subscribeQuote, type QuoteSnapshot } from './use-quote-store';

export interface UseQuoteOptions {
  intervalMs?: number;
  enabled?: boolean;
}

export interface UseQuoteResult {
  quote: Quote | null;
  source: string | null;
  error: string | null;
  loading: boolean;
  /**
   * `enabled: false`인데 스토어의 마지막 값을 대신 보여주고 있는가.
   * 화면 밖으로 나간 타일이 값은 유지하되 갱신은 멈춘 상태를 뜻한다.
   * `enabled: true`면 값이 아무리 오래됐어도 false다(갱신은 돌고 있으므로).
   */
  stale: boolean;
  refetch: () => void;
}

/** enabled: false일 때 보여줄 스냅샷 — 스토어에 남은 값을 그대로 쓰되 loading은 항상 false로 고정한다 */
function disabledSnapshot(ticker: string, market: Market): QuoteSnapshot {
  const peeked = peekQuote(ticker, market);
  return {
    quote: peeked?.quote ?? null,
    source: peeked?.source ?? null,
    error: peeked?.error ?? null,
    at: peeked?.at ?? null,
    loading: false,
  };
}

function initialSnapshot(ticker: string, market: Market, enabled: boolean): QuoteSnapshot {
  if (!enabled) return disabledSnapshot(ticker, market);
  return peekQuote(ticker, market) ?? { quote: null, source: null, error: null, at: null, loading: true };
}

export function useQuote(ticker: string, market: Market, opts: UseQuoteOptions = {}): UseQuoteResult {
  const { intervalMs = 7000, enabled = true } = opts;

  const [snapshot, setSnapshot] = useState<QuoteSnapshot>(() => initialSnapshot(ticker, market, enabled));

  useEffect(() => {
    if (!enabled) {
      // 구독하지 않는다 — 스토어에 남은 마지막 값만 한 번 읽어 보여준다
      setSnapshot(disabledSnapshot(ticker, market));
      return;
    }
    return subscribeQuote(ticker, market, { intervalMs }, setSnapshot);
  }, [ticker, market, intervalMs, enabled]);

  const refetch = useCallback(() => {
    refetchQuote(ticker, market);
  }, [ticker, market]);

  return {
    quote: snapshot.quote,
    source: snapshot.source,
    error: snapshot.error,
    loading: snapshot.loading,
    stale: !enabled && snapshot.at !== null,
    refetch,
  };
}
