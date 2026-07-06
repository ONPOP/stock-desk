'use client';

// 전역 우상단 플로팅 툴 — 계산기 + 실시간 메모 FAB. 탭 제목과 같은 열(우상단)에 배치.
// 바깥 화면 클릭 시 열린 패널을 닫는다.
import { useEffect, useRef, useState } from 'react';
import { Calculator, StickyNote, X } from 'lucide-react';
import { CalculatorPanel } from '@/components/calculator/calculator-panel';
import { MemoPanel } from '@/components/memo/memo-panel';

type Panel = 'calc' | 'memo' | null;

export function FloatingTools() {
  const [open, setOpen] = useState<Panel>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggle = (p: Panel) => setOpen((cur) => (cur === p ? null : p));

  return (
    <div ref={rootRef} className="fixed top-3.5 right-4 z-50 flex flex-col items-end gap-3 lg:right-6 lg:top-4">
      <div className="flex gap-2">
        <Fab
          active={open === 'memo'}
          onClick={() => toggle('memo')}
          label={open === 'memo' ? '메모 닫기' : '메모 열기'}
          className="bg-ink text-ink-foreground shadow-[0_10px_30px_-6px_rgba(0,0,0,.45)]"
        >
          {open === 'memo' ? <X className="size-5" /> : <StickyNote className="size-5" />}
        </Fab>
        <Fab
          active={open === 'calc'}
          onClick={() => toggle('calc')}
          label={open === 'calc' ? '계산기 닫기' : '계산기 열기'}
          className="bg-[#d97757] text-white shadow-[0_10px_30px_-6px_rgba(217,119,87,.6)]"
        >
          {open === 'calc' ? <X className="size-5" /> : <Calculator className="size-5" />}
        </Fab>
      </div>
      {open === 'calc' && <CalculatorPanel />}
      {open === 'memo' && <MemoPanel />}
    </div>
  );
}

function Fab({
  active, onClick, label, className, children,
}: {
  active: boolean; onClick: () => void; label: string; className: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={active}
      className={`flex size-11 items-center justify-center rounded-full transition hover:brightness-110 active:scale-95 ${className}`}
    >
      {children}
    </button>
  );
}
