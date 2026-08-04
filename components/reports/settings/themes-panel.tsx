'use client';

// 테마 관리 (D16) — 테마 CRUD + 종목 편입/제외.
// 종목 검색은 기존 /api/stocks/search를 재사용한다(새 검색 경로를 만들지 않는다).
import { useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ThemeRow } from '@/lib/supabase/queries/engine-config';

interface SearchHit {
  ticker: string;
  name_kr: string | null;
  name_en: string | null;
  market: string;
}

export function ThemesPanel({ initial }: { initial: ThemeRow[] }) {
  const [themes, setThemes] = useState(initial);
  const [name, setName] = useState('');
  const [market, setMarket] = useState<'KR' | 'US' | 'BOTH'>('KR');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTheme, setActiveTheme] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const call = async (init: RequestInit & { url?: string }) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(init.url ?? '/api/engine/themes', init);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? '요청에 실패했습니다.');
      setThemes(json.themes as ThemeRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '요청에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    if (query.trim().length < 1) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(query.trim())}`);
      const json = await res.json();
      setHits((json.results ?? []) as SearchHit[]);
    } catch {
      setHits([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h3 className="text-base font-semibold">테마</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          종목의 상대강도를 비교할 묶음입니다. 리포트의 시장 개요에서 테마별 흐름으로 쓰입니다.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor="theme-name" className="text-xs">
            새 테마 이름
          </Label>
          <Input
            id="theme-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: AI 데이터센터 전력"
            className="h-8"
          />
        </div>
        <select
          value={market}
          onChange={(e) => setMarket(e.target.value as typeof market)}
          className="h-8 rounded-md border bg-transparent px-2 text-sm"
          aria-label="테마 시장"
        >
          <option value="KR">KR</option>
          <option value="US">US</option>
          <option value="BOTH">BOTH</option>
        </select>
        <Button
          size="sm"
          disabled={busy || name.trim() === ''}
          onClick={async () => {
            await call({
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: name.trim(), market }),
            });
            setName('');
          }}
        >
          <Plus className="size-4" /> 추가
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {themes.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          등록된 테마가 없습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {themes.map((t) => (
            <div key={t.id} className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{t.name}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{t.market}</span>
                <span className="text-xs text-muted-foreground">{t.stocks.length}종목</span>
                <div className="ml-auto flex gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setActiveTheme(activeTheme === t.id ? null : t.id)}
                  >
                    종목 편집
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-destructive"
                    onClick={() => call({ method: 'DELETE', url: `/api/engine/themes?id=${t.id}` })}
                  >
                    삭제
                  </Button>
                </div>
              </div>

              {t.stocks.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {t.stocks.map((s) => (
                    <span key={s.stockId} className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs">
                      {s.name}
                      <button
                        type="button"
                        aria-label={`${s.name} 제외`}
                        onClick={() =>
                          call({
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ themeId: t.id, stockId: s.stockId, add: false }),
                          })
                        }
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {activeTheme === t.id && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  <div className="flex gap-2">
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && search()}
                      placeholder="종목명 또는 티커 검색"
                      className="h-8"
                    />
                    <Button size="sm" variant="outline" onClick={search} disabled={searching}>
                      {searching ? <Loader2 className="size-4 animate-spin" /> : '검색'}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {hits.map((h) => (
                      <Button
                        key={`${h.ticker}-${h.market}`}
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() =>
                          call({
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ themeId: t.id, ticker: h.ticker, market: h.market, add: true }),
                          })
                        }
                      >
                        + {h.name_kr ?? h.name_en ?? h.ticker}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
