// planPurge·executePurge의 삭제 스코프와 순서 불변식 검증 (D19 위험 경로).
// Supabase 쿼리 빌더를 최소한으로 흉내내되, 필터는 실제로 적용해 'user_id를 안 걸면 통과한다'를 막는다.
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { executePurge, planPurge, type PurgePlan } from './retention';

type Row = Record<string, unknown>;

interface FakeState {
  tables: Record<string, Row[]>;
  objects: Set<string>;
  /** 객체 삭제를 실패시킬 프리픽스 */
  failRemovePrefix?: string;
}

function matches(row: Row, eq: Array<[string, unknown]>, lt: Array<[string, unknown]>): boolean {
  return (
    eq.every(([k, v]) => row[k] === v) &&
    lt.every(([k, v]) => String(row[k]) < String(v))
  );
}

function builder(state: FakeState, table: string) {
  const eq: Array<[string, unknown]> = [];
  const lt: Array<[string, unknown]> = [];
  let mode: 'select' | 'delete' | 'update' = 'select';
  let payload: Row = {};
  let sort: { column: string; ascending: boolean } | null = null;
  let take: number | null = null;

  const api = {
    select: (...ignored: unknown[]) => {
      void ignored;
      return api;
    },
    delete: (...ignored: unknown[]) => {
      void ignored;
      mode = 'delete';
      return api;
    },
    update: (p: Row) => {
      mode = 'update';
      payload = p;
      return api;
    },
    eq: (k: string, v: unknown) => {
      eq.push([k, v]);
      return api;
    },
    lt: (k: string, v: unknown) => {
      lt.push([k, v]);
      return api;
    },
    // 정렬은 흉내가 아니라 실제로 한다 — latestRunPerSlot이 '최신 먼저'에 의존하기 때문이다
    order: (column: string, opts?: { ascending?: boolean }) => {
      sort = { column, ascending: opts?.ascending ?? true };
      return api;
    },
    limit: (n: number) => {
      take = n;
      return api;
    },
    then: (resolve: (r: unknown) => void) => {
      const rows = state.tables[table] ?? [];
      let hit = rows.filter((r) => matches(r, eq, lt));
      if (sort) {
        const { column, ascending } = sort;
        hit = [...hit].sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : 1) * (ascending ? 1 : -1));
      }
      if (take !== null) hit = hit.slice(0, take);
      if (mode === 'delete') {
        state.tables[table] = rows.filter((r) => !hit.includes(r));
        return resolve({ data: hit, error: null, count: hit.length });
      }
      if (mode === 'update') {
        for (const r of hit) Object.assign(r, payload);
        return resolve({ data: hit, error: null, count: hit.length });
      }
      return resolve({ data: hit, error: null, count: hit.length });
    },
  };
  return api;
}

function fakeDb(state: FakeState): SupabaseClient {
  return {
    from: (table: string) => builder(state, table),
    storage: {
      from: () => ({
        list: async (prefix: string) => ({
          data: [...state.objects]
            .filter((k) => k.startsWith(`${prefix}/`))
            .map((k) => ({ name: k.slice(prefix.length + 1) })),
          error: null,
        }),
        remove: async (keys: string[]) => {
          if (state.failRemovePrefix && keys.some((k) => k.startsWith(state.failRemovePrefix!))) {
            return { data: null, error: { message: '권한 없음' } };
          }
          for (const k of keys) state.objects.delete(k);
          return { data: keys.map((k) => ({ name: k })), error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;
}

const MINE = 'user-me';
const OTHER = 'user-other';

function baseState(): FakeState {
  return {
    tables: {
      analysis_reports: [
        {
          id: 'mine-old',
          user_id: MINE,
          run_date: '2026-01-01',
          thumb_bucket_path: `${MINE}/2026-01-01/kr_close_buy`,
          slide_paths: ['a.webp'],
          slides: [{ kind: 'cover' }],
        },
        {
          id: 'other-old',
          user_id: OTHER,
          run_date: '2026-01-01',
          thumb_bucket_path: `${OTHER}/2026-01-01/kr_close_buy`,
          slide_paths: ['a.webp'],
          slides: [{ kind: 'cover' }],
        },
      ],
      market_snapshots: [
        { user_id: MINE, run_date: '2026-01-01', slot_id: 'kr_close_buy', captured_at: '2026-01-01T06:00:00Z' },
        { user_id: MINE, run_date: '2026-01-02', slot_id: 'kr_close_buy', captured_at: '2026-01-02T06:00:00Z' },
        { user_id: OTHER, run_date: '2026-01-01', slot_id: 'kr_close_buy', captured_at: '2026-01-01T06:00:00Z' },
      ],
    },
    objects: new Set([`${MINE}/2026-01-01/kr_close_buy/01.webp`, `${OTHER}/2026-01-01/kr_close_buy/01.webp`]),
  };
}

describe('planPurge', () => {
  it('다른 사용자의 리포트는 계획에 넣지 않는다', async () => {
    const plan = await planPurge(fakeDb(baseState()), MINE, '2026-08-10', 30);
    expect(plan.slideReports.map((r) => r.reportId)).toEqual(['mine-old']);
  });

  it('보존이 무제한(0)이면 슬라이드는 대상이 아니다', async () => {
    const plan = await planPurge(fakeDb(baseState()), MINE, '2026-08-10', 0);
    expect(plan.slideReports).toEqual([]);
  });

  it('내 스냅샷의 슬롯별 최신 run만 보호 목록에 담는다', async () => {
    const plan = await planPurge(fakeDb(baseState()), MINE, '2026-08-10', 30);
    expect(plan.latestProtected).toEqual([{ slotId: 'kr_close_buy', runDate: '2026-01-02' }]);
  });
});

describe('executePurge', () => {
  function planOf(overrides: Partial<PurgePlan> = {}): PurgePlan {
    return {
      slideReports: [{ reportId: 'mine-old', prefix: `${MINE}/2026-01-01/kr_close_buy`, runDate: '2026-01-01' }],
      snapshotCutoff: '2026-06-01',
      newsCutoff: '2026-06-01',
      latestProtected: [{ runDate: '2026-01-02', slotId: 'kr_close_buy' }],
      ...overrides,
    };
  }

  it('내 객체만 지우고 다른 사용자의 객체는 남긴다', async () => {
    const state = baseState();
    await executePurge(fakeDb(state), MINE, planOf());
    expect([...state.objects]).toEqual([`${OTHER}/2026-01-01/kr_close_buy/01.webp`]);
  });

  it('슬라이드 정의를 비울 때 내 리포트만 건드린다', async () => {
    const state = baseState();
    await executePurge(fakeDb(state), MINE, planOf());

    const mine = state.tables.analysis_reports.find((r) => r.id === 'mine-old')!;
    const other = state.tables.analysis_reports.find((r) => r.id === 'other-old')!;
    expect(mine.slides).toEqual([]);
    expect(other.slides).toEqual([{ kind: 'cover' }]);
  });

  it('객체 삭제가 실패하면 슬라이드 정의를 비우지 않는다 (불변식 7)', async () => {
    const state = { ...baseState(), failRemovePrefix: MINE };
    await expect(executePurge(fakeDb(state), MINE, planOf())).rejects.toThrow(/슬라이드 삭제 실패/);

    const mine = state.tables.analysis_reports.find((r) => r.id === 'mine-old')!;
    expect(mine.slides).toEqual([{ kind: 'cover' }]);
  });

  it('보호된 최신 run은 컷오프보다 오래돼도 남긴다 (불변식 6)', async () => {
    const state = baseState();
    await executePurge(fakeDb(state), MINE, planOf());

    const left = state.tables.market_snapshots.filter((r) => r.user_id === MINE);
    expect(left).toHaveLength(1);
    expect(left[0].run_date).toBe('2026-01-02');
  });

  it('다른 사용자의 스냅샷은 지우지 않는다', async () => {
    const state = baseState();
    await executePurge(fakeDb(state), MINE, planOf());
    expect(state.tables.market_snapshots.filter((r) => r.user_id === OTHER)).toHaveLength(1);
  });

  it('기본값에서는 공용 news_items를 건드리지 않는다', async () => {
    const state = baseState();
    state.tables.news_items = [{ id: 'n1', published_at: '2020-01-01T00:00:00Z' }];
    const counts = await executePurge(fakeDb(state), MINE, planOf());

    expect(counts.news).toBe(0);
    expect(state.tables.news_items).toHaveLength(1);
  });

  it('--include-news를 켜면 컷오프 이전 뉴스를 지운다', async () => {
    const state = baseState();
    state.tables.news_items = [
      { id: 'old', published_at: '2020-01-01T00:00:00Z' },
      { id: 'new', published_at: '2026-08-01T00:00:00Z' },
    ];
    const counts = await executePurge(fakeDb(state), MINE, planOf(), { includeSharedNews: true });

    expect(counts.news).toBe(1);
    expect(state.tables.news_items.map((r) => r.id)).toEqual(['new']);
  });
});
