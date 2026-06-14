'use client';

// 손익 계산기 (F8) — 현재가 자동 입력(시세 폴링), 목표수익률↔목표가 양방향, 현재가 갱신 시 자동 재계산.
// [재설계] 입력/결과 비주얼만. [보존] Props·Decimal·targetPriceForReturn·useMemo 계산·손익 색(빨강/파랑).
import { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMoney, targetPriceForReturn } from '@/lib/utils/money';
import type { Currency } from '@/types';

interface ProfitCalculatorProps {
  priceMinor: number | null;
  currency: Currency;
}

type Mode = 'return-to-price' | 'price-to-return';

const NUM = /^-?\d+(\.\d+)?$/;

export function ProfitCalculator({ priceMinor, currency }: ProfitCalculatorProps) {
  const [mode, setMode] = useState<Mode>('return-to-price');
  const [qty, setQty] = useState('10');
  const [targetReturn, setTargetReturn] = useState('10');
  const [targetPriceInput, setTargetPriceInput] = useState('');

  const result = useMemo(() => {
    if (priceMinor == null) return null;
    const q = Number(qty);
    if (!Number.isInteger(q) || q <= 0) return null;

    let targetMinor: number;
    let computedReturn: string;

    if (mode === 'return-to-price') {
      if (!NUM.test(targetReturn.trim())) return null;
      targetMinor = targetPriceForReturn(targetReturn.trim(), priceMinor);
      computedReturn = targetReturn.trim();
    } else {
      if (!NUM.test(targetPriceInput.trim())) return null;
      const factor = currency === 'USD' ? 100 : 1;
      targetMinor = new Decimal(targetPriceInput.trim()).mul(factor).toDecimalPlaces(0).toNumber();
      if (targetMinor <= 0) return null;
      computedReturn = new Decimal(targetMinor).minus(priceMinor).div(priceMinor).mul(100).toFixed(2);
    }

    const currentValue = priceMinor * q;
    const targetValue = targetMinor * q;
    const pnl = targetValue - currentValue;
    return { targetMinor, computedReturn, currentValue, targetValue, pnl };
  }, [priceMinor, qty, targetReturn, targetPriceInput, mode, currency]);

  const pnlColor = result ? (result.pnl > 0 ? 'text-up' : result.pnl < 0 ? 'text-down' : '') : '';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">현재가</span>
        <span className="font-semibold tabular-nums">
          {priceMinor != null ? formatMoney(priceMinor, currency) : '—'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-[3px]">
        {(
          [
            ['return-to-price', '수익률 → 목표가'],
            ['price-to-return', '목표가 → 수익률'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
              mode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="calc-qty">보유 수량</Label>
          <Input id="calc-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        {mode === 'return-to-price' ? (
          <div className="space-y-1.5">
            <Label htmlFor="calc-return">목표 수익률 (%)</Label>
            <Input
              id="calc-return"
              inputMode="decimal"
              value={targetReturn}
              onChange={(e) => setTargetReturn(e.target.value)}
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="calc-price">목표가</Label>
            <Input
              id="calc-price"
              inputMode="decimal"
              placeholder={currency === 'USD' ? '예: 200' : '예: 80000'}
              value={targetPriceInput}
              onChange={(e) => setTargetPriceInput(e.target.value)}
            />
          </div>
        )}
      </div>

      {result ? (
        <dl className="space-y-2 rounded-xl border bg-secondary/50 p-3.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{mode === 'return-to-price' ? '목표 주가' : '예상 수익률'}</dt>
            <dd className="font-medium tabular-nums">
              {mode === 'return-to-price'
                ? formatMoney(result.targetMinor, currency)
                : `${result.computedReturn}%`}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">현재 평가금액</dt>
            <dd className="tabular-nums">{formatMoney(result.currentValue, currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">도달 시 평가금액</dt>
            <dd className="tabular-nums">{formatMoney(result.targetValue, currency)}</dd>
          </div>
          <div className="flex justify-between border-t pt-2.5">
            <dt className="text-muted-foreground">손익</dt>
            <dd className={`font-semibold tabular-nums ${pnlColor}`}>
              {result.pnl > 0 ? '+' : ''}
              {formatMoney(result.pnl, currency)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">
          {priceMinor == null ? '현재가를 불러오는 중입니다.' : '수량과 목표값을 올바르게 입력하세요.'}
        </p>
      )}
    </div>
  );
}
