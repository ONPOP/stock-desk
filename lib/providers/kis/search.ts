// 종목검색 — stocks 마스터 테이블 질의 (마스터 동기화는 scripts/sync-stock-master.ts)
import type { SupabaseClient } from '@supabase/supabase-js';
import { ValidationError } from '@/lib/errors';
import type { StockSearchResult } from '@/types';

const MAX_QUERY_LENGTH = 50;

/** 검색어 정규화 + ilike 패턴 이스케이프 (%, _ 와일드카드 주입 방지) */
export function sanitizeSearchQuery(raw: string): string {
  const q = raw.trim();
  if (q.length === 0) {
    throw new ValidationError('검색어를 입력해주세요.');
  }
  if (q.length > MAX_QUERY_LENGTH) {
    throw new ValidationError(`검색어는 ${MAX_QUERY_LENGTH}자 이내여야 합니다.`);
  }
  // PostgREST or= 필터 구문 주입 방지: 허용 문자만 통과
  if (!/^[\p{L}\p{N} .\-&]+$/u.test(q)) {
    throw new ValidationError('검색어에 사용할 수 없는 문자가 포함되어 있습니다.');
  }
  return q.replace(/[%_]/g, '\\$&');
}

export async function searchStocks(
  db: SupabaseClient,
  rawQuery: string,
  limit = 20,
): Promise<StockSearchResult[]> {
  const q = sanitizeSearchQuery(rawQuery);
  const { data, error } = await db
    .from('stocks')
    .select('ticker, name_kr, name_en, market, currency')
    .or(`ticker.ilike.${q}%,name_kr.ilike.%${q}%,name_en.ilike.%${q}%`)
    .limit(Math.min(Math.max(limit, 1), 50));
  if (error) {
    throw new ValidationError('종목 검색 중 오류가 발생했습니다.', error.message);
  }
  return (data ?? []) as StockSearchResult[];
}
