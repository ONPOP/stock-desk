// 엔진 설정 조회 (D16) — /reports 설정 탭 전용. RLS를 타는 사용자 클라이언트로 호출한다.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_SIGNAL_RULES, parseSignalRules, type SignalRules } from '@/lib/engine/rules';

export interface SlotRow {
  slotId: string;
  label: string;
  cronKst: string;
  market: 'KR' | 'US' | 'BOTH';
  slotType: 'quick' | 'detail' | 'grade' | 'weekly';
  enabled: boolean;
}

export async function listSlots(db: SupabaseClient, userId: string): Promise<SlotRow[]> {
  const { data, error } = await db
    .from('schedule_slots')
    .select('slot_id, label, cron_kst, market, slot_type, enabled')
    .eq('user_id', userId)
    .order('slot_id', { ascending: true });
  if (error) throw new Error(`슬롯 조회 실패: ${error.message}`);
  return (data ?? []).map((r) => ({
    slotId: r.slot_id,
    label: r.label,
    cronKst: r.cron_kst,
    market: r.market,
    slotType: r.slot_type,
    enabled: r.enabled,
  }));
}

export interface RuleVersion {
  id: string;
  version: number;
  active: boolean;
  memo: string | null;
  createdAt: string;
  rules: SignalRules;
  /** 이 버전으로 낸 신호의 성적 — 룰 변경 효과를 바로 볼 수 있게 함께 준다 */
  graded: number;
  wins: number;
}

export async function listRuleVersions(db: SupabaseClient, userId: string): Promise<RuleVersion[]> {
  const { data, error } = await db
    .from('signal_rules')
    .select('id, version, active, memo, created_at, rules')
    .eq('user_id', userId)
    .order('version', { ascending: false });
  if (error) throw new Error(`신호 규칙 조회 실패: ${error.message}`);

  const rows = data ?? [];
  if (rows.length === 0) {
    return [
      {
        id: 'default',
        version: 1,
        active: true,
        memo: '코드 기본값 (아직 저장된 규칙 없음)',
        createdAt: new Date(0).toISOString(),
        rules: DEFAULT_SIGNAL_RULES,
        graded: 0,
        wins: 0,
      },
    ];
  }

  // 버전별 성적 — 신호 수가 많지 않아 한 번에 읽고 메모리에서 집계한다
  const { data: signals } = await db
    .from('slot_signals')
    .select('rule_version, outcome')
    .eq('user_id', userId)
    .not('graded_at', 'is', null);

  const stats = new Map<number, { graded: number; wins: number }>();
  for (const s of signals ?? []) {
    if (s.rule_version === null) continue;
    const cur = stats.get(s.rule_version) ?? { graded: 0, wins: 0 };
    cur.graded++;
    if (s.outcome === 'WIN') cur.wins++;
    stats.set(s.rule_version, cur);
  }

  return rows.map((r) => {
    const stat = stats.get(r.version) ?? { graded: 0, wins: 0 };
    return {
      id: r.id,
      version: r.version,
      active: r.active,
      memo: r.memo,
      createdAt: r.created_at,
      // 저장된 값이 스키마와 어긋나면 기본값으로 보여주고 편집은 가능하게 둔다
      rules: (() => {
        try {
          return parseSignalRules(r.rules);
        } catch {
          return DEFAULT_SIGNAL_RULES;
        }
      })(),
      graded: stat.graded,
      wins: stat.wins,
    };
  });
}

export interface ThemeRow {
  id: string;
  name: string;
  market: 'KR' | 'US' | 'BOTH';
  description: string | null;
  stocks: Array<{ stockId: string; ticker: string; name: string }>;
}

interface ThemeStockJoin {
  theme_id: string;
  stock_id: string;
  stocks: { ticker: string; name_kr: string | null; name_en: string | null } | null;
}

export async function listThemes(db: SupabaseClient, userId: string): Promise<ThemeRow[]> {
  const { data, error } = await db
    .from('analysis_themes')
    .select('id, name, market, description')
    .eq('user_id', userId)
    .order('name', { ascending: true });
  if (error) throw new Error(`테마 조회 실패: ${error.message}`);

  const themes = data ?? [];
  if (themes.length === 0) return [];

  const { data: links } = await db
    .from('theme_stocks')
    .select('theme_id, stock_id, stocks!inner(ticker, name_kr, name_en)')
    .in(
      'theme_id',
      themes.map((t) => t.id),
    );

  const byTheme = new Map<string, ThemeRow['stocks']>();
  for (const l of (links ?? []) as unknown as ThemeStockJoin[]) {
    const list = byTheme.get(l.theme_id) ?? [];
    list.push({
      stockId: l.stock_id,
      ticker: l.stocks?.ticker ?? '',
      name: l.stocks?.name_kr ?? l.stocks?.name_en ?? l.stocks?.ticker ?? '',
    });
    byTheme.set(l.theme_id, list);
  }

  return themes.map((t) => ({
    id: t.id,
    name: t.name,
    market: t.market,
    description: t.description,
    stocks: byTheme.get(t.id) ?? [],
  }));
}

export interface SnapshotForPreview {
  stockId: string;
  ticker: string;
  name: string;
  market: string;
  alwaysBrief: boolean;
  radarPin: boolean;
  priceData: unknown;
  indicators: unknown;
}

/**
 * 규칙 미리보기용 최근 스냅샷.
 * 시세를 다시 부르지 않고 저장된 지표에 규칙만 재적용하기 위한 것 — API 호출 0회.
 */
export async function latestSnapshotSet(
  db: SupabaseClient,
  userId: string,
  slotId?: string,
): Promise<{ runDate: string; slotId: string; rows: SnapshotForPreview[] } | null> {
  let head = db
    .from('market_snapshots')
    .select('run_date, slot_id')
    .eq('user_id', userId)
    .order('captured_at', { ascending: false })
    .limit(1);
  if (slotId) head = head.eq('slot_id', slotId);

  const { data: latest, error } = await head.maybeSingle();
  if (error) throw new Error(`스냅샷 조회 실패: ${error.message}`);
  if (!latest) return null;

  const { data, error: rowsError } = await db
    .from('market_snapshots')
    .select('stock_id, price_data, indicators, stocks!inner(ticker, name_kr, name_en, market)')
    .eq('user_id', userId)
    .eq('run_date', latest.run_date)
    .eq('slot_id', latest.slot_id);
  if (rowsError) throw new Error(`스냅샷 조회 실패: ${rowsError.message}`);

  const { data: flags } = await db
    .from('watchlist_items')
    .select('stock_id, always_brief, radar_pin')
    .eq('user_id', userId);
  const flagByStock = new Map(
    (flags ?? []).map((f) => [f.stock_id as string, { alwaysBrief: f.always_brief, radarPin: f.radar_pin }]),
  );

  interface Row {
    stock_id: string;
    price_data: unknown;
    indicators: unknown;
    stocks: { ticker: string; name_kr: string | null; name_en: string | null; market: string } | null;
  }

  const rows = ((data ?? []) as unknown as Row[]).map((r) => {
    const flag = flagByStock.get(r.stock_id);
    return {
      stockId: r.stock_id,
      ticker: r.stocks?.ticker ?? '',
      name: r.stocks?.name_kr ?? r.stocks?.name_en ?? r.stocks?.ticker ?? '',
      market: r.stocks?.market ?? '',
      alwaysBrief: flag?.alwaysBrief ?? false,
      radarPin: flag?.radarPin ?? false,
      priceData: r.price_data,
      indicators: r.indicators,
    };
  });

  return { runDate: latest.run_date, slotId: latest.slot_id, rows };
}
