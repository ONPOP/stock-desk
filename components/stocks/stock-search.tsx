'use client';

// 종목 검색·등록 (F3) — 디바운스 검색, 시장 뱃지, 중복 등록 방지.
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Market, StockSearchResult } from '@/types';

interface StockSearchProps {
  existingKeys: Set<string>; // 이미 등록된 `${ticker}:${market}` 집합
  onAdd: (result: StockSearchResult) => Promise<void>;
}

function keyOf(ticker: string, market: Market) {
  return `${ticker}:${market}`;
}

export function StockSearch({ existingKeys, onAdd }: StockSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = await res.json();
        if (res.ok) setResults(data.results ?? []);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  async function handleAdd(r: StockSearchResult) {
    setAdding(keyOf(r.ticker, r.market));
    try {
      await onAdd(r);
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="space-y-3">
      <Input
        type="search"
        placeholder="종목명·티커·종목코드 검색 (예: 삼성전자, AAPL, 005930)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="종목 검색"
      />
      {loading && <p className="text-sm text-muted-foreground">검색 중…</p>}
      {!loading && query.trim().length > 0 && results.length === 0 && (
        <p className="text-sm text-muted-foreground">검색 결과가 없습니다.</p>
      )}
      {results.length > 0 && (
        <ul className="divide-y rounded-md border">
          {results.map((r) => {
            const registered = existingKeys.has(keyOf(r.ticker, r.market));
            return (
              <li key={keyOf(r.ticker, r.market)} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{r.name_kr ?? r.name_en ?? r.ticker}</span>
                    <Badge variant="secondary">{r.market}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{r.ticker}</p>
                </div>
                <Button
                  size="sm"
                  variant={registered ? 'secondary' : 'default'}
                  disabled={registered || adding === keyOf(r.ticker, r.market)}
                  onClick={() => handleAdd(r)}
                >
                  {registered ? '등록됨' : adding === keyOf(r.ticker, r.market) ? '추가 중…' : '추가'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
