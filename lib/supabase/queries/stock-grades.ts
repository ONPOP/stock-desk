// 사용자 종목 등급(D22) — 종목 단위(탭 무관). RLS가 user_id로 격리하나 쿼리에도 명시해 이중 방어.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StockGrade, UserStockGrade } from '@/types';

interface GradeRow {
  stock_id: string;
  grade: StockGrade;
  reason: string | null;
  graded_at: string;
}

const toGrade = (r: GradeRow): UserStockGrade => ({
  stockId: r.stock_id,
  grade: r.grade,
  reason: r.reason,
  gradedAt: r.graded_at,
});

export async function listStockGrades(db: SupabaseClient, userId: string): Promise<Record<string, UserStockGrade>> {
  const { data, error } = await db
    .from('user_stock_grades')
    .select('stock_id, grade, reason, graded_at')
    .eq('user_id', userId);
  if (error) throw new Error(`종목 등급 조회 실패: ${error.message}`);
  const out: Record<string, UserStockGrade> = {};
  for (const r of data as GradeRow[]) out[r.stock_id] = toGrade(r);
  return out;
}

export async function upsertStockGrade(
  db: SupabaseClient,
  userId: string,
  stockId: string,
  grade: StockGrade,
  reason: string | null,
): Promise<UserStockGrade> {
  const { data, error } = await db
    .from('user_stock_grades')
    .upsert(
      // graded_at을 명시해야 수정 시에도 지정일이 갱신된다(default는 insert에만 적용)
      { user_id: userId, stock_id: stockId, grade, reason, graded_at: new Date().toISOString() },
      { onConflict: 'user_id,stock_id' },
    )
    .select('stock_id, grade, reason, graded_at')
    .single();
  if (error) throw new Error(`종목 등급 저장 실패: ${error.message}`);
  return toGrade(data as GradeRow);
}

export async function deleteStockGrade(db: SupabaseClient, userId: string, stockId: string): Promise<void> {
  const { error } = await db.from('user_stock_grades').delete().eq('user_id', userId).eq('stock_id', stockId);
  if (error) throw new Error(`종목 등급 해제 실패: ${error.message}`);
}
