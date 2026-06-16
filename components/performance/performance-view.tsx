'use client';

// 기간별 수익률 (V2) — 실현손익(computeRealized) 기반. 연도별(기본)/월별/기간 토글.
// 누적 라인 + 기간별 바 + 종목별 도넛(recharts). 통화 혼합은 원화 환산(환율=시장지수 원/달러)으로 통합.
import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { useUsdKrw } from '@/lib/hooks/use-usd-krw';
import { computeRealized } from '@/lib/utils/portfolio';
import { formatMoney, formatCompactMoney } from '@/lib/utils/money';
import type { RealTrade } from '@/types';

type Mode = 'year' | 'month' | 'range';

const DONUT_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#94a3b8'];
const UP = '#e0364f';
const DOWN = '#2f6fed';

function pnlColor(n: number): string {
  return n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted-foreground';
}
function signedKrw(n: number): string {
  return `${n > 0 ? '+' : ''}${formatMoney(n, 'KRW')}`;
}

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--popover)',
  fontSize: 12,
} as const;

export function PerformanceView({ trades }: { trades: RealTrade[] }) {
  const { usdKrw, ready } = useUsdKrw();
  const realized = useMemo(() => computeRealized(trades), [trades]);

  // 원화 환산 실현손익 부착(USD 센트 → 원)
  const rows = useMemo(
    () =>
      realized.map((r) => ({
        ...r,
        krw: r.currency === 'USD' ? Math.round((r.realizedPnl / 100) * (ready ? usdKrw : 0)) : r.realizedPnl,
      })),
    [realized, ready, usdKrw],
  );

  const years = useMemo(() => {
    const set = new Set(rows.map((r) => r.tradeDate.slice(0, 4)));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [rows]);

  const [mode, setMode] = useState<Mode>('year');
  const [year, setYear] = useState<string>(() => years[0] ?? String(new Date().getFullYear()));
  const [range, setRange] = useState<{ from: string; to: string }>(() => {
    const to = new Date().toLocaleDateString('en-CA');
    const from = `${new Date().getFullYear()}-01-01`;
    return { from, to };
  });

  // 모드별 필터 + 버킷 키 산출
  const { buckets, filtered } = useMemo(() => {
    const bucketKey = (date: string) => (mode === 'year' ? date.slice(0, 4) : date.slice(0, 7));
    const inScope = (date: string) => {
      if (mode === 'year') return true;
      if (mode === 'month') return date.slice(0, 4) === year;
      return date >= range.from && date <= range.to;
    };
    const f = rows.filter((r) => inScope(r.tradeDate));
    const map = new Map<string, number>();
    for (const r of f) map.set(bucketKey(r.tradeDate), (map.get(bucketKey(r.tradeDate)) ?? 0) + r.krw);
    const sorted = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    let cum = 0;
    const list = sorted.map(([key, pnl]) => {
      cum += pnl;
      return { key, label: mode === 'year' ? key : key.slice(5) + '월', pnl, cum };
    });
    return { buckets: list, filtered: f };
  }, [rows, mode, year, range]);

  // 종목별 실현손익(도넛 — 비중은 이익 종목만)
  const byStock = useMemo(() => {
    const map = new Map<string, { name: string; value: number }>();
    for (const r of filtered) {
      const cur = map.get(r.stockId) ?? { name: r.name, value: 0 };
      cur.value += r.krw;
      map.set(r.stockId, cur);
    }
    return [...map.values()].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const summary = useMemo(() => {
    const total = filtered.reduce((acc, r) => acc + r.krw, 0);
    const count = filtered.length;
    const wins = filtered.filter((r) => r.realizedPnl > 0).length;
    const winRate = count > 0 ? Math.round((wins / count) * 100) : 0;
    return { total, count, winRate };
  }, [filtered]);

  const donut = byStock.length > 7 ? [...byStock.slice(0, 6), { name: '기타', value: byStock.slice(6).reduce((a, s) => a + s.value, 0) }] : byStock;

  return (
    <div className="space-y-5">
      {/* 모드 토글 + 보조 입력 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-grid grid-cols-3 gap-1 rounded-full bg-muted p-[3px]">
          {(
            [
              ['year', '연도별'],
              ['month', '월별'],
              ['range', '기간'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
                mode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'month' && years.length > 0 && (
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="h-9 rounded-lg border bg-card px-3 text-sm"
            aria-label="연도 선택"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        )}

        {mode === 'range' && (
          <div className="flex items-center gap-2 text-sm">
            <input
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className="h-9 rounded-lg border bg-card px-3"
              aria-label="시작일"
            />
            <span className="text-muted-foreground">~</span>
            <input
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className="h-9 rounded-lg border bg-card px-3"
              aria-label="종료일"
            />
          </div>
        )}
      </div>

      {realized.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          매도 기록이 없습니다. 종목 상세의 매매일지에서 매도를 기록하면 실현손익이 집계됩니다.
        </Card>
      ) : (
        <>
          {/* 요약 */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="gap-1 p-4">
              <span className="text-[11px] text-muted-foreground">실현손익(₩환산)</span>
              <span className={`text-xl font-bold tabular-nums ${pnlColor(summary.total)}`}>{signedKrw(summary.total)}</span>
            </Card>
            <Card className="gap-1 p-4">
              <span className="text-[11px] text-muted-foreground">매도 횟수</span>
              <span className="text-xl font-bold tabular-nums">{summary.count}건</span>
            </Card>
            <Card className="gap-1 p-4">
              <span className="text-[11px] text-muted-foreground">승률</span>
              <span className="text-xl font-bold tabular-nums">{summary.winRate}%</span>
            </Card>
          </div>

          {/* 기간별 바 + 누적 라인 */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="gap-3 p-4">
              <h3 className="text-sm font-semibold">{mode === 'year' ? '연도별' : '월별'} 실현손익</h3>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={buckets} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis tickFormatter={(v) => formatCompactMoney(Number(v), 'KRW')} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={64} />
                    <Tooltip formatter={(v) => signedKrw(Number(v) || 0)} contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--muted)' }} />
                    <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                      {buckets.map((b) => (
                        <Cell key={b.key} fill={b.pnl >= 0 ? UP : DOWN} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="gap-3 p-4">
              <h3 className="text-sm font-semibold">누적 실현손익</h3>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={buckets} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis tickFormatter={(v) => formatCompactMoney(Number(v), 'KRW')} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={64} />
                    <Tooltip formatter={(v) => signedKrw(Number(v) || 0)} contentStyle={TOOLTIP_STYLE} />
                    <Line type="monotone" dataKey="cum" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* 종목별 도넛 */}
          <Card className="gap-3 p-4">
            <h3 className="text-sm font-semibold">종목별 실현이익 비중</h3>
            {donut.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">해당 기간에 이익 실현 종목이 없습니다.</p>
            ) : (
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <div className="h-56 w-56 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donut} dataKey="value" nameKey="name" innerRadius={56} outerRadius={88} paddingAngle={2} stroke="none">
                        {donut.map((s, i) => (
                          <Cell key={s.name} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => formatMoney(Number(v) || 0, 'KRW')} contentStyle={TOOLTIP_STYLE} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex-1 space-y-1.5">
                  {donut.map((s, i) => (
                    <li key={s.name} className="flex items-center gap-2 text-sm">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <span className="font-medium tabular-nums text-up">{formatMoney(s.value, 'KRW')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </>
      )}

      {!ready && (
        <p className="text-[11px] text-muted-foreground">환율 불러오는 중 — 달러 종목 ₩환산값은 갱신되면 정확해집니다.</p>
      )}
    </div>
  );
}
