'use client';

// /stocks 등급 필터 — 다중 선택 토글 칩. 아무것도 켜지 않으면 전체.
import { cn } from '@/lib/utils';
import { GRADE_FILTERS } from '@/lib/utils/stock-grade';
import type { GradeFilter } from '@/types';
import { GRADE_LABEL, GRADE_TONE } from './grade-style';

interface GradeFilterChipsProps {
  selected: ReadonlySet<GradeFilter>;
  counts: Record<GradeFilter, number>;
  onToggle: (f: GradeFilter) => void;
  onClear: () => void;
}

export function GradeFilterChips({ selected, counts, onToggle, onClear }: GradeFilterChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="등급 필터">
      <span className="mr-1 text-xs font-medium text-muted-foreground">등급</span>
      {GRADE_FILTERS.map((f) => {
        const on = selected.has(f);
        return (
          <button
            key={f}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(f)}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition-colors',
              on
                ? f === 'none'
                  ? 'bg-foreground/10 text-foreground ring-foreground/30'
                  : GRADE_TONE[f]
                : 'text-muted-foreground ring-border hover:bg-muted',
            )}
          >
            {GRADE_LABEL[f]} <span className="font-normal tabular-nums opacity-70">{counts[f]}</span>
          </button>
        );
      })}
      {selected.size > 0 && (
        <button type="button" onClick={onClear} className="ml-1 text-xs text-muted-foreground underline">
          전체 보기
        </button>
      )}
    </div>
  );
}
