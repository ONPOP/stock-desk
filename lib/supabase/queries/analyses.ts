// AI 분석 DB 쿼리 (F7) — ai_analyses. 본인 행만(RLS).
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiAnalysis, AnalysisPosition } from '@/types';

interface AnalysisRow {
  id: string;
  model: string;
  trigger_type: string;
  result_md: string | null;
  position: string | null;
  confidence: number | string | null;
  created_at: string;
}

function rowToAnalysis(r: AnalysisRow): AiAnalysis {
  return {
    id: r.id,
    model: r.model as AiAnalysis['model'],
    triggerType: r.trigger_type as AiAnalysis['triggerType'],
    resultMd: r.result_md,
    position: (r.position as AnalysisPosition | null) ?? null,
    confidence: r.confidence == null ? null : Number(r.confidence),
    createdAt: r.created_at,
  };
}

const COLS = 'id, model, trigger_type, result_md, position, confidence, created_at';

export async function listAnalyses(db: SupabaseClient, stockId: string, limit = 10): Promise<AiAnalysis[]> {
  const { data, error } = await db
    .from('ai_analyses')
    .select(COLS)
    .eq('stock_id', stockId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`분석 조회 실패: ${error.message}`);
  return (data ?? []).map((r) => rowToAnalysis(r as AnalysisRow));
}

export async function insertAnalysis(
  db: SupabaseClient,
  userId: string,
  input: {
    stockId: string;
    model: 'gpt' | 'claude';
    triggerType: 'auto' | 'manual';
    contextSnapshot: Record<string, unknown>;
    resultMd: string;
    position: AnalysisPosition;
    confidence: number;
  },
): Promise<AiAnalysis> {
  const { data, error } = await db
    .from('ai_analyses')
    .insert({
      user_id: userId,
      stock_id: input.stockId,
      model: input.model,
      trigger_type: input.triggerType,
      context_snapshot: input.contextSnapshot,
      result_md: input.resultMd,
      position: input.position,
      confidence: input.confidence,
    })
    .select(COLS)
    .single();
  if (error) throw new Error(`분석 저장 실패: ${error.message}`);
  return rowToAnalysis(data as AnalysisRow);
}
