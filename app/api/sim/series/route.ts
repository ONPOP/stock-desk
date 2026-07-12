// 모의투자 테스트 — 테마 시장 시계열. 동결 일봉(sim_candles)을 공통 거래일 축으로 정렬해
// 클라이언트 시계가 로컬 인덱싱하도록 반환한다(요구 1·3).
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { stocksByTheme, themeBySlug } from '@/lib/sim/universe';
import type { SimSeriesResponse, SimStockSeries } from '@/types/sim';
import type { SupabaseClient } from '@supabase/supabase-js';

const PAGE = 1000;

// PostgREST 행 제한 대비 ticker 단위 페이지네이션 (10년 일봉 ≈ 2500행/종목)
async function fetchCloses(db: SupabaseClient, ticker: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('sim_candles')
      .select('ts,c')
      .eq('ticker', ticker)
      .order('ts', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new ValidationError('시뮬레이션 데이터 조회 실패', error.message);
    for (const row of data ?? []) out.set(row.ts as string, row.c as number);
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const { supabase } = await requireUser();
    const slug = new URL(req.url).searchParams.get('theme') ?? '';
    const theme = themeBySlug(slug);
    if (!theme) throw new ValidationError('존재하지 않는 테마입니다.');

    const stocks = stocksByTheme(slug);
    const maps = await Promise.all(stocks.map((s) => fetchCloses(supabase, s.ticker)));

    // 공통 거래일 축 = 테마 내 모든 종목 거래일의 합집합 (오름차순)
    const dateSet = new Set<string>();
    for (const m of maps) for (const d of m.keys()) dateSet.add(d);
    const dates = [...dateSet].sort();

    // 각 종목: 축에 정렬 + 상장 후 결측은 직전 종가로 보정, 상장 전은 null
    const series: SimStockSeries[] = stocks.map((s, i) => {
      const m = maps[i];
      let last: number | null = null;
      let started = false;
      const closes = dates.map((d) => {
        if (m.has(d)) {
          last = m.get(d)!;
          started = true;
        }
        return started ? last : null;
      });
      return { ticker: s.ticker, nameEn: s.nameEn, nameKr: s.nameKr, market: s.market, closes };
    });

    const body: SimSeriesResponse = { theme: slug, dates, series, empty: dates.length === 0 };
    return NextResponse.json(body);
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
