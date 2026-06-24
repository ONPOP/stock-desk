'use client';

// 탭 생성/이름변경/삭제 모달 — UI 프리미티브가 없어 경량 오버레이로 직접 구현(Esc·배경 클릭 닫기).
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type DialogMode =
  | { kind: 'create' }
  | { kind: 'rename'; id: string; initialName: string }
  | { kind: 'delete'; id: string; name: string };

type NameMode = Extract<DialogMode, { kind: 'create' | 'rename' }>;

interface WatchlistDialogProps {
  mode: DialogMode | null;
  onClose: () => void;
  onSaveName: (name: string, mode: NameMode) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function WatchlistDialog({ mode, onClose, onSaveName, onDelete }: WatchlistDialogProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  // 중복 제출 차단 — busy(state)는 리렌더 후에야 버튼을 disable하므로, 그 사이의 두 번째 클릭/Enter를 막는다.
  const submittingRef = useRef(false);

  useEffect(() => {
    setBusy(false);
    submittingRef.current = false;
    if (mode?.kind === 'rename') setName(mode.initialName);
    else if (mode?.kind === 'create') setName('');
  }, [mode]);

  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, onClose]);

  if (!mode) return null;
  const m = mode; // null 가드 후 캡처 — 클로저 내 내로잉 유지

  const isForm = m.kind === 'create' || m.kind === 'rename';
  const title = m.kind === 'create' ? '관심목록 추가' : m.kind === 'rename' ? '이름 변경' : '관심목록 삭제';

  async function handleSave() {
    if (m.kind !== 'create' && m.kind !== 'rename') return;
    const trimmed = name.trim();
    if (!trimmed || submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      await onSaveName(trimmed, m as NameMode);
      onClose();
    } catch {
      setBusy(false); // 실패 시 모달 유지(에러 토스트는 호출부에서 표시)
    } finally {
      submittingRef.current = false;
    }
  }

  async function handleDelete() {
    if (m.kind !== 'delete' || submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      await onDelete(m.id);
      onClose();
    } catch {
      setBusy(false);
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl">
        <h2 className="text-lg font-semibold">{title}</h2>

        {isForm ? (
          <div className="mt-4 space-y-2">
            <Label htmlFor="wl-name">이름</Label>
            <Input
              id="wl-name"
              autoFocus
              value={name}
              maxLength={30}
              placeholder="예: 반도체, 배당주, 단타"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave();
              }}
            />
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{m.kind === 'delete' ? m.name : ''}</span> 탭과 등록된 종목이
            모두 삭제됩니다. 계속할까요?
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            취소
          </Button>
          {isForm ? (
            <Button onClick={() => void handleSave()} disabled={busy || !name.trim()}>
              {busy ? '저장 중…' : '저장'}
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={busy}>
              {busy ? '삭제 중…' : '삭제'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
