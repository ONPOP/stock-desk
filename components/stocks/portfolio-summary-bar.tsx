'use client';

// 내 종목 하단 고정 요약바 (V2) — 원화 환산 통합 + 통화별 분리(하이브리드) + 자산배분 도넛.
// 평가금액은 보유 종목 현재가(매니저가 모은 priceMap)에 의존하므로 클라이언트에서 계산해 전달받는다.
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card } from '@/components/ui/card';
import { formatMoney } from '@/lib/utils/money';
import type { PortfolioSummary } from '@/types';

export interface AllocationSlice {
  name: string;
  /** 원화 환산 평가금액(원) */
  value: number;
}

const DONUT_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#94a3b8'];

function pnlColor(n: number): string {
  return n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted-foreground';
}

function signedKrw(n: number): string {
  return `${n > 0 ? '+' : ''}${formatMoney(n, 'KRW')}`;
}

/** 상위 6개 + 기타로 묶어 도넛 슬라이스 과밀을 방지 */
function topSlices(slices: AllocationSlice[]): AllocationSlice[] {
  const sorted = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= 7) return sorted;
  const top = sorted.slice(0, 6);
  const rest = sorted.slice(6).reduce((acc, s) => acc + s.value, 0);
  return [...top, { name: '기타', value: rest }];
}

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${className ?? ''}`}>{value}</span>
    </div>
  );
}

export function PortfolioSummaryBar({
  summary,
  allocation,
  ready,
}: {
  summary: PortfolioSummary;
  allocation: AllocationSlice[];
  ready: boolean;
}) {
  const u = summary.krwUnified;
  const slices = topSlices(allocation);

  return (
    <Card className="sticky bottom-4 z-20 gap-0 border-primary/15 bg-card/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex items-center gap-5">
        <div className="grid flex-1 grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
          <Metric label="평가 금액(₩환산)" value={formatMoney(u.currentValue, 'KRW')} />
          <Metric
            label="평가 손익"
            value={`${signedKrw(u.evalPnl)} (${u.evalRate > 0 ? '+' : ''}${u.evalRate}%)`}
            className={pnlColor(u.evalPnl)}
          />
          <Metric label="매입 금액(₩환산)" value={formatMoney(u.buyAmount, 'KRW')} />
          <Metric label="누적 실현손익(₩환산)" value={signedKrw(u.realizedPnl)} className={pnlColor(u.realizedPnl)} />
        </div>

        {slices.length > 0 && (
          <div className="hidden h-[88px] w-[88px] shrink-0 md:block" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="name" innerRadius={26} outerRadius={42} paddingAngle={2} stroke="none">
                  {slices.map((s, i) => (
                    <Cell key={s.name} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatMoney(Number(value) || 0, 'KRW')}
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--popover)',
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {summary.byCurrency.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t pt-2.5 text-[11.5px] text-muted-foreground">
          {summary.byCurrency.map((c) => (
            <span key={c.currency} className="tabular-nums">
              <span className="font-medium text-foreground">{c.currency}</span> 평가 {formatMoney(c.currentValue, c.currency)}
              <span className={`ml-1 ${pnlColor(c.evalPnl)}`}>
                ({c.evalPnl > 0 ? '+' : ''}
                {formatMoney(c.evalPnl, c.currency)})
              </span>
            </span>
          ))}
        </div>
      )}

      {!ready && (
        <p className="mt-2 text-[11px] text-muted-foreground">환율 불러오는 중 — ₩환산값은 갱신되면 정확해집니다.</p>
      )}
    </Card>
  );
}
