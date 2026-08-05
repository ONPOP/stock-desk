// 슬롯 결과 적재 (D16 Phase 2) — analysis_reports · slot_signals + 썸네일 업로드.
//
//   npx tsx scripts/engine/archive.ts --slot kr_close_buy [--date 2026-08-04]
//
// 실패해도 로컬 산출물은 이미 디스크에 있으므로, DB 적재 실패는 fallback 큐에 남기고 다음 실행에서 재시도한다.
import '../_bootstrap';

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Slide, StockCard } from '../../lib/engine/slide-schema';
import { fallbackDir } from '../../lib/engine/fallback-queue';
import { resolveRunDir, type RunMeta } from './run-context';

const THUMB_BUCKET = 'analysis-slides';

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

/**
 * 썸네일만 Storage에 올린다 (원본은 로컬 — 무료 티어 용량 보호).
 * 업로드 실패는 치명적이지 않다: 데스크톱에서는 로컬 원본으로 볼 수 있다.
 */
async function uploadThumbs(db: SupabaseClient, meta: RunMeta, dir: string): Promise<string | null> {
  const thumbDir = path.join(dir, 'thumbs');
  let files: string[];
  try {
    files = (await readdir(thumbDir)).filter((f) => f.endsWith('.jpg')).sort();
  } catch {
    return null;
  }
  if (files.length === 0) return null;

  // 버킷은 최초 1회만 만들어지고, 이미 있으면 에러를 무시한다
  await db.storage.createBucket(THUMB_BUCKET, { public: false }).catch(() => undefined);

  const prefix = `${meta.userId}/${meta.runDate}/${meta.slotId}`;
  let uploaded = 0;
  for (const f of files) {
    const body = await readFile(path.join(thumbDir, f));
    const { error } = await db.storage
      .from(THUMB_BUCKET)
      .upload(`${prefix}/${f}`, body, { contentType: 'image/jpeg', upsert: true });
    if (error) {
      console.warn(`⚠ 썸네일 업로드 실패(${f}): ${error.message}`);
      break;
    }
    uploaded++;
  }
  return uploaded > 0 ? prefix : null;
}

/** 진입가 구간을 최소 통화 단위 정수 쌍으로 (없으면 null) */
function entryOf(card: StockCard): { low: number | null; high: number | null } {
  if (!card.entryZone) return { low: null, high: null };
  return { low: card.entryZone.low, high: card.entryZone.high };
}

export async function archiveSlot(
  db: SupabaseClient,
  meta: RunMeta,
  dir: string,
): Promise<{ reportId: string; signals: number; slides: number }> {
  const snapshot = await readJson<SnapshotFileLite>(path.join(dir, 'snapshot.json'));
  const analysis = await readJson<AnalysisFileLite>(path.join(dir, 'analysis.json'));
  const slides = await readJson<Slide[]>(path.join(dir, 'slides.json')).catch(() => [] as Slide[]);
  const slidePaths = await readJson<string[]>(path.join(dir, 'slide-paths.json')).catch(() => [] as string[]);

  const thumbPrefix = await uploadThumbs(db, meta, dir);

  const { data: report, error: reportError } = await db
    .from('analysis_reports')
    .upsert(
      {
        user_id: meta.userId,
        slot_id: meta.slotId,
        run_date: meta.runDate,
        run_at: meta.capturedAt,
        market_overview: analysis.marketOverview,
        stock_cards: analysis.stockCards,
        slides,
        slide_paths: slidePaths,
        storage_state: slidePaths.length === 0 ? 'pending' : meta.storageState,
        thumb_bucket_path: thumbPrefix,
        usage_note: analysis.usageNote,
      },
      { onConflict: 'user_id,run_date,slot_id' },
    )
    .select('id')
    .single();
  if (reportError) throw new Error(`리포트 적재 실패: ${reportError.message}`);

  const closeByTicker = new Map(snapshot.selected.map((s) => [s.ticker, s.priceData.close]));
  const stockIdByTicker = new Map(snapshot.selected.map((s) => [s.ticker, s.stockId]));

  // 재실행 시 중복 누적을 막기 위해 같은 리포트의 기존 신호를 지우고 다시 넣는다
  await db.from('slot_signals').delete().eq('report_id', report.id);

  const rows = analysis.stockCards
    .filter((c) => stockIdByTicker.has(c.ticker))
    .map((c) => {
      const entry = entryOf(c);
      return {
        user_id: meta.userId,
        report_id: report.id,
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

  if (rows.length > 0) {
    const { error } = await db.from('slot_signals').insert(rows);
    if (error) throw new Error(`신호 적재 실패: ${error.message}`);
  }

  return { reportId: report.id as string, signals: rows.length, slides: slidePaths.length };
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
    console.log(`✅ 적재 완료 · 리포트 ${result.reportId} · 신호 ${result.signals}건 · 슬라이드 ${result.slides}장`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await queueFallback(dir, reason);
    throw err;
  }
}

main();
