'use client';

// 나만의 투자 규칙 (D21) — 대시보드 상단 고정. 번호 목록 + 추가·수정·삭제·순서 변경.
import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Check, ListChecks, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { InvestmentRule } from '@/types';

async function call(method: string, body?: unknown, query = ''): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(`/api/rules${query}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast.error((data.error as string) ?? '저장에 실패했습니다.');
    return { ok: res.ok, data };
  } catch {
    toast.error('네트워크 오류로 저장하지 못했습니다.');
    return { ok: false, data: {} };
  }
}

export function RulesCard({ initialRules }: { initialRules: InvestmentRule[] }) {
  const [rules, setRules] = useState(initialRules);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    const content = draft.trim();
    if (!content) return;
    setBusy(true);
    const { ok, data } = await call('POST', { content });
    setBusy(false);
    if (!ok) return;
    setRules((r) => [...r, data.rule as InvestmentRule]);
    setDraft('');
  }

  async function saveEdit() {
    if (!editId) return;
    const content = editText.trim();
    if (!content) return;
    setBusy(true);
    const { ok, data } = await call('PATCH', { id: editId, content });
    setBusy(false);
    if (!ok) return;
    setRules((r) => r.map((x) => (x.id === editId ? (data.rule as InvestmentRule) : x)));
    setEditId(null);
  }

  async function remove(id: string) {
    const prev = rules;
    setRules((r) => r.filter((x) => x.id !== id));
    const { ok } = await call('DELETE', undefined, `?id=${encodeURIComponent(id)}`);
    if (!ok) setRules(prev);
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= rules.length) return;
    const prev = rules;
    const next = [...rules];
    [next[index], next[target]] = [next[target], next[index]];
    setRules(next);
    const { ok } = await call('PUT', { ids: next.map((r) => r.id) });
    if (!ok) setRules(prev);
  }

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <ListChecks className="size-4" />
        </span>
        <h3 className="font-semibold">나만의 투자 규칙</h3>
        <Button
          size="sm"
          variant={editing ? 'secondary' : 'ghost'}
          className="ml-auto h-7 text-xs"
          onClick={() => {
            setEditing((v) => !v);
            setEditId(null);
          }}
        >
          {editing ? '완료' : '편집'}
        </Button>
      </div>

      {rules.length === 0 && !editing ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-xl border border-dashed py-6 text-sm text-muted-foreground hover:bg-muted/50"
        >
          매일 지킬 투자 규칙을 추가해 보세요
        </button>
      ) : (
        <ol className="space-y-1">
          {rules.map((r, i) => (
            <li key={r.id} className="flex items-start gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-muted/40">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary tabular-nums">
                {i + 1}
              </span>
              {editId === r.id ? (
                <form
                  className="flex flex-1 items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveEdit();
                  }}
                >
                  <Input value={editText} onChange={(e) => setEditText(e.target.value)} maxLength={300} autoFocus className="h-8" />
                  <Button type="submit" size="icon-xs" variant="ghost" aria-label="저장" disabled={busy}>
                    <Check />
                  </Button>
                  <Button type="button" size="icon-xs" variant="ghost" aria-label="취소" onClick={() => setEditId(null)}>
                    <X />
                  </Button>
                </form>
              ) : (
                <>
                  <span className="flex-1 text-sm leading-relaxed break-words whitespace-pre-wrap">{r.content}</span>
                  {editing && (
                    <span className="flex shrink-0 items-center">
                      <Button size="icon-xs" variant="ghost" aria-label="위로" disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUp />
                      </Button>
                      <Button size="icon-xs" variant="ghost" aria-label="아래로" disabled={i === rules.length - 1} onClick={() => move(i, 1)}>
                        <ArrowDown />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label="수정"
                        onClick={() => {
                          setEditId(r.id);
                          setEditText(r.content);
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button size="icon-xs" variant="ghost" className="text-muted-foreground" aria-label="삭제" onClick={() => remove(r.id)}>
                        <Trash2 />
                      </Button>
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      {editing && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="예: 손절 -3%는 무조건 지킨다"
            maxLength={300}
            className="h-9"
          />
          <Button type="submit" size="sm" disabled={busy || !draft.trim()}>
            <Plus data-icon="inline-start" />
            추가
          </Button>
        </form>
      )}
    </Card>
  );
}
