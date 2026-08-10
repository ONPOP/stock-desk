// 슬롯 결과 적재 (D16 Phase 2) — analysis_reports · slot_signals + 슬라이드 원본·썸네일 업로드(D19).
//
//   npx tsx scripts/engine/archive.ts --slot kr_close_buy [--date 2026-08-04]
//
// 실패해도 로컬 산출물은 이미 디스크에 있으므로, DB 적재 실패는 fallback 큐에 남기고 다음 실행에서 재시도한다.
import '../_bootstrap';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Slide, StockCard } from '../../lib/engine/slide-schema';
import { replaceSignals, upsertReport, type SlotSignalRow } from '../../lib/engine/archive-db';
import { fallbackDir } from '../../lib/engine/fallback-queue';
import { slidePrefix, uploadRunAssets } from '../../lib/engine/slide-storage';
import { resolveRunDir, type RunMeta } from './run-context';

interface SnapshotFileLite {
  ruleVersion: number;
  selected: Array<{ stockId: string; ticker: string; priceData: { close: number } }>;
}

interface AnalysisFileLite {
  marketOverview: unknown;
  stockCards: StockCard[];
  usageNote: string;
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

/** 진입가 구간을 최소 통화 단위 정수 쌍으로 (없으면 null) */
function entryOf(card: StockCard): { low: number | null; high: number | null } {
  if (!card.entryZone) return { low: null, high: null };
  return { low: card.entryZone.low, high: card.entryZone.high };
}

export interface ArchiveResult {
  reportId: string;
  signals: number;
  slides: number;
  /** 원본이 전량 업로드됐는가 — 로컬 삭제의 유일한 근거다(불변식 1) */
  slidesUploaded: boolean;
}

export async function archiveSlot(db: SupabaseClient, meta: RunMeta, dir: string): Promise<ArchiveResult> {
  const snapshot = await readJson<SnapshotFileLite>(path.join(dir, 'snapshot.json'));
  const analysis = await readJson<AnalysisFileLite>(path.join(dir, 'analysis.json'));
  const slides = await readJson<Slide[]>(path.join(dir, 'slides.json')).catch(() => [] as Slide[]);
  const slidePaths = await readJson<string[]>(path.join(dir, 'slide-paths.json')).catch(() => [] as string[]);

  // 원본까지 Storage에 올린다(D19). 실패해도 DB 적재는 계속한다 — 리포트 본문은 이미지 없이도 가치가 있다.
  const upload = await uploadRunAssets(db, dir, slidePrefix(meta.userId, meta.runDate, meta.slotId));
  const thumbPrefix = upload.slides > 0 || upload.thumbs > 0 ? upload.prefix : null;
  const slidesUploaded = slidePaths.length > 0 && upload.slides === slidePaths.length;

  // 이 기기의 Wi-Fi 경로는 간헐적으로 TLS 레코드를 손상시킨다(2026-08-10 규명). supabase-js는 그 실패를
  // throw가 아니라 { error }로 돌려주므로 재시도는 archive-db.ts가 Error로 승격시킨 뒤에 건다.
  const reportId = await upsertReport(db, {
    userId: meta.userId,
    slotId: meta.slotId,
    runDate: meta.runDate,
    runAt: meta.capturedAt,
    marketOverview: analysis.marketOverview,
    stockCards: analysis.stockCards,
    slides,
    slidePaths,
    storageState: slidePaths.length === 0 ? 'pending' : meta.storageState,
    thumbBucketPath: thumbPrefix,
    usageNote: analysis.usageNote,
  });

  const closeByTicker = new Map(snapshot.selected.map((s) => [s.ticker, s.priceData.close]));
  const stockIdByTicker = new Map(snapshot.selected.map((s) => [s.ticker, s.stockId]));

  const rows: SlotSignalRow[] = analysis.stockCards
    .filter((c) => stockIdByTicker.has(c.ticker))
    .map((c) => {
      const entry = entryOf(c);
      return {
        user_id: meta.userId,
        stock_id: stockIdByTicker.get(c.ticker)!,
        signal_date: meta.runDate,
        signal: c.signal,
        confidence: c.confidence,
        entry_low: entry.low,
        entry_high: entry.high,
        rule_version: snapshot.ruleVersion,
        close_price: closeByTicker.get(c.ticker) ?? null,
      };
    });

  // 재실행 시 중복 누적을 막기 위해 같은 리포트의 기존 신호를 지우고 다시 넣는다(재시도 단위로 묶여 있다)
  const signals = await replaceSignals(db, reportId, rows);

  return { reportId, signals, slides: slidePaths.length, slidesUploaded };
}

/** DB 적재 실패분 보존 — 다음 실행에서 재시도할 수 있도록 경로만 남긴다 */
async function queueFallback(dir: string, reason: string): Promise<void> {
  const queueDir = fallbackDir();
  await mkdir(queueDir, { recursive: true });
  const name = `${path.basename(path.dirname(dir))}_${path.basename(dir)}.json`;
  await writeFile(path.join(queueDir, name), JSON.stringify({ dir, reason }, null, 2));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const slot = argv[argv.indexOf('--slot') + 1];
  const dateIdx = argv.indexOf('--date');
  const date = dateIdx >= 0 ? argv[dateIdx + 1] : null;
  if (!slot || slot.startsWith('--')) throw new Error('--slot <slot_id> 가 필요합니다.');

  const { db, meta, dir } = await resolveRunDir(slot, date);
  try {
    const result = await archiveSlot(db, meta, dir);
    console.log(
      `✅ 적재 완료 · 리포트 ${result.reportId} · 신호 ${result.signals}건 · 슬라이드 ${result.slides}장` +
        `${result.slidesUploaded ? ' (원본 업로드 완료)' : ' (원본 로컬 보존 — 업로드 미완)'}`,
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await queueFallback(dir, reason);
    throw err;
  }
}

main();
