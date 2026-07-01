'use client';

// F2 캘린더 월 보기 — 거시(보라)·실적(빨강)·수동(인디고) 일정. "(예정)" 라벨, 수동 추가/수정/삭제, 일정 갱신.
// [재설계] 그리드·칩·툴바 비주얼. [보존] loadMonth/addEvent/refresh/remove fetch·changeMonth·eventsByDate·셀 계산.
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, RefreshCw, Plus, ListFilter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { dateInTz, KST_TZ } from '@/lib/utils/date';
import type { CalendarEvent, CalendarEventType } from '@/types';

// 사용자가 등록 가능한 분류(모달 select 순서)
const USER_TYPES: CalendarEventType[] = ['custom', 'macro', 'earnings', 'options', 'dividend'];

const TYPE_COLOR: Record<CalendarEventType, string> = {
  macro: 'bg-purple-500/12 text-purple-600 dark:text-purple-300',
  earnings: 'bg-up-soft text-up',
  custom: 'bg-accent text-accent-foreground',
  options: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
  dividend: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
};
const TYPE_DOT: Record<CalendarEventType, string> = {
  macro: 'bg-purple-500',
  earnings: 'bg-up',
  custom: 'bg-primary',
  options: 'bg-amber-500',
  dividend: 'bg-emerald-500',
};
const TYPE_LABEL: Record<CalendarEventType, string> = {
  macro: '거시',
  earnings: '실적',
  custom: '내 일정',
  options: '옵션만기',
  dividend: '배당',
};
const LEGEND_TYPES: CalendarEventType[] = ['macro', 'earnings', 'options', 'dividend', 'custom'];
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
  const [open, setOpen] = useState(false); // 일정 추가/수정 모달
  const [addDate, setAddDate] = useState('');
  const [addTitle, setAddTitle] = useState('');
  const [formType, setFormType] = useState<CalendarEventType>('custom');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // open 상태 ↔ 네이티브 <dialog> showModal/close 동기화 (ESC·포커스 트랩·백드롭 확보)
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  // 종목 표시 필터 — 숨길 종목 stockId 집합 (기본 비어있음 = 전체 표시)
  const [hiddenStocks, setHiddenStocks] = useState<Set<string>>(new Set());
  const [showFilter, setShowFilter] = useState(false);

  function toggleStock(id: string) {
    setHiddenStocks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

  // 추가 모달 열기 (날짜 지정 시 프리필 — 셀 더블클릭용)
  function openAdd(date?: string) {
    setEditingId(null);
    setAddDate(date ?? todayStr);
    setAddTitle('');
    setFormType('custom');
    setOpen(true);
  }

  // 수정 모달 열기 (기존 값 프리필)
  function openEdit(e: CalendarEvent) {
    setEditingId(e.id);
    setAddDate(e.eventDate);
    setAddTitle(e.title);
    setFormType(e.type);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditingId(null);
    setAddTitle('');
    setAddDate('');
  }

  // 추가(POST) / 수정(PATCH) 겸용 — editingId 유무로 분기
  async function submitEvent() {
    if (!addDate || !addTitle.trim()) {
      toast.error('날짜와 제목을 입력해주세요.');
      return;
    }
    setBusy(true);
    try {
      const url = editingId ? `/api/calendar?id=${editingId}` : '/api/calendar';
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: addTitle.trim(), event_date: addDate, type: formType }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? (editingId ? '일정 수정 실패' : '일정 추가 실패'));
        return;
      }
      if (editingId) {
        setEvents((prev) => prev.map((x) => (x.id === editingId ? data.event : x)));
        toast.success('일정을 수정했습니다.');
      } else {
        setEvents((prev) => [...prev, data.event]);
        toast.success('일정을 추가했습니다.');
      }
      closeModal();
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
      const r = data.result ?? {};
      toast.success(`거시 ${r.macro ?? 0} · 실적 ${r.earnings ?? 0} · 옵션 ${r.options ?? 0} · 배당 ${r.dividends ?? 0}건 갱신`);
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

  // 종목 일정이 달린 종목 목록(필터 UI용) — 중복 제거 + 가나다 정렬
  const stockList = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of events) if (e.stockId) m.set(e.stockId, e.name ?? e.ticker ?? e.stockId);
    return [...m.entries()]
      .map(([stockId, label]) => ({ stockId, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ko'));
  }, [events]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      // 숨긴 종목의 일정은 제외 (시장 공통 일정은 stockId 없음 → 항상 표시)
      if (e.stockId && hiddenStocks.has(e.stockId)) continue;
      if (!map.has(e.eventDate)) map.set(e.eventDate, []);
      map.get(e.eventDate)!.push(e);
    }
    return map;
  }, [events, hiddenStocks]);

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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          {LEGEND_TYPES.map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${TYPE_DOT[t]}`} /> {TYPE_LABEL[t]}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => openAdd()} disabled={busy}>
            <Plus data-icon="inline-start" /> 추가
          </Button>
          <Button size="sm" variant="outline" onClick={refresh} disabled={busy}>
            <RefreshCw data-icon="inline-start" className={busy ? 'animate-spin' : ''} /> 일정 갱신
          </Button>
          {stockList.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowFilter((v) => !v)}
              aria-pressed={showFilter}
            >
              <ListFilter data-icon="inline-start" /> 종목 표시
              {hiddenStocks.size > 0 && ` (${stockList.length - hiddenStocks.size}/${stockList.length})`}
            </Button>
          )}
        </div>
      </div>

      {showFilter && stockList.length > 0 && (
        <div className="space-y-2 rounded-xl border bg-secondary/30 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">캘린더에 표시할 종목 (기본 전체)</span>
            <div className="flex gap-1.5">
              <Button size="xs" variant="ghost" onClick={() => setHiddenStocks(new Set())}>
                전체
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setHiddenStocks(new Set(stockList.map((s) => s.stockId)))}>
                해제
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {stockList.map((s) => (
              <label key={s.stockId} className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                <input
                  type="checkbox"
                  checked={!hiddenStocks.has(s.stockId)}
                  onChange={() => toggleStock(s.stockId)}
                  className="size-3.5 accent-[var(--color-primary)]"
                />
                {s.label}
              </label>
            ))}
          </div>
        </div>
      )}

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
          <div
            key={i}
            className={`min-h-24 p-1.5 ${isToday ? 'bg-primary/5 ring-1 ring-inset ring-primary/50' : 'bg-card'} ${cell ? 'cursor-pointer' : ''}`}
            onDoubleClick={cell ? () => openAdd(cell.dateStr) : undefined}
            title={cell ? '더블클릭하여 일정 추가' : undefined}
          >
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
                      className={`group flex items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ${TYPE_COLOR[e.type]} ${
                        editingId === e.id ? 'ring-1 ring-primary' : ''
                      }`}
                      title={e.title}
                    >
                      <span className="truncate">
                        {e.title}
                        {!e.confirmed && ' (예정)'}
                      </span>
                      {e.source === 'user' && (
                        <span className="ml-auto hidden shrink-0 items-center gap-1 group-hover:inline-flex">
                          <button
                            type="button"
                            onClick={() => openEdit(e)}
                            className="shrink-0 hover:text-primary"
                            aria-label="수정"
                          >
                            ✎
                          </button>
                          <button type="button" onClick={() => remove(e.id)} className="shrink-0 hover:text-down" aria-label="삭제">
                            ×
                          </button>
                        </span>
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

      <dialog
        ref={dialogRef}
        onClose={closeModal}
        onClick={(e) => {
          if (e.target === dialogRef.current) closeModal(); // 백드롭 클릭 닫기
        }}
        className="m-auto w-[min(92vw,26rem)] rounded-2xl border bg-card p-0 text-foreground shadow-lg backdrop:bg-black/40"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitEvent();
          }}
          className="space-y-4 p-5"
        >
          <h2 className="text-base font-semibold">{editingId ? '일정 수정' : '일정 추가'}</h2>
          <div className="space-y-1.5">
            <label htmlFor="ev-date" className="text-xs font-medium text-muted-foreground">
              날짜
            </label>
            <Input id="ev-date" type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ev-title" className="text-xs font-medium text-muted-foreground">
              제목
            </label>
            <Input
              id="ev-title"
              placeholder="일정 제목"
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              maxLength={100}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ev-type" className="text-xs font-medium text-muted-foreground">
              분류
            </label>
            <select
              id="ev-type"
              value={formType}
              onChange={(e) => setFormType(e.target.value as CalendarEventType)}
              className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {USER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" size="sm" variant="ghost" onClick={closeModal} disabled={busy}>
              취소
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {editingId ? '저장' : '추가'}
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
