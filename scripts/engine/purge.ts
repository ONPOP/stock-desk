// 만료 정리 (D19) — 슬라이드 원본 객체 · 슬라이드 정의 · 스냅샷을 보존 기간에 맞춰 지운다.
//
//   npx tsx scripts/engine/purge.ts --dry            계획만 출력 (아무것도 지우지 않는다)
//   npx tsx scripts/engine/purge.ts                  실행
//   npx tsx scripts/engine/purge.ts --include-news   공용 news_items까지 (아래 경고 참고)
//
// `--dry`가 출력하는 목록이 곧 실행 대상이다 — 같은 planPurge 결과를 쓴다.
// run-slot.ts가 notify 다음 단계로 부르며, 실패해도 슬롯을 실패로 만들지 않는다(정리는 멱등이다).
import '../_bootstrap';

import { dateInTz, KST_TZ } from '../../lib/utils/date';
import { loadEngineSettings } from '../../lib/engine/repository';
import { executePurge, planPurge, SNAPSHOT_RETENTION_DAYS } from '../../lib/engine/retention';
import { adminClient, resolveUserId } from './run-context';

export async function runPurge(opts: { dry: boolean; includeSharedNews: boolean }): Promise<void> {
  const db = adminClient();
  const userId = await resolveUserId(db);
  const settings = await loadEngineSettings(db, userId);
  const today = dateInTz(new Date(), KST_TZ);

  const plan = await planPurge(db, userId, today, settings.retentionDays);

  console.log(`기준일 ${today} (KST)`);
  console.log(
    settings.retentionDays > 0
      ? `슬라이드 보존 ${settings.retentionDays}일 → 만료 리포트 ${plan.slideReports.length}건`
      : '슬라이드 보존 = 무제한(retention_days 0) → 이미지 정리 없음',
  );
  for (const r of plan.slideReports) console.log(`   - ${r.runDate} ${r.prefix}`);
  console.log(`스냅샷 보존 ${SNAPSHOT_RETENTION_DAYS}일 → ${plan.snapshotCutoff} 미만 삭제`);
  console.log(`   보호되는 최신 run ${plan.latestProtected.length}개: ${plan.latestProtected
    .map((p) => `${p.runDate}/${p.slotId}`)
    .join(', ')}`);
  if (opts.includeSharedNews) {
    console.log(`⚠ news_items는 user_id가 없는 공용 테이블이다 — ${plan.newsCutoff} 미만을 전역 삭제한다.`);
  } else {
    console.log(`뉴스 정리 건너뜀 (공용 테이블이라 user 스코프를 걸 수 없다 — 필요하면 --include-news)`);
  }

  if (opts.dry) {
    console.log('\n--dry 이므로 아무것도 지우지 않았습니다.');
    return;
  }

  const counts = await executePurge(db, userId, plan, { includeSharedNews: opts.includeSharedNews });
  console.log(
    `\n✅ 정리 완료 · 객체 ${counts.objects}개 · 슬라이드 정의 ${counts.slidesCleared}건 · ` +
      `스냅샷 ${counts.snapshots}행 · 뉴스 ${counts.news}행`,
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  await runPurge({ dry: argv.includes('--dry'), includeSharedNews: argv.includes('--include-news') });
}

main();
