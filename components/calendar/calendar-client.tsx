'use client';

// F2 캘린더 월 보기 — 거시(보라)·실적(빨강)·수동(인디고) 일정. "(예정)" 라벨, 수동 추가/삭제, 일정 갱신.
// [재설계] 그리드·칩·툴바 비주얼. [보존] loadMonth/addEvent/refresh/remove fetch·changeMonth·eventsByDate·셀 계산.
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, RefreshCw, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { dateInTz, KST_TZ } from '@/lib/utils/date';
import type { CalendarEvent, CalendarEventType } from '@/types';

const TYPE_COLOR: Record<CalendarEventType, string> = {
  macro: 'bg-purple-500/12 text-purple-600 dark:text-purple-300',
  earnings: 'bg-up-soft text-up',
  custom: 'bg-accent text-accent-foreground',
};
const TYPE_DOT: Record<CalendarEventType, string> = {
  macro: 'bg-purple-500',
  earnings: 'bg-up',
  custom: 'bg-primary',
};
const TYPE_LABEL: Record<CalendarEventType, string> = { macro: '거시', earnings: '실적', custom: '내 일정' };
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function CalendarClient({ initialEvents }: { initialEvents: CalendarEvent[] }) {
  const todayStr = dateInTz(new Date().toISOString(), KST_TZ); // KST 기준 오늘 "YYYY-MM-DD"
  const [ty0, tm0] = todayStr.split('-').map(Number); // tm0=1-based 월
  const [year, setYear] = useState(ty0);
  const [month, setMonth] = useState(tm0 - 1); // 0-based
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [addDate, setAddDate] = useState('');
  const [addTitle, setAddTitle] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadMonth(y: number, m: number) {
    const from = `${y}-${pad(m + 1)}-01`;
    const to = `${y}-${pad(m + 1)}-${pad(new Date(Date.UTC(y, m + 1, 0)).getUTCDate())}`;
    try {
      const res = await fetch(`/api/calendar?from=${from}&to=${to}`);
      const data = await res.json();
      if (res.ok) setEvents(data.events ?? []);
    } catch {
      toast.error('일정을 불러오지 못했습니다.');
    }
  }

  function changeMonth(delta: number) {
    let y = year;
    let m = month + delta;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setYear(y);
    setMonth(m);
    loadMonth(y, m);
  }

  function goToToday() {
    setYear(ty0);
    setMonth(tm0 - 1);
    loadMonth(ty0, tm0 - 1);
  }

  async function addEvent() {
    if (!addDate || !addTitle.trim()) {
      toast.error('날짜와 제목을 입력해주세요.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: addTitle.trim(), event_date: addDate, type: 'custom' }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? '일정 추가 실패');
        return;
      }
      setEvents((prev) => [...prev, data.event]);
      setAddTitle('');
      toast.success('일정을 추가했습니다.');
    } catch {
      toast.error('네트워크 오류');
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    try {
      const res = await fetch('/api/calendar?refresh=true', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? '갱신 실패');
        return;
      }
      await loadMonth(year, month);
      toast.success(`거시 ${data.result?.macro ?? 0}건 · 실적 ${data.result?.earnings ?? 0}건 갱신`);
    } catch {
      toast.error('네트워크 오류');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const prev = events;
    setEvents((e) => e.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/calendar?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setEvents(prev);
        toast.error('삭제 실패 (공통 일정은 삭제할 수 없습니다)');
      }
    } catch {
      setEvents(prev);
    }
  }

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      if (!map.has(e.eventDate)) map.set(e.eventDate, []);
      map.get(e.eventDate)!.push(e);
    }
    return map;
  }, [events]);

  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: Array<{ day: number; dateStr: string } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, dateStr: `${year}-${pad(month + 1)}-${pad(d)}` });

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="icon-sm" variant="outline" className="rounded-full" onClick={() => changeMonth(-1)} aria-label="이전 달">
            <ChevronLeft />
          </Button>
          <span className="min-w-28 text-center text-[15px] font-semibold tabular-nums">
            {year}년 {month + 1}월
          </span>
          <Button size="icon-sm" variant="outline" className="rounded-full" onClick={() => changeMonth(1)} aria-label="다음 달">
            <ChevronRight />
          </Button>
          <Button size="sm" variant="outline" className="ml-1 rounded-full" onClick={goToToday}>
            오늘
          </Button>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {(['macro', 'earnings', 'custom'] as CalendarEventType[]).map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${TYPE_DOT[t]}`} /> {TYPE_LABEL[t]}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} className="w-40" />
          <Input
            placeholder="일정 제목"
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
            className="w-40"
            onKeyDown={(e) => e.key === 'Enter' && addEvent()}
          />
          <Button size="sm" onClick={addEvent} disabled={busy}>
            <Plus data-icon="inline-start" /> 추가
          </Button>
          <Button size="sm" variant="outline" onClick={refresh} disabled={busy}>
            <RefreshCw data-icon="inline-start" className={busy ? 'animate-spin' : ''} /> 일정 갱신
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border bg-border text-sm">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`bg-secondary/60 py-2 text-center text-xs font-semibold ${
              i === 0 ? 'text-up' : i === 6 ? 'text-down' : 'text-muted-foreground'
            }`}
          >
            {w}
          </div>
        ))}
        {cells.map((cell, i) => {
          const isToday = !!cell && cell.dateStr === todayStr;
          return (
          <div key={i} className={`min-h-24 p-1.5 ${isToday ? 'bg-primary/5 ring-1 ring-inset ring-primary/50' : 'bg-card'}`}>
            {cell && (
              <>
                <div
                  className={`mb-1 inline-flex size-5 items-center justify-center text-[11.5px] font-medium tabular-nums ${
                    isToday ? 'rounded-full bg-primary font-bold text-primary-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {cell.day}
                </div>
                <div className="space-y-1">
                  {(eventsByDate.get(cell.dateStr) ?? []).slice(0, 3).map((e) => (
                    <div
                      key={e.id}
                      className={`group flex items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ${TYPE_COLOR[e.type]}`}
                      title={e.title}
                    >
                      <span className="truncate">
                        {e.title}
                        {!e.confirmed && ' (예정)'}
                      </span>
                      {e.source === 'user' && (
                        <button
                          type="button"
                          onClick={() => remove(e.id)}
                          className="ml-auto hidden shrink-0 group-hover:inline"
                          aria-label="삭제"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
