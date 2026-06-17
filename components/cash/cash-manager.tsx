'use client';

// 예수금 관리 패널 (V2 · D11) — 입금/출금 기록 추가·삭제. 대시보드 자산현황에서 토글 표시.
// 금액 입력은 표시 단위(원/달러) → 최소 단위 변환 후 /api/cash POST. 변경 시 onChange로 상위에 전파.
import { useState } from 'react';
import Decimal from 'decimal.js';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMoney } from '@/lib/utils/money';
import type { CashTransaction, CashTxType, Currency } from '@/types';

const NUM = /^\d+(\.\d+)?$/;
const todayLocal = () => new Date().toLocaleDateString('en-CA');

function toMinor(raw: string, currency: Currency): number | null {
  if (!NUM.test(raw.trim())) return null;
  const factor = currency === 'USD' ? 100 : 1;
  const v = new Decimal(raw.trim()).mul(factor).toDecimalPlaces(0).toNumber();
  return v > 0 ? v : null;
}

export function CashManager({
  initialTxs,
  onChange,
}: {
  initialTxs: CashTransaction[];
  onChange?: (txs: CashTransaction[]) => void;
}) {
  const [txs, setTxs] = useState<CashTransaction[]>(initialTxs);
  const [currency, setCurrency] = useState<Currency>('KRW');
  const [type, setType] = useState<CashTxType>('deposit');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayLocal);
  const [submitting, setSubmitting] = useState(false);

  function sync(next: CashTransaction[]) {
    setTxs(next);
    onChange?.(next);
  }

  async function add() {
    const amountMinor = toMinor(amount, currency);
    if (amountMinor == null) {
      toast.error('금액을 올바르게 입력하세요.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency, type, amount: amountMinor, txDate: date }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? '저장에 실패했습니다.');
        return;
      }
      sync([data.tx as CashTransaction, ...txs]);
      setAmount('');
      toast.success(type === 'deposit' ? '입금을 기록했습니다.' : '출금을 기록했습니다.');
    } catch {
      toast.error('네트워크 오류로 저장하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    const prev = txs;
    sync(txs.filter((t) => t.id !== id)); // 낙관적 삭제
    try {
      const res = await fetch(`/api/cash?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        sync(prev);
        toast.error('삭제에 실패했습니다.');
      }
    } catch {
      sync(prev);
      toast.error('네트워크 오류로 삭제하지 못했습니다.');
    }
  }

  const unit = currency === 'USD' ? '$' : '₩';

  return (
    <div className="space-y-3 rounded-xl border bg-secondary/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* 통화 토글 */}
        <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-[3px]">
          {(['KRW', 'USD'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                currency === c ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        {/* 입금/출금 토글 */}
        <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-[3px]">
          {(
            [
              ['deposit', '입금'],
              ['withdraw', '출금'],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                type === t
                  ? `${t === 'deposit' ? 'bg-up-soft text-up' : 'bg-down-soft text-down'} shadow-sm`
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="c-amount">금액 ({unit})</Label>
          <Input
            id="c-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={currency === 'USD' ? '예: 1000' : '예: 1000000'}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-date">날짜</Label>
          <Input id="c-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <Button onClick={add} disabled={submitting} size="sm" className="w-full sm:w-auto">
        <Plus data-icon="inline-start" />
        {submitting ? '저장 중…' : type === 'deposit' ? '입금 기록' : '출금 기록'}
      </Button>

      {txs.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">입출금 내역 {txs.length}건</p>
          <div className="max-h-56 divide-y divide-border/60 overflow-y-auto">
            {txs.map((t) => (
              <div key={t.id} className="flex items-center gap-3 py-2">
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                    t.type === 'deposit' ? 'bg-up-soft text-up' : 'bg-down-soft text-down'
                  }`}
                >
                  {t.type === 'deposit' ? '입금' : '출금'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium tabular-nums">{formatMoney(t.amount, t.currency)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t.txDate}
                    {t.memo ? ` · ${t.memo}` : ''}
                  </div>
                </div>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="text-muted-foreground"
                  aria-label="내역 삭제"
                  onClick={() => remove(t.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
