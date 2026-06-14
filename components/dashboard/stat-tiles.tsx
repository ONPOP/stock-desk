// 대시보드 4칸 KPI 타일 (B 트레이더 콕핏) — 관심종목·신규분석·오늘일정 카운트 + KOSPI.
// 서버 컴포넌트(집계는 서버 데이터). KOSPI만 시세 의존이라 클라이언트 자식.
import type { ReactNode } from 'react';
import { Star, Sparkles, CalendarDays } from 'lucide-react';
import { MarketKpiTile } from './market-kpi-tile';
import type { CalendarEvent, RecentAnalysis } from '@/types';

interface StatTilesProps {
  watchCount: number;
  analyses: RecentAnalysis[];
  events: CalendarEvent[];
}

function Tile({ icon, label, num, sub }: { icon: ReactNode; label: string; num: ReactNode; sub: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">{icon}</span>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <span className="text-2xl font-bold tabular-nums">{num}</span>
      <span className="text-sm text-muted-foreground">{sub}</span>
    </div>
  );
}

export function StatTiles({ watchCount, analyses, events }: StatTilesProps) {
  const buy = analyses.filter((a) => a.position === 'buy').length;
  const neutral = analyses.filter((a) => a.position === 'neutral').length;
  const sell = analyses.filter((a) => a.position === 'sell').length;
  const confirmed = events.filter((e) => e.confirmed).length;
  const planned = events.length - confirmed;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Tile icon={<Star className="size-4" />} label="관심 종목" num={watchCount} sub={`${watchCount}종목`} />
      <Tile
        icon={<Sparkles className="size-4" />}
        label="신규 분석"
        num={analyses.length}
        sub={`매수 ${buy} · 중립 ${neutral} · 매도 ${sell}`}
      />
      <Tile
        icon={<CalendarDays className="size-4" />}
        label="오늘 일정"
        num={events.length}
        sub={`확정 ${confirmed} · 예정 ${planned}`}
      />
      <MarketKpiTile />
    </div>
  );
}
