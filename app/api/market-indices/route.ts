// 시장 지수 위젯 데이터 (F11).
import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { getMarketIndices } from '@/lib/providers/yahoo/market-index';

export async function GET() {
  try {
    await requireUser();
    const indices = await getMarketIndices();
    return NextResponse.json({ indices });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
