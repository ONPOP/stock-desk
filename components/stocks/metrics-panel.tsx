// F4 핵심지표 패널 — 밸류에이션 그리드 + 분기/연간 실적 미니차트.
import type { Currency, StockMetrics } from '@/types';
import { formatCompactMoney } from '@/lib/utils/money';
import { MiniBarChart } from '@/components/ui/mini-bar-chart';

function ratio(v: number | null, suffix = ''): string {
  return v === null ? '—' : `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;
}

function eps(v: number | null, currency: Currency): string {
  if (v === null) return '—';
  return currency === 'KRW' ? `${Math.round(v).toLocaleString()}원` : `$${v.toFixed(2)}`;
}

function money(v: number | null, currency: Currency): string {
  return v === null ? '—' : formatCompactMoney(v, currency);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export function MetricsPanel({ metrics, currency }: { metrics: StockMetrics[]; currency: Currency }) {
  if (metrics.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        아직 지표 데이터가 없습니다. 상단의 <span className="font-medium">갱신</span> 버튼을 눌러 수집하세요.
      </p>
    );
  }
  const latest = metrics[0];
  // 실적 시계열: 매출이 있는 행을 기간 오름차순으로 최근 6개
  const series = metrics
    .filter((m) => m.revenueQ !== null && m.fiscalQuarter)
    .sort((a, b) => a.asOfDate.localeCompare(b.asOfDate))
    .slice(-6);

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
        <Metric label="시가총액" value={money(latest.marketCap, currency)} />
        <Metric label="PER" value={ratio(latest.per)} />
        <Metric label="PBR" value={ratio(latest.pbr)} />
        <Metric label="ROE" value={ratio(latest.roe, '%')} />
        <Metric label="EPS" value={eps(latest.eps, currency)} />
        <Metric label="배당수익률" value={ratio(latest.dividendYield, '%')} />
        <Metric label="부채비율" value={ratio(latest.debtRatio, '%')} />
        <Metric label="매출 (최근)" value={money(latest.revenueQ, currency)} />
        <Metric label="영업이익 (최근)" value={money(latest.operatingIncomeQ, currency)} />
        <Metric label="순이익 (최근)" value={money(latest.netIncomeQ, currency)} />
        <Metric label="CAPEX" value={money(latest.capex, currency)} />
      </dl>

      {series.length > 1 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">매출 추이</h3>
          <MiniBarChart
            bars={series.map((m) => ({
              label: m.fiscalQuarter ?? m.asOfDate.slice(0, 7),
              value: m.revenueQ,
              display: m.revenueQ === null ? '—' : formatCompactMoney(m.revenueQ, currency),
            }))}
          />
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        출처: {latest.source.toUpperCase()} · 기준 {latest.asOfDate}
      </p>
    </div>
  );
}
