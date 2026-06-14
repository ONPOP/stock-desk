// 캘린더 DB 쿼리 (F2) — calendar_events. 공통 일정(user_id null) + 본인 일정.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarEvent, CalendarEventType } from '@/types';

interface EventRow {
  id: string;
  type: string;
  stock_id: string | null;
  title: string;
  event_date: string;
  confirmed: boolean;
  source: string | null;
  memo: string | null;
}

function rowToEvent(r: EventRow): CalendarEvent {
  return {
    id: r.id,
    type: r.type as CalendarEventType,
    stockId: r.stock_id,
    title: r.title,
    eventDate: r.event_date,
    confirmed: r.confirmed,
    source: r.source,
    memo: r.memo,
  };
}

const COLS = 'id, type, stock_id, title, event_date, confirmed, source, memo';

/** from~to 범위의 공통+본인 일정 */
export async function listEvents(db: SupabaseClient, userId: string, from: string, to: string): Promise<CalendarEvent[]> {
  const { data, error } = await db
    .from('calendar_events')
    .select(COLS)
    .gte('event_date', from)
    .lte('event_date', to)
    .or(`user_id.eq.${userId},user_id.is.null`)
    .order('event_date', { ascending: true });
  if (error) throw new Error(`일정 조회 실패: ${error.message}`);
  return (data ?? []).map((r) => rowToEvent(r as EventRow));
}

export async function createEvent(
  db: SupabaseClient,
  userId: string,
  input: { title: string; eventDate: string; type?: CalendarEventType; stockId?: string | null; memo?: string | null },
): Promise<CalendarEvent> {
  const { data, error } = await db
    .from('calendar_events')
    .insert({
      user_id: userId,
      type: input.type ?? 'custom',
      title: input.title,
      event_date: input.eventDate,
      stock_id: input.stockId ?? null,
      memo: input.memo ?? null,
      confirmed: true,
      source: 'user',
    })
    .select(COLS)
    .single();
  if (error) throw new Error(`일정 저장 실패: ${error.message}`);
  return rowToEvent(data as EventRow);
}

export async function deleteEvent(db: SupabaseClient, userId: string, id: string): Promise<void> {
  const { error } = await db.from('calendar_events').delete().eq('user_id', userId).eq('id', id);
  if (error) throw new Error(`일정 삭제 실패: ${error.message}`);
}

/** 공통 시드/실적 일정을 소스 단위로 교체(중복 방지) — user_id null */
export async function replaceEventsBySource(
  admin: SupabaseClient,
  source: string,
  events: Array<{ type: CalendarEventType; title: string; eventDate: string; stockId?: string | null; confirmed: boolean }>,
): Promise<number> {
  const { error: delErr } = await admin.from('calendar_events').delete().is('user_id', null).eq('source', source);
  if (delErr) throw new Error(`일정 정리 실패: ${delErr.message}`);
  if (events.length === 0) return 0;
  const payload = events.map((e) => ({
    user_id: null,
    type: e.type,
    title: e.title,
    event_date: e.eventDate,
    stock_id: e.stockId ?? null,
    confirmed: e.confirmed,
    source,
  }));
  const { error } = await admin.from('calendar_events').insert(payload);
  if (error) throw new Error(`일정 저장 실패: ${error.message}`);
  return payload.length;
}
