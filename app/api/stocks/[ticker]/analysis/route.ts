// AI 투자 분석 (F7) — GET(이력), POST(수동 실행).
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { getStock } from '@/lib/supabase/queries/stocks';
import { listAnalyses } from '@/lib/supabase/queries/analyses';
import { runAnalysis } from '@/lib/services/analysis';
import { marketSchema, tickerSchema } from '@/lib/validation/market';

interface RouteCtx {
  params: Promise<{ ticker: string }>;
}

async function resolveStock(req: Request, ticker: string) {
  const { supabase, user } = await requireUser();
  const tk = tickerSchema.safeParse(ticker);
  const mk = marketSchema.safeParse(new URL(req.url).searchParams.get('market'));
  if (!tk.success || !mk.success) {
    throw new ValidationError(tk.error?.issues[0]?.message ?? mk.error?.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
  }
  const stock = await getStock(supabase, tk.data, mk.data);
  if (!stock) throw new ValidationError('등록되지 않은 종목입니다.');
  return { supabase, user, stock };
}

export async function GET(req: Request, { params }: RouteCtx) {
  try {
    const { ticker } = await params;
    const { supabase, stock } = await resolveStock(req, ticker);
    return NextResponse.json({ analyses: await listAnalyses(supabase, stock.id, 10) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: Request, { params }: RouteCtx) {
  try {
    const { ticker } = await params;
    const { supabase, user, stock } = await resolveStock(req, ticker);
    const result = await runAnalysis(supabase, user.id, stock, 'manual');
    const analyses = await listAnalyses(supabase, stock.id, 10);
    return NextResponse.json({ analyses, result });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
