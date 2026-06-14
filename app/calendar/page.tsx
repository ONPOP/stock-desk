// F2 통합 일정 캘린더 — 월 보기. 거시·실적·수동 일정.
import { requireUser } from '@/lib/supabase/server';
import { listEvents } from '@/lib/supabase/queries/calendar';
import { CalendarClient } from '@/components/calendar/calendar-client';

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return {
    from: new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10),
    to: new Date(Date.UTC(y, m + 2, 0)).toISOString().slice(0, 10),
  };
}

export default async function CalendarPage() {
  const { supabase, user } = await requireUser();
  const { from, to } = monthRange();
  const events = await listEvents(supabase, user.id, from, to);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">캘린더</h1>
      <CalendarClient initialEvents={events} />
    </div>
  );
}
