// 슬롯 실행 컨텍스트 (D16) — run_slot.sh의 각 단계가 같은 디렉토리·같은 런 메타를 보게 한다.
// pipeline이 남긴 run.json이 단일 원천이며, 이후 단계는 저장 루트를 다시 추측하지 않는다.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { dateInTz, KST_TZ } from '../../lib/utils/date';
import { resolveStorageRoot, slotRelDir } from '../../lib/engine/storage-path';
import { loadEngineSettings, DEFAULT_ENGINE_SETTINGS, type EngineSettings } from '../../lib/engine/repository';

export const DEFAULT_STORAGE_DIR = path.resolve(process.cwd(), 'data/runs');

export interface RunMeta {
  userId: string;
  slotId: string;
  runDate: string;
  capturedAt: string;
  storageRoot: string;
  storageState: 'stored' | 'fallback';
  label?: string;
  runAtKst?: string;
}

export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)가 없습니다.');
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * 1인 전용 운영 기준 사용자 해석.
 * ENGINE_USER_ID > 유일 사용자 > 워치리스트가 있는 사용자(테스트 계정이 함께 있는 경우) 순.
 * 그래도 가려지지 않으면 조용히 아무나 고르지 않고 실패시킨다 — 남의 계정에 리포트를 쌓으면 안 된다.
 */
export async function resolveUserId(db: SupabaseClient): Promise<string> {
  const fromEnv = process.env.ENGINE_USER_ID;
  if (fromEnv) return fromEnv;

  const { data, error } = await db.from('users').select('id');
  if (error) throw new Error(`사용자 조회 실패: ${error.message}`);
  if (!data || data.length === 0) throw new Error('사용자가 없습니다. npm run create:user 를 먼저 실행하세요.');
  if (data.length === 1) return data[0].id as string;

  const withWatchlist: string[] = [];
  for (const u of data) {
    const { count } = await db
      .from('watchlist_items')
      .select('stock_id', { count: 'exact', head: true })
      .eq('user_id', u.id);
    if ((count ?? 0) > 0) withWatchlist.push(u.id as string);
  }
  if (withWatchlist.length === 1) return withWatchlist[0];

  throw new Error(
    `사용자가 여러 명이고 자동 판별이 불가능합니다(워치리스트 보유 ${withWatchlist.length}명). ENGINE_USER_ID를 지정하세요.`,
  );
}

export async function loadSettings(db: SupabaseClient, userId: string): Promise<EngineSettings> {
  return loadEngineSettings(db, userId).catch(() => DEFAULT_ENGINE_SETTINGS);
}

/** 슬롯 라벨 조회 — 미등록 슬롯이면 slot_id를 그대로 쓴다 */
export async function loadSlotLabel(db: SupabaseClient, userId: string, slotId: string): Promise<string> {
  const { data } = await db
    .from('schedule_slots')
    .select('label')
    .eq('user_id', userId)
    .eq('slot_id', slotId)
    .maybeSingle();
  return data?.label ?? slotId;
}

/**
 * pipeline이 만든 실행 디렉토리를 찾는다.
 * run.json이 있으면 그대로 신뢰하고(저장 루트 재해석 금지), 없으면 현재 설정으로 경로를 재구성한다.
 */
export async function resolveRunDir(
  slotId: string,
  date?: string | null,
): Promise<{ meta: RunMeta; dir: string; db: SupabaseClient }> {
  const db = adminClient();
  const userId = await resolveUserId(db);
  const runDate = date ?? dateInTz(new Date(), KST_TZ);
  const settings = await loadSettings(db, userId);

  const storage = await resolveStorageRoot({
    configured: settings.slideStorageRoot,
    envRoot: process.env.SLIDE_STORAGE_ROOT ?? null,
    defaultRoot: DEFAULT_STORAGE_DIR,
  });
  const dir = path.join(storage.root, slotRelDir(runDate, slotId));

  let meta: RunMeta = {
    userId,
    slotId,
    runDate,
    capturedAt: new Date().toISOString(),
    storageRoot: storage.root,
    storageState: storage.state,
  };
  try {
    const saved = JSON.parse(await readFile(path.join(dir, 'run.json'), 'utf8')) as Partial<RunMeta>;
    meta = { ...meta, ...saved };
  } catch {
    // run.json이 없으면 pipeline이 아직 돌지 않았거나 다른 루트에 저장된 상태 — 호출부가 판단
  }

  meta.label = await loadSlotLabel(db, userId, slotId);
  meta.runAtKst = new Date(meta.capturedAt).toLocaleString('ko-KR', { timeZone: KST_TZ, hour12: false });

  return { meta, dir, db };
}
