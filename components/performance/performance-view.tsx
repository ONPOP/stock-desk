'use client';

// 수익 분석 (V2 → D21 투자 기록 탭) — 실현손익(computeRealized) 기반. 연도별(기본)/월별/기간 토글.
// 기간별 바(+목표 수익선) + 누적 라인 + 종목별 막대. 통화 혼합은 원화 환산(환율=시장지수 원/달러)으로 통합.
// 월·연 목표 달성 기록은 목표 탭이 담당하고, 여기서는 매매 품질 지표(승률·손익비·보유일·비용)를 본다.
import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  ComposedChart,
  LineChart,
  Line,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { useUsdKrw } from '@/lib/hooks/use-usd-krw';
import { computeRealized } from '@/lib/utils/portfolio';
import { formatMoney, formatCompactMoney } from '@/lib/utils/money';
import type { RealTrade } from '@/types';

type Mode = 'year' | 'month' | 'range';

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

const DAY_MS = 86_400_000;

export interface PerformanceViewProps {
  trades: RealTrade[];
  /** 목표 수익(₩) — 키는 월(YYYY-MM) 또는 연(YYYY). 목표 탭 설정이 있을 때 막대 위에 선으로 겹친다 */
  targets?: Record<string, number>;
}

export function PerformanceView({ trades, targets = {} }: PerformanceViewProps) {
  const { usdKrw, ready } = useUsdKrw();
  const realized = useMemo(() => computeRealized(trades), [trades]);

  // 원화 환산 실현손익 부착(USD 센트 → 원)
  const rows = useMemo(
    () =>
      realized.map((r) => ({
        ...r,
        krw: r.currency === 'USD' ? Math.round((r.realizedPnl / 100) * (ready ? usdKrw : 0)) : r.realizedPnl,
        feeKrw: r.currency === 'USD' ? Math.round((r.fee / 100) * (ready ? usdKrw : 0)) : r.fee,
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
    // range(임의 기간)는 일별, month는 월별, year는 연도별로 집계
    const bucketKey = (date: string) =>
      mode === 'year' ? date.slice(0, 4) : mode === 'month' ? date.slice(0, 7) : date.slice(0, 10);
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
      const label = mode === 'year' ? key : mode === 'month' ? key.slice(5) + '월' : key.slice(5);
      return { key, label, pnl, cum, target: mode === 'range' ? undefined : targets[key] };
    });
    return { buckets: list, filtered: f };
  }, [rows, mode, year, range, targets]);
  const hasTargets = buckets.some((b) => b.target != null);

  // 종목별 실현손익(가로 막대 — 이익·손실 모두, 기여도 큰 순)
  const byStock = useMemo(() => {
    const map = new Map<string, { name: string; value: number }>();
    for (const r of filtered) {
      const cur = map.get(r.stockId) ?? { name: r.name, value: 0 };
      cur.value += r.krw;
      map.set(r.stockId, cur);
    }
    return [...map.values()].filter((s) => s.value !== 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  }, [filtered]);

  // 누적 실현손익(매도 거래 건별 시간순 — 단일 연도여도 거래마다 점으로 표시)
  const cumSeries = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => (a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0));
    let cum = 0;
    return sorted.map((r, i) => {
      cum += r.krw;
      return { idx: i, label: r.tradeDate.slice(5), name: r.name, pnl: r.krw, cum };
    });
  }, [filtered]);

  const summary = useMemo(() => {
    const total = filtered.reduce((acc, r) => acc + r.krw, 0);
    const count = filtered.length;
    const winList = filtered.filter((r) => r.realizedPnl > 0);
    const lossList = filtered.filter((r) => r.realizedPnl < 0);
    const winRate = count > 0 ? Math.round((winList.length / count) * 100) : 0;
    // 손익비 = 평균 이익 ÷ 평균 손실(절댓값). 손실이 없으면 산출 불가
    const avgWin = winList.length > 0 ? winList.reduce((a, r) => a + r.krw, 0) / winList.length : 0;
    const avgLoss = lossList.length > 0 ? Math.abs(lossList.reduce((a, r) => a + r.krw, 0) / lossList.length) : 0;
    const payoff = avgLoss > 0 && winList.length > 0 ? (avgWin / avgLoss).toFixed(2) : null;
    // 평균 보유일 = 보유 구간 최초 매수일 → 매도일(같은 날 매도는 0일)
    const held = filtered.filter((r) => r.buyDate);
    const avgHoldDays =
      held.length > 0
        ? (held.reduce((a, r) => a + (Date.parse(r.tradeDate) - Date.parse(r.buyDate)) / DAY_MS, 0) / held.length).toFixed(1)
        : null;
    const fees = filtered.reduce((a, r) => a + r.feeKrw, 0);
    return { total, count, winRate, payoff, avgHoldDays, fees };
  }, [filtered]);

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
          매도 기록이 없습니다. [매매] 탭이나 종목 상세의 매매일지에서 매도를 기록하면 실현손익이 집계됩니다.
        </Card>
      ) : (
        <>
          {/* 요약 */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
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
            <Card className="gap-1 p-4">
              <span className="text-[11px] text-muted-foreground">손익비 (평균 이익÷손실)</span>
              <span className="text-xl font-bold tabular-nums">{summary.payoff ?? '—'}</span>
            </Card>
            <Card className="gap-1 p-4">
              <span className="text-[11px] text-muted-foreground">평균 보유일</span>
              <span className="text-xl font-bold tabular-nums">{summary.avgHoldDays != null ? `${summary.avgHoldDays}일` : '—'}</span>
            </Card>
            <Card className="gap-1 p-4">
              <span className="text-[11px] text-muted-foreground">매매비용 합계(₩환산)</span>
              <span className="text-xl font-bold tabular-nums">{formatMoney(summary.fees, 'KRW')}</span>
            </Card>
          </div>

          {/* 기간별 바 + 누적 라인 */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="gap-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{mode === 'year' ? '연도별' : mode === 'month' ? '월별' : '일별'} 실현손익</h3>
                {hasTargets && (
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="h-0.5 w-4 rounded bg-amber-500" aria-hidden /> 목표 수익
                  </span>
                )}
              </div>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={buckets} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis tickFormatter={(v) => formatCompactMoney(Number(v), 'KRW')} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={64} />
                    <Tooltip
                      formatter={(v, name) => [signedKrw(Number(v) || 0), name === 'target' ? '목표 수익' : '실현손익']}
                      contentStyle={TOOLTIP_STYLE}
                      cursor={{ fill: 'var(--muted)' }}
                    />
                    <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                      {buckets.map((b) => (
                        <Cell key={b.key} fill={b.pnl >= 0 ? UP : DOWN} />
                      ))}
                    </Bar>
                    {hasTargets && (
                      <Line type="stepAfter" dataKey="target" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2.5 }} connectNulls />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="gap-3 p-4">
              <h3 className="text-sm font-semibold">누적 실현손익</h3>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cumSeries} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis tickFormatter={(v) => formatCompactMoney(Number(v), 'KRW')} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={64} />
                    <Tooltip
                      formatter={(v) => signedKrw(Number(v) || 0)}
                      labelFormatter={(_, p) => (p?.[0]?.payload ? `${p[0].payload.label} · ${p[0].payload.name}` : '')}
                      contentStyle={TOOLTIP_STYLE}
                    />
                    <Line type="monotone" dataKey="cum" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* 종목별 실현손익 (가로 막대 — 이익·손실 모두) */}
          <Card className="gap-3 p-4">
            <h3 className="text-sm font-semibold">종목별 실현손익</h3>
            {byStock.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">해당 기간에 실현손익이 없습니다.</p>
            ) : (
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="w-full min-w-0 sm:flex-1" style={{ height: Math.max(140, byStock.length * 44) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byStock} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => formatCompactMoney(Number(v), 'KRW')} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                      <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                      <Tooltip formatter={(v) => signedKrw(Number(v) || 0)} contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--muted)' }} />
                      <ReferenceLine x={0} stroke="var(--border)" />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {byStock.map((s) => (
                          <Cell key={s.name} fill={s.value >= 0 ? UP : DOWN} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <ul className="space-y-1.5 sm:w-48">
                  {byStock.map((s) => (
                    <li key={s.name} className="flex items-center gap-2 text-sm">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.value >= 0 ? UP : DOWN }} />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <span className={`font-medium tabular-nums ${pnlColor(s.value)}`}>{signedKrw(s.value)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {/* 종목별 수익률 표 (매도 건별) */}
          <Card className="gap-3 p-4">
            <h3 className="text-sm font-semibold">종목별 수익률</h3>
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">해당 기간에 매도 기록이 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="py-2 pr-3 text-left font-medium">종목명</th>
                      <th className="px-3 py-2 text-right font-medium">매수 단가</th>
                      <th className="px-3 py-2 text-right font-medium">매수량</th>
                      <th className="px-3 py-2 text-right font-medium">판매 단가</th>
                      <th className="px-3 py-2 text-right font-medium">실현손익</th>
                      <th className="px-3 py-2 text-right font-medium">수익률</th>
                      <th className="px-3 py-2 text-left font-medium">매수일</th>
                      <th className="py-2 pl-3 text-left font-medium">실현일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id} className="border-b border-border/50 last:border-0">
                        <td className="py-2.5 pr-3 font-medium">{r.name}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(r.avgBuyPrice, r.currency)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.qty.toLocaleString()}주</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(r.sellPrice, r.currency)}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${pnlColor(r.realizedPnl)}`}>
                          {r.realizedPnl > 0 ? '+' : ''}
                          {formatMoney(r.realizedPnl, r.currency)}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${pnlColor(r.realizedRate)}`}>
                          {r.realizedRate > 0 ? '+' : ''}
                          {r.realizedRate.toFixed(2)}%
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{r.buyDate || '-'}</td>
                        <td className="py-2.5 pl-3 tabular-nums text-muted-foreground">{r.tradeDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
