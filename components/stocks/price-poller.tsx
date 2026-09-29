'use client';

// 보유 종목 시세를 폴링해 부모에 보고만 하는 무표시 컴포넌트.
// 훅을 반복문에서 부를 수 없어 종목마다 이 컴포넌트를 하나씩 둔다. 같은 종목 요청은 use-quote-store가 합친다.
import { useEffect } from 'react';
import { useQuote } from '@/lib/hooks/use-quote';
import type { Market } from '@/types';

export function PricePoller({
  stockId,
  ticker,
  market,
  onPrice,
}: {
  stockId: string;
  ticker: string;
  market: Market;
  onPrice: (stockId: string, price: number) => void;
}) {
  const { quote } = useQuote(ticker, market, { intervalMs: 15_000 });
  useEffect(() => {
    if (quote) onPrice(stockId, quote.price);
  }, [quote, stockId, onPrice]);
  return null;
}
