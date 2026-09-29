// 투자 기록 하위 탭 키 — 서버(page)·클라이언트(탭) 공용이라 'use client' 모듈 밖에 둔다.
export const JOURNAL_TABS = ['trade', 'goals', 'analysis'] as const;
export type JournalTab = (typeof JOURNAL_TABS)[number];

export function parseJournalTab(v: string | null | undefined): JournalTab | null {
  return (JOURNAL_TABS as readonly string[]).includes(v ?? '') ? (v as JournalTab) : null;
}
