'use client';

// F13 투자 노트 — 작성 폼 + 검색(전역) + 최신순 타임라인 + 삭제. 마크다운 지원.
// 전역(stockId 미지정) / 종목별(stockId 지정) 양쪽 재사용.
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Note } from '@/types';

export function NotesClient({ initialNotes, stockId }: { initialNotes: Note[]; stockId?: string }) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [content, setContent] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    const text = content.trim();
    if (!text) {
      toast.error('내용을 입력해주세요.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content_md: text, stock_id: stockId ?? null }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? '저장에 실패했습니다.');
        return;
      }
      setNotes((prev) => [data.note, ...prev]);
      setContent('');
      toast.success('노트를 저장했습니다.');
    } catch {
      toast.error('네트워크 오류로 저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const prev = notes;
    setNotes((n) => n.filter((x) => x.id !== id)); // 낙관적
    try {
      const res = await fetch(`/api/notes?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setNotes(prev);
        toast.error('삭제에 실패했습니다.');
      }
    } catch {
      setNotes(prev);
      toast.error('네트워크 오류로 삭제하지 못했습니다.');
    }
  }

  async function search() {
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/notes?${params.toString()}`);
      const data = await res.json();
      if (res.ok) setNotes(data.notes ?? []);
    } catch {
      toast.error('검색에 실패했습니다.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <textarea
          className="min-h-20 w-full resize-y rounded-md border bg-transparent p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          placeholder="투자 메모를 입력하세요. (마크다운 지원)"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={5000}
        />
        <div className="flex justify-end">
          <Button onClick={add} size="sm" disabled={busy}>
            {busy ? '저장 중…' : '노트 추가'}
          </Button>
        </div>
      </div>

      {!stockId && (
        <div className="flex gap-2">
          <Input
            placeholder="노트 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
          />
          <Button onClick={search} variant="outline" size="sm">
            검색
          </Button>
        </div>
      )}

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">노트가 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md border p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {!stockId && n.stockTicker && (
                    <Badge variant="secondary" className="text-[10px]">
                      {n.stockName ?? n.stockTicker}
                    </Badge>
                  )}
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString('ko-KR')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  className="text-[11px] text-muted-foreground hover:text-red-500"
                >
                  삭제
                </button>
              </div>
              <div className="text-sm leading-relaxed [&_p]:mb-1 [&_ul]:list-disc [&_ul]:pl-5">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{n.contentMd}</ReactMarkdown>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
