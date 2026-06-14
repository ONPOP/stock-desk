// 대시보드 신규 AI 분석 타일 (B) — 최신 분석 N건. 포지션 뱃지·신뢰도. 클릭 시 종목 상세.
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CompanyLogo } from '@/components/ui/company-logo';
import type { AnalysisPosition, RecentAnalysis } from '@/types';

const POSITION: Record<AnalysisPosition, { label: string; className: string }> = {
  buy: { label: '매수', className: 'border-up/30 bg-up-soft text-up' },
  neutral: { label: '중립', className: 'bg-muted text-muted-foreground' },
  sell: { label: '매도', className: 'border-down/30 bg-down-soft text-down' },
};

function rel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export function AnalysesTile({ analyses }: { analyses: RecentAnalysis[] }) {
  return (
    <Card className="gap-0 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Sparkles className="size-4" />
        </span>
        <h3 className="font-semibold">신규 AI 분석</h3>
        {analyses.length > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            {analyses.length}
          </Badge>
        )}
      </div>
      {analyses.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">아직 분석이 없습니다.</p>
      ) : (
        <div className="divide-y divide-border/60">
          {analyses.map((a) => {
            const pos = a.position ? POSITION[a.position] : null;
            return (
              <Link
                key={a.id}
                href={`/stocks/${a.ticker}?market=${a.market}`}
                className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60"
              >
                <CompanyLogo ticker={a.ticker} name={a.name} size={30} />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{a.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {rel(a.createdAt)} · {a.model.toUpperCase()}
                  </span>
                </div>
                {pos && (
                  <Badge variant="outline" className={pos.className}>
                    {pos.label}
                    {a.confidence != null && ` ${a.confidence}%`}
                  </Badge>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}
