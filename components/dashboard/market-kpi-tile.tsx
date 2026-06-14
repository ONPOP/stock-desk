'use client';

// 대시보드 KPI 4번째 타일 — KOSPI 지수(시장 위젯과 동일 /api/market-indices 사용).
import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { MarketIndex } from '@/types';

export function MarketKpiTile() {
  const [kospi, setKospi] = useState<MarketIndex | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/market-indices')
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        const list: MarketIndex[] = d.indices ?? [];
        setKospi(list.find((i) => i.key === 'KOSPI' || i.label === 'KOSPI' || i.label.includes('코스피')) ?? null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const color =
    !kospi || kospi.change === 0
      ? 'text-muted-foreground'
      : kospi.change > 0
        ? 'text-up'
        : 'text-down';

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <TrendingUp className="size-4" />
        </span>
        <span className="text-sm font-medium text-muted-foreground">KOSPI</span>
      </div>
      <span className="text-2xl font-bold tabular-nums">{kospi ? Math.round(kospi.value).toLocaleString() : '—'}</span>
      <span className={`text-sm font-medium tabular-nums ${color}`}>
        {kospi ? `${kospi.change > 0 ? '+' : ''}${kospi.changeRate}%` : '…'}
      </span>
    </div>
  );
}
