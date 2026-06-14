// F13 투자 노트 — 전역 노트 페이지 (전체 목록·검색·작성).
import { requireUser } from '@/lib/supabase/server';
import { listNotes } from '@/lib/supabase/queries/notes';
import { NotesClient } from '@/components/notes/notes-client';

export default async function NotesPage() {
  const { supabase, user } = await requireUser();
  const notes = await listNotes(supabase, user.id, { limit: 100 });

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">투자 노트</h1>
      <NotesClient initialNotes={notes} />
    </div>
  );
}
