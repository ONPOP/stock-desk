'use client';

// 분석 리포트 아카이브 뷰어 (D16) — 날짜 레일 → 슬롯 카드 → 슬라이드 라이트박스.
// 슬라이드는 배치가 렌더한 PNG를 그대로 본다(앱이 다시 그리지 않는다 — 그때의 판단을 그대로 보존).
import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, Loader2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ReportSummary } from '@/lib/supabase/queries/reports';

interface Props {
  dates: string[];
  initialDate: string | null;
  initialReports: ReportSummary[];
}

const MARKET_OF: Record<string, 'KR' | 'US' | 'BOTH'> = {};
function marketOf(slotId: string): 'KR' | 'US' | 'BOTH' {
  if (MARKET_OF[slotId]) return MARKET_OF[slotId];
  if (slotId.startsWith('kr_')) return 'KR';
  if (slotId.startsWith('us_')) return 'US';
  return 'BOTH';
}

function timeOf(runAt: string): string {
  return new Date(runAt).toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function slideUrl(reportId: string, index: number): string {
  return `/api/reports/slide?report=${reportId}&n=${index}`;
}

/** 슬라이드 라이트박스 — ←/→ 로 넘기고 Esc로 닫는다 */
function Lightbox({ report, onClose }: { report: ReportSummary; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  const move = useCallback(
    (delta: number) => {
      setFailed(false);
      setIndex((i) => Math.min(report.slideCount - 1, Math.max(0, i + delta)));
    },
    [report.slideCount],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') move(1);
      else if (e.key === 'ArrowLeft') move(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4" role="dialog" aria-modal="true" aria-label="슬라이드 보기">
      <div className="flex items-center justify-between text-white">
        <div className="text-sm">
          <span className="font-semibold">{report.slotId}</span>
          <span className="ml-2 opacity-70">
            {report.runDate} {timeOf(report.runAt)} · {index + 1} / {report.slideCount}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={slideUrl(report.id, index)}
            download={`${report.runDate}_${report.slotId}_${index + 1}.png`}
            className="rounded-md px-3 py-1.5 text-sm hover:bg-white/10"
          >
            원본 저장
          </a>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="닫기" className="text-white hover:bg-white/10">
            <X className="size-5" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => move(-1)}
          disabled={index === 0}
          aria-label="이전 슬라이드"
          className="text-white hover:bg-white/10"
        >
          <ChevronLeft className="size-7" />
        </Button>

        {failed ? (
          <div className="flex flex-1 flex-col items-center gap-2 text-white/80">
            <ImageOff className="size-8" />
            <p className="text-sm">
              슬라이드를 불러올 수 없습니다. 외장 볼륨에 저장된 경우 연결 상태를 확인하세요.
            </p>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- 로컬 파일 스트리밍이라 next/image 최적화 대상이 아니다
          <img
            src={slideUrl(report.id, index)}
            alt={`${report.slotId} 슬라이드 ${index + 1}`}
            onError={() => setFailed(true)}
            className="mx-auto max-h-full max-w-full flex-1 object-contain"
          />
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => move(1)}
          disabled={index >= report.slideCount - 1}
          aria-label="다음 슬라이드"
          className="text-white hover:bg-white/10"
        >
          <ChevronRight className="size-7" />
        </Button>
      </div>

      <div className="flex justify-center gap-1.5 overflow-x-auto pt-3">
        {Array.from({ length: report.slideCount }, (_, i) => (
          <button
            key={i}
            onClick={() => {
              setFailed(false);
              setIndex(i);
            }}
            aria-label={`슬라이드 ${i + 1}`}
            aria-current={i === index}
            className={cn(
              'h-1.5 w-8 rounded-full transition-colors',
              i === index ? 'bg-white' : 'bg-white/30 hover:bg-white/60',
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function ReportsView({ dates, initialDate, initialReports }: Props) {
  const [date, setDate] = useState(initialDate);
  const [reports, setReports] = useState<ReportSummary[]>(initialReports);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markets, setMarkets] = useState<Set<'KR' | 'US' | 'BOTH'>>(new Set());
  const [open, setOpen] = useState<ReportSummary | null>(null);

  const selectDate = useCallback(async (next: string) => {
    setDate(next);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports?date=${next}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? '리포트를 불러오지 못했습니다.');
      setReports(json.reports as ReportSummary[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '리포트를 불러오지 못했습니다.');
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleMarket = (m: 'KR' | 'US' | 'BOTH') => {
    setMarkets((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  const visible = markets.size === 0 ? reports : reports.filter((r) => markets.has(marketOf(r.slotId)));

  if (dates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        아직 생성된 리포트가 없습니다. 슬롯을 실행하면 여기에 날짜·시간별로 쌓입니다.
        <div className="mt-2 font-mono text-xs">./scripts/engine/run-slot.sh kr_close_buy</div>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      <aside className="w-44 shrink-0 space-y-4">
        <div>
          <div className="mb-2 text-xs font-semibold text-muted-foreground">날짜</div>
          <div className="max-h-[60vh] space-y-0.5 overflow-y-auto pr-1">
            {dates.map((d) => (
              <button
                key={d}
                onClick={() => selectDate(d)}
                aria-current={d === date}
                className={cn(
                  'w-full rounded-md px-2.5 py-1.5 text-left text-sm tabular-nums transition-colors',
                  d === date ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold text-muted-foreground">시장</div>
          <div className="flex flex-wrap gap-1.5">
            {(['KR', 'US', 'BOTH'] as const).map((m) => (
              <Button
                key={m}
                size="sm"
                variant={markets.has(m) ? 'default' : 'outline'}
                onClick={() => toggleMarket(m)}
                className="h-7 px-2.5 text-xs"
              >
                {m}
              </Button>
            ))}
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> 불러오는 중…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/40 p-6 text-sm text-destructive">{error}</div>
        ) : visible.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            선택한 조건에 해당하는 리포트가 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {visible.map((r) => (
              <button
                key={r.id}
                onClick={() => r.slideCount > 0 && setOpen(r)}
                disabled={r.slideCount === 0}
                className={cn(
                  'group overflow-hidden rounded-xl border text-left transition-colors',
                  r.slideCount > 0 ? 'hover:border-primary' : 'cursor-not-allowed opacity-60',
                )}
              >
                <div className="aspect-video bg-muted">
                  {r.slideCount > 0 ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 로컬 파일 스트리밍
                    <img
                      src={slideUrl(r.id, 0)}
                      alt={`${r.slotId} 표지`}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                      슬라이드 없음
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-semibold tabular-nums">{timeOf(r.runAt)}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {marketOf(r.slotId)}
                    </Badge>
                  </div>
                  <div className="truncate text-sm">{r.headline ?? r.slotId}</div>
                  <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                    <span>{r.stockCount}종목</span>
                    {r.buyCount > 0 && <span className="text-primary">BUY {r.buyCount}</span>}
                    {r.avoidCount > 0 && <span>AVOID {r.avoidCount}</span>}
                    <span>· 슬라이드 {r.slideCount}</span>
                    {r.storageState === 'fallback' && <span className="text-amber-600">임시 저장</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {open && <Lightbox report={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
