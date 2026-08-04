// 국내 호가 조회 (D15 실시간 탭) — KIS 전용 (Yahoo 폴백 불가: 호가 미제공).
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { getKisCredentials } from '@/lib/supabase/queries/settings';
import { KisClient } from '@/lib/providers/kis/client';
import { SupabaseTokenStore } from '@/lib/providers/kis/supabase-token-store';
import { getDomesticOrderbook } from '@/lib/providers/kis/orderbook';
import { orderbookQuerySchema } from '@/lib/validation/trading';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = orderbookQuerySchema.safeParse({
      ticker: new URL(req.url).searchParams.get('ticker'),
    });
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? '티커가 올바르지 않습니다.');

    let client: KisClient;
    try {
      const creds = await getKisCredentials(supabase, user.id);
      client = new KisClient(creds, { tokenStore: new SupabaseTokenStore() });
    } catch {
      throw new ValidationError('호가는 KIS 연동이 필요합니다. 설정에서 KIS API 키를 등록해주세요.');
    }
    return NextResponse.json({ orderbook: await getDomesticOrderbook(client, parsed.data.ticker) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
