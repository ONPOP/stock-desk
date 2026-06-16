'use client';

// 모의투자 주문용 종목 선택기 — 종목명·티커·코드 검색(디바운스) → 선택 시 ticker+market 확정.
// searchStocks(/api/stocks/search) 재사용. 선택 후엔 종목 카드 + '변경' 버튼.
import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CompanyLogo } from '@/components/ui/company-logo';
import type { Market, StockSearchResult } from '@/types';

export interface SelectedStock {
  ticker: string;
  market: Market;
  name: string;
}

export function StockPicker({
  selected,
  onSelect,
  onClear,
}: {
  selected: SelectedStock | null;
  onSelect: (s: SelectedStock) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
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
        if (res.ok) {
          setResults(data.results ?? []);
          setOpen(true);
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  if (selected) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-input bg-muted/40 px-3 py-2">
        <CompanyLogo ticker={selected.ticker} name={selected.name} size={28} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{selected.name}</div>
          <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {selected.ticker} · {selected.market}
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          변경
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="종목명·티커·코드 검색 (예: 삼성전자, AAPL, 005930)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          aria-label="종목 검색"
        />
      </div>
      {open && query.trim().length > 0 && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border bg-popover shadow-lg">
          {loading && <p className="px-3 py-2 text-sm text-muted-foreground">검색 중…</p>}
          {!loading && results.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">검색 결과가 없습니다.</p>
          )}
          {results.map((r) => (
            <button
              key={`${r.ticker}:${r.market}`}
              type="button"
              onClick={() => {
                onSelect({ ticker: r.ticker, market: r.market, name: r.name_kr ?? r.name_en ?? r.ticker });
                setQuery('');
                setOpen(false);
                setResults([]);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted"
            >
              <CompanyLogo ticker={r.ticker} name={r.name_kr ?? r.name_en} size={26} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{r.name_kr ?? r.name_en ?? r.ticker}</span>
                  <Badge variant="secondary" className="shrink-0">
                    {r.market}
                  </Badge>
                </span>
                <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">{r.ticker}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
