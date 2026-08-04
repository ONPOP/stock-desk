// 엔진 초기 데이터 (D16) — 기본 슬롯(설계서 §7) · 신호 규칙 v1 · 엔진 설정 1행.
// 여러 번 실행해도 안전하다(upsert). 기존 값은 덮어쓰지 않는 항목을 구분해 둔다.
//
//   npx tsx scripts/engine/seed-engine.ts
import '../_bootstrap';

import { DEFAULT_RULE_VERSION, DEFAULT_SIGNAL_RULES } from '../../lib/engine/rules';
import { adminClient, resolveUserId } from './run-context';

/** 설계서 §7 스케줄 초기값 (KST, 미국 서머타임 기준 — 표준시 보정은 install-schedule이 한다) */
const DEFAULT_SLOTS = [
  { slot_id: 'kr_premarket', cron_kst: '30 8 * * 1-5', market: 'KR', slot_type: 'quick', label: '한국 장전 브리핑' },
  { slot_id: 'kr_open_check', cron_kst: '40 9 * * 1-5', market: 'KR', slot_type: 'quick', label: '한국 개장 흐름' },
  { slot_id: 'kr_close_buy', cron_kst: '50 14 * * 1-5', market: 'KR', slot_type: 'quick', label: '한국 종가 매수 판단' },
  { slot_id: 'kr_wrap', cron_kst: '30 16 * * 1-5', market: 'KR', slot_type: 'detail', label: '한국장 상세 리포트' },
  { slot_id: 'kr_grade', cron_kst: '40 9 * * 1-5', market: 'KR', slot_type: 'grade', label: '전일 KR 신호 채점' },
  { slot_id: 'us_premarket', cron_kst: '30 21 * * 1-5', market: 'US', slot_type: 'quick', label: '미국 프리마켓' },
  { slot_id: 'us_close_buy', cron_kst: '30 4 * * 2-6', market: 'US', slot_type: 'quick', label: '미국 종가 판단' },
  { slot_id: 'us_wrap', cron_kst: '0 7 * * 2-6', market: 'US', slot_type: 'detail', label: '미국장 상세 리포트' },
  { slot_id: 'us_grade', cron_kst: '30 22 * * 1-5', market: 'US', slot_type: 'grade', label: '전일 US 신호 채점' },
  { slot_id: 'weekly_review', cron_kst: '0 10 * * 6', market: 'BOTH', slot_type: 'weekly', label: '주간 성적 리뷰' },
] as const;

async function main(): Promise<void> {
  const db = adminClient();
  const userId = await resolveUserId(db);

  const { error: slotError } = await db
    .from('schedule_slots')
    .upsert(
      DEFAULT_SLOTS.map((s) => ({ ...s, user_id: userId })),
      { onConflict: 'user_id,slot_id', ignoreDuplicates: true },
    );
  if (slotError) throw new Error(`슬롯 시드 실패: ${slotError.message}`);

  // 규칙은 '기존 행 수정 금지'가 원칙 — 이미 active 버전이 있으면 건드리지 않는다
  const { data: existing } = await db
    .from('signal_rules')
    .select('id')
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();
  if (!existing) {
    const { error } = await db.from('signal_rules').insert({
      user_id: userId,
      version: DEFAULT_RULE_VERSION,
      rules: DEFAULT_SIGNAL_RULES,
      active: true,
      memo: '초기 버전 (설계서 §5)',
    });
    if (error) throw new Error(`신호 규칙 시드 실패: ${error.message}`);
  }

  const { error: settingsError } = await db
    .from('engine_settings')
    .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (settingsError) throw new Error(`엔진 설정 시드 실패: ${settingsError.message}`);

  const { count } = await db
    .from('schedule_slots')
    .select('slot_id', { count: 'exact', head: true })
    .eq('user_id', userId);

  console.log(`✅ 시드 완료 · 슬롯 ${count ?? 0}개 · 규칙 v${DEFAULT_RULE_VERSION}${existing ? '(기존 유지)' : ''}`);
}

main();
