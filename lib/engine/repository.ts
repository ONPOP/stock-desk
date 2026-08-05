// 분석 엔진 DB 접근 (D16). 기존 lib/supabase/queries/*는 웹 UI 소비처가 있어 손대지 않고,
// 엔진 전용 조회·적재만 여기에 모은다.
//
// 'server-only'를 붙이지 않는다: 이 모듈은 tsx로 도는 배치 스크립트(scripts/engine/*)가 직접 import하며,
// server-only는 CJS 로더에서 즉시 throw한다. 대신 SupabaseClient를 주입받아 클라이언트 번들에 들어갈
// 자격증명 자체를 갖지 않는다 (기존 sim-ingest가 provider를 직접 import하는 방식과 동일).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Market } from '@/types';
import { DEFAULT_SIGNAL_RULES, DEFAULT_RULE_VERSION, parseSignalRules, type SignalRules } from '@/lib/engine/rules';
import type { ScoredStock } from '@/lib/engine/scorer';
import type { EngineStock } from '@/lib/engine/types';

export interface EngineSettings {
  slideStorageRoot: string | null;
  retentionDays: number;
  telegramChatId: string | null;
  maxStocksPerSlot: number;
  maxSearchesPerStock: number;
}

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  slideStorageRoot: null,
  retentionDays: 0,
  telegramChatId: null,
  maxStocksPerSlot: 8,
  maxSearchesPerStock: 4,
};

export async function loadEngineSettings(
  db: SupabaseClient,
  userId: string,
): Promise<EngineSettings> {
  const { data, error } = await db
    .from('engine_settings')
    .select('slide_storage_root, retention_days, telegram_chat_id, max_stocks_per_slot, max_searches_per_stock')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`엔진 설정 조회 실패: ${error.message}`);
  if (!data) return DEFAULT_ENGINE_SETTINGS;

  return {
    slideStorageRoot: data.slide_storage_root,
    retentionDays: data.retention_days,
    telegramChatId: data.telegram_chat_id,
    maxStocksPerSlot: data.max_stocks_per_slot,
    maxSearchesPerStock: data.max_searches_per_stock,
  };
}

export interface ActiveRules {
  version: number;
  rules: SignalRules;
}

/** active 규칙이 없으면 코드 기본값(v1)을 쓴다 — 최초 실행에서 엔진이 멈추지 않게 */
export async function loadActiveRules(db: SupabaseClient, userId: string): Promise<ActiveRules> {
  const { data, error } = await db
    .from('signal_rules')
    .select('version, rules')
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();
  if (error) throw new Error(`신호 규칙 조회 실패: ${error.message}`);
  if (!data) return { version: DEFAULT_RULE_VERSION, rules: DEFAULT_SIGNAL_RULES };
  return { version: data.version, rules: parseSignalRules(data.rules) };
}

interface WatchlistRow {
  stock_id: string;
  always_brief: boolean;
  radar_pin: boolean;
  stocks: { ticker: string; name_kr: string | null; name_en: string | null; market: Market } | null;
}

/**
 * 분석 대상 종목 — 전체 워치리스트 탭 통합, stock_id 기준 중복 제거 (D14 소비처 규약과 동일).
 * 같은 종목이 여러 탭에 있고 한 곳에서만 켜져 있으면 켜진 것으로 본다(always_brief·radar_pin 모두).
 */
export async function loadEngineStocks(
  db: SupabaseClient,
  userId: string,
  market?: 'KR' | 'US' | 'BOTH',
): Promise<EngineStock[]> {
  const { data, error } = await db
    .from('watchlist_items')
    .select('stock_id, always_brief, radar_pin, stocks!inner(ticker, name_kr, name_en, market)')
    .eq('user_id', userId);
  if (error) throw new Error(`워치리스트 조회 실패: ${error.message}`);

  const byStock = new Map<string, EngineStock>();
  for (const row of (data ?? []) as unknown as WatchlistRow[]) {
    if (!row.stocks) continue;
    const isKr = row.stocks.market === 'KOSPI' || row.stocks.market === 'KOSDAQ';
    if (market === 'KR' && !isKr) continue;
    if (market === 'US' && isKr) continue;

    const prev = byStock.get(row.stock_id);
    byStock.set(row.stock_id, {
      stockId: row.stock_id,
      ticker: row.stocks.ticker,
      name: row.stocks.name_kr ?? row.stocks.name_en ?? row.stocks.ticker,
      market: row.stocks.market,
      alwaysBrief: (prev?.alwaysBrief ?? false) || row.always_brief,
      radarPin: (prev?.radarPin ?? false) || row.radar_pin,
    });
  }
  return [...byStock.values()];
}

/**
 * 당일 실적발표가 예정된 stock_id 집합.
 * 종가 매수 후보에서 하드 제외하기 위한 값이라 '오늘'만 본다 (KST 기준 날짜를 호출부가 넘긴다).
 */
export async function loadEarningsToday(
  db: SupabaseClient,
  userId: string,
  runDate: string,
): Promise<Set<string>> {
  const { data, error } = await db
    .from('calendar_events')
    .select('stock_id')
    .eq('type', 'earnings')
    .eq('event_date', runDate)
    .or(`user_id.eq.${userId},user_id.is.null`);
  if (error) throw new Error(`실적 일정 조회 실패: ${error.message}`);

  const out = new Set<string>();
  for (const row of data ?? []) if (row.stock_id) out.add(row.stock_id as string);
  return out;
}

export interface SnapshotUpsertContext {
  userId: string;
  slotId: string;
  runDate: string;
  capturedAt: string;
}

export interface SnapshotRow {
  user_id: string;
  slot_id: string;
  run_date: string;
  stock_id: string;
  captured_at: string;
  price_data: unknown;
  indicators: unknown;
  flow_data: unknown;
  score: number;
  score_detail: unknown;
}

/**
 * 적재할 행을 만든다 — 적재와 분리해 둔 이유는 실패 시 이 행들을 그대로 대기 큐에 남기기 위함이다
 * (재시도 때 시세를 다시 조회하거나 지표를 다시 계산하지 않는다).
 */
export function buildSnapshotRows(ctx: SnapshotUpsertContext, scored: ScoredStock[]): SnapshotRow[] {
  return scored.map((s) => ({
    user_id: ctx.userId,
    slot_id: ctx.slotId,
    run_date: ctx.runDate,
    stock_id: s.snapshot.stock.stockId,
    captured_at: ctx.capturedAt,
    price_data: s.snapshot.priceData,
    indicators: s.snapshot.indicators,
    flow_data: s.snapshot.flowData,
    score: s.score,
    score_detail: s.detail,
  }));
}

/** 스냅샷 적재 — 동일 (유저·날짜·슬롯·종목) 재실행은 덮어쓴다(uniq_snapshot_per_run) */
export async function upsertSnapshotRows(db: SupabaseClient, rows: SnapshotRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  const { error } = await db
    .from('market_snapshots')
    .upsert(rows, { onConflict: 'user_id,run_date,slot_id,stock_id' });
  if (error) throw new Error(`스냅샷 적재 실패: ${error.message}`);
  return rows.length;
}

export async function upsertSnapshots(
  db: SupabaseClient,
  ctx: SnapshotUpsertContext,
  scored: ScoredStock[],
): Promise<number> {
  return upsertSnapshotRows(db, buildSnapshotRows(ctx, scored));
}
