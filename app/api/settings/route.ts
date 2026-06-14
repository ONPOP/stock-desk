import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { getSettingsView, patchSettings } from '@/lib/supabase/queries/settings';
import { clearQuoteSourceCache } from '@/lib/providers/quote-source';
import { settingsPatchSchema } from '@/lib/validation/settings';

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const view = await getSettingsView(supabase, user.id);
    return NextResponse.json(view);
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      throw new ValidationError('요청 본문이 JSON 형식이 아닙니다.');
    }
    const parsed = settingsPatchSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    }
    await patchSettings(supabase, user.id, parsed.data);
    clearQuoteSourceCache(user.id);
    const view = await getSettingsView(supabase, user.id);
    return NextResponse.json(view);
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
