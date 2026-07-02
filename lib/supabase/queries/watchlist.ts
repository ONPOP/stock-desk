// 워치리스트 CRUD (F3) — 탭(컬렉션) 단위 관리. RLS가 user_id로 격리하나 쿼리에도 명시해 이중 방어.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NotFoundError, ValidationError } from '@/lib/errors';
import type { Currency, Market, WatchlistItem, WatchlistTab } from '@/types';

interface JoinedRow {
  stock_id: string;
  group_name: string;
  auto_analysis: boolean;
  is_favorite: boolean;
  sort_order: number;
  stocks: {
    ticker: string;
    name_kr: string | null;
    name_en: string | null;
    market: Market;
    currency: Currency;
  } | null;
}

function flatten(row: JoinedRow): WatchlistItem | null {
  if (!row.stocks) return null; // 종목이 삭제된 고아 행은 제외
  return {
    stock_id: row.stock_id,
    ticker: row.stocks.ticker,
    name_kr: row.stocks.name_kr,
    name_en: row.stocks.name_en,
    market: row.stocks.market,
    currency: row.stocks.currency,
    group_name: row.group_name,
    auto_analysis: row.auto_analysis,
    isFavorite: row.is_favorite,
    sortOrder: row.sort_order,
  };
}

// ───────────────────────── 탭(컬렉션) ─────────────────────────
interface WatchlistRow {
  id: string;
  name: string;
  is_default: boolean;
  sort_order: number;
}

const flattenTab = (r: WatchlistRow): WatchlistTab => ({
  id: r.id,
  name: r.name,
  isDefault: r.is_default,
  sortOrder: r.sort_order,
});

const DEFAULT_TAB_NAME = '내 종목';
const TAB_MAX = 20;
const NAME_MAX = 30;

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError('탭 이름을 입력해주세요.');
  if (trimmed.length > NAME_MAX) throw new ValidationError(`탭 이름은 ${NAME_MAX}자 이내여야 합니다.`);
  return trimmed;
}

/** 유저의 기본 탭 id 확보 — 없으면 생성(신규 유저·마이그 누락 대비). */
export async function ensureDefaultWatchlist(db: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await db
    .from('watchlists')
    .select('id')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();
  if (error) throw new Error(`기본 탭 조회 실패: ${error.message}`);
  if (data) return data.id as string;

  const { data: created, error: insErr } = await db
    .from('watchlists')
    .insert({ user_id: userId, name: DEFAULT_TAB_NAME, is_default: true, sort_order: 0 })
    .select('id')
    .single();
  if (insErr) throw new Error(`기본 탭 생성 실패: ${insErr.message}`);
  return created.id as string;
}

/** 탭 목록 — 기본 탭이 항상 맨 앞, 그 뒤 sort_order 순. 없으면 기본 탭 생성 후 재조회. */
export async function listWatchlists(db: SupabaseClient, userId: string): Promise<WatchlistTab[]> {
  const fetchTabs = () =>
    db
      .from('watchlists')
      .select('id, name, is_default, sort_order')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

  const { data, error } = await fetchTabs();
  if (error) throw new Error(`탭 목록 조회 실패: ${error.message}`);
  if (data && data.length > 0) return (data as WatchlistRow[]).map(flattenTab);

  await ensureDefaultWatchlist(db, userId);
  const retry = await fetchTabs();
  if (retry.error) throw new Error(`탭 목록 조회 실패: ${retry.error.message}`);
  return (retry.data as WatchlistRow[]).map(flattenTab);
}

/** 탭 소유 검증 — 다른 유저의 탭에 종목을 추가하는 것을 차단. */
async function assertOwnsWatchlist(db: SupabaseClient, userId: string, watchlistId: string): Promise<void> {
  const { data, error } = await db
    .from('watchlists')
    .select('id')
    .eq('id', watchlistId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`탭 조회 실패: ${error.message}`);
  if (!data) throw new NotFoundError('해당 탭을 찾을 수 없습니다.');
}

export async function createWatchlist(db: SupabaseClient, userId: string, name: string): Promise<WatchlistTab> {
  const trimmed = normalizeName(name);

  const { count, error: cntErr } = await db
    .from('watchlists')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (cntErr) throw new Error(`탭 개수 조회 실패: ${cntErr.message}`);
  if ((count ?? 0) >= TAB_MAX) throw new ValidationError(`탭은 최대 ${TAB_MAX}개까지 만들 수 있습니다.`);

  // 새 탭은 맨 뒤로 배치
  const { data: maxRow } = await db
    .from('watchlists')
    .select('sort_order')
    .eq('user_id', userId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? 0) + 1;

  const { data, error } = await db
    .from('watchlists')
    .insert({ user_id: userId, name: trimmed, is_default: false, sort_order: nextOrder })
    .select('id, name, is_default, sort_order')
    .single();
  if (error) throw new Error(`탭 생성 실패: ${error.message}`);
  return flattenTab(data as WatchlistRow);
}

export async function renameWatchlist(
  db: SupabaseClient,
  userId: string,
  id: string,
  name: string,
): Promise<void> {
  const trimmed = normalizeName(name);

  const { data: tab, error: selErr } = await db
    .from('watchlists')
    .select('is_default')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (selErr) throw new Error(`탭 조회 실패: ${selErr.message}`);
  if (!tab) throw new NotFoundError('해당 탭을 찾을 수 없습니다.');
  if (tab.is_default) throw new ValidationError('기본 탭은 이름을 변경할 수 없습니다.');

  const { error } = await db
    .from('watchlists')
    .update({ name: trimmed })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw new Error(`탭 이름 변경 실패: ${error.message}`);
}

export async function deleteWatchlist(db: SupabaseClient, userId: string, id: string): Promise<void> {
  const { data: tab, error: selErr } = await db
    .from('watchlists')
    .select('is_default')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (selErr) throw new Error(`탭 조회 실패: ${selErr.message}`);
  if (!tab) throw new NotFoundError('해당 탭을 찾을 수 없습니다.');
  if (tab.is_default) throw new ValidationError('기본 탭은 삭제할 수 없습니다.');

  // 멤버십(watchlist_items)은 FK on delete cascade로 함께 삭제됨
  const { error } = await db.from('watchlists').delete().eq('id', id).eq('user_id', userId);
  if (error) throw new Error(`탭 삭제 실패: ${error.message}`);
}

/** 탭 순서 재정렬 — 기본 탭은 항상 맨 앞이므로 제외. */
export async function reorderWatchlists(
  db: SupabaseClient,
  userId: string,
  orders: { id: string; sortOrder: number }[],
): Promise<void> {
  if (orders.length === 0) return;
  const results = await Promise.all(
    orders.map(({ id, sortOrder }) =>
      db
        .from('watchlists')
        .update({ sort_order: sortOrder })
        .eq('id', id)
        .eq('user_id', userId)
        .eq('is_default', false),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(`탭 정렬 변경 실패: ${failed.error.message}`);
}

// ───────────────────────── 종목(멤버십) ─────────────────────────
export async function listWatchlist(
  db: SupabaseClient,
  userId: string,
  watchlistId: string,
): Promise<WatchlistItem[]> {
  const { data, error } = await db
    .from('watchlist_items')
    .select(
      'stock_id, group_name, auto_analysis, is_favorite, sort_order, stocks!inner(ticker, name_kr, name_en, market, currency)',
    )
    .eq('user_id', userId)
    .eq('watchlist_id', watchlistId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`워치리스트 조회 실패: ${error.message}`);
  return (data as unknown as JoinedRow[]).map(flatten).filter((x): x is WatchlistItem => x !== null);
}

/** 유저가 추적 중인 전체 종목(모든 탭 통합, stock_id 기준 중복 제거) — 대시보드·비교·캘린더·브리핑용. */
export async function listAllWatchlistItems(db: SupabaseClient, userId: string): Promise<WatchlistItem[]> {
  const { data, error } = await db
    .from('watchlist_items')
    .select(
      'stock_id, group_name, auto_analysis, is_favorite, sort_order, stocks!inner(ticker, name_kr, name_en, market, currency)',
    )
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`워치리스트 조회 실패: ${error.message}`);
  const rows = (data as unknown as JoinedRow[]).map(flatten).filter((x): x is WatchlistItem => x !== null);
  const seen = new Set<string>();
  const out: WatchlistItem[] = [];
  for (const r of rows) {
    if (seen.has(r.stock_id)) continue; // 같은 종목이 여러 탭에 있을 수 있음
    seen.add(r.stock_id);
    out.push(r);
  }
  return out;
}

export async function addToWatchlist(
  db: SupabaseClient,
  userId: string,
  watchlistId: string,
  ticker: string,
  market: Market,
): Promise<WatchlistItem> {
  await assertOwnsWatchlist(db, userId, watchlistId);

  const { data: stock, error: stockErr } = await db
    .from('stocks')
    .select('id, ticker, name_kr, name_en, market, currency, is_active')
    .eq('ticker', ticker)
    .eq('market', market)
    .maybeSingle();
  if (stockErr) throw new Error(`종목 조회 실패: ${stockErr.message}`);
  if (!stock) throw new NotFoundError('해당 종목을 찾을 수 없습니다.');
  if (stock.is_active === false) throw new ValidationError('거래정지 또는 상장폐지된 종목입니다.');

  const { error: insErr } = await db
    .from('watchlist_items')
    .upsert(
      { user_id: userId, watchlist_id: watchlistId, stock_id: stock.id },
      { onConflict: 'watchlist_id,stock_id', ignoreDuplicates: true },
    );
  if (insErr) throw new Error(`워치리스트 추가 실패: ${insErr.message}`);

  return {
    stock_id: stock.id,
    ticker: stock.ticker,
    name_kr: stock.name_kr,
    name_en: stock.name_en,
    market: stock.market,
    currency: stock.currency,
    group_name: '기본',
    auto_analysis: true,
    isFavorite: false,
    sortOrder: 0,
  };
}

export async function removeFromWatchlist(
  db: SupabaseClient,
  userId: string,
  watchlistId: string,
  stockId: string,
): Promise<void> {
  const { error } = await db
    .from('watchlist_items')
    .delete()
    .eq('user_id', userId)
    .eq('watchlist_id', watchlistId)
    .eq('stock_id', stockId);
  if (error) throw new Error(`워치리스트 삭제 실패: ${error.message}`);
}

export async function setFavorite(
  db: SupabaseClient,
  userId: string,
  watchlistId: string,
  stockId: string,
  value: boolean,
): Promise<void> {
  const { error } = await db
    .from('watchlist_items')
    .update({ is_favorite: value })
    .eq('user_id', userId)
    .eq('watchlist_id', watchlistId)
    .eq('stock_id', stockId);
  if (error) throw new Error(`즐겨찾기 변경 실패: ${error.message}`);
}

/** 같은 묶음 내 드래그 정렬 — stock_id별 sort_order를 일괄 갱신(탭 단위, RLS로 user_id 격리). */
export async function reorderWatchlist(
  db: SupabaseClient,
  userId: string,
  watchlistId: string,
  orders: { stockId: string; sortOrder: number }[],
): Promise<void> {
  if (orders.length === 0) return;
  const results = await Promise.all(
    orders.map(({ stockId, sortOrder }) =>
      db
        .from('watchlist_items')
        .update({ sort_order: sortOrder })
        .eq('user_id', userId)
        .eq('watchlist_id', watchlistId)
        .eq('stock_id', stockId),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(`정렬 변경 실패: ${failed.error.message}`);
}
