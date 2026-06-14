// 소량 시계열용 인라인 SVG 막대 그래프 (F4 분기실적·F15 배당 추이).
// lightweight-charts는 시세 캔들 전용이라 과함 — 의존성 없이 가볍게 그린다.
interface Bar {
  label: string;
  value: number | null;
  /** 막대 위에 표시할 포맷된 값 */
  display?: string;
}

export function MiniBarChart({ bars, height = 96 }: { bars: Bar[]; height?: number }) {
  const valid = bars.filter((b) => b.value !== null) as Array<Bar & { value: number }>;
  if (valid.length === 0) {
    return <p className="text-sm text-muted-foreground">데이터 없음</p>;
  }
  const maxAbs = Math.max(...valid.map((b) => Math.abs(b.value)), 1);
  const hasNeg = valid.some((b) => b.value < 0);
  const zeroY = hasNeg ? height / 2 : height;
  const usableH = hasNeg ? height / 2 : height;

  return (
    <div className="flex items-end gap-2" role="img" aria-label="시계열 막대 그래프">
      {bars.map((b, i) => {
        const v = b.value;
        const barH = v === null ? 0 : Math.max(2, (Math.abs(v) / maxAbs) * (usableH - 8));
        const negative = v !== null && v < 0;
        return (
          <div key={`${b.label}-${i}`} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[10px] tabular-nums text-muted-foreground">{b.display ?? (v === null ? '—' : '')}</span>
            <svg width="100%" height={height} viewBox={`0 0 40 ${height}`} preserveAspectRatio="none" className="overflow-visible">
              <line x1="0" y1={zeroY} x2="40" y2={zeroY} stroke="var(--border)" strokeWidth="1" />
              {v !== null && (
                <rect
                  x="8"
                  y={negative ? zeroY : zeroY - barH}
                  width="24"
                  height={barH}
                  rx="2"
                  fill={negative ? 'var(--color-blue-500, #3b82f6)' : 'var(--primary)'}
                />
              )}
            </svg>
            <span className="text-[10px] text-muted-foreground">{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}
