// 분석 리포트 조회 (D16) — /reports 아카이브 뷰어용. 날짜 → 슬롯 → 슬라이드 순으로 좁혀 읽는다.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ReportSummary {
  id: string;
  slotId: string;
  runDate: string;
  runAt: string;
  slideCount: number;
  storageState: 'pending' | 'stored' | 'fallback';
  /** 커버 슬라이드에서 뽑은 헤드라인 (없으면 null) */
  headline: string | null;
  buyCount: number;
  avoidCount: number;
  stockCount: number;
}

interface ReportRow {
  id: string;
  slot_id: string;
  run_date: string;
  run_at: string;
  slide_paths: string[] | null;
  storage_state: 'pending' | 'stored' | 'fallback';
  slides: Array<{ kind: string; headline?: string }> | null;
  stock_cards: Array<{ signal: string }> | null;
  thumb_bucket_path: string | null;
}

function toSummary(r: ReportRow): ReportSummary {
  const cards = r.stock_cards ?? [];
  const cover = (r.slides ?? []).find((s) => s.kind === 'cover');
  return {
    id: r.id,
    slotId: r.slot_id,
    runDate: r.run_date,
    runAt: r.run_at,
    slideCount: r.slide_paths?.length ?? 0,
    storageState: r.storage_state,
    headline: cover?.headline ?? null,
    buyCount: cards.filter((c) => c.signal === 'BUY').length,
    avoidCount: cards.filter((c) => c.signal === 'AVOID').length,
    stockCount: cards.length,
  };
}

const SUMMARY_COLUMNS =
  'id, slot_id, run_date, run_at, slide_paths, storage_state, slides, stock_cards, thumb_bucket_path';

/** 리포트가 존재하는 날짜 목록 (최신순) — 좌측 날짜 레일 */
export async function listReportDates(db: SupabaseClient, userId: string, limit = 120): Promise<string[]> {
  const { data, error } = await db
    .from('analysis_reports')
    .select('run_date')
    .eq('user_id', userId)
    .order('run_date', { ascending: false })
    .limit(limit * 6); // 하루 최대 ~10슬롯이라 넉넉히 읽고 중복 제거
  if (error) throw new Error(`리포트 날짜 조회 실패: ${error.message}`);

  const seen: string[] = [];
  for (const row of data ?? []) {
    if (!seen.includes(row.run_date)) seen.push(row.run_date as string);
    if (seen.length >= limit) break;
  }
  return seen;
}

/** 특정 날짜의 슬롯 리포트 (시각순) */
export async function listReportsByDate(
  db: SupabaseClient,
  userId: string,
  runDate: string,
): Promise<ReportSummary[]> {
  const { data, error } = await db
    .from('analysis_reports')
    .select(SUMMARY_COLUMNS)
    .eq('user_id', userId)
    .eq('run_date', runDate)
    .order('run_at', { ascending: true });
  if (error) throw new Error(`리포트 조회 실패: ${error.message}`);
  return ((data ?? []) as unknown as ReportRow[]).map(toSummary);
}

/** 가장 최근 리포트가 있는 날짜 (없으면 null) */
export async function latestReportDate(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await db
    .from('analysis_reports')
    .select('run_date')
    .eq('user_id', userId)
    .order('run_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`최근 리포트 조회 실패: ${error.message}`);
  return data?.run_date ?? null;
}

export interface ReportDetail extends ReportSummary {
  slidePaths: string[];
  /** Storage 프리픽스(`{userId}/{runDate}/{slotId}`) — 슬라이드 서빙에서만 쓴다 */
  bucketPrefix: string | null;
}

export async function getReport(
  db: SupabaseClient,
  userId: string,
  reportId: string,
): Promise<ReportDetail | null> {
  const { data, error } = await db
    .from('analysis_reports')
    .select(SUMMARY_COLUMNS)
    .eq('user_id', userId)
    .eq('id', reportId)
    .maybeSingle();
  if (error) throw new Error(`리포트 조회 실패: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as ReportRow;
  return { ...toSummary(row), slidePaths: row.slide_paths ?? [], bucketPrefix: row.thumb_bucket_path };
}
