// DB 적재 실패분 대기 큐 (D16). 슬롯 산출물은 이미 디스크에 있으므로 Supabase 일시 장애로 배치를
// 죽이지 않는다 — 적재할 행을 파일로 남기고 다음 실행 시작에서 다시 밀어 넣는다.
//
// 파일명은 (실행일, 슬롯)으로 고정한다: 같은 슬롯을 재실행하면 덮어써서 대기 파일이 무한히 쌓이지 않는다.
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dataDir } from './data-dir';
import type { SnapshotRow } from './repository';

const PREFIX = 'snapshots_';

export interface PendingSnapshots {
  kind: 'snapshots';
  userId: string;
  slotId: string;
  runDate: string;
  capturedAt: string;
  /** 적재하려던 행 그대로 — 스냅샷을 다시 계산하지 않고 재시도할 수 있어야 한다 */
  rows: SnapshotRow[];
  /** 최초 실패 사유 (운영자 확인용) */
  reason: string;
  queuedAt: string;
}

/** 대기 큐 디렉토리 — 산출물 루트(`STOCK_DESK_DATA_DIR`) 하위 */
export function fallbackDir(cwd: string = process.cwd()): string {
  return path.join(dataDir(cwd), 'fallback');
}

export async function queueSnapshots(
  entry: Omit<PendingSnapshots, 'queuedAt'>,
  dir: string = fallbackDir(),
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${PREFIX}${entry.runDate}_${entry.slotId}.json`);
  const pending: PendingSnapshots = { ...entry, queuedAt: new Date().toISOString() };
  await writeFile(file, JSON.stringify(pending, null, 2));
  return file;
}

export interface FlushResult {
  /** 재적재에 성공한 대기 파일 수 */
  flushed: number;
  /** 재적재된 행 수 */
  rows: number;
  /** 재적재에 실패해 그대로 남은 파일 수 */
  failed: number;
}

/**
 * 대기 파일을 모두 재시도한다. 이 함수는 절대 던지지 않는다 —
 * 복구 시도가 실패했다고 새 실행까지 막으면 장애가 연쇄된다. 실패분은 파일로 남아 다음 실행을 기다린다.
 * (깨진 파일도 지우지 않는다: 조용한 데이터 손실보다 남아 있는 실패 카운트가 낫다)
 */
export async function flushSnapshots(
  upsert: (rows: SnapshotRow[]) => Promise<void>,
  dir: string = fallbackDir(),
): Promise<FlushResult> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.startsWith(PREFIX) && f.endsWith('.json')).sort();
  } catch {
    return { flushed: 0, rows: 0, failed: 0 };
  }

  const result: FlushResult = { flushed: 0, rows: 0, failed: 0 };
  for (const name of files) {
    const file = path.join(dir, name);
    try {
      const pending = JSON.parse(await readFile(file, 'utf8')) as PendingSnapshots;
      if (!Array.isArray(pending.rows)) throw new Error('rows 필드가 없습니다.');
      await upsert(pending.rows);
      await unlink(file);
      result.flushed++;
      result.rows += pending.rows.length;
    } catch (err) {
      result.failed++;
      console.warn(`⚠ 대기분 재적재 실패(${name}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return result;
}
