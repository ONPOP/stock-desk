// 적재 재시도의 멱등성 검증 (D19).
//
// 여기서 잡으려는 사고는 하나다: 삽입이 서버에 닿은 뒤 응답만 유실되면, 삽입만 다시 할 때
// 같은 신호가 두 벌 남는다. 그래서 가짜 클라이언트는 "행은 실제로 넣고 오류만 돌려주는" 실패를 흉내낸다.
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { replaceSignals, upsertReport, type ReportUpsert, type SlotSignalRow } from './archive-db';

const fast = { attempts: 3, backoffMs: 1 };

const TRANSIENT = { message: 'TypeError: fetch failed' };

type Row = Record<string, unknown>;

interface FakeOptions {
  /** 이 횟수만큼 upsert가 일시 실패한다 */
  failUpsert?: number;
  /** 이 횟수만큼 insert가 **행은 넣고** 일시 실패한다(응답 유실 흉내) */
  failInsertAfterWrite?: number;
  /** upsert가 돌려줄 고정 오류 — 네트워크가 아닌 오류 경로용 */
  upsertError?: { message: string };
}

interface Fake {
  db: SupabaseClient;
  signals: Row[];
  calls: { upsert: number; delete: number; insert: number };
}

function makeFake(options: FakeOptions = {}): Fake {
  const signals: Row[] = [];
  const calls = { upsert: 0, delete: 0, insert: 0 };
  let upsertFailsLeft = options.failUpsert ?? 0;
  let insertFailsLeft = options.failInsertAfterWrite ?? 0;

  function from(table: string) {
    if (table === 'analysis_reports') {
      return {
        upsert: () => ({
          select: () => ({
            single: async () => {
              calls.upsert++;
              if (options.upsertError) return { data: null, error: options.upsertError };
              if (upsertFailsLeft > 0) {
                upsertFailsLeft--;
                return { data: null, error: TRANSIENT };
              }
              return { data: { id: 'report-1' }, error: null };
            },
          }),
        }),
      };
    }
    if (table === 'slot_signals') {
      return {
        delete: () => ({
          eq: async (column: string, value: unknown) => {
            calls.delete++;
            for (let i = signals.length - 1; i >= 0; i--) {
              if (signals[i][column] === value) signals.splice(i, 1);
            }
            return { error: null };
          },
        }),
        insert: async (rows: Row[]) => {
          calls.insert++;
          // 먼저 쓰고 나서 실패시킨다 — "요청은 닿았는데 응답만 유실"이 재현하려는 상황이다
          signals.push(...rows);
          if (insertFailsLeft > 0) {
            insertFailsLeft--;
            return { error: TRANSIENT };
          }
          return { error: null };
        },
      };
    }
    throw new Error(`예상하지 못한 테이블: ${table}`);
  }

  return { db: { from } as unknown as SupabaseClient, signals, calls };
}

const REPORT: ReportUpsert = {
  userId: 'user-1',
  slotId: 'kr_premarket',
  runDate: '2026-08-10',
  runAt: '2026-08-10T00:07:00.000Z',
  marketOverview: {},
  stockCards: [],
  slides: [],
  slidePaths: ['2026-08-10/kr_premarket/01.webp'],
  storageState: 'stored',
  thumbBucketPath: 'user-1/2026-08-10/kr_premarket',
  usageNote: '검색 15회',
};

function signalRow(stockId: string): SlotSignalRow {
  return {
    user_id: 'user-1',
    stock_id: stockId,
    signal_date: '2026-08-10',
    signal: 'HOLD',
    confidence: 'LOW',
    entry_low: null,
    entry_high: null,
    rule_version: 1,
    close_price: 1000,
  };
}

describe('upsertReport', () => {
  it('일시적 fetch 실패를 넘기고 리포트 id를 돌려준다', async () => {
    const fake = makeFake({ failUpsert: 2 });

    await expect(upsertReport(fake.db, REPORT, fast)).resolves.toBe('report-1');
    expect(fake.calls.upsert).toBe(3);
  });

  it('네트워크가 아닌 오류는 다시 시도하지 않고 바로 올린다', async () => {
    const fake = makeFake({ upsertError: { message: 'column "slides" does not exist' } });

    await expect(upsertReport(fake.db, REPORT, fast)).rejects.toThrow('리포트 적재 실패: column "slides" does not exist');
    expect(fake.calls.upsert).toBe(1);
  });

  it('재시도를 다 써도 실패하면 마지막 오류를 올린다', async () => {
    const fake = makeFake({ failUpsert: 99 });

    await expect(upsertReport(fake.db, REPORT, fast)).rejects.toThrow('fetch failed');
    expect(fake.calls.upsert).toBe(3);
  });
});

describe('replaceSignals', () => {
  it('삽입이 서버에 닿은 뒤 실패해도 신호는 한 벌만 남는다', async () => {
    const fake = makeFake({ failInsertAfterWrite: 2 });

    await expect(replaceSignals(fake.db, 'report-1', [signalRow('a'), signalRow('b')], fast)).resolves.toBe(2);

    // 삽입은 3번 됐지만 매 시도가 삭제부터 시작하므로 최종 2행이다.
    // 삭제를 재시도 단위 밖으로 빼면 6행이 되어 이 단언이 깨진다.
    expect(fake.calls.insert).toBe(3);
    expect(fake.calls.delete).toBe(3);
    expect(fake.signals).toHaveLength(2);
  });

  it('삽입한 모든 행에 report_id를 찍는다', async () => {
    const fake = makeFake();

    await replaceSignals(fake.db, 'report-9', [signalRow('a')], fast);

    expect(fake.signals).toEqual([{ ...signalRow('a'), report_id: 'report-9' }]);
  });

  it('넣을 신호가 없어도 기존 신호는 지운다', async () => {
    const fake = makeFake();
    fake.signals.push({ report_id: 'report-1', stock_id: 'old' });

    await expect(replaceSignals(fake.db, 'report-1', [], fast)).resolves.toBe(0);
    expect(fake.signals).toHaveLength(0);
    expect(fake.calls.insert).toBe(0);
  });

  it('다른 리포트의 신호는 건드리지 않는다', async () => {
    const fake = makeFake();
    fake.signals.push({ report_id: 'report-other', stock_id: 'keep' });

    await replaceSignals(fake.db, 'report-1', [signalRow('a')], fast);

    expect(fake.signals.filter((r) => r.report_id === 'report-other')).toHaveLength(1);
  });
});
