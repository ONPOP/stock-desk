'use client';

// F5 뉴스 피드 — 감성 뱃지(호재/악재/중립) + 제목 + 매체·시각 + AI 3줄 요약 + 원문 링크.
// [재설계] 칩/리스트 비주얼만. [보존] useState 필터·SENTIMENT 색(호재=빨강/악재=파랑)·NewsItem·정렬.
import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { NewsItem, Sentiment } from '@/types';

const SENTIMENT: Record<Sentiment, { label: string; className: string }> = {
  positive: { label: '호재', className: 'bg-up-soft text-up' },
  negative: { label: '악재', className: 'bg-down-soft text-down' },
  neutral: { label: '중립', className: 'bg-muted text-muted-foreground' },
};

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
}

const ALL = '전체';

export function NewsFeed({ news }: { news: NewsItem[] }) {
  const [filter, setFilter] = useState<Sentiment | typeof ALL>(ALL);

  const hasSentiment = useMemo(() => news.some((n) => n.sentiment), [news]);
  const filtered = useMemo(
    () => (filter === ALL ? news : news.filter((n) => n.sentiment === filter)),
    [news, filter],
  );

  if (news.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        뉴스 없음. 상단의 <span className="font-medium">뉴스 갱신</span> 버튼을 눌러 수집하세요.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {hasSentiment && (
        <div className="flex flex-wrap gap-1.5">
          {([ALL, 'positive', 'negative', 'neutral'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filter === f
                  ? 'border-transparent bg-foreground text-background'
                  : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {f === ALL ? ALL : SENTIMENT[f].label}
            </button>
          ))}
        </div>
      )}
      <ul className="divide-y">
        {filtered.map((n, i) => (
          <li key={`${n.url}-${i}`} className="space-y-1.5 py-3">
            <div className="flex items-start gap-2">
              {n.sentiment && (
                <Badge variant="outline" className={`shrink-0 border-0 text-[10px] ${SENTIMENT[n.sentiment].className}`}>
                  {SENTIMENT[n.sentiment].label}
                </Badge>
              )}
              <a
                href={n.url}
                target="_blank"
                rel="noreferrer noopener"
                className="min-w-0 flex-1 text-sm font-medium hover:underline"
                title={n.title}
              >
                {n.title}
              </a>
              <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" />
            </div>
            {n.summaryAi && <p className="text-xs leading-relaxed text-muted-foreground">{n.summaryAi}</p>}
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground/80">
              {[n.source, fmtDate(n.publishedAt)].filter(Boolean).join(' · ')}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
