// 신호 규칙 (D16) — 버전 목록 조회 / 새 버전 저장 / 활성 전환.
// 기존 행 수정은 제공하지 않는다: 버전별 성적을 비교하려면 이력이 보존돼야 한다.
import { NextResponse } from 'next/server';
import { NotFoundError, toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { listRuleVersions } from '@/lib/supabase/queries/engine-config';
import { rulesActivateSchema, rulesCreateSchema } from '@/lib/validation/engine';

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    return NextResponse.json({ versions: await listRuleVersions(supabase, user.id) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      throw new ValidationError('요청 본문이 JSON 형식이 아닙니다.');
    }
    const parsed = rulesCreateSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '규칙 값이 올바르지 않습니다.');
    }

    const { data: top } = await supabase
      .from('signal_rules')
      .select('version')
      .eq('user_id', user.id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (top?.version ?? 0) + 1;

    if (parsed.data.activate) {
      // 유저당 active는 1개만 허용(partial unique) — 먼저 내리고 새 행을 active로 넣는다
      const { error } = await supabase
        .from('signal_rules')
        .update({ active: false })
        .eq('user_id', user.id)
        .eq('active', true);
      if (error) throw new Error(`기존 버전 비활성화 실패: ${error.message}`);
    }

    const { error } = await supabase.from('signal_rules').insert({
      user_id: user.id,
      version: nextVersion,
      rules: parsed.data.rules,
      active: parsed.data.activate,
      memo: parsed.data.memo ?? null,
    });
    if (error) throw new Error(`규칙 저장 실패: ${error.message}`);

    return NextResponse.json({ version: nextVersion, versions: await listRuleVersions(supabase, user.id) });
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
    const parsed = rulesActivateSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError('버전 번호가 올바르지 않습니다.');

    const { data: target } = await supabase
      .from('signal_rules')
      .select('id')
      .eq('user_id', user.id)
      .eq('version', parsed.data.version)
      .maybeSingle();
    if (!target) throw new NotFoundError('해당 버전을 찾을 수 없습니다.');

    await supabase.from('signal_rules').update({ active: false }).eq('user_id', user.id).eq('active', true);
    const { error } = await supabase.from('signal_rules').update({ active: true }).eq('id', target.id);
    if (error) throw new Error(`활성 전환 실패: ${error.message}`);

    return NextResponse.json({ versions: await listRuleVersions(supabase, user.id) });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
