// 데일리 브리핑 잡 (F1) — 06:30 KST. 워치리스트가 있는 사용자에게 브리핑 생성.
// 디스패처가 시각(06:30) 게이팅. 스케줄 등록은 배포 후(W4 골격).
import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { generateDailyBriefing, type BriefingResult } from '@/lib/services/briefing';

export interface BriefingJobReport {
  processed: number;
  failed: number;
  details: Array<{ userId: string; result: BriefingResult }>;
}

/** @param dateLabel KST 날짜(YYYY-MM-DD). 미지정 시 호출 시점 KST. */
export async function runBriefingJob(dateLabel?: string): Promise<BriefingJobReport> {
  const admin = createAdminSupabase();
  const day = dateLabel ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

  // 워치리스트를 가진 사용자만 대상(distinct user_id)
  const { data, error } = await admin.from('watchlist_items').select('user_id');
  if (error) throw new Error(`사용자 조회 실패: ${error.message}`);
  const userIds = [...new Set((data ?? []).map((r) => (r as { user_id: string }).user_id))];

  const report: BriefingJobReport = { processed: 0, failed: 0, details: [] };
  for (const userId of userIds) {
    const result = await generateDailyBriefing(admin, userId, day);
    report.processed += 1;
    if (result.status === 'failed') report.failed += 1;
    report.details.push({ userId, result });
  }
  return report;
}
