'use client';

// 새 시즌 시작 다이얼로그 — 목표 기간(선택) + KRW/USD 초기 현금 설정.
// 시작 시 현재 시즌이 종료·초기화되므로 빨간색 경고를 강조한다. 기간은 표시·기록용.
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface NewSeasonValues {
  seedKrw: number; // 원
  seedUsd: number; // 달러
  startDate: string; // "" 가능
  endDate: string; // "" 가능
}

export function NewSeasonDialog({
  defaultKrw,
  defaultUsd,
  busy,
  onClose,
  onSubmit,
}: {
  defaultKrw: number;
  defaultUsd: number;
  busy: boolean;
  onClose: () => void;
  onSubmit: (v: NewSeasonValues) => void;
}) {
  const [krw, setKrw] = useState(String(defaultKrw));
  const [usd, setUsd] = useState(String(defaultUsd));
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const krwNum = Number(krw);
  const usdNum = Number(usd);
  const valid =
    Number.isFinite(krwNum) && krwNum > 0 && Number.isFinite(usdNum) && usdNum > 0 && (!start || !end || start <= end);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <Card className="w-full max-w-md gap-4 p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">새 시즌 시작</h3>
        <p className="rounded-lg bg-red-500/10 px-3 py-2.5 text-[13px] font-medium text-red-600">
          ⚠️ 새 시즌이 빈 상태로 시작되고 현재 시즌은 종료됩니다. 지난 시즌 기록은 <strong className="font-bold">삭제되지 않고 보관</strong>되어
          아래 ‘지난 시즌’에서 다시 볼 수 있지만, 이전 시즌으로 되돌아갈 수는 없습니다.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">시작일 (선택)</span>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">종료일 (선택)</span>
            <Input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">KRW 초기 현금 (원)</span>
            <Input type="number" value={krw} min={1} onChange={(e) => setKrw(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">USD 초기 현금 ($)</span>
            <Input type="number" value={usd} min={1} step="any" onChange={(e) => setUsd(e.target.value)} />
          </label>
        </div>

        <div className="mt-1 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button
            onClick={() => onSubmit({ seedKrw: Math.round(krwNum), seedUsd: usdNum, startDate: start, endDate: end })}
            disabled={busy || !valid}
            className="border-0 bg-down text-white hover:bg-down/90"
          >
            기존 시즌 종료 &amp; 새 시즌 시작
          </Button>
        </div>
      </Card>
    </div>
  );
}
