// 슬롯 알림 (D16 Phase 2) — 요약 텍스트 + 대표 슬라이드 이미지 발송.
//
//   npx tsx scripts/engine/notify.ts --slot kr_close_buy [--date 2026-08-04]
//   npx tsx scripts/engine/notify.ts --slot kr_close_buy --error "렌더 실패: ..."  # 실패 알림
import '../_bootstrap';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildTelegramSummary, type SnapshotSelected } from '../../lib/engine/slide-builder';
import { parseAnalysisOutput } from '../../lib/engine/slide-schema';
import { resolveTelegramConfig, sendMessage, sendPhoto, sendSlotError } from '../../lib/engine/telegram';
import { loadSettings, resolveRunDir } from './run-context';

/** 이미지로 보낼 대표 슬라이드 수 — 표지 + 시장개요 + 상위 종목 2장 */
const MAX_PHOTOS = 4;

interface Args {
  slot: string;
  date: string | null;
  error: string | null;
  step: string;
}

function parseArgs(argv: string[]): Args {
  let slot: string | null = null;
  let date: string | null = null;
  let error: string | null = null;
  let step = '알 수 없음';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--slot') slot = argv[++i] ?? null;
    else if (argv[i] === '--date') date = argv[++i] ?? null;
    else if (argv[i] === '--error') error = argv[++i] ?? null;
    else if (argv[i] === '--step') step = argv[++i] ?? step;
  }
  if (!slot) throw new Error('--slot <slot_id> 가 필요합니다.');
  return { slot, date, error, step };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { db, meta, dir } = await resolveRunDir(args.slot, args.date);
  const settings = await loadSettings(db, meta.userId);
  const cfg = resolveTelegramConfig(settings.telegramChatId);

  if (!cfg) {
    // 토큰 미설정은 오류가 아니다 — 로컬 산출물은 이미 만들어졌고 앱에서 볼 수 있다
    console.log('ℹ 텔레그램 설정(TELEGRAM_BOT_TOKEN / chat id)이 없어 발송을 건너뜁니다.');
    return;
  }

  if (args.error) {
    await sendSlotError(cfg, args.slot, args.step, args.error);
    console.log('✅ 실패 알림 발송');
    return;
  }

  const snapshot = JSON.parse(await readFile(path.join(dir, 'snapshot.json'), 'utf8')) as {
    selected: SnapshotSelected[];
    failed: Array<{ ticker: string }>;
  };
  const analysis = parseAnalysisOutput(JSON.parse(await readFile(path.join(dir, 'analysis.json'), 'utf8')));

  const summary = buildTelegramSummary({
    slotLabel: meta.label ?? meta.slotId,
    runAtKst: meta.runAtKst ?? meta.runDate,
    analysis,
    selected: snapshot.selected,
    failedTickers: snapshot.failed.map((f) => f.ticker),
    grade: null,
  });
  await sendMessage(cfg, `${summary}\n\n상세는 앱 · 리포트 탭에서 확인`);

  const slidePaths = JSON.parse(
    await readFile(path.join(dir, 'slide-paths.json'), 'utf8').catch(() => '[]'),
  ) as string[];

  let sent = 0;
  for (const rel of slidePaths.slice(0, MAX_PHOTOS)) {
    const abs = path.join(meta.storageRoot, rel);
    try {
      await sendPhoto(cfg, await readFile(abs), path.basename(rel));
      sent++;
    } catch (err) {
      // 일부 이미지 실패로 알림 전체를 실패시키지 않는다 (요약 텍스트는 이미 전달됨)
      console.warn(`⚠ 슬라이드 전송 실패(${rel}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`✅ 알림 발송 · 요약 1건 + 슬라이드 ${sent}장`);
}

main();
