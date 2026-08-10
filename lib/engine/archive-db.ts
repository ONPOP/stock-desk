// 슬롯 결과 DB 적재 (D16 Phase 2 · D19) — analysis_reports upsert · slot_signals 교체.
//
// scripts/engine/archive.ts에서 떼어낸 이유는 두 가지다.
//   1. 이 기기의 Wi-Fi 경로가 간헐적으로 TLS 레코드를 손상시켜 적재가 통째로 실패한다(net-retry.ts 참고).
//      "무엇을 한 재시도 단위로 묶는가"가 멱등성을 좌우하는 로직이라 테스트로 고정해야 한다.
//   2. vitest include가 scripts/를 잡지 않고, archive.ts는 모듈을 import하면 main()이 돌아버린다.
//
// server-only를 import하지 않는다 — tsx로 직접 실행되는 scripts/engine/*가 쓴다.
import type { SupabaseClient } from '@supabase/supabase-js';
import { withNetworkRetry, type NetworkRetryOptions } from './net-retry';
import type { Confidence, Signal } from './slide-schema';

export interface ReportUpsert {
  userId: string;
  slotId: string;
  runDate: string;
  runAt: string;
  marketOverview: unknown;
  stockCards: unknown;
  slides: unknown;
  slidePaths: string[];
  storageState: string;
  thumbBucketPath: string | null;
  usageNote: string;
}

/** `report_id`는 여기서 채우지 않는다 — replaceSignals가 방금 비운 리포트의 id를 직접 찍는다 */
export interface SlotSignalRow {
  user_id: string;
  stock_id: string;
  signal_date: string;
  signal: Signal;
  confidence: Confidence;
  entry_low: number | null;
  entry_high: number | null;
  rule_version: number;
  close_price: number | null;
}

/**
 * supabase-js는 전송 계층 실패를 throw가 아니라 `{ error }`로 돌려준다
 * (2026-08-10 실측: message가 그대로 `"TypeError: fetch failed"`다).
 * 재시도 판정은 **던져진** 오류를 보므로, 여기서 Error로 승격시키지 않으면 한 번도 다시 시도되지 않는다.
 * 스키마 오류처럼 다시 해도 같은 결과인 것은 승격돼도 isTransient에 걸리지 않아 즉시 올라간다.
 */
function raise(label: string, error: { message: string } | null): void {
  if (error) throw new Error(`${label}: ${error.message}`);
}

/** 리포트를 적재하고 id를 돌려준다. upsert라 몇 번을 다시 시도해도 같은 한 행이다. */
export async function upsertReport(
  db: SupabaseClient,
  report: ReportUpsert,
  retry: NetworkRetryOptions = {},
): Promise<string> {
  return withNetworkRetry(
    async () => {
      const { data, error } = await db
        .from('analysis_reports')
        .upsert(
          {
            user_id: report.userId,
            slot_id: report.slotId,
            run_date: report.runDate,
            run_at: report.runAt,
            market_overview: report.marketOverview,
            stock_cards: report.stockCards,
            slides: report.slides,
            slide_paths: report.slidePaths,
            storage_state: report.storageState,
            thumb_bucket_path: report.thumbBucketPath,
            usage_note: report.usageNote,
          },
          { onConflict: 'user_id,run_date,slot_id' },
        )
        .select('id')
        .single();
      raise('리포트 적재 실패', error);
      const id = (data as { id?: string } | null)?.id;
      if (!id) throw new Error('리포트 적재 실패: 응답에 id가 없습니다.');
      return id;
    },
    '리포트 적재',
    retry,
  );
}

/**
 * 같은 리포트의 신호를 통째로 교체한다. 적재한 행 수를 돌려준다.
 *
 * 삭제와 삽입을 **한 재시도 단위로 묶는 것**이 이 함수의 핵심이다.
 * 삽입 요청이 서버에 닿은 뒤 응답만 유실되는 경우가 있는데(TLS 레코드 손상은 어느 방향에서든 난다),
 * 삽입만 다시 하면 같은 신호가 두 벌 남는다. 매 시도가 삭제부터 시작해야 몇 번을 재시도해도 결과가 같다.
 *
 * 행이 없어도 삭제는 한다 — 재실행으로 선정이 줄었을 때 옛 신호가 남으면 안 된다.
 */
export async function replaceSignals(
  db: SupabaseClient,
  reportId: string,
  rows: SlotSignalRow[],
  retry: NetworkRetryOptions = {},
): Promise<number> {
  return withNetworkRetry(
    async () => {
      const { error: deleteError } = await db.from('slot_signals').delete().eq('report_id', reportId);
      raise('기존 신호 삭제 실패', deleteError);
      if (rows.length === 0) return 0;

      const { error } = await db.from('slot_signals').insert(rows.map((r) => ({ ...r, report_id: reportId })));
      raise('신호 적재 실패', error);
      return rows.length;
    },
    '신호 적재',
    retry,
  );
}
