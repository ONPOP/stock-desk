// 대시보드 오늘 일정 타일 (B) — 오늘 날짜의 거시·실적·내 일정. 유형별 색 점.
import Link from 'next/link';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { CalendarEvent, CalendarEventType } from '@/types';

const DOT: Record<CalendarEventType, string> = {
  macro: 'bg-chart-2',
  earnings: 'bg-up',
  custom: 'bg-primary',
  options: 'bg-amber-500',
  dividend: 'bg-emerald-500',
};

export function ScheduleTile({ events }: { events: CalendarEvent[] }) {
  return (
    <Card className="gap-0 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <CalendarDays className="size-4" />
        </span>
        <h3 className="font-semibold">오늘 일정</h3>
        <Link href="/calendar" className="ml-auto flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">
          캘린더 <ChevronRight className="size-3" />
        </Link>
      </div>
      {events.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">오늘 일정이 없습니다.</p>
      ) : (
        <div className="space-y-0.5">
          {events.map((e) => (
            <div key={e.id} className="flex items-center gap-2.5 px-2 py-2">
              <span className={`size-2 shrink-0 rounded-full ${DOT[e.type] ?? 'bg-muted-foreground'}`} aria-hidden />
              <span className="flex-1 truncate text-sm">
                {e.title}
                {!e.confirmed && <span className="text-muted-foreground"> (예정)</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
