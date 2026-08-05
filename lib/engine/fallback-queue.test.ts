import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { fallbackDir, flushSnapshots, queueSnapshots, type PendingSnapshots } from './fallback-queue';
import type { SnapshotRow } from './repository';

const tmpDirs: string[] = [];
async function tmp(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'stock-desk-fallback-'));
  tmpDirs.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(tmpDirs.map((d) => rm(d, { recursive: true, force: true })));
});

function row(stockId: string): SnapshotRow {
  return {
    user_id: 'u1',
    slot_id: 'kr_close_buy',
    run_date: '2026-08-05',
    stock_id: stockId,
    captured_at: '2026-08-05T06:00:00.000Z',
    price_data: { close: 1000 },
    indicators: { rsi14: 50 },
    flow_data: null,
    score: 42,
    score_detail: { trend: true },
  };
}

function entry(overrides: Partial<PendingSnapshots> = {}): Omit<PendingSnapshots, 'queuedAt'> {
  return {
    kind: 'snapshots',
    userId: 'u1',
    slotId: 'kr_close_buy',
    runDate: '2026-08-05',
    capturedAt: '2026-08-05T06:00:00.000Z',
    reason: 'TypeError: fetch failed',
    rows: [row('s1'), row('s2')],
    ...overrides,
  };
}

describe('fallbackDir', () => {
  it('작업 디렉토리 기준 data/fallback 이다', () => {
    expect(fallbackDir('/repo')).toBe(path.join('/repo', 'data', 'fallback'));
  });
});

describe('queueSnapshots', () => {
  it('적재 실패분을 파일로 남긴다', async () => {
    const dir = await tmp();
    const file = await queueSnapshots(entry(), dir);

    const saved = JSON.parse(await readFile(file, 'utf8')) as PendingSnapshots;
    expect(saved.rows).toHaveLength(2);
    expect(saved.slotId).toBe('kr_close_buy');
    expect(saved.queuedAt).toBeTruthy();
  });

  it('같은 슬롯·같은 날짜는 덮어써서 무한히 쌓이지 않는다', async () => {
    const dir = await tmp();
    await queueSnapshots(entry(), dir);
    await queueSnapshots(entry(), dir);
    expect((await readdir(dir)).filter((f) => f.endsWith('.json'))).toHaveLength(1);
  });
});

describe('flushSnapshots', () => {
  it('재적재에 성공하면 대기 파일을 지운다', async () => {
    const dir = await tmp();
    await queueSnapshots(entry(), dir);

    const seen: SnapshotRow[][] = [];
    const result = await flushSnapshots(async (rows) => {
      seen.push(rows);
    }, dir);

    expect(result).toEqual({ flushed: 1, rows: 2, failed: 0 });
    expect(seen[0]).toHaveLength(2);
    expect((await readdir(dir)).filter((f) => f.endsWith('.json'))).toHaveLength(0);
  });

  it('재적재에 실패하면 파일을 남기고 예외를 던지지 않는다', async () => {
    const dir = await tmp();
    await queueSnapshots(entry(), dir);

    const result = await flushSnapshots(async () => {
      throw new Error('fetch failed');
    }, dir);

    expect(result).toEqual({ flushed: 0, rows: 0, failed: 1 });
    expect((await readdir(dir)).filter((f) => f.endsWith('.json'))).toHaveLength(1);
  });

  it('대기 파일이 없거나 디렉토리가 없어도 조용히 넘어간다', async () => {
    const dir = await tmp();
    expect(await flushSnapshots(async () => {}, dir)).toEqual({ flushed: 0, rows: 0, failed: 0 });
    expect(await flushSnapshots(async () => {}, path.join(dir, 'nope'))).toEqual({
      flushed: 0,
      rows: 0,
      failed: 0,
    });
  });

  it('깨진 파일은 실패로 세고 지우지 않는다 — 조용한 데이터 손실을 만들지 않는다', async () => {
    const dir = await tmp();
    await writeFile(path.join(dir, 'snapshots_2026-08-05_kr_close_buy.json'), '{ not json');

    const result = await flushSnapshots(async () => {}, dir);

    expect(result.failed).toBe(1);
    expect((await readdir(dir)).filter((f) => f.endsWith('.json'))).toHaveLength(1);
  });

  it('여러 대기 파일 중 하나가 실패해도 나머지는 적재한다', async () => {
    const dir = await tmp();
    await queueSnapshots(entry({ slotId: 'kr_close_buy' }), dir);
    await queueSnapshots(entry({ slotId: 'kr_premarket', rows: [row('s9')] }), dir);

    const result = await flushSnapshots(async (rows) => {
      if (rows.length === 1) throw new Error('fetch failed');
    }, dir);

    expect(result.flushed).toBe(1);
    expect(result.failed).toBe(1);
    expect((await readdir(dir)).filter((f) => f.endsWith('.json'))).toHaveLength(1);
  });
});
