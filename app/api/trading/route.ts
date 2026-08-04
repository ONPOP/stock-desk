// 자동매매 설정·시그널 (D15) — GET(설정+최근 시그널), PATCH(설정 변경).
// 파라미터는 부분 입력을 기존값과 병합 후 전체 스키마로 검증 (범위 밖 값 차단).
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { getTradingConfig, patchTradingConfig, listSignals } from '@/lib/supabase/queries/trading';
import { strategyParamsSchema, tradingPatchSchema } from '@/lib/validation/trading';

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const [config, signals] = await Promise.all([
      getTradingConfig(supabase, user.id),
      listSignals(supabase, user.id, 50),
    ]);
    return NextResponse.json({ config, signals });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const json = await req.json().catch(() => null);
    const parsed = tradingPatchSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');

    // params 부분 변경 → 기존값 병합 후 전체 재검증 (fast<slow 등 관계 제약 포함)
    let params;
    if (parsed.data.params !== undefined) {
      const current = await getTradingConfig(supabase, user.id);
      const merged = strategyParamsSchema.safeParse({ ...current.params, ...parsed.data.params });
      if (!merged.success) throw new ValidationError(merged.error.issues[0]?.message ?? '파라미터가 올바르지 않습니다.');
      params = merged.data;
    }

    await patchTradingConfig(supabase, user.id, {
      enabled: parsed.data.enabled,
      killSwitch: parsed.data.killSwitch,
      params,
      universe: parsed.data.universe,
    });
    return NextResponse.json({ config: await getTradingConfig(supabase, user.id) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
