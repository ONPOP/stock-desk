'use client';

// 지난(아카이브) 시즌 열람 — 새 시즌 시작 시 기록은 삭제되지 않고 보존된다.
// 펼칠 때 한 번만 lazy fetch. 시즌별 시드·실현손익·거래내역을 보여준다.
import { useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/utils/money';
import type { ArchivedSeason } from '@/types';

function pnlClass(n: number): string {
  return n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted-foreground';
}
function signed(n: number, currency: 'KRW' | 'USD'): string {
  return `${n > 0 ? '+' : ''}${formatMoney(n, currency)}`;
}

export function ArchivedSeasons() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [seasons, setSeasons] = useState<ArchivedSeason[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      setLoading(true);
      try {
        const res = await fetch('/api/paper/seasons');
        const data = await res.json();
        if (res.ok) {
          setSeasons(data.seasons ?? []);
          setLoaded(true);
        } else {
          toast.error(data.error ?? '지난 시즌을 불러오지 못했습니다.');
        }
      } catch {
        toast.error('네트워크 오류로 지난 시즌을 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <Card className="gap-3 p-[18px]">
      <button type="button" onClick={toggle} className="flex items-center justify-between" aria-expanded={open}>
        <h2 className="font-semibold">지난 시즌</h2>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open &&
        (loading ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : seasons.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 종료된 시즌이 없습니다.</p>
        ) : (
          <ul className="space-y-2.5">
            {seasons.map((s) => {
              const isOpen = expanded === s.id;
              return (
                <li key={s.id} className="rounded-xl border p-3">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : s.id)}
                    className="flex w-full items-center justify-between gap-2 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge variant="secondary" className="shrink-0">
                        시즌 {s.seasonNo}
                      </Badge>
                      <span className="truncate text-xs tabular-nums text-muted-foreground">
                        {s.startDate && s.endDate
                          ? `${s.startDate} ~ ${s.endDate}`
                          : `종료 ${new Date(s.endedAt).toLocaleDateString('ko-KR')}`}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3 text-sm tabular-nums">
                      {s.realizedKrw !== 0 && <span className={pnlClass(s.realizedKrw)}>{signed(s.realizedKrw, 'KRW')}</span>}
                      {s.realizedUsdCents !== 0 && (
                        <span className={pnlClass(s.realizedUsdCents)}>{signed(s.realizedUsdCents, 'USD')}</span>
                      )}
                      <ChevronDown
                        className={`size-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </span>
                  </button>

                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>
                      시드 {formatMoney(s.seedKrw, 'KRW')} · {formatMoney(s.seedUsdCents, 'USD')}
                    </span>
                    <span>실현손익 기준 · 거래 {s.trades.length}건</span>
                  </div>

                  {isOpen &&
                    (s.trades.length === 0 ? (
                      <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">거래 내역이 없습니다.</p>
                    ) : (
                      <ul className="mt-2 divide-y border-t">
                        {s.trades.map((t) => (
                          <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
                            <span className="flex min-w-0 items-center gap-2">
                              <Badge
                                variant="outline"
                                className={`border-0 ${t.side === 'buy' ? 'bg-up-soft text-up' : 'bg-down-soft text-down'}`}
                              >
                                {t.side === 'buy' ? '매수' : '매도'}
                              </Badge>
                              <span className="truncate font-medium">{t.name || t.ticker}</span>
                              {t.status === 'canceled' && <span className="text-[11px] text-muted-foreground">취소됨</span>}
                            </span>
                            <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                              {t.qty.toLocaleString()}주 {t.price != null ? `@ ${formatMoney(t.price, t.currency)}` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ))}
                </li>
              );
            })}
          </ul>
        ))}
    </Card>
  );
}
