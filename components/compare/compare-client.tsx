'use client';

// F16 종목 비교 — 워치리스트에서 2~4개 선택 → 핵심 지표(F4) 표 비교.
// [재설계] 칩·표 비주얼 + 실제 로고. [보존] selected 상태·toggle(MAX 4)·ROWS render·CompareItem.
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { CompanyLogo } from '@/components/ui/company-logo';
import { formatCompactMoney } from '@/lib/utils/money';
import type { CompareItem, Currency, StockMetrics } from '@/types';

const MAX = 4;

function ratio(v: number | null | undefined, suffix = ''): string {
  return v == null ? '—' : `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;
}
function eps(v: number | null | undefined, currency: Currency): string {
  if (v == null) return '—';
  return currency === 'KRW' ? `${Math.round(v).toLocaleString()}원` : `$${v.toFixed(2)}`;
}
function money(v: number | null | undefined, currency: Currency): string {
  return v == null ? '—' : formatCompactMoney(v, currency);
}

const ROWS: Array<{ label: string; render: (m: StockMetrics | null, c: Currency) => string }> = [
  { label: '시가총액', render: (m, c) => money(m?.marketCap, c) },
  { label: 'PER', render: (m) => ratio(m?.per) },
  { label: 'PBR', render: (m) => ratio(m?.pbr) },
  { label: 'ROE', render: (m) => ratio(m?.roe, '%') },
  { label: 'EPS', render: (m, c) => eps(m?.eps, c) },
  { label: '배당수익률', render: (m) => ratio(m?.dividendYield, '%') },
  { label: '부채비율', render: (m) => ratio(m?.debtRatio, '%') },
  { label: '매출(최근)', render: (m, c) => money(m?.revenueQ, c) },
  { label: '영업이익(최근)', render: (m, c) => money(m?.operatingIncomeQ, c) },
  { label: '순이익(최근)', render: (m, c) => money(m?.netIncomeQ, c) },
];

export function CompareClient({ items }: { items: CompareItem[] }) {
  const [selected, setSelected] = useState<string[]>(items.slice(0, Math.min(MAX, items.length)).map((i) => i.stockId));

  function toggle(stockId: string) {
    setSelected((prev) => {
      if (prev.includes(stockId)) return prev.filter((id) => id !== stockId);
      if (prev.length >= MAX) return prev;
      return [...prev, stockId];
    });
  }

  const chosen = items.filter((i) => selected.includes(i.stockId));

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">비교할 종목이 없습니다. 먼저 내 종목에 등록하세요.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {items.map((i) => {
            const on = selected.includes(i.stockId);
            return (
              <button
                key={i.stockId}
                type="button"
                onClick={() => toggle(i.stockId)}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  on ? 'border-transparent bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                <CompanyLogo ticker={i.ticker} name={i.name} size={18} />
                {i.name} <span className="font-mono text-xs opacity-60">{i.ticker}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          최대 {MAX}개까지 선택. 지표가 비어 있으면 종목 상세에서 &quot;갱신&quot;을 먼저 실행하세요. · 출처 DART/Finnhub/FMP
        </p>
      </div>

      {chosen.length === 0 ? (
        <p className="text-sm text-muted-foreground">비교할 종목을 선택하세요.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-4 text-left text-xs font-medium text-muted-foreground">지표</th>
                {chosen.map((c) => (
                  <th key={c.stockId} className="p-4 text-right align-bottom">
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-semibold whitespace-nowrap">{c.name}</span>
                      <Badge variant="secondary" className="font-mono text-[10px]">{c.ticker}</Badge>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-b transition-colors last:border-0 hover:bg-secondary/50">
                  <td className="p-4 text-xs text-muted-foreground">{row.label}</td>
                  {chosen.map((c) => (
                    <td key={c.stockId} className="p-4 text-right tabular-nums">
                      {row.render(c.metrics, c.currency)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
