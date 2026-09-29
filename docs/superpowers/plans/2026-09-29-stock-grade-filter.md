# 종목 등급(A~D) · 등급 필터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/stocks`에서 종목마다 사용자가 A~D 등급(+한 줄 사유·지정일)을 매기고, 등급 칩(다중 선택)으로 목록을 거른다.

**Architecture:** 등급은 탭과 무관한 종목 단위 값이라 신규 테이블 `user_stock_grades`(PK `user_id, stock_id`)에 둔다 — `watchlist_items`는 탭마다 행이 중복돼 플래그를 거기 두면 동기화 문제가 생기고, 기존 테이블 스키마 변경 금지 규칙에도 걸린다. RSC(`app/stocks/page.tsx`)가 등급 맵을 함께 로드해 `WatchlistManager`에 넘기고, 매니저는 `Record<stockId, UserStockGrade>` 상태로 낙관적 갱신한다. 필터링·집계는 순수 함수(`lib/utils/stock-grade.ts`)로 분리해 단위 테스트한다.

**Tech Stack:** Next.js 15 App Router(RSC + API Route), Supabase(Postgres + RLS), zod, vitest, Tailwind, lucide-react, sonner.

**Spec:** 별도 spec 문서 없음(사용자 요청으로 설계 단계 생략). 확정 사항은 아래 Global Constraints에 전부 기록.

## Global Constraints

- 등급 값은 정확히 `'A' | 'B' | 'C' | 'D'`, A가 최상위(투자성 높음). 미지정 종목은 "미분류".
- 저장: 신규 테이블 `public.user_stock_grades`만 추가. **기존 테이블 스키마 변경 금지.** 마이그레이션 번호 `0022`.
- RLS: `user_id = auth.uid()` (using + with check). 쿼리에도 `.eq('user_id', userId)` 이중 방어.
- 기록 항목: 등급 + 한 줄 사유(선택, trim 후 1~100자, 빈 값은 `null`) + 지정일(`graded_at`, UTC 저장·KST 날짜 표시).
- 적용 범위: `/stocks` 화면만(카드 배지 + 등급 지정 모달 + 필터 칩). 분석 엔진·종목 상세·다른 화면 연동 없음.
- 필터: A·B·C·D·미분류 칩 다중 선택, 아무것도 선택 안 하면 전체.
- 명명: 엔진 `lib/engine/scorer.ts`의 `grade: ScoreGrade`와 겹치지 않도록 도메인 타입은 `StockGrade`/`UserStockGrade`, 필드는 `userGrade` 계열 사용.
- 사용자 메시지는 한국어. `console.log` 금지. 금액 연산 없음.
- 커밋 전 `npx tsc --noEmit` + `npm run lint` 통과. 브랜치 `claude/pensive-bardeen-vpz1k7`(main 직접 커밋 금지).
- 운영 DB 반영(`npm run db:migrate`)은 **사용자 승인 후** 실행.
- PRD Decision Log에 D22 추가(스펙 변경 규칙).

## Review Focus

1. **필터가 켜진 상태에서 드래그 정렬** — 걸러진 부분 목록만 0..n으로 `sort_order`를 저장하면 숨은 종목과 순서가 충돌한다. 기대: 필터 활성 중에는 정렬을 저장하지 않고 안내 토스트만 띄운다. → Task 5 Step 4.
2. **필터 결과가 0건** — 탭에 종목은 있는데 선택 등급이 없으면 빈 화면이 된다. 기대: "선택한 등급의 종목이 없습니다." 문구 + 필터 해제 버튼. → Task 5 Step 4.
3. **사유가 공백만/101자 이상** — 기대: 공백만은 `null`로 저장, 101자 이상은 한국어 오류로 거부. → Task 2 테스트.
4. **탭 전환·다른 탭에 같은 종목** — 등급은 종목 단위라 모든 탭에서 같아야 한다. 기대: 한 탭에서 바꾸면 다른 탭 카드도 즉시 같은 등급. 등급 맵을 탭 캐시와 분리해 보관하므로 구조적으로 보장. → Task 1 `countByGrade`/`filterByGrade` 테스트가 맵 기반임을 고정.
5. **저장 실패** — 기대: 낙관적 변경을 되돌리고 토스트. 모달은 닫히지 않아 재시도 가능. → Task 5 Step 3.

---

## File Structure

| 파일 | 책임 |
|---|---|
| Create `supabase/migrations/0022_stock_grades.sql` | 신규 테이블 + RLS |
| Modify `types/index.ts` (WatchlistItem 아래) | `StockGrade`, `GradeFilter`, `UserStockGrade` |
| Create `lib/utils/stock-grade.ts` (+ `.test.ts`) | 등급 목록 상수, 필터·집계·토글 순수 함수 |
| Create `lib/validation/stock-grade.ts` (+ `.test.ts`) | PUT 본문 zod 스키마 |
| Create `lib/supabase/queries/stock-grades.ts` | 조회·upsert·삭제 |
| Create `app/api/stock-grades/route.ts` | PUT(지정/수정)·DELETE(해제) |
| Modify `app/stocks/page.tsx` | 등급 맵 서버 로드 |
| Create `components/stocks/grade-filter-chips.tsx` | 필터 칩 바 |
| Create `components/stocks/stock-grade-dialog.tsx` | 등급 지정 모달 |
| Create `components/stocks/grade-style.ts` | 등급별 색상 클래스(칩·배지 공용) |
| Modify `components/stocks/watchlist-card.tsx` | 등급 배지 버튼 |
| Modify `components/stocks/watchlist-manager.tsx` | 상태·필터 적용·핸들러 연결 |
| Modify `docs/PRD.md` | Decision Log D22 |

---

### Task 1: 도메인 타입 + 등급 순수 함수

**Files:**
- Modify: `types/index.ts` (WatchlistItem 인터페이스 바로 아래)
- Create: `lib/utils/stock-grade.ts`
- Test: `lib/utils/stock-grade.test.ts`

**Interfaces:**
- Produces:
  - `type StockGrade = 'A' | 'B' | 'C' | 'D'`
  - `type GradeFilter = StockGrade | 'none'`
  - `interface UserStockGrade { stockId: string; grade: StockGrade; reason: string | null; gradedAt: string }`
  - `STOCK_GRADES: readonly StockGrade[]`, `GRADE_FILTERS: readonly GradeFilter[]`
  - `filterByGrade(items: WatchlistItem[], grades: Record<string, UserStockGrade>, selected: ReadonlySet<GradeFilter>): WatchlistItem[]`
  - `countByGrade(items: WatchlistItem[], grades: Record<string, UserStockGrade>): Record<GradeFilter, number>`
  - `toggleGradeFilter(selected: ReadonlySet<GradeFilter>, f: GradeFilter): Set<GradeFilter>`

- [ ] **Step 1: 타입 추가** — `types/index.ts`의 `WatchlistItem` 닫는 `}` 다음에:

```ts
/** 사용자 종목 등급 — 조사·분석 후 투자성으로 매기는 수동 등급(A 최상위). 엔진 ScoreGrade와 별개 */
export type StockGrade = 'A' | 'B' | 'C' | 'D';

/** /stocks 등급 필터 칩 — 'none'은 미분류(등급 미지정) */
export type GradeFilter = StockGrade | 'none';

/** 종목 단위 등급 기록 — 탭과 무관(user_id, stock_id당 1건) */
export interface UserStockGrade {
  stockId: string;
  grade: StockGrade;
  /** 한 줄 사유(선택) */
  reason: string | null;
  /** 지정·수정 시각(UTC ISO) */
  gradedAt: string;
}
```

- [ ] **Step 2: 실패하는 테스트 작성** — `lib/utils/stock-grade.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { countByGrade, filterByGrade, toggleGradeFilter } from './stock-grade';
import type { GradeFilter, UserStockGrade, WatchlistItem } from '@/types';

function item(stockId: string): WatchlistItem {
  return {
    stock_id: stockId,
    ticker: stockId.toUpperCase(),
    name_kr: null,
    name_en: null,
    market: 'KOSPI',
    currency: 'KRW',
    group_name: '기본',
    auto_analysis: true,
    isFavorite: false,
    sortOrder: 0,
    alwaysBrief: false,
    radarPin: false,
  };
}
const g = (stockId: string, grade: UserStockGrade['grade']): UserStockGrade => ({
  stockId,
  grade,
  reason: null,
  gradedAt: '2026-09-29T00:00:00.000Z',
});

const items = [item('a1'), item('b1'), item('c1'), item('n1')];
const grades = { a1: g('a1', 'A'), b1: g('b1', 'B'), c1: g('c1', 'C') };

describe('filterByGrade', () => {
  it('선택이 비어 있으면 전체를 순서 그대로 반환', () => {
    expect(filterByGrade(items, grades, new Set())).toEqual(items);
  });
  it('여러 등급 동시 선택', () => {
    const out = filterByGrade(items, grades, new Set<GradeFilter>(['A', 'C']));
    expect(out.map((i) => i.stock_id)).toEqual(['a1', 'c1']);
  });
  it("'none'은 등급 없는 종목만", () => {
    const out = filterByGrade(items, grades, new Set<GradeFilter>(['none']));
    expect(out.map((i) => i.stock_id)).toEqual(['n1']);
  });
  it('해당 등급이 없으면 빈 배열', () => {
    expect(filterByGrade(items, grades, new Set<GradeFilter>(['D']))).toEqual([]);
  });
});

describe('countByGrade', () => {
  it('등급별·미분류 개수', () => {
    expect(countByGrade(items, grades)).toEqual({ A: 1, B: 1, C: 1, D: 0, none: 1 });
  });
  it('맵에만 있고 현재 탭에 없는 종목은 세지 않는다', () => {
    expect(countByGrade([item('n1')], grades)).toEqual({ A: 0, B: 0, C: 0, D: 0, none: 1 });
  });
});

describe('toggleGradeFilter', () => {
  it('없으면 추가, 있으면 제거하고 원본은 바꾸지 않는다', () => {
    const base = new Set<GradeFilter>(['A']);
    const added = toggleGradeFilter(base, 'B');
    expect([...added].sort()).toEqual(['A', 'B']);
    expect([...toggleGradeFilter(added, 'A')]).toEqual(['B']);
    expect([...base]).toEqual(['A']);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run lib/utils/stock-grade.test.ts`
Expected: FAIL — `Failed to resolve import "./stock-grade"`

- [ ] **Step 4: 구현** — `lib/utils/stock-grade.ts`:

```ts
// 사용자 종목 등급(A~D) — /stocks 등급 필터용 순수 함수. 등급은 탭과 무관한 종목 단위 맵으로 받는다.
import type { GradeFilter, StockGrade, UserStockGrade, WatchlistItem } from '@/types';

export const STOCK_GRADES: readonly StockGrade[] = ['A', 'B', 'C', 'D'];
export const GRADE_FILTERS: readonly GradeFilter[] = [...STOCK_GRADES, 'none'];

function filterKey(stockId: string, grades: Record<string, UserStockGrade>): GradeFilter {
  return grades[stockId]?.grade ?? 'none';
}

/** 선택이 비어 있으면 전체 — 칩을 다 끈 상태를 '필터 없음'으로 본다 */
export function filterByGrade(
  items: WatchlistItem[],
  grades: Record<string, UserStockGrade>,
  selected: ReadonlySet<GradeFilter>,
): WatchlistItem[] {
  if (selected.size === 0) return items;
  return items.filter((i) => selected.has(filterKey(i.stock_id, grades)));
}

export function countByGrade(
  items: WatchlistItem[],
  grades: Record<string, UserStockGrade>,
): Record<GradeFilter, number> {
  const out: Record<GradeFilter, number> = { A: 0, B: 0, C: 0, D: 0, none: 0 };
  for (const i of items) out[filterKey(i.stock_id, grades)] += 1;
  return out;
}

export function toggleGradeFilter(selected: ReadonlySet<GradeFilter>, f: GradeFilter): Set<GradeFilter> {
  const next = new Set(selected);
  if (next.has(f)) next.delete(f);
  else next.add(f);
  return next;
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run lib/utils/stock-grade.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add types/index.ts lib/utils/stock-grade.ts lib/utils/stock-grade.test.ts
git commit -m "기능: 종목 등급 타입과 등급 필터 순수 함수"
```

---

### Task 2: 입력 검증 스키마

**Files:**
- Create: `lib/validation/stock-grade.ts`
- Test: `lib/validation/stock-grade.test.ts`

**Interfaces:**
- Produces: `stockGradeUpsertSchema` → 파싱 결과 `{ stock_id: string; grade: StockGrade; reason: string | null }`, `stockGradeStockIdSchema` (uuid string)

- [ ] **Step 1: 실패하는 테스트** — `lib/validation/stock-grade.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { stockGradeStockIdSchema, stockGradeUpsertSchema } from './stock-grade';

const SID = '11111111-1111-4111-8111-111111111111';

describe('stockGradeUpsertSchema', () => {
  it('등급만 / 등급+사유 통과, 사유는 trim', () => {
    expect(stockGradeUpsertSchema.parse({ stock_id: SID, grade: 'A' })).toEqual({
      stock_id: SID,
      grade: 'A',
      reason: null,
    });
    expect(stockGradeUpsertSchema.parse({ stock_id: SID, grade: 'D', reason: '  실적 둔화  ' }).reason).toBe(
      '실적 둔화',
    );
  });
  it('공백만인 사유와 null은 null로 저장', () => {
    expect(stockGradeUpsertSchema.parse({ stock_id: SID, grade: 'B', reason: '   ' }).reason).toBeNull();
    expect(stockGradeUpsertSchema.parse({ stock_id: SID, grade: 'B', reason: null }).reason).toBeNull();
  });
  it('100자까지 허용, 101자 거부(한국어 메시지)', () => {
    expect(stockGradeUpsertSchema.safeParse({ stock_id: SID, grade: 'C', reason: 'a'.repeat(100) }).success).toBe(
      true,
    );
    const r = stockGradeUpsertSchema.safeParse({ stock_id: SID, grade: 'C', reason: 'a'.repeat(101) });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('사유는 100자 이하로 입력하세요.');
  });
  it('허용되지 않은 등급·UUID·추가 필드 거부', () => {
    expect(stockGradeUpsertSchema.safeParse({ stock_id: SID, grade: 'E' }).success).toBe(false);
    expect(stockGradeUpsertSchema.safeParse({ stock_id: SID, grade: 'a' }).success).toBe(false);
    expect(stockGradeUpsertSchema.safeParse({ stock_id: 'x', grade: 'A' }).success).toBe(false);
    expect(stockGradeUpsertSchema.safeParse({ stock_id: SID, grade: 'A', user_id: SID }).success).toBe(false);
  });
});

describe('stockGradeStockIdSchema', () => {
  it('uuid만 통과', () => {
    expect(stockGradeStockIdSchema.safeParse(SID).success).toBe(true);
    expect(stockGradeStockIdSchema.safeParse(null).success).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run lib/validation/stock-grade.test.ts`
Expected: FAIL — import 해석 실패

- [ ] **Step 3: 구현** — `lib/validation/stock-grade.ts`:

```ts
// 사용자 종목 등급(A~D) 입력 검증 — PUT /api/stock-grades
import { z } from 'zod';

export const stockGradeStockIdSchema = z.string().uuid('stock_id 형식이 올바르지 않습니다.');

export const stockGradeUpsertSchema = z
  .object({
    stock_id: stockGradeStockIdSchema,
    grade: z.enum(['A', 'B', 'C', 'D'], { message: '등급은 A·B·C·D 중 하나여야 합니다.' }),
    reason: z
      .string()
      .trim()
      .max(100, '사유는 100자 이하로 입력하세요.')
      .nullish()
      .transform((v) => (v ? v : null)), // 빈 문자열·공백만 → null
  })
  .strict();
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run lib/validation/stock-grade.test.ts`
Expected: PASS (5 tests). (zod 4.x — `z.enum(values, { message })` 형식)

- [ ] **Step 5: Commit**

```bash
git add lib/validation/stock-grade.ts lib/validation/stock-grade.test.ts
git commit -m "기능: 종목 등급 입력 검증 스키마"
```

---

### Task 3: 마이그레이션 + 쿼리 + API 라우트 + 서버 로드

**Files:**
- Create: `supabase/migrations/0022_stock_grades.sql`
- Create: `lib/supabase/queries/stock-grades.ts`
- Create: `app/api/stock-grades/route.ts`
- Modify: `app/stocks/page.tsx`

**Interfaces:**
- Consumes: `UserStockGrade`, `StockGrade`(Task 1), `stockGradeUpsertSchema`, `stockGradeStockIdSchema`(Task 2)
- Produces:
  - `listStockGrades(db, userId): Promise<Record<string, UserStockGrade>>`
  - `upsertStockGrade(db, userId, stockId, grade, reason): Promise<UserStockGrade>`
  - `deleteStockGrade(db, userId, stockId): Promise<void>`
  - HTTP: `PUT /api/stock-grades` body `{stock_id, grade, reason?}` → `{ grade: UserStockGrade }`; `DELETE /api/stock-grades?stock_id=` → `{ ok: true }`
  - `WatchlistManager`에 새 prop `grades: Record<string, UserStockGrade>` (Task 5에서 받음)

- [ ] **Step 1: 마이그레이션 작성** — `supabase/migrations/0022_stock_grades.sql`:

```sql
-- ───────────────────────── 사용자 종목 등급 A~D (D22) ─────────────────────────
-- 신규 테이블만 추가한다(기존 테이블 스키마 변경 없음).
-- watchlist_items는 탭마다 같은 종목 행이 따로 있어 종목 단위 값을 두면 탭 간 동기화가 필요하다.
-- 등급은 탭과 무관하므로 (user_id, stock_id) 1건으로 둔다. 종목을 목록에서 빼도 등급은 남아 재등록 시 복원된다.
create table if not exists public.user_stock_grades (
  user_id    uuid not null references public.users (id) on delete cascade,
  stock_id   uuid not null references public.stocks (id) on delete cascade,
  grade      text not null check (grade in ('A', 'B', 'C', 'D')),
  reason     text check (reason is null or char_length(reason) between 1 and 100),
  graded_at  timestamptz not null default now(),
  primary key (user_id, stock_id)
);

alter table public.user_stock_grades enable row level security;
drop policy if exists user_stock_grades_own on public.user_stock_grades;
create policy user_stock_grades_own on public.user_stock_grades
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: 쿼리 모듈** — `lib/supabase/queries/stock-grades.ts`:

```ts
// 사용자 종목 등급(D22) — 종목 단위(탭 무관). RLS가 user_id로 격리하나 쿼리에도 명시해 이중 방어.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StockGrade, UserStockGrade } from '@/types';

interface GradeRow {
  stock_id: string;
  grade: StockGrade;
  reason: string | null;
  graded_at: string;
}

const toGrade = (r: GradeRow): UserStockGrade => ({
  stockId: r.stock_id,
  grade: r.grade,
  reason: r.reason,
  gradedAt: r.graded_at,
});

export async function listStockGrades(db: SupabaseClient, userId: string): Promise<Record<string, UserStockGrade>> {
  const { data, error } = await db
    .from('user_stock_grades')
    .select('stock_id, grade, reason, graded_at')
    .eq('user_id', userId);
  if (error) throw new Error(`종목 등급 조회 실패: ${error.message}`);
  const out: Record<string, UserStockGrade> = {};
  for (const r of data as GradeRow[]) out[r.stock_id] = toGrade(r);
  return out;
}

export async function upsertStockGrade(
  db: SupabaseClient,
  userId: string,
  stockId: string,
  grade: StockGrade,
  reason: string | null,
): Promise<UserStockGrade> {
  const { data, error } = await db
    .from('user_stock_grades')
    .upsert(
      // graded_at을 명시해야 수정 시에도 지정일이 갱신된다(default는 insert에만 적용)
      { user_id: userId, stock_id: stockId, grade, reason, graded_at: new Date().toISOString() },
      { onConflict: 'user_id,stock_id' },
    )
    .select('stock_id, grade, reason, graded_at')
    .single();
  if (error) throw new Error(`종목 등급 저장 실패: ${error.message}`);
  return toGrade(data as GradeRow);
}

export async function deleteStockGrade(db: SupabaseClient, userId: string, stockId: string): Promise<void> {
  const { error } = await db.from('user_stock_grades').delete().eq('user_id', userId).eq('stock_id', stockId);
  if (error) throw new Error(`종목 등급 해제 실패: ${error.message}`);
}
```

- [ ] **Step 3: API 라우트** — `app/api/stock-grades/route.ts` (기존 `app/api/watchlist/route.ts` 패턴):

```ts
// 사용자 종목 등급(D22) — PUT 지정·수정, DELETE 해제. 목록은 /stocks RSC가 직접 로드한다.
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { deleteStockGrade, upsertStockGrade } from '@/lib/supabase/queries/stock-grades';
import { stockGradeStockIdSchema, stockGradeUpsertSchema } from '@/lib/validation/stock-grade';

export async function PUT(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      throw new ValidationError('요청 본문이 JSON 형식이 아닙니다.');
    }
    const parsed = stockGradeUpsertSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
    }
    const { stock_id, grade, reason } = parsed.data;
    const saved = await upsertStockGrade(supabase, user.id, stock_id, grade, reason);
    return NextResponse.json({ grade: saved });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = stockGradeStockIdSchema.safeParse(new URL(req.url).searchParams.get('stock_id'));
    if (!parsed.success) throw new ValidationError('stock_id가 필요합니다.');
    await deleteStockGrade(supabase, user.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
```

- [ ] **Step 4: 서버 로드** — `app/stocks/page.tsx`:

import 추가:
```ts
import { listStockGrades } from '@/lib/supabase/queries/stock-grades';
```
`Promise.all` 교체:
```ts
  const [initial, trades, grades] = await Promise.all([
    listWatchlist(supabase, user.id, activeId),
    listAllTrades(supabase, user.id),
    listStockGrades(supabase, user.id),
  ]);
```
JSX 교체:
```tsx
      <WatchlistManager tabs={tabs} activeId={activeId} initial={initial} trades={trades} grades={grades} />
```
(이 시점에 `grades` prop 타입 오류가 나는 것은 정상 — Task 5에서 매니저가 받는다. Task 3·5를 같은 커밋 단위로 묶지 않으려면 Step 5에서 매니저 props 타입만 먼저 추가한다.)

- [ ] **Step 5: 매니저 prop 타입만 선반영** — `components/stocks/watchlist-manager.tsx`:

import 타입에 `UserStockGrade` 추가, `WatchlistManagerProps`에:
```ts
  /** 종목 단위 사용자 등급(D22) — 탭과 무관, stock_id 키 */
  grades: Record<string, UserStockGrade>;
```
함수 시그니처 구조분해에 `grades: initialGrades` 추가(사용은 Task 5). 미사용 변수 lint 경고가 나면 Task 5와 같은 커밋으로 합친다.

- [ ] **Step 6: 타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음

- [ ] **Step 7: 운영 DB 반영 — 사용자 승인 필요**

사용자에게 "0022(신규 테이블 1개, 파괴적 변경 없음)를 `npm run db:migrate`로 반영할까요?" 확인 후 실행.
Run: `npm run db:migrate`
Expected: `0022_stock_grades.sql` 적용 로그

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0022_stock_grades.sql lib/supabase/queries/stock-grades.ts app/api/stock-grades/route.ts app/stocks/page.tsx components/stocks/watchlist-manager.tsx
git commit -m "기능: 종목 등급 테이블(0022)·API·서버 로드"
```

---

### Task 4: 등급 UI 컴포넌트 (칩 · 모달 · 색상)

**Files:**
- Create: `components/stocks/grade-style.ts`
- Create: `components/stocks/grade-filter-chips.tsx`
- Create: `components/stocks/stock-grade-dialog.tsx`

**Interfaces:**
- Consumes: `STOCK_GRADES`, `GRADE_FILTERS`(Task 1), `dateInTz`(`lib/utils/date.ts`)
- Produces:
  - `GRADE_TONE: Record<StockGrade, string>`, `GRADE_LABEL: Record<GradeFilter, string>`
  - `<GradeFilterChips selected counts onToggle onClear />`
    - `selected: ReadonlySet<GradeFilter>`, `counts: Record<GradeFilter, number>`, `onToggle(f: GradeFilter): void`, `onClear(): void`
  - `<StockGradeDialog target onClose onSave onClear />`
    - `target: { stockId: string; name: string; current: UserStockGrade | null } | null`
    - `onSave(stockId: string, grade: StockGrade, reason: string | null): Promise<void>` (실패 시 throw → 모달 유지)
    - `onClear(stockId: string): Promise<void>`

- [ ] **Step 1: 색상 상수** — `components/stocks/grade-style.ts`:

```ts
// 등급 색 — 시세 등락색(빨강 상승·파랑 하락)과 헷갈리지 않도록 빨강·파랑 계열은 피한다.
import type { GradeFilter, StockGrade } from '@/types';

export const GRADE_TONE: Record<StockGrade, string> = {
  A: 'bg-emerald-500/15 text-emerald-600 ring-emerald-500/40 dark:text-emerald-400',
  B: 'bg-teal-500/15 text-teal-600 ring-teal-500/40 dark:text-teal-400',
  C: 'bg-amber-500/15 text-amber-600 ring-amber-500/40 dark:text-amber-400',
  D: 'bg-zinc-500/15 text-zinc-600 ring-zinc-500/40 dark:text-zinc-300',
};

export const GRADE_LABEL: Record<GradeFilter, string> = { A: 'A', B: 'B', C: 'C', D: 'D', none: '미분류' };
```

- [ ] **Step 2: 필터 칩** — `components/stocks/grade-filter-chips.tsx`:

```tsx
'use client';

// /stocks 등급 필터 — 다중 선택 토글 칩. 아무것도 켜지 않으면 전체.
import { cn } from '@/lib/utils';
import { GRADE_FILTERS } from '@/lib/utils/stock-grade';
import type { GradeFilter } from '@/types';
import { GRADE_LABEL, GRADE_TONE } from './grade-style';

interface GradeFilterChipsProps {
  selected: ReadonlySet<GradeFilter>;
  counts: Record<GradeFilter, number>;
  onToggle: (f: GradeFilter) => void;
  onClear: () => void;
}

export function GradeFilterChips({ selected, counts, onToggle, onClear }: GradeFilterChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="등급 필터">
      <span className="mr-1 text-xs font-medium text-muted-foreground">등급</span>
      {GRADE_FILTERS.map((f) => {
        const on = selected.has(f);
        return (
          <button
            key={f}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(f)}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition-colors',
              on
                ? f === 'none'
                  ? 'bg-foreground/10 text-foreground ring-foreground/30'
                  : GRADE_TONE[f]
                : 'text-muted-foreground ring-border hover:bg-muted',
            )}
          >
            {GRADE_LABEL[f]} <span className="font-normal tabular-nums opacity-70">{counts[f]}</span>
          </button>
        );
      })}
      {selected.size > 0 && (
        <button type="button" onClick={onClear} className="ml-1 text-xs text-muted-foreground underline">
          전체 보기
        </button>
      )}
    </div>
  );
}
```


- [ ] **Step 3: 등급 지정 모달** — `components/stocks/stock-grade-dialog.tsx` (`watchlist-dialog.tsx`와 같은 경량 오버레이 방식: Esc·배경 클릭 닫기, 중복 제출 ref 가드):

```tsx
'use client';

// 종목 등급 지정 모달 — A~D 선택 + 한 줄 사유. 저장 실패 시 닫지 않아 재시도할 수 있다.
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { dateInTz } from '@/lib/utils/date';
import { STOCK_GRADES } from '@/lib/utils/stock-grade';
import type { StockGrade, UserStockGrade } from '@/types';
import { GRADE_TONE } from './grade-style';

export interface GradeTarget {
  stockId: string;
  name: string;
  current: UserStockGrade | null;
}

interface StockGradeDialogProps {
  target: GradeTarget | null;
  onClose: () => void;
  onSave: (stockId: string, grade: StockGrade, reason: string | null) => Promise<void>;
  onClear: (stockId: string) => Promise<void>;
}

const REASON_MAX = 100;

export function StockGradeDialog({ target, onClose, onSave, onClear }: StockGradeDialogProps) {
  const [grade, setGrade] = useState<StockGrade | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    setGrade(target?.current?.grade ?? null);
    setReason(target?.current?.reason ?? '');
    setBusy(false);
    submittingRef.current = false;
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, onClose]);

  if (!target) return null;
  const t = target;

  async function run(action: () => Promise<void>) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      await action();
      onClose();
    } catch {
      // 토스트는 매니저가 띄운다 — 모달을 유지해 재시도하게 둔다
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-grade-title"
        className="w-full max-w-sm space-y-4 rounded-xl bg-background p-5 shadow-lg ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 id="stock-grade-title" className="text-base font-semibold">
            {t.name} 등급
          </h2>
          {t.current && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {dateInTz(t.current.gradedAt, 'Asia/Seoul')} 지정
            </p>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="등급 선택">
          {STOCK_GRADES.map((g) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={grade === g}
              onClick={() => setGrade(g)}
              className={cn(
                'rounded-lg py-2 text-lg font-bold ring-1 transition-colors',
                grade === g ? GRADE_TONE[g] : 'text-muted-foreground ring-border hover:bg-muted',
              )}
            >
              {g}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">A가 투자성이 가장 높은 등급입니다.</p>

        <div className="space-y-1.5">
          <Label htmlFor="stock-grade-reason">한 줄 사유 (선택)</Label>
          <Input
            id="stock-grade-reason"
            value={reason}
            maxLength={REASON_MAX}
            placeholder="예: 2분기 실적 서프라이즈, 수주 잔고 증가"
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="text-right text-xs text-muted-foreground tabular-nums">
            {reason.length}/{REASON_MAX}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2">
          {t.current ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => onClear(t.stockId))}>
              등급 해제
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
              취소
            </Button>
            <Button
              size="sm"
              disabled={busy || grade === null}
              onClick={() => grade && run(() => onSave(t.stockId, grade, reason.trim() || null))}
            >
              저장
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```


- [ ] **Step 4: 타입체크·린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 없음

- [ ] **Step 5: Commit**

```bash
git add components/stocks/grade-style.ts components/stocks/grade-filter-chips.tsx components/stocks/stock-grade-dialog.tsx
git commit -m "기능: 종목 등급 필터 칩·등급 지정 모달"
```

---

### Task 5: 카드 배지 + 매니저 연결 (필터 적용 · 낙관적 저장)

**Files:**
- Modify: `components/stocks/watchlist-card.tsx` (props 인터페이스, 우상단 버튼 그룹 `:96` 앞)
- Modify: `components/stocks/watchlist-manager.tsx`

**Interfaces:**
- Consumes: Task 1 함수들, Task 3 API·`grades` prop, Task 4 컴포넌트
- Produces: `WatchlistCard` 새 props `userGrade: UserStockGrade | null`, `onEditGrade: (stockId: string) => void`

- [ ] **Step 1: 카드 배지** — `components/stocks/watchlist-card.tsx`

import에 `import { GRADE_TONE } from './grade-style';`, 타입 import에 `UserStockGrade` 추가.
`WatchlistCardProps`에:
```ts
  /** 사용자 등급(D22) — 없으면 미분류 */
  userGrade: UserStockGrade | null;
  onEditGrade: (stockId: string) => void;
```
컴포넌트 구조분해에 `userGrade, onEditGrade` 추가. 우상단 `<div className="absolute top-2.5 right-2.5 ...">`의 **첫 자식**으로:
```tsx
        <button
          type="button"
          onClick={() => onEditGrade(item.stock_id)}
          aria-label={userGrade ? `등급 ${userGrade.grade}, 변경` : '등급 지정'}
          title={userGrade?.reason ?? (userGrade ? undefined : '등급 지정')}
          className={cn(
            'mr-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[11px] font-bold ring-1',
            userGrade ? GRADE_TONE[userGrade.grade] : 'text-muted-foreground/50 ring-border hover:bg-muted',
          )}
        >
          {userGrade?.grade ?? '–'}
        </button>
```
버튼이 하나 늘어 제목과 겹치면 제목 영역 `pr-14`를 `pr-20`으로 넓힌다(`:139` 부근). `cn`은 `@/lib/utils`에서 import(없으면 추가).

- [ ] **Step 2: 매니저 상태** — `components/stocks/watchlist-manager.tsx`

import 추가:
```ts
import { GradeFilterChips } from './grade-filter-chips';
import { StockGradeDialog, type GradeTarget } from './stock-grade-dialog';
import { countByGrade, filterByGrade, toggleGradeFilter } from '@/lib/utils/stock-grade';
```
타입 import에 `GradeFilter, StockGrade, UserStockGrade` 추가.
기존 `useState` 묶음 아래:
```ts
  // 등급은 종목 단위라 탭 캐시(itemsByTab)와 분리 보관 — 한 탭에서 바꾸면 모든 탭 카드에 즉시 반영된다.
  const [grades, setGrades] = useState<Record<string, UserStockGrade>>(initialGrades);
  const [gradeFilter, setGradeFilter] = useState<Set<GradeFilter>>(new Set());
  const [gradeTarget, setGradeTarget] = useState<GradeTarget | null>(null);
```
`items` useMemo 아래:
```ts
  const gradeCounts = useMemo(() => countByGrade(items, grades), [items, grades]);
  const visibleItems = useMemo(() => filterByGrade(items, grades, gradeFilter), [items, grades, gradeFilter]);
```

- [ ] **Step 3: 저장·해제 핸들러** (handleToggleEngineFlag 아래):

```ts
  function openGradeDialog(stockId: string) {
    const it = items.find((i) => i.stock_id === stockId);
    if (!it) return;
    setGradeTarget({ stockId, name: it.name_kr ?? it.ticker, current: grades[stockId] ?? null });
  }

  /** 실패 시 throw — 모달이 닫히지 않고 남아 재시도할 수 있다 */
  async function saveGrade(stockId: string, grade: StockGrade, reason: string | null) {
    const snapshot = grades;
    setGrades((m) => ({ ...m, [stockId]: { stockId, grade, reason, gradedAt: new Date().toISOString() } }));
    try {
      const res = await fetch('/api/stock-grades', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock_id: stockId, grade, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '등급 저장에 실패했습니다.');
      setGrades((m) => ({ ...m, [stockId]: data.grade as UserStockGrade }));
      toast.success(`${grade}등급으로 지정했습니다.`);
    } catch (e) {
      setGrades(snapshot);
      toast.error((e as Error).message);
      throw e;
    }
  }

  async function clearGrade(stockId: string) {
    const snapshot = grades;
    setGrades((m) => {
      const n = { ...m };
      delete n[stockId];
      return n;
    });
    try {
      const res = await fetch(`/api/stock-grades?stock_id=${encodeURIComponent(stockId)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('등급을 해제했습니다.');
    } catch (e) {
      setGrades(snapshot);
      toast.error('등급 해제에 실패했습니다.');
      throw e;
    }
  }
```

- [ ] **Step 4: 필터 적용 + Review Focus 1·2 처리**

`buckets` useMemo 안의 `items`를 전부 `visibleItems`로 바꾸고 의존성도 `[visibleItems]`로:
```ts
    const favorites = visibleItems.filter((i) => i.isFavorite).sort(bySort);
    const byMarket = MARKET_ORDER.map((mkt) => ({
      market: mkt,
      list: visibleItems.filter((i) => i.market === mkt).sort(bySort),
    })).filter((g) => g.list.length > 0);
    return { favorites, byMarket };
  }, [visibleItems]);
```
`handleDragEnd` 맨 앞(`const { active, over } = e;` 다음 줄 `if (!over ...)` 뒤)에:
```ts
    // 걸러진 일부만 0..n으로 저장하면 숨은 종목과 sort_order가 겹친다 — 필터 중에는 정렬하지 않는다
    if (gradeFilter.size > 0) {
      toast.info('등급 필터를 해제한 뒤 순서를 바꿀 수 있습니다.');
      return;
    }
```
`renderBucket`의 `<WatchlistCard ... />`에 props 추가:
```tsx
              userGrade={grades[it.stock_id] ?? null}
              onEditGrade={openGradeDialog}
```
JSX: `<StockSearch ... />` 바로 아래에 (종목이 있을 때만):
```tsx
      {tabLoaded && items.length > 0 && (
        <GradeFilterChips
          selected={gradeFilter}
          counts={gradeCounts}
          onToggle={(f) => setGradeFilter((s) => toggleGradeFilter(s, f))}
          onClear={() => setGradeFilter(new Set())}
        />
      )}
```
빈 상태 분기: 기존 `items.length === 0 ? (...)` 다음에 분기 하나 추가:
```tsx
      ) : visibleItems.length === 0 ? (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>선택한 등급의 종목이 없습니다.</span>
          <button type="button" className="underline" onClick={() => setGradeFilter(new Set())}>
            전체 보기
          </button>
        </div>
```
`<WatchlistDialog ... />` 옆에:
```tsx
      <StockGradeDialog
        target={gradeTarget}
        onClose={() => setGradeTarget(null)}
        onSave={saveGrade}
        onClear={clearGrade}
      />
```

- [ ] **Step 5: 정적 검증**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: 전부 통과

- [ ] **Step 6: 브라우저 검증** (`preview_start`로 dev 서버, `/stocks`)
  1. 카드의 `–` 배지 클릭 → 모달에서 A + 사유 입력 → 저장 → 배지 `A`, 토스트, 새로고침 후 유지
  2. 같은 종목이 있는 다른 탭으로 전환 → 같은 `A` 배지
  3. 칩 `A`+`C` 선택 → 두 등급만 표시, 개수 일치 / `D`만 선택(0건) → "선택한 등급의 종목이 없습니다." + 전체 보기
  4. 필터 활성 중 카드 드래그 → 안내 토스트, 순서 저장 요청(PATCH reorder) 없음(`read_network_requests`)
  5. 등급 해제 → `–`로 복귀, 미분류 칩 개수 +1
  6. 사유 101자 붙여넣기 → 입력이 100자에서 잘림(maxLength)

- [ ] **Step 7: Commit**

```bash
git add components/stocks/watchlist-card.tsx components/stocks/watchlist-manager.tsx
git commit -m "기능: 내 종목 카드 등급 배지와 등급 필터 연결"
```

---

### Task 6: PRD Decision Log D22

**Files:**
- Modify: `docs/PRD.md` (Decision Log 표, D21 행 **위**에 추가 — 최신이 위)

- [ ] **Step 1: 행 추가**

```markdown
| D22 | 사용자 종목 등급 A~D (`/stocks` · 마이그레이션 `0022`) | 종목을 조사·분석한 뒤 투자성으로 **A(최상위)~D** 등급을 수동 지정하고 `/stocks`에서 **다중 선택 칩(A·B·C·D·미분류, 미선택=전체)**으로 거른다. 등급은 **탭과 무관한 종목 단위**라 신규 테이블 `user_stock_grades`(PK `user_id, stock_id`, RLS 본인 행)에 둔다 — `watchlist_items`는 탭마다 행이 있어 동기화 문제가 생기고 기존 테이블 변경 금지 규칙에도 걸린다. 기록은 등급 + 한 줄 사유(선택, 100자) + 지정일(`graded_at`, 수정 시 갱신). 종목을 목록에서 빼도 등급은 남아 재등록 시 복원된다. 필터 중에는 드래그 정렬을 막는다(부분 목록 저장 시 순서 충돌). **분석 엔진·종목 상세와는 연동하지 않는다**(엔진의 `ScoreGrade`와 별개). (사용자 승인 2026-09-29) |
```

- [ ] **Step 2: Commit**

```bash
git add docs/PRD.md
git commit -m "문서: PRD D22 사용자 종목 등급"
```
