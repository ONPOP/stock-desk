'use client';

// 일반 계산기 패널 — 첨부 디자인(다크 브라운) 재현. 로직은 calculator-logic(테스트 분리).
import { useEffect, useReducer } from 'react';
import { cn } from '@/lib/utils';
import { reducer, group, toAction, INITIAL } from './calculator-logic';

const KEYS: { a: string; label: string; kind: 'num' | 'fn' | 'op' | 'eq'; wide?: boolean }[] = [
  { a: 'clear', label: 'AC', kind: 'fn' },
  { a: 'sign', label: '±', kind: 'fn' },
  { a: 'pct', label: '%', kind: 'fn' },
  { a: 'div', label: '÷', kind: 'op' },
  { a: '7', label: '7', kind: 'num' },
  { a: '8', label: '8', kind: 'num' },
  { a: '9', label: '9', kind: 'num' },
  { a: 'mul', label: '×', kind: 'op' },
  { a: '4', label: '4', kind: 'num' },
  { a: '5', label: '5', kind: 'num' },
  { a: '6', label: '6', kind: 'num' },
  { a: 'sub', label: '−', kind: 'op' },
  { a: '1', label: '1', kind: 'num' },
  { a: '2', label: '2', kind: 'num' },
  { a: '3', label: '3', kind: 'num' },
  { a: 'add', label: '+', kind: 'op' },
  { a: '0', label: '0', kind: 'num', wide: true },
  { a: 'dot', label: '.', kind: 'num' },
  { a: 'eq', label: '=', kind: 'eq' },
];

const KIND_CLS: Record<string, string> = {
  num: 'bg-[#261e19] text-[#f2ebe3] hover:bg-[#2f2620]',
  fn: 'bg-[#39302a] text-[#ecc6ae] hover:bg-[#453a32]',
  op: 'bg-[#d97757] text-white shadow-[0_6px_22px_-4px_rgba(217,119,87,.5)] hover:brightness-110',
  eq: 'bg-gradient-to-b from-[#e8835f] to-[#d36a48] text-white shadow-[0_8px_26px_-4px_rgba(217,119,87,.65)] hover:brightness-110',
};

export function CalculatorPanel() {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const display = state.error ? 'Error' : group(state.current);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = e.key;
      let a: string | null = null;
      if (/^[0-9]$/.test(k)) a = k;
      else if (k === '.') a = 'dot';
      else if (k === '+') a = 'add';
      else if (k === '-') a = 'sub';
      else if (k === '*') a = 'mul';
      else if (k === '/') {
        a = 'div';
        e.preventDefault();
      } else if (k === 'Enter' || k === '=') {
        a = 'eq';
        e.preventDefault();
      } else if (k === 'Backspace') {
        dispatch({ type: 'back' });
        return;
      } else if (k === 'Escape' || k.toLowerCase() === 'c') a = 'clear';
      else if (k === '%') a = 'pct';
      if (a) dispatch(toAction(a));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className="flex w-[320px] flex-col gap-3.5 rounded-[26px] border border-[rgba(240,200,170,.09)] bg-gradient-to-b from-[#1a1411] to-[#15100d] p-[18px] shadow-[0_34px_70px_-24px_rgba(0,0,0,.8),0_0_90px_-34px_rgba(217,119,87,.4)]"
      style={{ fontFamily: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif" }}
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold tracking-[2.5px] text-[#7c6f64] uppercase">Calculator</span>
        <button
          type="button"
          onClick={() => dispatch({ type: 'clearHistory' })}
          className="text-[10px] font-semibold tracking-[1.5px] text-[#6b5f55] uppercase transition-colors hover:text-[#d97757]"
        >
          Clear log
        </button>
      </div>

      <div className="flex max-h-[104px] flex-col gap-1 overflow-y-auto rounded-[16px] border border-[rgba(240,200,170,.05)] bg-[rgba(10,7,6,.55)] p-2.5">
        {state.history.length === 0 ? (
          <span className="py-3 text-center text-[12px] text-[#5e544b]">No calculations yet</span>
        ) : (
          state.history.map((h, i) => (
            <button
              key={`${i}-${h.result}`}
              type="button"
              onClick={() => dispatch({ type: 'pickHistory', result: h.result })}
              className="flex w-full flex-col items-end rounded-[10px] px-1 py-1 text-right transition-colors hover:bg-[rgba(217,119,87,.08)]"
            >
              <span className="text-[12px] text-[#83766b]">{h.expr}</span>
              <span className="text-[15px] font-semibold tabular-nums text-[#dca088]">{h.result}</span>
            </button>
          ))
        )}
      </div>

      <div className="flex flex-col items-end gap-1.5 rounded-[20px] border border-[rgba(240,200,170,.06)] bg-gradient-to-b from-[#100c0a] to-[#0c0807] px-5 pt-4 pb-5 shadow-[inset_0_2px_10px_rgba(0,0,0,.5)]">
        <div className="min-h-[18px] text-[14px] tabular-nums text-[#8a7d72]">{state.expr}</div>
        <div className="max-w-full overflow-hidden text-ellipsis text-[48px] leading-none font-semibold tabular-nums text-[#f7f1ea]">
          {display}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2.5">
        {KEYS.map((k) => (
          <button
            key={k.a}
            type="button"
            onClick={() => dispatch(toAction(k.a))}
            className={cn(
              'flex h-[56px] items-center justify-center rounded-[18px] text-[22px] font-semibold tabular-nums transition-[transform,background,filter] duration-100 select-none active:scale-[.92]',
              KIND_CLS[k.kind],
              k.wide && 'col-span-2',
            )}
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}
