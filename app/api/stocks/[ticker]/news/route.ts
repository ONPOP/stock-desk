// 종목 뉴스 (F5) — GET: DB 조회, POST: 수집+AI 요약·감성 후 반영.
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { getStock } from '@/lib/supabase/queries/stocks';
import { getNewsByStock } from '@/lib/supabase/queries/news';
import { refreshNews } from '@/lib/services/news';
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
    return NextResponse.json({ news: await getNewsByStock(supabase, stock.id, 30) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: Request, { params }: RouteCtx) {
  try {
    const { ticker } = await params;
    const { supabase, user, stock } = await resolveStock(req, ticker);
    const outcome = await refreshNews(supabase, user.id, stock);
    const news = await getNewsByStock(supabase, stock.id, 30);
    return NextResponse.json({ news, outcome });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
