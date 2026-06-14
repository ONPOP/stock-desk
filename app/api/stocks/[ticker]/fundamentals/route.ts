// 펀더멘털 (F4/F15/F12) — GET: DB 조회(외부 호출 없음), POST: 외부 소스 수집 후 반영.
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { getStock } from '@/lib/supabase/queries/stocks';
import {
  getMetricsSeries,
  getDividendsByStock,
  getDisclosuresByStock,
} from '@/lib/supabase/queries/fundamentals';
import { refreshFundamentals } from '@/lib/services/fundamentals';
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

async function readFundamentals(db: Parameters<typeof getMetricsSeries>[0], stockId: string) {
  const [metrics, dividends, disclosures] = await Promise.all([
    getMetricsSeries(db, stockId, 8),
    getDividendsByStock(db, stockId, 24),
    getDisclosuresByStock(db, stockId, 50),
  ]);
  return { metrics, dividends, disclosures };
}

export async function GET(req: Request, { params }: RouteCtx) {
  try {
    const { ticker } = await params;
    const { supabase, stock } = await resolveStock(req, ticker);
    return NextResponse.json(await readFundamentals(supabase, stock.id));
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: Request, { params }: RouteCtx) {
  try {
    const { ticker } = await params;
    const { supabase, user, stock } = await resolveStock(req, ticker);
    const outcome = await refreshFundamentals(supabase, user.id, stock);
    const data = await readFundamentals(supabase, stock.id);
    return NextResponse.json({ ...data, outcome });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
