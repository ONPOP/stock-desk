'use client';

// 슬롯 스케줄 편집 (D16) — cron 문자열을 노출하지 않고 시:분 + 요일로 다룬다.
// 저장과 '스케줄 반영'은 별개 동작이다: DB만 바꾸면 launchd는 그대로이므로, 반영 버튼을 눌러야
// 실제 자동 실행 시각이 바뀐다. 이 구분을 UI가 명시적으로 보여준다.
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { fromCron, toCron, WEEKDAY_LABELS } from '@/lib/engine/cron-ui';
import type { SlotRow } from '@/lib/supabase/queries/engine-config';

const SLOT_TYPES = [
  { value: 'quick', label: '간이' },
  { value: 'detail', label: '상세' },
  { value: 'grade', label: '채점' },
  { value: 'weekly', label: '주간' },
] as const;

const MARKETS = ['KR', 'US', 'BOTH'] as const;

interface EditableSlot extends SlotRow {
  hour: number;
  minute: number;
  weekdays: number[];
  /** cron이 UI로 표현 불가한 경우 — 시각 편집을 잠근다 */
  advanced: boolean;
}

function toEditable(row: SlotRow): EditableSlot {
  const ui = fromCron(row.cronKst);
  return {
    ...row,
    hour: ui?.hour ?? 9,
    minute: ui?.minute ?? 0,
    weekdays: ui?.weekdays ?? [],
    advanced: ui === null,
  };
}

function newSlot(index: number): EditableSlot {
  return {
    slotId: `custom_${index}`,
    label: '새 슬롯',
    cronKst: '0 9 * * 1,2,3,4,5',
    market: 'KR',
    slotType: 'quick',
    enabled: false,
    hour: 9,
    minute: 0,
    weekdays: [1, 2, 3, 4, 5],
    advanced: false,
  };
}

export function SlotSchedulePanel({ initial }: { initial: SlotRow[] }) {
  const [slots, setSlots] = useState<EditableSlot[]>(() => initial.map(toEditable));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncAvailable, setSyncAvailable] = useState<boolean | null>(null);
  const [syncCommand, setSyncCommand] = useState('npx tsx scripts/engine/install-schedule.ts');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/engine/slots/sync')
      .then((r) => r.json())
      .then((j) => {
        setSyncAvailable(Boolean(j.available));
        if (j.command) setSyncCommand(j.command);
      })
      .catch(() => setSyncAvailable(false));
  }, []);

  const patch = useCallback((index: number, next: Partial<EditableSlot>) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...next } : s)));
    setDirty(true);
  }, []);

  const toggleDay = (index: number, day: number) => {
    setSlots((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const has = s.weekdays.includes(day);
        return { ...s, weekdays: has ? s.weekdays.filter((d) => d !== day) : [...s.weekdays, day].sort() };
      }),
    );
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload = slots.map((s) => ({
        slotId: s.slotId,
        label: s.label,
        // 고급(직접 편집) 슬롯은 원본 cron을 보존한다
        cronKst: s.advanced ? s.cronKst : toCron({ hour: s.hour, minute: s.minute, weekdays: s.weekdays }),
        market: s.market,
        slotType: s.slotType,
        enabled: s.enabled,
      }));
      const res = await fetch('/api/engine/slots', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? '저장에 실패했습니다.');
      setSlots((json.slots as SlotRow[]).map(toEditable));
      setDirty(false);
      setMessage({ tone: 'info', text: '저장했습니다. 자동 실행에 반영하려면 [스케줄 반영]을 누르세요.' });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : '저장에 실패했습니다.' });
    } finally {
      setSaving(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch('/api/engine/slots/sync', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? '반영에 실패했습니다.');
      setMessage(
        json.ok
          ? { tone: 'ok', text: '스케줄을 반영했습니다.' }
          : { tone: 'error', text: json.message },
      );
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : '반영에 실패했습니다.' });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">슬롯 스케줄</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            리포트를 만들 시각입니다. 미국 슬롯은 표준시 기간에 자동으로 1시간 밀립니다.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setSlots((prev) => [...prev, newSlot(prev.length + 1)]);
            setDirty(true);
          }}
        >
          <Plus className="size-4" /> 슬롯 추가
        </Button>
      </div>

      <div className="space-y-2">
        {slots.map((slot, i) => (
          <div
            key={slot.slotId}
            className={cn(
              'grid grid-cols-1 gap-3 rounded-lg border p-3 lg:grid-cols-[1fr_auto_auto_auto_auto]',
              !slot.enabled && 'opacity-60',
            )}
          >
            <div className="min-w-0 space-y-1">
              <Input
                value={slot.label}
                onChange={(e) => patch(i, { label: e.target.value })}
                className="h-8"
                aria-label="슬롯 이름"
              />
              <div className="font-mono text-[11px] text-muted-foreground">{slot.slotId}</div>
            </div>

            <div className="flex items-center gap-1.5">
              {slot.advanced ? (
                <span className="rounded bg-muted px-2 py-1 font-mono text-xs" title="UI로 표현할 수 없는 크론">
                  {slot.cronKst}
                </span>
              ) : (
                <>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={slot.hour}
                    onChange={(e) => patch(i, { hour: Number(e.target.value) })}
                    className="h-8 w-14 text-center tabular-nums"
                    aria-label="시"
                  />
                  <span className="text-muted-foreground">:</span>
                  <Input
                    type="number"
                    min={0}
                    max={59}
                    value={slot.minute}
                    onChange={(e) => patch(i, { minute: Number(e.target.value) })}
                    className="h-8 w-14 text-center tabular-nums"
                    aria-label="분"
                  />
                </>
              )}
            </div>

            <div className="flex items-center gap-1">
              {WEEKDAY_LABELS.map((label, day) => (
                <button
                  key={day}
                  type="button"
                  disabled={slot.advanced}
                  onClick={() => toggleDay(i, day)}
                  aria-pressed={slot.weekdays.includes(day)}
                  className={cn(
                    'size-7 rounded text-xs transition-colors disabled:opacity-40',
                    slot.weekdays.includes(day)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-muted-foreground/20',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <select
                value={slot.market}
                onChange={(e) => patch(i, { market: e.target.value as SlotRow['market'] })}
                className="h-8 rounded-md border bg-transparent px-2 text-sm"
                aria-label="시장"
              >
                {MARKETS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={slot.slotType}
                onChange={(e) => patch(i, { slotType: e.target.value as SlotRow['slotType'] })}
                className="h-8 rounded-md border bg-transparent px-2 text-sm"
                aria-label="유형"
              >
                {SLOT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={slot.enabled ? 'default' : 'outline'}
                onClick={() => patch(i, { enabled: !slot.enabled })}
                className="h-8 px-3 text-xs"
              >
                {slot.enabled ? '활성' : '중지'}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="슬롯 삭제"
                onClick={() => {
                  setSlots((prev) => prev.filter((_, idx) => idx !== i));
                  setDirty(true);
                }}
                className="size-8"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {dirty && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/40 p-2.5 text-sm text-amber-600">
          <AlertTriangle className="size-4 shrink-0" />
          저장하지 않은 변경사항이 있습니다.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : '저장'}
        </Button>
        <Button variant="outline" onClick={sync} disabled={syncing || syncAvailable === false}>
          {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} 스케줄 반영
        </Button>
        {message && (
          <span
            className={cn(
              'text-sm',
              message.tone === 'error' ? 'text-destructive' : message.tone === 'ok' ? 'text-emerald-600' : 'text-muted-foreground',
            )}
          >
            {message.text}
          </span>
        )}
      </div>

      {syncAvailable === false && (
        <p className="text-xs text-muted-foreground">
          이 환경에서는 자동 실행 등록을 할 수 없습니다(launchd는 로컬 Mac 전용). 로컬에서{' '}
          <code className="rounded bg-muted px-1 py-0.5">{syncCommand}</code> 를 실행하세요.
        </p>
      )}
    </Card>
  );
}
