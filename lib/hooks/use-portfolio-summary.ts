'use client';

// 포트폴리오 요약 폴링 훅(마스코트 펫용) — 60초 주기, 탭 숨김 시 중단. 실패는 다음 주기 재시도.
import { useEffect, useState, useCallback } from 'react';

export interface PortfolioPulse {
  evalPnl: number;
  evalRate: number;
  realizedPnl: number;
  holdingsCount: number;
  pricedCount: number;
  fxReady: boolean;
}

const POLL_MS = 60_000;

export function usePortfolioSummary(): { data: PortfolioPulse | null; loading: boolean } {
  const [data, setData] = useState<PortfolioPulse | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio/summary');
      if (!res.ok) return;
      setData((await res.json()) as PortfolioPulse);
    } catch {
      // 다음 주기에 재시도
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    run();
    const timer = setInterval(() => {
      if (active && document.visibilityState === 'visible') run();
    }, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [run]);

  return { data, loading };
}
