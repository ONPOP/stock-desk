// F13 투자 노트 DB 쿼리 — notes. 본인 행만(RLS user_id=auth.uid()).
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Note } from '@/types';
import type { NoteCreate } from '@/lib/validation/note';

interface NoteRow {
  id: string;
  stock_id: string | null;
  content_md: string;
  attached_analysis_id: string | null;
  attached_trade_id: string | null;
  created_at: string;
  stocks: { ticker: string; name_kr: string | null; name_en: string | null } | null;
}

const NOTE_COLS =
  'id, stock_id, content_md, attached_analysis_id, attached_trade_id, created_at, stocks(ticker, name_kr, name_en)';

function rowToNote(r: NoteRow): Note {
  return {
    id: r.id,
    stockId: r.stock_id,
    stockName: r.stocks?.name_kr ?? r.stocks?.name_en ?? null,
    stockTicker: r.stocks?.ticker ?? null,
    contentMd: r.content_md,
    attachedAnalysisId: r.attached_analysis_id,
    attachedTradeId: r.attached_trade_id,
    createdAt: r.created_at,
  };
}

/** 전역 목록 — 검색(content_md ilike)·종목 필터, 최신순 */
export async function listNotes(
  db: SupabaseClient,
  userId: string,
  opts?: { q?: string; stockId?: string; limit?: number },
): Promise<Note[]> {
  let query = db.from('notes').select(NOTE_COLS).eq('user_id', userId);
  if (opts?.stockId) query = query.eq('stock_id', opts.stockId);
  if (opts?.q) query = query.ilike('content_md', `%${opts.q}%`);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(opts?.limit ?? 100);
  if (error) throw new Error(`노트 조회 실패: ${error.message}`);
  return (data ?? []).map((r) => rowToNote(r as unknown as NoteRow));
}

export async function createNote(db: SupabaseClient, userId: string, input: NoteCreate): Promise<Note> {
  const { data, error } = await db
    .from('notes')
    .insert({
      user_id: userId,
      content_md: input.content_md,
      stock_id: input.stock_id ?? null,
      attached_analysis_id: input.attached_analysis_id ?? null,
      attached_trade_id: input.attached_trade_id ?? null,
    })
    .select(NOTE_COLS)
    .single();
  if (error) throw new Error(`노트 저장 실패: ${error.message}`);
  return rowToNote(data as unknown as NoteRow);
}

export async function deleteNote(db: SupabaseClient, userId: string, noteId: string): Promise<void> {
  const { error } = await db.from('notes').delete().eq('user_id', userId).eq('id', noteId);
  if (error) throw new Error(`노트 삭제 실패: ${error.message}`);
}
