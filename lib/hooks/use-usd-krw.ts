'use client';

// 원/달러 환율 폴링 훅 — 통화 하이브리드 합산용(환율=시장지수 원/달러, /api/market-indices의 usdkrw).
// 시세 위젯과 동일 소스. 실패·로딩 시 fallback(0)을 주어 호출부가 환산을 보류할 수 있게 한다.
import { useEffect, useState } from 'react';
import type { MarketIndex } from '@/types';

const POLL_MS = 60_000;

export function useUsdKrw(): { usdKrw: number; ready: boolean } {
  const [usdKrw, setUsdKrw] = useState(0);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const res = await fetch('/api/market-indices');
        const data = await res.json();
        if (!active || !res.ok) return;
        const list: MarketIndex[] = data.indices ?? [];
        const fx = list.find((i) => i.key === 'usdkrw');
        if (fx && fx.value > 0) setUsdKrw(fx.value);
      } catch {
        // 다음 주기에 재시도
      }
    };
    run();
    const timer = setInterval(run, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return { usdKrw, ready: usdKrw > 0 };
}
