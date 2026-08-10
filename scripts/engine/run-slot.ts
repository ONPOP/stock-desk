// 슬롯 오케스트레이터 (D16 Phase 2) — 수집 → Claude 분석 → 슬라이드 렌더 → 적재 → 알림.
//
//   npx tsx scripts/engine/run-slot.ts kr_close_buy [--date 2026-08-04] [--skip-claude]
//
// 오케스트레이션을 bash가 아니라 TS로 두는 이유: 단계별 실패 처리·텔레그램 에러 알림·슬롯 유형 분기를
// 한 곳에서 타입 안전하게 다루기 위함. run-slot.sh는 launchd 진입점(로그 리다이렉트)일 뿐이다.
import '../_bootstrap';

import { spawn } from 'node:child_process';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { dateInTz, KST_TZ } from '../../lib/utils/date';
import { dataDir } from '../../lib/engine/data-dir';
import { sendSlotError, setTelegramFetch } from '../../lib/engine/telegram';
import { resolveTelegramConfigForUser } from '../../lib/engine/telegram-settings';
import { adminClient, loadSettings, resolveUserId } from './run-context';
import { engineFetch } from './http-dispatcher';

// 실패 알림까지 내장 fetch의 죽은 세션에 걸리면 "왜 죽었는지"조차 못 받는다
setTelegramFetch(engineFetch);

type SlotType = 'quick' | 'detail' | 'grade' | 'weekly';

const PROMPT_FILE = path.resolve(process.cwd(), 'scripts/engine/prompts/slot-analysis.md');

const DETAIL_EXTRA = `
## 이 슬롯은 detail 유형이다
스킬의 "detail 슬롯 추가 절차"를 따른다. themeFlows를 등록된 테마 전부로 채우고,
macroEvents에 향후 5영업일 리스크 캘린더를 포함하라.`;

const WEEKLY_EXTRA = `
## 이 슬롯은 weekly 유형이다
스킬의 "weekly 슬롯 절차"를 따른다. grade.json을 읽어 적중률·패인을 분석하고
signal_rules 개선안을 \`ruleProposals\` 배열에 항목별로 제안만 하라 (DB 수정 금지).
개선안을 \`marketOverview.summary\`에 넣지 마라 — 시장 개요 슬라이드가 넘쳐 잘린다.
개선안은 별도 슬라이드로 렌더된다.`;

interface StepResult {
  ok: boolean;
  reason?: string;
}

function run(cmd: string, args: string[], label: string): Promise<StepResult> {
  return new Promise((resolve) => {
    console.log(`\n▶ ${label}\n  $ ${cmd} ${args.map((a) => (a.includes(' ') ? '"…"' : a)).join(' ')}`);
    const child = spawn(cmd, args, { stdio: 'inherit', env: process.env });
    child.on('error', (err) => resolve({ ok: false, reason: `${label} 실행 불가: ${err.message}` }));
    child.on('close', (code) =>
      resolve(code === 0 ? { ok: true } : { ok: false, reason: `${label} 실패 (exit ${code})` }),
    );
  });
}

const tsx = (script: string, args: string[]) => run('npx', ['tsx', `scripts/engine/${script}`, ...args], script);

async function buildPrompt(dir: string, slotId: string, slotType: SlotType, runDate: string): Promise<string> {
  const template = await readFile(PROMPT_FILE, 'utf8');
  const extra = slotType === 'detail' ? DETAIL_EXTRA : slotType === 'weekly' ? WEEKLY_EXTRA : '';
  return template
    .replaceAll('{{DIR}}', dir)
    .replaceAll('{{SLOT_ID}}', slotId)
    .replaceAll('{{SLOT_TYPE}}', slotType)
    .replaceAll('{{RUN_DATE}}', runDate)
    .replaceAll('{{EXTRA}}', extra);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const slotId = argv.find((a) => !a.startsWith('--'));
  if (!slotId) throw new Error('사용법: run-slot.ts <slot_id> [--date YYYY-MM-DD] [--skip-claude]');
  const dateIdx = argv.indexOf('--date');
  const runDate = dateIdx >= 0 ? argv[dateIdx + 1] : dateInTz(new Date(), KST_TZ);
  const skipClaude = argv.includes('--skip-claude');

  const db = adminClient();
  const userId = await resolveUserId(db);
  const settings = await loadSettings(db, userId);
  // notify.ts와 동일한 병합 규칙(env > engine_telegram(신규) > engine_settings(구))을 공유 헬퍼로 적용한다.
  // engine_telegram 조회가 실패해도 헬퍼 내부에서 흡수하므로, 이 슬롯 자체를 죽이지 않는다.
  const telegram = (await resolveTelegramConfigForUser(db, userId, settings.telegramChatId)).config;

  const { data: slot } = await db
    .from('schedule_slots')
    .select('slot_type, market, label')
    .eq('user_id', userId)
    .eq('slot_id', slotId)
    .maybeSingle();
  const slotType: SlotType = (slot?.slot_type as SlotType) ?? 'quick';
  const market = (slot?.market as 'KR' | 'US' | 'BOTH') ?? 'BOTH';

  await mkdir(path.join(dataDir(), 'logs', runDate), { recursive: true });
  console.log(`■ 슬롯 ${slotId} (${slotType} · ${market}) · ${runDate}`);

  const fail = async (step: string, reason: string): Promise<never> => {
    console.error(`\n❌ ${reason}`);
    if (telegram) await sendSlotError(telegram, slotId, step, reason).catch(() => undefined);
    process.exit(1);
  };

  // grade 슬롯은 Claude를 쓰지 않는다 (순수 계산 — 사용량 예산 0)
  if (slotType === 'grade') {
    const g = await tsx('grade-signals.ts', ['--market', market, '--date', runDate]);
    if (!g.ok) await fail('채점', g.reason ?? '실패');
    console.log('\n✅ 채점 슬롯 완료');
    return;
  }

  // [1] 수집·지표·스코어링
  const step1 = await tsx('pipeline.ts', ['--slot', slotId, '--market', market]);
  if (!step1.ok) await fail('수집', step1.reason ?? '실패');

  // 주간 슬롯은 성적 데이터를 먼저 만든다 (Claude가 grade.json을 읽는다)
  if (slotType === 'weekly') {
    const g = await tsx('grade-report.ts', ['--slot', slotId, '--date', runDate, '--days', '7']);
    if (!g.ok) await fail('주간 성적 집계', g.reason ?? '실패');
  }

  const { dir } = await import('./run-context').then((m) => m.resolveRunDir(slotId, runDate));
  const analysisPath = path.join(dir, 'analysis.json');

  // [2] Claude 헤드리스 분석 — 필요한 도구만 허용한다 (--dangerously-skip-permissions 사용 금지)
  if (!skipClaude) {
    const prompt = await buildPrompt(dir, slotId, slotType, runDate);
    const step2 = await run('claude', ['-p', prompt, '--allowedTools', 'Read,Write,WebSearch,WebFetch'], 'claude 분석');
    if (!step2.ok) await fail('분석', step2.reason ?? '실패');
  }
  if (!(await fileExists(analysisPath))) {
    await fail('분석', `analysis.json이 생성되지 않았습니다: ${analysisPath}`);
  }

  // [3] 슬라이드 렌더 (WebP + 썸네일)
  const step3 = await tsx('render-slides.ts', ['--slot', slotId, '--date', runDate]);
  if (!step3.ok) await fail('렌더', step3.reason ?? '실패');

  // [4] 적재 — 알림보다 먼저 한다. 알림을 보고 앱을 열었을 때 리포트가 이미 있어야 한다
  const step4 = await tsx('archive.ts', ['--slot', slotId, '--date', runDate]);
  if (!step4.ok) await fail('적재', step4.reason ?? '실패');

  // [5] 알림 — 텔레그램은 로컬 파일을 읽는다(불변식 9). 정리는 반드시 이 뒤다.
  const step5 = await tsx('notify.ts', ['--slot', slotId, '--date', runDate]);
  if (!step5.ok) await fail('알림', step5.reason ?? '실패');

  // [6] 로컬 원본 정리 (D19 ⑧) — **반드시 알림 다음이다.** 텔레그램이 로컬 파일을 읽는다(불변식 9).
  //     삭제 직전에 원격 객체를 장별로 다시 대조하므로(불변식 1), 업로드가 덜 됐으면 스스로 건너뛴다.
  //     뒷정리라 실패해도 슬롯을 실패로 만들지 않는다.
  const step6 = await tsx('cleanup-local.ts', ['--slot', slotId, '--date', runDate]);
  if (!step6.ok) console.warn(`⚠ 로컬 정리 실패(슬롯은 성공 처리): ${step6.reason ?? '실패'}`);

  // [7] 만료 정리 (D19) — 알림까지 끝난 뒤의 뒷정리라 실패해도 슬롯을 실패로 만들지 않는다.
  //     정리는 멱등이므로 다음 실행에서 다시 시도된다.
  //     --include-news: news_items는 user_id가 없는 공용 테이블이라 전역 삭제다(사용자 승인 2026-08-10).
  const step7 = await tsx('purge.ts', ['--include-news']);
  if (!step7.ok) console.warn(`⚠ 정리 실패(슬롯은 성공 처리): ${step7.reason ?? '실패'}`);

  console.log(`\n✅ 슬롯 ${slotId} 완료`);
}

main();
