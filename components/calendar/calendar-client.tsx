'use client';

// F2 캘린더 월 보기 — 거시(보라)·실적(주황)·수동(파랑) 일정. "(예정)" 라벨, 수동 추가/삭제, 일정 갱신.
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CalendarEvent, CalendarEventType } from '@/types';

const TYPE_COLOR: Record<CalendarEventType, string> = {
  macro: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
  earnings: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  custom: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
};
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function CalendarClient({ initialEvents }: { initialEvents: CalendarEvent[] }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => changeMonth(-1)}>
            ‹
          </Button>
          <span className="min-w-28 text-center font-semibold tabular-nums">
            {year}년 {month + 1}월
          </span>
          <Button size="sm" variant="ghost" onClick={() => changeMonth(1)}>
            ›
          </Button>
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={busy}>
          {busy ? '갱신 중…' : '일정 갱신'}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} className="w-40" />
        <Input
          placeholder="일정 제목"
          value={addTitle}
          onChange={(e) => setAddTitle(e.target.value)}
          className="flex-1 min-w-40"
          onKeyDown={(e) => e.key === 'Enter' && addEvent()}
        />
        <Button size="sm" onClick={addEvent} disabled={busy}>
          추가
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-border text-sm">
        {WEEKDAYS.map((w) => (
          <div key={w} className="bg-background py-1.5 text-center text-xs font-medium text-muted-foreground">
            {w}
          </div>
        ))}
        {cells.map((cell, i) => (
          <div key={i} className="min-h-20 bg-background p-1">
            {cell && (
              <>
                <div className="mb-0.5 text-xs tabular-nums text-muted-foreground">{cell.day}</div>
                <div className="space-y-0.5">
                  {(eventsByDate.get(cell.dateStr) ?? []).slice(0, 3).map((e) => (
                    <div
                      key={e.id}
                      className={`group flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] ${TYPE_COLOR[e.type]}`}
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
        ))}
      </div>
    </div>
  );
}
