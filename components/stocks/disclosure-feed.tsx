'use client';

// F12 공시 피드 — 유형 뱃지 + 제목 + 제출일 + 원문 링크. AI 1줄 요약은 W4에서 채워짐.
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { DisclosureItem } from '@/types';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

const ALL = '전체';

export function DisclosureFeed({ disclosures }: { disclosures: DisclosureItem[] }) {
  const [filter, setFilter] = useState<string>(ALL);

  const types = useMemo(() => {
    const set = new Set<string>();
    for (const d of disclosures) set.add(d.typeLabelKr ?? '기타');
    return [ALL, ...[...set].sort()];
  }, [disclosures]);

  const filtered = useMemo(
    () => (filter === ALL ? disclosures : disclosures.filter((d) => (d.typeLabelKr ?? '기타') === filter)),
    [disclosures, filter],
  );

  if (disclosures.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        공시 없음. 상단의 <span className="font-medium">갱신</span> 버튼을 눌러 수집하세요.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {types.length > 2 && (
        <div className="flex flex-wrap gap-1.5">
          {types.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilter(t)}
              className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                filter === t ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      <ul className="divide-y">
        {filtered.map((d, i) => (
          <li key={`${d.source}-${d.url}-${i}`} className="py-2.5">
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {d.typeLabelKr ?? d.formType}
              </Badge>
              <div className="min-w-0 flex-1 space-y-0.5">
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block truncate text-sm font-medium hover:underline"
                  title={d.title}
                >
                  {d.title}
                </a>
                {d.summaryAi && <p className="text-xs text-muted-foreground">{d.summaryAi}</p>}
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {fmtDate(d.filedAt)} · {d.source.toUpperCase()}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
