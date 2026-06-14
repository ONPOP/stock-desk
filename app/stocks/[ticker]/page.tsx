// 종목 상세 — /stocks/[ticker]?market=KOSPI. 같은 티커가 시장별로 존재할 수 있어 market을 쿼리로 받는다.
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/supabase/server';
import { getStock } from '@/lib/supabase/queries/stocks';
import {
  getMetricsSeries,
  getDividendsByStock,
  getDisclosuresByStock,
} from '@/lib/supabase/queries/fundamentals';
import { getNewsByStock } from '@/lib/supabase/queries/news';
import { listNotes } from '@/lib/supabase/queries/notes';
import { listAnalyses } from '@/lib/supabase/queries/analyses';
import { listTradesByStock } from '@/lib/supabase/queries/real-trades';
import { marketSchema } from '@/lib/validation/market';
import { StockDetail } from '@/components/stocks/stock-detail';

interface PageProps {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<{ market?: string }>;
}

export default async function StockDetailPage({ params, searchParams }: PageProps) {
  const { ticker } = await params;
  const { market } = await searchParams;
  const parsed = marketSchema.safeParse(market);
  if (!parsed.success) notFound();

  const { supabase, user } = await requireUser();
  const stock = await getStock(supabase, ticker, parsed.data);
  if (!stock) notFound();

  const [metrics, dividends, disclosures, news, stockNotes, analyses, trades] = await Promise.all([
    getMetricsSeries(supabase, stock.id, 8),
    getDividendsByStock(supabase, stock.id, 24),
    getDisclosuresByStock(supabase, stock.id, 50),
    getNewsByStock(supabase, stock.id, 30),
    listNotes(supabase, user.id, { stockId: stock.id, limit: 50 }),
    listAnalyses(supabase, stock.id, 10),
    listTradesByStock(supabase, user.id, stock.id),
  ]);

  return (
    <StockDetail
      stock={stock}
      fundamentals={{ metrics, dividends, disclosures }}
      news={news}
      stockNotes={stockNotes}
      analyses={analyses}
      trades={trades}
    />
  );
}
