'use client';

// 종목 검색·등록 (F3) — 디바운스 검색, 시장 뱃지, 중복 등록 방지.
// [재설계] 검색 인풋·결과 드롭다운 비주얼 + 실제 로고. [보존] 디바운스 fetch·abort·중복방지·StockSearchProps.
import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CompanyLogo } from '@/components/ui/company-logo';
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
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          className="h-11 rounded-xl pl-9"
          placeholder="종목명·티커·종목코드 검색 (예: 삼성전자, AAPL, 005930)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="종목 검색"
        />
      </div>
      {loading && <p className="text-sm text-muted-foreground">검색 중…</p>}
      {!loading && query.trim().length > 0 && results.length === 0 && (
        <p className="text-sm text-muted-foreground">검색 결과가 없습니다.</p>
      )}
      {results.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {results.map((r) => {
            const registered = existingKeys.has(keyOf(r.ticker, r.market));
            return (
              <li key={keyOf(r.ticker, r.market)} className="flex items-center justify-between gap-3 p-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <CompanyLogo ticker={r.ticker} name={r.name_kr ?? r.name_en} size={30} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{r.name_kr ?? r.name_en ?? r.ticker}</span>
                      <Badge variant="secondary" className="shrink-0">{r.market}</Badge>
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">{r.ticker}</p>
                  </div>
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
