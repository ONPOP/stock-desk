// 거시 일정 시드 (F2) — 시장 공통(user_id null). 정확한 날짜는 사용자 보강/AI 보강 전제(confirmed=false).
// PRD 11장: 거시일정 시드 + Finnhub Earnings + AI 보강. 2026년 대표 일정 시드.
export interface MacroSeed {
  title: string;
  eventDate: string; // YYYY-MM-DD
}

// 대표 거시 일정 — 공개 일정 기반 근사값. "(예정)"으로 표시되며 사용자가 확정/수정한다.
export const MACRO_SEED_2026: MacroSeed[] = [
  { title: '미국 FOMC (1월)', eventDate: '2026-01-28' },
  { title: '미국 FOMC (3월)', eventDate: '2026-03-18' },
  { title: '미국 FOMC (4월)', eventDate: '2026-04-29' },
  { title: '미국 FOMC (6월)', eventDate: '2026-06-17' },
  { title: '미국 FOMC (7월)', eventDate: '2026-07-29' },
  { title: '미국 FOMC (9월)', eventDate: '2026-09-16' },
  { title: '미국 FOMC (10월)', eventDate: '2026-10-28' },
  { title: '미국 FOMC (12월)', eventDate: '2026-12-09' },
  { title: '미국 CPI (월간)', eventDate: '2026-06-10' },
  { title: '미국 CPI (월간)', eventDate: '2026-07-14' },
  { title: '한국 금통위', eventDate: '2026-06-11' },
  { title: '한국 금통위', eventDate: '2026-07-09' },
];
