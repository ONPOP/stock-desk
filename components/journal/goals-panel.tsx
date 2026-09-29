'use client';

// 투자 기록 > 목표 (D21) — 이번 달·올해 달성 현황, 목표 설정, 예수금 추가, 월·연 기록.
// 월 목표는 한 번 설정하면 그 달의 시작 금액에서 복리 경로로 매달 목표 금액이 자동 계산된다.
// 다시 설정하면 설정한 달부터 새 경로가 시작된다. 지난 달 기록은 확정되어 바뀌지 않는다.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';
import { toast } from 'sonner';
import { ArrowDownUp, CalendarRange, Check, RefreshCw, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CashManager } from '@/components/cash/cash-manager';
import { MonthGoalCard } from './month-goal-card';
import { activeMonthlyGoal } from '@/lib/utils/goals';
import { formatMoney } from '@/lib/utils/money';
import type { CashTransaction, GoalOverview, RealHolding, YearGoalProgress } from '@/types';

function pnlColor(n: number): string {
  return n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted-foreground';
}
function signedKrw(n: number): string {
  return `${n > 0 ? '+' : ''}${formatMoney(n, 'KRW')}`;
}
function signedPct(n: number): string {
  return `${n > 0 ? '+' : ''}${n}%`;
}

async function send(url: string, method: string, body?: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? '저장에 실패했습니다.');
    }
    return res.ok;
  } catch {
    toast.error('네트워크 오류로 저장하지 못했습니다.');
    return false;
  }
}

function YearGoalCard({ year }: { year: YearGoalProgress | null }) {
  const g = year?.goal ?? null;
  const bar = g ? Math.max(0, Math.min(100, g.achievementPct)) : 0;
  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <CalendarRange className="size-4" />
        </span>
        <h3 className="font-semibold">{year?.year ?? new Date().getFullYear()}년 목표 수익률</h3>
      </div>
      {!year ? (
        <p className="py-6 text-center text-sm text-muted-foreground">올해 기록이 없습니다.</p>
      ) : (
        <>
          {g ? (
            <div className="rounded-xl border bg-secondary/40 p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">달성률</span>
                <span className={`text-2xl font-bold tabular-nums ${g.achieved ? 'text-up' : ''}`}>{g.achievementPct}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={bar} aria-valuemin={0} aria-valuemax={100} aria-label="연 목표 달성률">
                <div className={`h-full rounded-full ${g.achieved ? 'bg-up' : 'bg-primary'}`} style={{ width: `${bar}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {g.achieved ? '올해 목표를 달성했습니다 🎉' : `목표까지 ${formatMoney(g.remaining, 'KRW')} 남음`}
              </p>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed py-4 text-center text-sm text-muted-foreground">
              아래에서 연 목표 수익률을 설정하세요
            </p>
          )}
          <div className="divide-y divide-border/60 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-xs text-muted-foreground">연초 시작 금액</span>
              <span className="font-semibold tabular-nums">{formatMoney(year.startAmount, 'KRW')}</span>
            </div>
            {g && (
              <div className="flex justify-between py-1">
                <span className="text-xs text-muted-foreground">목표 금액 (연 {g.ratePct}%)</span>
                <span className="font-semibold tabular-nums">{formatMoney(g.targetAmount, 'KRW')}</span>
              </div>
            )}
            <div className="flex justify-between py-1">
              <span className="text-xs text-muted-foreground">연간 실현 수익률</span>
              <span className={`font-semibold tabular-nums ${pnlColor(year.realized)}`}>
                {signedPct(year.realizedRatePct)} ({signedKrw(year.realized)})
              </span>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

export function GoalsPanel({
  initial,
  holdings,
  initialCashTxs,
}: {
  initial: GoalOverview;
  holdings: RealHolding[];
  initialCashTxs: CashTransaction[];
}) {
  const router = useRouter();
  const [ov, setOv] = useState(initial);
  const [monthlyRate, setMonthlyRate] = useState('');
  const [yearlyRate, setYearlyRate] = useState('');
  const [goalYear, setGoalYear] = useState(initial.currentMonth.slice(0, 4));
  const [startInput, setStartInput] = useState('');
  const [showCash, setShowCash] = useState(false);
  const [busy, setBusy] = useState(false);

  const currentYear = ov.currentMonth.slice(0, 4);
  const current = ov.months.find((m) => m.month === ov.currentMonth) ?? null;
  const activeMonthly = activeMonthlyGoal(ov.goals, ov.currentMonth);
  const years = useMemo(() => [...new Set(ov.months.map((m) => m.month.slice(0, 4)))].sort().reverse(), [ov.months]);
  const [historyYear, setHistoryYear] = useState(years[0] ?? currentYear);
  const historyMonths = ov.months.filter((m) => m.month.startsWith(historyYear)).reverse();

  async function refresh() {
    try {
      const res = await fetch('/api/goals');
      if (res.ok) setOv((await res.json()) as GoalOverview);
    } catch {
      // 다음 새로고침에 반영
    }
    router.refresh(); // 대시보드 등 RSC 캐시 갱신
  }

  async function saveGoal(kind: 'monthly' | 'yearly') {
    const ratePct = (kind === 'monthly' ? monthlyRate : yearlyRate).trim();
    if (!ratePct) return;
    setBusy(true);
    const effectiveMonth = kind === 'monthly' ? ov.currentMonth : `${goalYear}-01`;
    const ok = await send('/api/goals', 'POST', { kind, ratePct, effectiveMonth });
    setBusy(false);
    if (!ok) return;
    toast.success(kind === 'monthly' ? `${Number(ov.currentMonth.slice(5))}월부터 새 월 목표를 적용합니다.` : `${goalYear}년 목표를 저장했습니다.`);
    if (kind === 'monthly') setMonthlyRate('');
    else setYearlyRate('');
    await refresh();
  }

  async function removeGoal(id: string) {
    if (!(await send(`/api/goals?id=${encodeURIComponent(id)}`, 'DELETE'))) return;
    await refresh();
  }

  async function saveStart(reset: boolean) {
    let startOverride: number | null = null;
    if (!reset) {
      const raw = startInput.trim().replace(/,/g, '');
      if (!/^\d+$/.test(raw)) {
        toast.error('시작 금액을 원 단위 숫자로 입력하세요.');
        return;
      }
      startOverride = new Decimal(raw).toNumber();
    }
    setBusy(true);
    const ok = await send('/api/goals/months', 'PATCH', { month: ov.currentMonth, startOverride });
    setBusy(false);
    if (!ok) return;
    setStartInput('');
    toast.success(reset ? '월초 금액을 자동 계산값으로 되돌렸습니다.' : '월초 금액을 수정했습니다.');
    await refresh();
  }

  async function recompute() {
    if (
      !window.confirm(
        '확정된 지난 달까지 지금의 매매·입출금 기록으로 다시 계산합니다.\n과거 매매를 뒤늦게 입력했을 때만 사용하세요. 직접 고친 월초 금액은 유지됩니다.',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/goals/months', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? '다시 계산하지 못했습니다.');
        return;
      }
      setOv(data as GoalOverview);
      toast.success('월별 기록을 다시 계산했습니다.');
      router.refresh();
    } catch {
      toast.error('네트워크 오류로 다시 계산하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  const goalHistory = [...ov.goals].sort((a, b) => (a.effectiveMonth < b.effectiveMonth ? 1 : -1));

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <MonthGoalCard progress={current} holdings={holdings} fxPending={ov.fxPending} showLink={false} />
        <YearGoalCard year={ov.years.find((y) => y.year === currentYear) ?? null} />
      </div>

      {/* 목표 설정 */}
      <Card className="gap-4 p-4">
        <h3 className="font-semibold">목표 설정</h3>
        <div className="grid gap-5 lg:grid-cols-3">
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void saveGoal('monthly');
            }}
          >
            <Label htmlFor="g-monthly">월 목표 수익률 (%)</Label>
            <div className="flex gap-2">
              <Input
                id="g-monthly"
                inputMode="decimal"
                value={monthlyRate}
                onChange={(e) => setMonthlyRate(e.target.value)}
                placeholder={activeMonthly ? `현재 ${activeMonthly.ratePct}` : '예: 3'}
              />
              <Button type="submit" size="sm" className="h-9" disabled={busy || !monthlyRate.trim()}>
                설정
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {activeMonthly
                ? `현재 ${activeMonthly.effectiveMonth}부터 월 ${activeMonthly.ratePct}% 복리 경로를 따릅니다. `
                : ''}
              한 번 설정하면 매달 목표 금액이 복리로 자동 계산됩니다. 다시 설정하면 이번 달 시작 금액부터 새로 계산합니다.
            </p>
          </form>

          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void saveGoal('yearly');
            }}
          >
            <Label htmlFor="g-yearly">연 목표 수익률 (%)</Label>
            <div className="flex gap-2">
              <select
                value={goalYear}
                onChange={(e) => setGoalYear(e.target.value)}
                className="h-9 rounded-lg border bg-card px-2 text-sm"
                aria-label="목표 연도"
              >
                {[Number(currentYear), Number(currentYear) + 1].map((y) => (
                  <option key={y} value={String(y)}>
                    {y}년
                  </option>
                ))}
              </select>
              <Input
                id="g-yearly"
                inputMode="decimal"
                value={yearlyRate}
                onChange={(e) => setYearlyRate(e.target.value)}
                placeholder="예: 30"
              />
              <Button type="submit" size="sm" className="h-9" disabled={busy || !yearlyRate.trim()}>
                설정
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              연초(그해 첫 기록 월) 시작 금액 기준으로 연간 실현손익 달성률을 계산합니다.
            </p>
          </form>

          <div className="space-y-2">
            <Label htmlFor="g-start">이번 달 월초 금액 (원)</Label>
            <div className="flex gap-2">
              <Input
                id="g-start"
                inputMode="numeric"
                value={startInput}
                onChange={(e) => setStartInput(e.target.value)}
                placeholder={current ? String(current.record.startOverride ?? current.record.baseStart) : ''}
              />
              <Button size="sm" className="h-9" disabled={busy || !startInput.trim()} onClick={() => saveStart(false)}>
                <Check data-icon="inline-start" />
                수정
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              자동값 = 월초 예수금 + 보유 매입원가
              {current && ` (${formatMoney(current.record.baseStart, 'KRW')})`}.
              {current?.record.startOverride != null && (
                <button type="button" className="ml-1 text-primary hover:underline" onClick={() => saveStart(true)}>
                  자동값으로 되돌리기
                </button>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button variant="outline" size="sm" onClick={() => setShowCash((v) => !v)} aria-expanded={showCash}>
            <ArrowDownUp data-icon="inline-start" />
            예수금 추가
          </Button>
          <span className="text-[11px] text-muted-foreground">
            입금하면 해당 월 시작 금액에 더해집니다(수익으로 잡지 않음). 지난 달 기록에는 영향을 주지 않습니다.
          </span>
        </div>
        {showCash && <CashManager initialTxs={initialCashTxs} onChange={() => void refresh()} />}

        {goalHistory.length > 0 && (
          <div className="space-y-1 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">설정 이력</p>
            <ul className="flex flex-wrap gap-2">
              {goalHistory.map((g) => (
                <li key={g.id} className="flex items-center gap-1 rounded-full border bg-secondary/40 py-0.5 pr-1 pl-3 text-xs tabular-nums">
                  {g.kind === 'monthly' ? `월 ${g.ratePct}% · ${g.effectiveMonth}~` : `${g.effectiveMonth.slice(0, 4)}년 ${g.ratePct}%`}
                  <Button size="icon-xs" variant="ghost" className="text-muted-foreground" aria-label="목표 삭제" onClick={() => removeGoal(g.id)}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* 연도별 기록 */}
      {ov.years.length > 0 && (
        <Card className="gap-3 p-4">
          <h3 className="font-semibold">연도별 기록</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 pr-3 text-left font-medium">연도</th>
                  <th className="px-3 py-2 text-right font-medium">시작 금액</th>
                  <th className="px-3 py-2 text-right font-medium">목표</th>
                  <th className="px-3 py-2 text-right font-medium">실현손익</th>
                  <th className="px-3 py-2 text-right font-medium">실현 수익률</th>
                  <th className="py-2 pl-3 text-right font-medium">달성률</th>
                </tr>
              </thead>
              <tbody>
                {[...ov.years].reverse().map((y) => (
                  <tr key={y.year} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 pr-3 font-medium">{y.year}년</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(y.startAmount, 'KRW')}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {y.goal ? `${y.goal.ratePct}% · ${formatMoney(y.goal.targetProfit, 'KRW')}` : '—'}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${pnlColor(y.realized)}`}>{signedKrw(y.realized)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${pnlColor(y.realized)}`}>{signedPct(y.realizedRatePct)}</td>
                    <td className="py-2.5 pl-3 text-right font-semibold tabular-nums">
                      {y.goal ? `${y.goal.achievementPct}%${y.goal.achieved ? ' ✓' : ''}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 월별 기록 */}
      <Card className="gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">월별 기록</h3>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-8 text-xs text-muted-foreground"
            onClick={recompute}
            disabled={busy}
            title="과거 매매·입출금을 뒤늦게 입력했을 때 지난 달 기록을 다시 계산합니다"
          >
            <RefreshCw data-icon="inline-start" />
            다시 계산
          </Button>
          {years.length > 0 && (
            <select
              value={historyYear}
              onChange={(e) => setHistoryYear(e.target.value)}
              className="h-8 rounded-lg border bg-card px-2 text-sm"
              aria-label="기록 연도"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
          )}
        </div>
        {historyMonths.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">기록이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 pr-3 text-left font-medium">월</th>
                  <th className="px-3 py-2 text-right font-medium">시작 금액</th>
                  <th className="px-3 py-2 text-right font-medium">목표 수익률</th>
                  <th className="px-3 py-2 text-right font-medium">목표 금액</th>
                  <th className="px-3 py-2 text-right font-medium">실현손익</th>
                  <th className="px-3 py-2 text-right font-medium">실현 수익률</th>
                  <th className="py-2 pl-3 text-right font-medium">달성률</th>
                </tr>
              </thead>
              <tbody>
                {historyMonths.map((m) => (
                  <tr key={m.month} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 pr-3 font-medium">
                      {Number(m.month.slice(5))}월
                      {!m.record.closed && <span className="ml-1.5 text-[11px] font-normal text-primary">진행 중</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatMoney(m.startAmount, 'KRW')}
                      {m.record.netFlow !== 0 && (
                        <span className="block text-[11px] text-muted-foreground">입출금 {signedKrw(m.record.netFlow)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {m.goal ? (
                        <>
                          {m.goal.ratePct}%
                          {Number(m.goal.ratePct) !== m.goal.requiredRatePct && (
                            <span className="block text-[11px]">필요 {m.goal.requiredRatePct}%</span>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{m.goal ? formatMoney(m.goal.targetAmount, 'KRW') : '—'}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${pnlColor(m.record.realized)}`}>{signedKrw(m.record.realized)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${pnlColor(m.record.realized)}`}>{signedPct(m.realizedRatePct)}</td>
                    <td className="py-2.5 pl-3 text-right font-semibold tabular-nums">
                      {m.goal ? (
                        <span className={m.goal.achieved ? 'text-up' : ''}>
                          {m.goal.achievementPct}%{m.goal.achieved ? ' ✓' : ''}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
