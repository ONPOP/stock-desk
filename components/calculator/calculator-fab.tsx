'use client';

// 전역 floating 계산기 — 우하단 FAB로 계산기 패널을 토글. 모든 페이지(로그인 제외)에서 사용.
// 모바일은 하단 탭 위로 띄운다(lg에서 위치 조정).
import { useState } from 'react';
import { Calculator, X } from 'lucide-react';
import { CalculatorPanel } from './calculator-panel';

export function CalculatorFab() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <div className="fixed right-4 bottom-[152px] z-50 lg:right-6 lg:bottom-[88px]">
          <CalculatorPanel />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? '계산기 닫기' : '계산기 열기'}
        aria-expanded={open}
        className="fixed right-4 bottom-[88px] z-50 flex size-14 items-center justify-center rounded-full bg-[#d97757] text-white shadow-[0_10px_30px_-6px_rgba(217,119,87,.6)] transition hover:brightness-110 active:scale-95 lg:right-6 lg:bottom-6"
      >
        {open ? <X className="size-6" /> : <Calculator className="size-6" />}
      </button>
    </>
  );
}
