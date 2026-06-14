'use client';

// F16 종목 비교 — 워치리스트에서 2~4개 선택 → 핵심 지표(F4) 표 비교.
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
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
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <button
            key={i.stockId}
            type="button"
            onClick={() => toggle(i.stockId)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              selected.includes(i.stockId)
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {i.name} <span className="text-xs opacity-70">{i.ticker}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">최대 {MAX}개까지 선택. 지표가 비어 있으면 종목 상세에서 &quot;갱신&quot;을 먼저 실행하세요.</p>

      {chosen.length === 0 ? (
        <p className="text-sm text-muted-foreground">비교할 종목을 선택하세요.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 text-left text-xs font-medium text-muted-foreground">지표</th>
                {chosen.map((c) => (
                  <th key={c.stockId} className="py-2 pl-4 text-right">
                    <div className="font-semibold">{c.name}</div>
                    <Badge variant="secondary" className="mt-0.5 text-[10px]">
                      {c.ticker}
                    </Badge>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-b last:border-0">
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{row.label}</td>
                  {chosen.map((c) => (
                    <td key={c.stockId} className="py-2 pl-4 text-right tabular-nums">
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
