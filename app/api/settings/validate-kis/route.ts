// KIS 키 검증 — 토큰 발급 + 국내(삼성전자)·해외(AAPL) 시세 1건 조회로 유효성 확인
// body 미전달 시 저장된 키 사용, 전달 시 저장 전 사전 검증
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { KisClient } from '@/lib/providers/kis/client';
import { getDomesticQuote, getOverseasQuote } from '@/lib/providers/kis/quote';
import { InMemoryTokenStore } from '@/lib/providers/kis/token-store';
import { SupabaseTokenStore } from '@/lib/providers/kis/supabase-token-store';
import { getKisCredentials } from '@/lib/supabase/queries/settings';
import { requireUser } from '@/lib/supabase/server';
import { validateKisSchema } from '@/lib/validation/settings';
import { formatMoney } from '@/lib/utils/money';

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();

    let json: unknown = {};
    const text = await req.text();
    if (text.trim().length > 0) {
      try {
        json = JSON.parse(text);
      } catch {
        throw new ValidationError('요청 본문이 JSON 형식이 아닙니다.');
      }
    }
    const parsed = validateKisSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    }

    const usingProvidedKeys = parsed.data.app_key !== undefined;
    const creds = usingProvidedKeys
      ? { appKey: parsed.data.app_key!, appSecret: parsed.data.app_secret! }
      : await getKisCredentials(supabase, user.id);

    // 미저장 키 검증은 임시 토큰 저장소 사용 (영속 캐시 오염 방지)
    const client = new KisClient(creds, {
      tokenStore: usingProvidedKeys ? new InMemoryTokenStore() : new SupabaseTokenStore(),
    });

    const domestic = await getDomesticQuote(client, '005930'); // 삼성전자
    let overseas: { ok: boolean; detail: string };
    try {
      const q = await getOverseasQuote(client, 'AAPL', 'NASDAQ');
      overseas = { ok: true, detail: `AAPL ${formatMoney(q.price, 'USD')}` };
    } catch (e) {
      // 해외시세 미신청 계정은 국내만 통과할 수 있음 — 부분 성공으로 안내
      overseas = { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }

    return NextResponse.json({
      ok: true,
      domestic: { ok: true, detail: `삼성전자 ${formatMoney(domestic.price, 'KRW')}` },
      overseas,
      message: overseas.ok
        ? 'KIS 키 검증 성공 — 국내·해외 시세 조회 정상'
        : 'KIS 키는 유효하나 해외 시세 조회에 실패했습니다. KIS Developers에서 해외주식 시세 신청 여부를 확인해주세요.',
    });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json({ ok: false, ...body }, { status });
  }
}
