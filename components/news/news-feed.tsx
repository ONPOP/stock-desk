'use client';

// F5 뉴스 피드 — 감성 뱃지(호재/악재/중립) + 제목 + 매체·시각 + AI 3줄 요약 + 원문 링크.
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { NewsItem, Sentiment } from '@/types';

const SENTIMENT: Record<Sentiment, { label: string; className: string }> = {
  positive: { label: '호재', className: 'bg-red-500/10 text-red-600 border-red-500/30' },
  negative: { label: '악재', className: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
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
              className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                filter === f ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {f === ALL ? ALL : SENTIMENT[f].label}
            </button>
          ))}
        </div>
      )}
      <ul className="divide-y">
        {filtered.map((n, i) => (
          <li key={`${n.url}-${i}`} className="space-y-1 py-2.5">
            <div className="flex items-start gap-2">
              {n.sentiment && (
                <Badge variant="outline" className={`shrink-0 text-[10px] ${SENTIMENT[n.sentiment].className}`}>
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
            </div>
            {n.summaryAi && <p className="text-xs text-muted-foreground">{n.summaryAi}</p>}
            <p className="text-[11px] tabular-nums text-muted-foreground">
              {[n.source, fmtDate(n.publishedAt)].filter(Boolean).join(' · ')}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
