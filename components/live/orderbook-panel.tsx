'use client';

// 호가창 (D15) — 매도 10호가(위) + 매수 10호가(아래), 잔량 막대. 3초 폴링(탭 숨김 시 중단).
import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '@/lib/utils/money';
import { cn } from '@/lib/utils';
import type { Orderbook } from '@/types';

const POLL_MS = 3000;

export function OrderbookPanel({ ticker }: { ticker: string }) {
  const [book, setBook] = useState<Orderbook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setBook(null);
    setError(null);
    let timer: ReturnType<typeof setInterval> | null = null;

    const fetchBook = async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/orderbook?ticker=${encodeURIComponent(ticker)}`, { signal: controller.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '호가를 불러오지 못했습니다.');
        setBook(data.orderbook);
        setError(null);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setError((e as Error).message);
      }
    };
    const start = () => {
      if (timer) return;
      fetchBook();
      timer = setInterval(fetchBook, POLL_MS);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      abortRef.current?.abort();
    };
  }, [ticker]);

  const maxQty = book ? Math.max(1, ...book.asks.map((l) => l.qty), ...book.bids.map((l) => l.qty)) : 1;

  const Row = ({ price, qty, side }: { price: number; qty: number; side: 'ask' | 'bid' }) => (
    <div className="relative flex items-center justify-between px-2 py-[3px] text-[12px] tabular-nums">
      <span
        aria-hidden
        className={cn('absolute inset-y-0 right-0 opacity-15', side === 'ask' ? 'bg-down' : 'bg-up')}
        style={{ width: `${Math.min(100, (qty / maxQty) * 100)}%` }}
      />
      <span className={cn('relative font-medium', side === 'ask' ? 'text-down' : 'text-up')}>
        {formatMoney(price, 'KRW')}
      </span>
      <span className="relative text-muted-foreground">{qty.toLocaleString('ko-KR')}</span>
    </div>
  );

  return (
    <div className="rounded-xl border bg-card">
      <p className="border-b px-3 py-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">호가</p>
      {error ? (
        <p className="p-3 text-xs text-muted-foreground">{error}</p>
      ) : !book ? (
        <p className="p-3 text-xs text-muted-foreground">불러오는 중…</p>
      ) : book.asks.length === 0 && book.bids.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground">호가 정보가 없습니다 (장 마감·거래정지).</p>
      ) : (
        <div className="py-1">
          {/* 매도호가 — 높은 가격이 위 (ask10 → ask1) */}
          {[...book.asks].reverse().map((l) => (
            <Row key={`a${l.price}`} price={l.price} qty={l.qty} side="ask" />
          ))}
          <div className="my-1 border-y bg-muted/40 px-2 py-1 text-center text-[10.5px] text-muted-foreground">
            잔량 매도 {book.totalAskQty.toLocaleString('ko-KR')} · 매수 {book.totalBidQty.toLocaleString('ko-KR')}
          </div>
          {book.bids.map((l) => (
            <Row key={`b${l.price}`} price={l.price} qty={l.qty} side="bid" />
          ))}
        </div>
      )}
    </div>
  );
}
