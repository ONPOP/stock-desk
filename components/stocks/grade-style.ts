// 등급 색 — 시세 등락색(빨강 상승·파랑 하락)과 헷갈리지 않도록 빨강·파랑 계열은 피한다.
import type { GradeFilter, StockGrade } from '@/types';

export const GRADE_TONE: Record<StockGrade, string> = {
  A: 'bg-emerald-500/15 text-emerald-600 ring-emerald-500/40 dark:text-emerald-400',
  B: 'bg-teal-500/15 text-teal-600 ring-teal-500/40 dark:text-teal-400',
  C: 'bg-amber-500/15 text-amber-600 ring-amber-500/40 dark:text-amber-400',
  D: 'bg-zinc-500/15 text-zinc-600 ring-zinc-500/40 dark:text-zinc-300',
};

export const GRADE_LABEL: Record<GradeFilter, string> = { A: 'A', B: 'B', C: 'C', D: 'D', none: '미분류' };
