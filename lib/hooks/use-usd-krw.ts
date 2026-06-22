'use client';

// 원/달러 환율 폴링 훅 — 통화 하이브리드 합산용(환율=시장지수 원/달러, /api/market-indices의 usdkrw).
// 시세 위젯과 동일 소스. 실패·로딩 시 fallback(0)을 주어 호출부가 환산을 보류할 수 있게 한다.
import { useEffect, useState } from 'react';
import type { MarketIndex } from '@/types';

const POLL_MS = 60_000;
const CACHE_KEY = 'stockdesk:usdkrw';

export function useUsdKrw(): { usdKrw: number; ready: boolean } {
  const [usdKrw, setUsdKrw] = useState(0);

  useEffect(() => {
    let active = true;
    // 마지막 성공 환율 즉시 복원 — API가 환율을 못 줄 때도 USD 종목이 사라지지 않게 한다.
    try {
      const cached = Number(window.localStorage.getItem(CACHE_KEY));
      if (cached > 0) setUsdKrw(cached);
    } catch {
      // localStorage 비활성 환경 무시
    }

    const run = async () => {
      try {
        const res = await fetch('/api/market-indices');
        const data = await res.json();
        if (!active || !res.ok) return;
        const list: MarketIndex[] = data.indices ?? [];
        const fx = list.find((i) => i.key === 'usdkrw');
        if (fx && fx.value > 0) {
          setUsdKrw(fx.value);
          try {
            window.localStorage.setItem(CACHE_KEY, String(fx.value));
          } catch {
            // 저장 실패 무시(시크릿 모드 등)
          }
        }
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
