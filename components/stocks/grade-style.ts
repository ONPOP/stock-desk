// 등급 색 — A 빨강·C 노랑은 사용자 지정(2026-09-29). 노랑은 밝은 배경 대비를 위해 글자를 한 단계 진하게 쓴다.
import type { GradeFilter, StockGrade } from '@/types';

export const GRADE_TONE: Record<StockGrade, string> = {
  A: 'bg-red-500/15 text-red-600 ring-red-500/40 dark:text-red-400',
  B: 'bg-teal-500/15 text-teal-600 ring-teal-500/40 dark:text-teal-400',
  C: 'bg-yellow-400/20 text-yellow-700 ring-yellow-500/50 dark:text-yellow-300',
  D: 'bg-zinc-500/15 text-zinc-600 ring-zinc-500/40 dark:text-zinc-300',
};

export const GRADE_LABEL: Record<GradeFilter, string> = { A: 'A', B: 'B', C: 'C', D: 'D', none: '미분류' };
