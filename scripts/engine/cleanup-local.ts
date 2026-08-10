// 로컬 원본 정리 (D19 ⑧) — 원격 적재가 확인된 실행의 로컬 이미지를 지운다.
//
//   npx tsx scripts/engine/cleanup-local.ts --dry              # 전체 미리보기
//   npx tsx scripts/engine/cleanup-local.ts --slot kr_close_buy --date 2026-08-10
//
// run-slot.ts는 **notify 다음**에 이걸 부른다(불변식 9 — 텔레그램이 로컬 파일을 읽는다).
//
// 삭제 전 원격을 다시 조회해 장별로 대조한다(불변식 1). 앞 단계의 "업로드 완료" 기록을 믿지 않는
// 이유는, 기록은 낡을 수 있고 객체는 나중에 지워질 수 있는데 로컬 삭제는 되돌릴 수 없기 때문이다.
// html/과 *.json은 남긴다 — 슬라이드를 다시 찍을 수 있는 유일한 로컬 원자료다.
import '../_bootstrap';

import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { selectDeletableFiles } from '../../lib/engine/local-cleanup';
import { SLIDE_BUCKET } from '../../lib/engine/slide-storage';
import { resolveStorageRoot, slotRelDir } from '../../lib/engine/storage-path';
import { adminClient, loadSettings, resolveUserId, DEFAULT_STORAGE_DIR } from './run-context';

interface Args {
  dry: boolean;
  slot: string | null;
  date: string | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dry: false, slot: null, date: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry') args.dry = true;
    else if (argv[i] === '--slot') args.slot = argv[++i] ?? null;
    else if (argv[i] === '--date') args.date = argv[++i] ?? null;
  }
  return args;
}

async function listDir(dir: string): Promise<string[]> {
  try {
    // AppleDouble 부산물은 대상에서 빼둔다 — 지우는 건 이 스크립트의 일이 아니다
    return (await readdir(dir)).filter((f) => !f.startsWith('._'));
  } catch {
    return [];
  }
}

async function totalBytes(dir: string, names: string[]): Promise<number> {
  let sum = 0;
  for (const n of names) {
    try {
      sum += (await stat(path.join(dir, n))).size;
    } catch {
      /* 이미 없으면 0 */
    }
  }
  return sum;
}

interface ReportRow {
  id: string;
  run_date: string;
  slot_id: string;
  slide_paths: string[] | null;
  thumb_bucket_path: string | null;
}

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)}MB`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const db: SupabaseClient = adminClient();
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
  if (args.slot) query = query.eq('slot_id', args.slot);
  if (args.date) query = query.eq('run_date', args.date);

  const { data, error } = await query;
  if (error) throw new Error(`리포트 조회 실패: ${error.message}`);
  const reports = (data ?? []) as ReportRow[];

  let freed = 0;
  let deleted = 0;
  const skipped: string[] = [];

  for (const report of reports) {
    const label = `${report.run_date}/${report.slot_id}`;
    const slideCount = (report.slide_paths ?? []).length;
    const prefix = report.thumb_bucket_path;
    if (!prefix) {
      skipped.push(`${label} — 버킷 프리픽스 없음`);
      continue;
    }

    const dir = path.join(storage.root, slotRelDir(report.run_date, report.slot_id));
    const localFiles = await listDir(dir);
    const thumbDir = path.join(dir, 'thumbs');
    const localThumbs = await listDir(thumbDir);
    if (localFiles.length === 0 && localThumbs.length === 0) continue; // 이미 정리됨

    // 삭제 직전에 원격을 다시 본다 — 여기가 불변식 1이 실제로 지켜지는 지점이다
    const { data: objects, error: listError } = await db.storage.from(SLIDE_BUCKET).list(prefix, { limit: 1000 });
    if (listError || !objects) {
      skipped.push(`${label} — 원격 조회 실패(${listError?.message ?? '응답 없음'})`);
      continue;
    }
    const remoteNames = new Set(objects.map((o) => o.name));

    const sel = selectDeletableFiles(localFiles, localThumbs, remoteNames, slideCount);
    if (sel.skipReason) {
      skipped.push(`${label} — ${sel.skipReason}`);
      continue;
    }
    if (sel.files.length === 0 && sel.thumbs.length === 0) continue;

    const bytes = (await totalBytes(dir, sel.files)) + (await totalBytes(thumbDir, sel.thumbs));
    console.log(
      `${args.dry ? '· ' : '✅ '}${label} · 원본 ${sel.files.length}개 · 썸네일 ${sel.thumbs.length}개 · ${mb(bytes)}`,
    );

    if (!args.dry) {
      for (const f of sel.files) await unlink(path.join(dir, f)).catch(() => undefined);
      for (const f of sel.thumbs) await unlink(path.join(thumbDir, f)).catch(() => undefined);
    }
    freed += bytes;
    deleted += sel.files.length + sel.thumbs.length;
  }

  if (skipped.length > 0) {
    console.log(`\n건너뜀 ${skipped.length}건 (로컬 보존)`);
    for (const s of skipped) console.log(`  · ${s}`);
  }
  console.log(`\n${args.dry ? '삭제 대상' : '삭제 완료'} 파일 ${deleted}개 · ${mb(freed)}`);
  if (args.dry) console.log('--dry 이므로 아무것도 지우지 않았습니다.');
}

main();
