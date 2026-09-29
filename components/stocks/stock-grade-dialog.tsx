'use client';

// 종목 등급 지정 모달 — A~D 선택 + 한 줄 사유. 저장 실패 시 닫지 않아 재시도할 수 있다.
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { dateInTz } from '@/lib/utils/date';
import { STOCK_GRADES } from '@/lib/utils/stock-grade';
import type { StockGrade, UserStockGrade } from '@/types';
import { GRADE_TONE } from './grade-style';

export interface GradeTarget {
  stockId: string;
  name: string;
  current: UserStockGrade | null;
}

interface StockGradeDialogProps {
  target: GradeTarget | null;
  onClose: () => void;
  onSave: (stockId: string, grade: StockGrade, reason: string | null) => Promise<void>;
  onClear: (stockId: string) => Promise<void>;
}

const REASON_MAX = 100;

export function StockGradeDialog({ target, onClose, onSave, onClear }: StockGradeDialogProps) {
  const [grade, setGrade] = useState<StockGrade | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  // 중복 제출 차단 — busy(state)는 리렌더 후에야 버튼을 disable하므로 그 사이의 두 번째 클릭을 막는다.
  const submittingRef = useRef(false);

  useEffect(() => {
    setGrade(target?.current?.grade ?? null);
    setReason(target?.current?.reason ?? '');
    setBusy(false);
    submittingRef.current = false;
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, onClose]);

  if (!target) return null;
  const t = target;

  async function run(action: () => Promise<void>) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      await action();
      onClose();
    } catch {
      // 토스트는 매니저가 띄운다 — 모달을 유지해 재시도하게 둔다
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-grade-title"
        className="w-full max-w-sm space-y-4 rounded-xl bg-background p-5 shadow-lg ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 id="stock-grade-title" className="text-base font-semibold">
            {t.name} 등급
          </h2>
          {t.current && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {dateInTz(t.current.gradedAt, 'Asia/Seoul')} 지정
            </p>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="등급 선택">
          {STOCK_GRADES.map((g) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={grade === g}
              onClick={() => setGrade(g)}
              className={cn(
                'rounded-lg py-2 text-lg font-bold ring-1 transition-colors',
                grade === g ? GRADE_TONE[g] : 'text-muted-foreground ring-border hover:bg-muted',
              )}
            >
              {g}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">A가 투자성이 가장 높은 등급입니다.</p>

        <div className="space-y-1.5">
          <Label htmlFor="stock-grade-reason">한 줄 사유 (선택)</Label>
          <Input
            id="stock-grade-reason"
            value={reason}
            maxLength={REASON_MAX}
            placeholder="예: 2분기 실적 서프라이즈, 수주 잔고 증가"
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="text-right text-xs text-muted-foreground tabular-nums">
            {reason.length}/{REASON_MAX}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2">
          {t.current ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => onClear(t.stockId))}>
              등급 해제
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
              취소
            </Button>
            <Button
              size="sm"
              disabled={busy || grade === null}
              onClick={() => grade && run(() => onSave(t.stockId, grade, reason.trim() || null))}
            >
              저장
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
