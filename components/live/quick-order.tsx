'use client';

// 빠른 주문 (D15) — 모의투자(paper) 시장가 주문. 레퍼런스 UI의 매수/매도 버튼.
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { WatchlistItem } from '@/types';

export function QuickOrder({ item }: { item: WatchlistItem }) {
  const [qty, setQty] = useState('1');
  const [pending, setPending] = useState(false);

  const order = async (side: 'buy' | 'sell') => {
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 1) {
      toast.error('수량은 1 이상의 정수여야 합니다.');
      return;
    }
    setPending(true);
    try {
      const res = await fetch('/api/paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: item.ticker, market: item.market, side, qty: n, orderType: 'market' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '주문에 실패했습니다.');
      const r = data.result;
      if (r.status === 'error') throw new Error(r.reason ?? '주문이 거부되었습니다.');
      toast.success(
        r.status === 'executed'
          ? `${side === 'buy' ? '매수' : '매도'} 체결 (모의) — ${n}주`
          : '장외 시간 — 예약 주문으로 등록되었습니다.',
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border bg-card p-3">
      <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">빠른 주문 (모의투자)</p>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="h-9 w-24 tabular-nums"
          aria-label="주문 수량"
        />
        <span className="text-xs text-muted-foreground">주</span>
        <Button
          size="sm"
          disabled={pending}
          className="flex-1 bg-up text-white hover:bg-up/90"
          onClick={() => order('buy')}
        >
          매수
        </Button>
        <Button
          size="sm"
          disabled={pending}
          className="flex-1 bg-down text-white hover:bg-down/90"
          onClick={() => order('sell')}
        >
          매도
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">시장가 · 모의투자 계좌로 체결됩니다.</p>
    </div>
  );
}
