// 과거 리포트 원본 backfill (D19) — 로컬에 남은 슬라이드 HTML을 WebP로 다시 찍어 Storage에 올린다.
//
//   npx tsx scripts/engine/backfill-slides.ts [--dry] [--date 2026-08-07] [--slot kr_wrap] [--force]
//
// D19 이전 리포트는 원본이 로컬 PNG로만 있고 Storage에는 썸네일뿐이라, /reports가 축소본으로 폴백한다.
// 원본을 채우면 그 폴백이 사라진다.
//
// PNG를 변환하지 않고 HTML에서 다시 찍는 이유: 렌더 당시의 자기완결 HTML이 그대로 남아 있어
// 원본과 같은 배율·같은 품질로 재현할 수 있고, PNG→WebP 변환 라이브러리를 새로 들이지 않아도 된다.
//
// **배율 측정·캡처는 slide-capture.ts를 그대로 쓴다.** 이 로직을 다른 곳에서 다시 구현했다가
// 축소를 건너뛴 이미지를 산출물로 착각한 사고가 있었다(2026-08-10). 캡처 경로는 하나뿐이어야 한다.
import '../_bootstrap';

import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withNetworkRetry } from '../../lib/engine/net-retry';
import { SLIDE_EXT, SLIDE_QUALITY } from '../../lib/engine/slide-format';
import { slidePrefix, uploadRunAssets } from '../../lib/engine/slide-storage';
import { resolveStorageRoot, slotRelDir } from '../../lib/engine/storage-path';
import { adminClient, loadSettings, resolveUserId, DEFAULT_STORAGE_DIR } from './run-context';
import { captureSlide, measureFit } from './slide-capture';

interface Args {
  dry: boolean;
  date: string | null;
  slot: string | null;
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dry: false, date: null, slot: null, force: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry') args.dry = true;
    else if (argv[i] === '--force') args.force = true;
    else if (argv[i] === '--date') args.date = argv[++i] ?? null;
    else if (argv[i] === '--slot') args.slot = argv[++i] ?? null;
  }
  return args;
}

interface ReportRow {
  id: string;
  run_date: string;
  slot_id: string;
  slide_paths: string[] | null;
  thumb_bucket_path: string | null;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** 이미 원본 형식으로 기록된 리포트인가 — 여기서 걸러야 몇 번을 돌려도 같은 결과가 된다 */
function alreadyBackfilled(paths: string[]): boolean {
  return paths.length > 0 && paths.every((p) => p.endsWith(`.${SLIDE_EXT}`));
}

type Outcome =
  | { kind: 'skipped'; reason: string }
  | { kind: 'dry'; slides: number }
  | { kind: 'done'; captured: number; uploaded: number; thumbs: number }
  | { kind: 'failed'; reason: string };

/**
 * 리포트 한 건을 backfill한다.
 * 순서가 중요하다 — 업로드가 전량 성공한 뒤에만 DB의 경로를 바꾼다. 반대로 하면 DB는 원본이 있다고
 * 말하는데 객체가 없는 상태가 남는다(라우트는 썸네일로 폴백하므로 화면은 조용히 축소본이 된다).
 */
async function backfillReport(
  db: SupabaseClient,
  browser: Browser,
  userId: string,
  storageRoot: string,
  report: ReportRow,
  args: Args,
): Promise<Outcome> {
  const paths = report.slide_paths ?? [];
  if (paths.length === 0) return { kind: 'skipped', reason: '슬라이드 정의 없음' };
  if (!args.force && alreadyBackfilled(paths)) return { kind: 'skipped', reason: '이미 원본 적재됨' };

  const dir = path.join(storageRoot, slotRelDir(report.run_date, report.slot_id));
  const htmlDir = path.join(dir, 'html');
  if (!(await exists(htmlDir))) return { kind: 'skipped', reason: `로컬 HTML 없음 (${dir})` };

  const htmlFiles = (await readdir(htmlDir)).filter((f) => f.endsWith('.html')).sort();
  if (htmlFiles.length < paths.length) {
    return { kind: 'skipped', reason: `HTML ${htmlFiles.length}장 < 슬라이드 정의 ${paths.length}장` };
  }
  if (args.dry) return { kind: 'dry', slides: paths.length };

  // 정의된 장수만 찍는다. 재실행으로 HTML이 더 남아 있는 디렉터리가 있어서(2026-08-05),
  // 전부 찍으면 리포트가 모르는 인덱스의 객체가 생긴다.
  let captured = 0;
  for (let i = 0; i < paths.length; i++) {
    const n = String(i + 1).padStart(2, '0');
    const outPath = path.join(dir, `${n}.${SLIDE_EXT}`);
    if (!args.force && (await exists(outPath))) continue;

    const htmlPath = path.join(htmlDir, `${n}.html`);
    if (!(await exists(htmlPath))) return { kind: 'failed', reason: `${n}.html 없음` };

    const fit = await measureFit(browser, htmlPath);
    await captureSlide(browser, htmlPath, outPath, {
      fit: fit.scale,
      outScale: 1,
      type: SLIDE_EXT,
      quality: SLIDE_QUALITY,
    });
    captured++;
  }

  const prefix = report.thumb_bucket_path ?? slidePrefix(userId, report.run_date, report.slot_id);
  const upload = await uploadRunAssets(db, dir, prefix);
  if (upload.slides !== paths.length) {
    return { kind: 'failed', reason: `업로드 미완 (${upload.slides}/${paths.length}) — DB는 그대로 둔다` };
  }

  const nextPaths = paths.map((p) => p.replace(/\.[^.]+$/, `.${SLIDE_EXT}`));
  await withNetworkRetry(
    async () => {
      const { error } = await db
        .from('analysis_reports')
        .update({ slide_paths: nextPaths, thumb_bucket_path: prefix })
        .eq('user_id', userId)
        .eq('id', report.id);
      if (error) throw new Error(`경로 갱신 실패: ${error.message}`);
    },
    `경로 갱신(${report.run_date}/${report.slot_id})`,
  );

  return { kind: 'done', captured, uploaded: upload.slides, thumbs: upload.thumbs };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const db = adminClient();
  const userId = await resolveUserId(db);
  const settings = await loadSettings(db, userId);
  const storage = await resolveStorageRoot({
    configured: settings.slideStorageRoot,
    envRoot: process.env.SLIDE_STORAGE_ROOT ?? null,
    defaultRoot: DEFAULT_STORAGE_DIR,
  });

  let query = db
    .from('analysis_reports')
    .select('id, run_date, slot_id, slide_paths, thumb_bucket_path')
    .eq('user_id', userId)
    .order('run_date', { ascending: true });
  if (args.date) query = query.eq('run_date', args.date);
  if (args.slot) query = query.eq('slot_id', args.slot);

  const { data, error } = await query;
  if (error) throw new Error(`리포트 조회 실패: ${error.message}`);
  const reports = (data ?? []) as ReportRow[];

  console.log(`저장 루트 ${storage.root} (${storage.state}) · 대상 후보 ${reports.length}건${args.dry ? ' · --dry' : ''}\n`);

  const browser = await chromium.launch();
  const skipped: string[] = [];
  const failed: string[] = [];
  let done = 0;
  let slides = 0;
  try {
    for (const report of reports) {
      const label = `${report.run_date}/${report.slot_id}`;
      const outcome = await backfillReport(db, browser, userId, storage.root, report, args);
      if (outcome.kind === 'skipped') {
        skipped.push(`${label} — ${outcome.reason}`);
      } else if (outcome.kind === 'dry') {
        console.log(`  ${label} · ${outcome.slides}장 대상`);
        slides += outcome.slides;
      } else if (outcome.kind === 'failed') {
        failed.push(`${label} — ${outcome.reason}`);
        console.warn(`  ⚠ ${label} — ${outcome.reason}`);
      } else {
        done++;
        slides += outcome.uploaded;
        console.log(`  ✅ ${label} · 캡처 ${outcome.captured}장 · 원본 ${outcome.uploaded}장 · 썸네일 ${outcome.thumbs}장`);
      }
    }
  } finally {
    await browser.close();
  }

  if (skipped.length > 0) {
    console.log(`\n건너뜀 ${skipped.length}건`);
    for (const s of skipped) console.log(`  · ${s}`);
  }
  if (failed.length > 0) {
    console.log(`\n실패 ${failed.length}건 — 다시 실행하면 이어서 시도한다`);
    for (const f of failed) console.log(`  · ${f}`);
  }
  console.log(`\n${args.dry ? '대상' : '완료'} 리포트 ${args.dry ? reports.length - skipped.length : done}건 · 슬라이드 ${slides}장`);
  if (failed.length > 0) process.exitCode = 1;
}

main();
