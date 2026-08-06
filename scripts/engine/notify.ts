// 슬롯 알림 (D16 Phase 2 · D18 확장) — 요약 텍스트 + 슬라이드 전량 발송.
//
//   npx tsx scripts/engine/notify.ts --slot kr_close_buy [--date 2026-08-04]
//   npx tsx scripts/engine/notify.ts --slot kr_close_buy --error "렌더 실패: ..."  # 실패 알림
import '../_bootstrap';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildTelegramSummary, type SnapshotSelected } from '../../lib/engine/slide-builder';
import { parseAnalysisOutput } from '../../lib/engine/slide-schema';
import {
  resolveTelegramConfig,
  sendMediaGroup,
  sendMessage,
  sendPhoto,
  sendSlotError,
  type TelegramConfig,
} from '../../lib/engine/telegram';
import { planSends, shouldNotify, type SendUnit } from '../../lib/engine/telegram-dispatch';
import { loadTelegramSettings, recordError } from '../../lib/engine/telegram-settings';
import { loadSettings, resolveRunDir } from './run-context';

/** 텔레그램 caption 표시 한도. 넘으면 잘라 caption에 붙이고 전문은 별도 sendMessage로 보낸다 */
const CAPTION_LIMIT = 1_024;
/** 같은 챗 초당 1건 레이트리밋 회피용 전송 단위 간 간격 */
const SEND_INTERVAL_MS = 1_000;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 슬라이드 1건(photo) 또는 여러 건(group)을 실제로 읽어 전송한다 */
async function sendUnit(cfg: TelegramConfig, storageRoot: string, unit: SendUnit, caption?: string): Promise<void> {
  if (unit.kind === 'photo') {
    const abs = path.join(storageRoot, unit.paths[0]);
    await sendPhoto(cfg, await readFile(abs), path.basename(unit.paths[0]), caption);
    return;
  }
  const photos = await Promise.all(
    unit.paths.map(async (rel) => ({
      bytes: await readFile(path.join(storageRoot, rel)),
      filename: path.basename(rel),
    })),
  );
  await sendMediaGroup(cfg, photos, caption);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { db, meta, dir } = await resolveRunDir(args.slot, args.date);
  const settings = await loadSettings(db, meta.userId);
  const telegramSettings = await loadTelegramSettings(db, meta.userId);
  // chat id: 신규 테이블(engine_telegram) 우선, 비어 있을 때만 구 컬럼(engine_settings)으로 폴백.
  // env(TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID)는 resolveTelegramConfig 내부에서 항상 최우선.
  const chatId = telegramSettings.chatId ?? settings.telegramChatId;
  const cfg = resolveTelegramConfig(chatId, telegramSettings.botToken);

  if (!cfg) {
    // 토큰 미설정은 오류가 아니다 — 로컬 산출물은 이미 만들어졌고 앱에서 볼 수 있다
    console.log('ℹ 텔레그램 설정(TELEGRAM_BOT_TOKEN / chat id)이 없어 발송을 건너뜁니다.');
    return;
  }

  if (args.error) {
    // 실패 알림은 슬롯 on/off 설정과 무관하게 항상 보낸다
    await sendSlotError(cfg, args.slot, args.step, args.error);
    console.log('✅ 실패 알림 발송');
    return;
  }

  if (!shouldNotify(args.slot, telegramSettings.enabledSlotIds)) {
    console.log(`ℹ 슬롯 ${args.slot}은 텔레그램 알림이 꺼져 있어 발송을 건너뜁니다.`);
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
  const fullText = `${summary}\n\n상세는 앱 · 리포트 탭에서 확인`;

  const slidePaths = JSON.parse(
    await readFile(path.join(dir, 'slide-paths.json'), 'utf8').catch(() => '[]'),
  ) as string[];
  const units = planSends(slidePaths);

  // 요약은 첫 전송 단위의 caption으로 병합한다. 슬라이드가 없거나 caption 한도를 넘으면
  // 전문을 별도 sendMessage로 보낸다(그 경우 caption에는 잘린 버전만 붙인다).
  const needsSeparateSummary = units.length === 0 || fullText.length > CAPTION_LIMIT;
  const firstCaption = fullText.length > CAPTION_LIMIT ? fullText.slice(0, CAPTION_LIMIT) : fullText;

  let hadFailure = false;
  let sentSlides = 0;
  let sentAnything = false;

  const dispatch = async (task: () => Promise<void>): Promise<void> => {
    if (sentAnything) await sleep(SEND_INTERVAL_MS);
    sentAnything = true;
    await task();
  };

  if (needsSeparateSummary) {
    try {
      await dispatch(() => sendMessage(cfg, fullText));
    } catch (err) {
      hadFailure = true;
      console.warn(`⚠ 요약 메시지 전송 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const caption = i === 0 ? firstCaption : undefined;
    try {
      await dispatch(() => sendUnit(cfg, meta.storageRoot, unit, caption));
      sentSlides += unit.paths.length;
    } catch (err) {
      // 전송 단위 하나의 실패가 알림 전체를 실패시키지 않는다 — 다음 단위를 계속 시도한다
      console.warn(`⚠ 슬라이드 전송 실패(${unit.paths.join(', ')}): ${err instanceof Error ? err.message : String(err)}`);
      hadFailure = true;
    }
  }

  try {
    await recordError(db, meta.userId, hadFailure ? '일부 슬라이드 전송 실패' : null);
  } catch (err) {
    // 오류 기록 자체의 실패로 알림 단계를 실패 처리하지 않는다 — 이미 보낼 건 다 보냈다
    console.warn(`⚠ 전송 결과 기록 실패: ${err instanceof Error ? err.message : String(err)}`);
  }

  const summaryCount = needsSeparateSummary ? 1 : 0;
  console.log(`✅ 알림 발송 · 요약 ${summaryCount}건 + 슬라이드 ${sentSlides}장`);
}

main();
