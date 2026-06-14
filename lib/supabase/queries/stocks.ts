// 종목 단건 조회 (종목 상세 페이지) — stocks 테이블(sync:master).
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Market, Stock } from '@/types';

export async function getStock(db: SupabaseClient, ticker: string, market: Market): Promise<Stock | null> {
  const { data, error } = await db
    .from('stocks')
    .select('id, ticker, name_kr, name_en, market, currency, sector, is_active')
    .eq('ticker', ticker)
    .eq('market', market)
    .maybeSingle();
  if (error) throw new Error(`종목 조회 실패: ${error.message}`);
  return (data as Stock) ?? null;
}
