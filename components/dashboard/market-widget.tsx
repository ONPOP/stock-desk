'use client';

// 시장 대시보드 위젯 (F11) — 지수·환율·금리 한 줄 바, 30초 폴링. 상승 빨강·하락 파랑.
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import type { MarketIndex } from '@/types';

function fmtValue(v: number, unit: MarketIndex['unit']): string {
  const grouped = v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (unit === '원') return `${grouped}원`;
  if (unit === '%') return `${grouped}%`;
  return grouped;
}

function changeColor(change: number): string {
  if (change > 0) return 'text-red-500';
  if (change < 0) return 'text-blue-500';
  return 'text-muted-foreground';
}

export function MarketWidget() {
  const [indices, setIndices] = useState<MarketIndex[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const res = await fetch('/api/market-indices');
        const data = await res.json();
        if (active && res.ok) setIndices(data.indices ?? []);
      } catch {
        // 폴링 실패는 다음 주기에 재시도
      } finally {
        if (active) setLoading(false);
      }
    };
    run();
    const timer = setInterval(run, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex gap-6 overflow-x-auto">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-24 shrink-0" />
        ))}
      </div>
    );
  }

  if (indices.length === 0) {
    return <p className="text-sm text-muted-foreground">시장 지수를 불러오지 못했습니다. 잠시 후 다시 시도됩니다.</p>;
  }

  return (
    <div className="flex gap-6 overflow-x-auto pb-1">
      {indices.map((idx) => (
        <div key={idx.key} className="flex shrink-0 flex-col">
          <span className="text-xs text-muted-foreground">{idx.label}</span>
          <span className="font-semibold tabular-nums">{fmtValue(idx.value, idx.unit)}</span>
          <span className={`text-xs tabular-nums ${changeColor(idx.change)}`}>
            {idx.change > 0 ? '+' : ''}
            {idx.changeRate}%
          </span>
        </div>
      ))}
    </div>
  );
}
