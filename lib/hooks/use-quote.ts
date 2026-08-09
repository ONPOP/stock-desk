'use client';

// 시세 폴링 훅 (PRD D3: MVP REST 폴링 5~10초).
// 실제 폴링(타이머·요청 중복 제거·탭 가시성 대응)은 use-quote-store.ts가 담당한다.
// 이 훅은 그 스토어의 얇은 구독자일 뿐이다 — 여기서 setInterval이나 AbortController를 새로 두지 않는다.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Market, Quote } from '@/types';
import { peekQuote, refetchQuote, refetchQuoteAndWait, subscribeQuote, type QuoteSnapshot } from './use-quote-store';

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

  // refetch()가 항상 "지금" 이 인스턴스의 ticker/market/enabled를 보도록 매 렌더 동기 갱신한다.
  // useCallback의 deps로 만들면 콜백 정체성이 매번 바뀌므로, ref로 최신값만 따로 들고 있는다.
  const latestRef = useRef({ ticker, market, enabled });
  latestRef.current = { ticker, market, enabled };

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refetch = useCallback(() => {
    if (latestRef.current.enabled) {
      refetchQuote(ticker, market);
      return;
    }
    // 비활성 상태: 구독을 새로 만들지 않고(=타이머를 걸지 않고) 1회 요청만 보내고,
    // 그 결과를 이 인스턴스 상태에 직접 반영한다. 응답이 오는 동안 ticker/market이 바뀌거나
    // enabled가 true가 되거나(구독이 이미 최신값을 반영 중) 언마운트되면 결과를 버린다.
    void refetchQuoteAndWait(ticker, market).then((snap) => {
      if (!mountedRef.current) return;
      const latest = latestRef.current;
      if (latest.enabled) return;
      if (latest.ticker !== ticker || latest.market !== market) return;
      setSnapshot(snap);
    });
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
