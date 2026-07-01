'use client';

// F13 투자 노트 — 작성 폼 + 검색(전역) + 최신순 타임라인 + 삭제. 마크다운 지원.
// 전역(stockId 미지정) / 종목별(stockId 지정) 양쪽 재사용.
// [재설계] 작성 박스(아이템 폭 100%)·검색·노트 카드 비주얼. [보존] add/remove/search fetch·낙관적 업데이트·ReactMarkdown·props.
import { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { Search, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Note } from '@/types';

const NO_STOCK = '__none__';

export function NotesClient({ initialNotes, stockId }: { initialNotes: Note[]; stockId?: string }) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [content, setContent] = useState('');
  const [q, setQ] = useState('');
  const [stockFilter, setStockFilter] = useState<string>('all');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // 탭 진입(마운트) 시 최신 노트를 다시 불러온다 — 다른 화면에서 추가한 노트가
  // 라우터 캐시로 인해 안 보이는 문제 방지. 전역 모드에서만.
  useEffect(() => {
    if (stockId) return;
    fetch('/api/notes')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data?.notes && setNotes(data.notes))
      .catch(() => {});
  }, [stockId]);

  // 종목 필터 옵션 — 로드된 노트에서 중복 없는 종목 추출(개수 포함)
  const stockOptions = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const n of notes) {
      const key = n.stockId ?? NO_STOCK;
      const label = n.stockId ? (n.stockName ?? n.stockTicker ?? n.stockId) : '종목 없음';
      const cur = map.get(key);
      if (cur) cur.count += 1;
      else map.set(key, { label, count: 1 });
    }
    return [...map.entries()].map(([value, v]) => ({ value, ...v }));
  }, [notes]);

  // 선택된 종목으로 클라이언트 필터 (텍스트 검색 결과와 조합)
  const visibleNotes = useMemo(() => {
    if (stockFilter === 'all') return notes;
    if (stockFilter === NO_STOCK) return notes.filter((n) => !n.stockId);
    return notes.filter((n) => n.stockId === stockFilter);
  }, [notes, stockFilter]);

  function startEdit(n: Note) {
    setEditingId(n.id);
    setEditText(n.contentMd);
  }

  async function saveEdit(id: string) {
    const text = editText.trim();
    if (!text) {
      toast.error('내용을 입력해주세요.');
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/notes?id=${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content_md: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? '수정에 실패했습니다.');
        return;
      }
      setNotes((prev) => prev.map((x) => (x.id === id ? data.note : x)));
      setEditingId(null);
      toast.success('노트를 수정했습니다.');
    } catch {
      toast.error('네트워크 오류로 수정하지 못했습니다.');
    } finally {
      setSavingEdit(false);
    }
  }

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
      {/* 작성 박스 — 아이템(카드) 폭을 꽉 채움 */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <textarea
          className="block min-h-24 w-full resize-y rounded-xl border bg-transparent p-3 text-sm leading-relaxed outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          placeholder="투자 메모를 입력하세요. (마크다운 지원)"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={5000}
        />
        <div className="mt-3 flex justify-end">
          <Button onClick={add} size="sm" disabled={busy}>
            <Plus data-icon="inline-start" /> {busy ? '저장 중…' : '노트 추가'}
          </Button>
        </div>
      </div>

      {!stockId && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 rounded-xl pl-9"
              placeholder="노트 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
            />
          </div>
          <select
            aria-label="종목 필터"
            className="h-10 rounded-xl border bg-transparent px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-56"
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
          >
            <option value="all">전체 종목 ({notes.length})</option>
            {stockOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} ({o.count})
              </option>
            ))}
          </select>
        </div>
      )}

      {visibleNotes.length === 0 ? (
        <p className="text-sm text-muted-foreground">노트가 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {visibleNotes.map((n) => (
            <li key={n.id} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {!stockId && n.stockTicker && (
                    <Badge variant="outline" className="border-0 bg-accent text-[10px] text-accent-foreground">
                      {n.stockName ?? n.stockTicker}
                    </Badge>
                  )}
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString('ko-KR')}
                  </span>
                </div>
                {editingId !== n.id && (
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => startEdit(n)}
                      className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(n.id)}
                      className="text-[11px] text-muted-foreground transition-colors hover:text-up"
                    >
                      삭제
                    </button>
                  </div>
                )}
              </div>
              {editingId === n.id ? (
                <div className="space-y-2">
                  <textarea
                    className="block min-h-24 w-full resize-y rounded-xl border bg-transparent p-3 text-sm leading-relaxed outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    maxLength={5000}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={savingEdit}>
                      취소
                    </Button>
                    <Button size="sm" onClick={() => saveEdit(n.id)} disabled={savingEdit}>
                      {savingEdit ? '저장 중…' : '저장'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-sm leading-relaxed text-foreground/90 [&_p]:mb-1 [&_ul]:list-disc [&_ul]:pl-5">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{n.contentMd}</ReactMarkdown>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
