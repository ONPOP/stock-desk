// 크론 디스패처 골격 (PRD 10장) — 30분 단위 단일 진입점.
// 배포 후 Vercel Cron(vercel.json schedule) 또는 외부 스케줄러가 호출. 현재 스케줄 미등록.
// D4 자동 AI 분석(F7) 스케줄은 V1에서 추가.
import 'server-only';
import { isAnyMarketOpen } from '@/lib/utils/market-hours';
import { runFundamentalsRefreshJob } from '@/lib/cron/jobs/metrics';
import { runNewsRefreshJob } from '@/lib/cron/jobs/news';
import { runBriefingJob } from '@/lib/cron/jobs/briefing';
import { runSettleJob } from '@/lib/cron/jobs/settle';
// F7 자동분석(runAnalysisJob)은 analysis_schedules(사용자별 run_time) 매칭이 필요해 배포 시 연결.

export interface DispatchReport {
  ran: string[];
  skipped: string[];
}

/**
 * 시각 기반 잡 게이팅 (배포 시 Vercel Cron이 30분마다 호출).
 * - 06:30 KST: 데일리 브리핑
 * - 장중: 뉴스 3시간 주기 / 장외: 6시간 주기 (D8) — 분 단위 근사 게이팅
 * - 지표: 일 1회 (장 시작 무렵)
 * 실제 스케줄 등록은 배포 단계. 현재는 수동/테스트 호출용.
 */
export async function dispatchCron(now: Date = new Date()): Promise<DispatchReport> {
  const kstHour = Number(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false }));
  const kstMin = Number(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul', minute: '2-digit' }));
  const open = isAnyMarketOpen(now);
  const ran: string[] = [];
  const skipped: string[] = [];

  // 브리핑: 06:30 KST
  if (kstHour === 6 && kstMin >= 30 && kstMin < 60) {
    await runBriefingJob();
    ran.push('briefing');
  } else {
    skipped.push('briefing');
  }

  // 뉴스: 장중 3h / 장외 6h (정시 근사). 크론은 AI 요약 생략(비용 통제).
  const newsInterval = open ? 3 : 6;
  if (kstHour % newsInterval === 0 && kstMin < 30) {
    await runNewsRefreshJob({ withAi: false });
    ran.push('news');
  } else {
    skipped.push('news');
  }

  // 지표: 일 1회 (08시 KST 근방)
  if (kstHour === 8 && kstMin < 30) {
    await runFundamentalsRefreshJob();
    ran.push('fundamentals');
  } else {
    skipped.push('fundamentals');
  }

  // 예약주문 체결: 개장 직후 (KR 09:00 / US 22:30 KST 근방 — D5 시초가)
  if ((kstHour === 9 && kstMin < 30) || (kstHour === 22 && kstMin >= 30)) {
    await runSettleJob();
    ran.push('settle');
  } else {
    skipped.push('settle');
  }

  return { ran, skipped };
}
