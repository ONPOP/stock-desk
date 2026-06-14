'use client';

// F15 배당 카드 — 수익률·DPS·주기·배당락/지급일 + 3년 추이 + 배당락 D-7 뱃지.
import { Badge } from '@/components/ui/badge';
import type { Currency, DividendFrequency, DividendInfo } from '@/types';
import { MiniBarChart } from '@/components/ui/mini-bar-chart';

const FREQ_LABEL: Record<DividendFrequency, string> = {
  annual: '연 1회',
  semiannual: '반기',
  quarterly: '분기',
  monthly: '월',
};

function dpsLabel(v: number | null, currency: Currency): string {
  if (v === null) return '—';
  return currency === 'KRW' ? `${Math.round(v).toLocaleString()}원` : `$${v.toFixed(2)}`;
}

/** 오늘로부터 가장 가까운 미래 배당락일까지 남은 일수 (없으면 null) */
function daysToNextExDate(dividends: DividendInfo[]): number | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const future = dividends
    .map((d) => d.exDate)
    .filter((d): d is string => !!d)
    .map((d) => new Date(`${d}T00:00:00`))
    .filter((d) => d.getTime() >= today.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  if (future.length === 0) return null;
  return Math.round((future[0].getTime() - today.getTime()) / (24 * 3600 * 1000));
}

export function DividendCard({ dividends, currency }: { dividends: DividendInfo[]; currency: Currency }) {
  if (dividends.length === 0) {
    return <p className="text-sm text-muted-foreground">배당 없음</p>;
  }
  const latest = dividends[0];
  const dDay = daysToNextExDate(dividends);

  // 연도별 DPS 합산(분기 배당은 연 합계) → 최근 4년 오름차순
  const byYear = new Map<number, number>();
  for (const d of dividends) {
    if (d.dps === null) continue;
    byYear.set(d.fiscalYear, (byYear.get(d.fiscalYear) ?? 0) + d.dps);
  }
  const yearly = [...byYear.entries()].sort((a, b) => a[0] - b[0]).slice(-4);

  return (
    <div className="space-y-4">
      {dDay !== null && dDay <= 7 && (
        <Badge variant="destructive">배당락 D-{dDay === 0 ? 'Day' : dDay}</Badge>
      )}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        <div className="space-y-0.5">
          <dt className="text-xs text-muted-foreground">배당수익률</dt>
          <dd className="text-sm font-medium tabular-nums">{latest.yieldAtRecord === null ? '—' : `${latest.yieldAtRecord}%`}</dd>
        </div>
        <div className="space-y-0.5">
          <dt className="text-xs text-muted-foreground">주당 배당금</dt>
          <dd className="text-sm font-medium tabular-nums">{dpsLabel(latest.dps, currency)}</dd>
        </div>
        <div className="space-y-0.5">
          <dt className="text-xs text-muted-foreground">주기</dt>
          <dd className="text-sm font-medium">{latest.frequency ? FREQ_LABEL[latest.frequency] : '—'}</dd>
        </div>
        <div className="space-y-0.5">
          <dt className="text-xs text-muted-foreground">직전 배당락일</dt>
          <dd className="text-sm font-medium tabular-nums">{latest.exDate ?? '—'}</dd>
        </div>
        {latest.payDate && (
          <div className="space-y-0.5">
            <dt className="text-xs text-muted-foreground">지급일</dt>
            <dd className="text-sm font-medium tabular-nums">{latest.payDate}</dd>
          </div>
        )}
      </dl>

      {yearly.length > 1 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">연간 배당 추이</h3>
          <MiniBarChart
            bars={yearly.map(([year, sum]) => ({
              label: `${year}`,
              value: sum,
              display: dpsLabel(sum, currency),
            }))}
          />
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">출처: {latest.source.toUpperCase()}</p>
    </div>
  );
}
