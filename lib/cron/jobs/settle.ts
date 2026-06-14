// 예약주문 체결 잡 (F9, D5) — 개장 직후 pending reserved를 시초가(개장 후 첫 시세)로 체결.
// 디스패처가 개장 시각에 호출. 스케줄 등록·완전 체결 로직은 배포 단계(현재 골격).
import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';

export interface SettleJobReport {
  pending: number;
  note: string;
}

/**
 * 골격: pending reserved 주문 수를 집계한다.
 * 실제 체결은 사용자별 시세 키(KIS)로 현재가 조회 후 placeOrder 체결 로직을 적용해야 하므로,
 * 배포 시 Vercel Cron 등록과 함께 완성한다(D5 — 개장 후 첫 시세 = 시초가).
 */
export async function runSettleJob(): Promise<SettleJobReport> {
  const admin = createAdminSupabase();
  const { count } = await admin
    .from('paper_trades')
    .select('id', { count: 'exact', head: true })
    .eq('order_type', 'reserved')
    .eq('status', 'pending');
  return { pending: count ?? 0, note: '예약 체결은 배포 시 개장 시각 크론으로 완성' };
}
