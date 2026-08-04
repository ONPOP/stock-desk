// 테마 (D16) — 테마 CRUD + 종목 편입/제외.
// 종목 참조는 stock_id (기존 watchlist_items·price_candles와 동일 컨벤션).
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { listThemes } from '@/lib/supabase/queries/engine-config';
import { themeCreateSchema, themeStockSchema } from '@/lib/validation/engine';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ValidationError('요청 본문이 JSON 형식이 아닙니다.');
  }
}

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    return NextResponse.json({ themes: await listThemes(supabase, user.id) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = themeCreateSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    }
    const { error } = await supabase.from('analysis_themes').insert({
      user_id: user.id,
      name: parsed.data.name,
      market: parsed.data.market,
      description: parsed.data.description ?? null,
    });
    if (error) {
      throw new ValidationError(
        error.code === '23505' ? '같은 이름의 테마가 이미 있습니다.' : `테마 생성 실패: ${error.message}`,
      );
    }
    return NextResponse.json({ themes: await listThemes(supabase, user.id) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

/** 종목 편입 — add=true면 추가, false면 제외 */
export async function PATCH(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = themeStockSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '테마·종목 정보가 올바르지 않습니다.');
    }

    // 남의 테마를 건드리지 못하게 소유권을 먼저 확인한다 (RLS와 별개로 명시적 검증)
    const { data: theme } = await supabase
      .from('analysis_themes')
      .select('id')
      .eq('user_id', user.id)
      .eq('id', parsed.data.themeId)
      .maybeSingle();
    if (!theme) throw new ValidationError('테마를 찾을 수 없습니다.');

    let stockId = parsed.data.stockId;
    if (!stockId) {
      const { data: stock } = await supabase
        .from('stocks')
        .select('id')
        .eq('ticker', parsed.data.ticker!)
        .eq('market', parsed.data.market!)
        .maybeSingle();
      if (!stock) throw new ValidationError('종목을 찾을 수 없습니다.');
      stockId = stock.id as string;
    }

    if (!parsed.data.add) {
      const { error } = await supabase
        .from('theme_stocks')
        .delete()
        .eq('theme_id', parsed.data.themeId)
        .eq('stock_id', stockId);
      if (error) throw new Error(`종목 제외 실패: ${error.message}`);
    } else {
      const { error } = await supabase
        .from('theme_stocks')
        .upsert(
          { theme_id: parsed.data.themeId, stock_id: stockId },
          { onConflict: 'theme_id,stock_id', ignoreDuplicates: true },
        );
      if (error) throw new Error(`종목 편입 실패: ${error.message}`);
    }
    return NextResponse.json({ themes: await listThemes(supabase, user.id) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const id = new URL(req.url).searchParams.get('id') ?? '';
    if (!UUID_RE.test(id)) throw new ValidationError('테마 ID가 올바르지 않습니다.');

    const { error } = await supabase.from('analysis_themes').delete().eq('user_id', user.id).eq('id', id);
    if (error) throw new Error(`테마 삭제 실패: ${error.message}`);
    return NextResponse.json({ themes: await listThemes(supabase, user.id) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
