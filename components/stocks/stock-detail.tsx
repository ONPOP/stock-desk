'use client';

// 종목 상세 — 현재가(시세 폴링) + 차트(F6) + 손익 계산기(F8) + 펀더멘털(F4/F15/F12).
// [재설계] 헤더 비주얼 + 섹션을 탭(개요/차트/뉴스/AI분석/노트)으로 재구성, 실제 로고.
// [보존] props 시그니처·useQuote·useState·refresh()/refreshNewsFeed()·reportOutcome·dynamic import 그대로.
import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { ChevronLeft, Star, Clock, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CompanyLogo } from '@/components/ui/company-logo';
import { useQuote } from '@/lib/hooks/use-quote';
import { formatMoney } from '@/lib/utils/money';
import { ProfitCalculator } from './profit-calculator';
import { HoldingsTradesPanel } from './holdings-trades-panel';
import { MetricsPanel } from './metrics-panel';
import { DividendCard } from './dividend-card';
import { DisclosureFeed } from './disclosure-feed';
import { NewsFeed } from '@/components/news/news-feed';
import { NotesClient } from '@/components/notes/notes-client';
import type { AiAnalysis, DisclosureItem, DividendInfo, NewsItem, Note, RealTrade, Stock, StockMetrics } from '@/types';
import type { RefreshOutcome } from '@/lib/services/fundamentals';
import type { PriceChartProps } from './price-chart';
import type { AnalysisPanelProps } from '@/components/stocks/analysis-panel';

export interface Fundamentals {
  metrics: StockMetrics[];
  dividends: DividendInfo[];
  disclosures: DisclosureItem[];
}

function changeColor(change: number): string {
  if (change > 0) return 'text-up';
  if (change < 0) return 'text-down';
  return 'text-muted-foreground';
}

const PriceChart = dynamic<PriceChartProps>(
  () => import('./price-chart').then((mod) => mod.PriceChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[360px] items-center justify-center text-sm text-muted-foreground">
        차트 로딩 중…
      </div>
    ),
  },
);

const AnalysisPanel = dynamic<AnalysisPanelProps>(
  () => import('@/components/stocks/analysis-panel').then((mod) => mod.AnalysisPanel),
  {
    ssr: false,
    loading: () => <p className="text-sm text-muted-foreground">AI 분석 불러오는 중…</p>,
  },
);

/** 갱신 결과를 토스트로 요약 */
function reportOutcome(outcome: RefreshOutcome) {
  const sections = [outcome.metrics, outcome.dividends, outcome.disclosures];
  if (sections.every((s) => s.status === 'skipped')) {
    toast.warning('데이터 소스 키 또는 식별자가 설정되지 않았습니다. 설정에서 DART/Finnhub/FMP 키를 등록하세요.');
    return;
  }
  const errored = sections.find((s) => s.status === 'error');
  if (errored) {
    toast.error(`일부 항목 갱신 실패: ${errored.reason ?? '알 수 없는 오류'}`);
    return;
  }
  toast.success('펀더멘털을 갱신했습니다.');
}

export function StockDetail({
  stock,
  fundamentals,
  news,
  stockNotes,
  analyses,
  trades,
}: {
  stock: Stock;
  fundamentals: Fundamentals;
  news: NewsItem[];
  stockNotes: Note[];
  analyses: AiAnalysis[];
  trades: RealTrade[];
}) {
  const { quote, source, error, loading } = useQuote(stock.ticker, stock.market);
  const [fund, setFund] = useState<Fundamentals>(fundamentals);
  const [refreshing, setRefreshing] = useState(false);
  const [newsItems, setNewsItems] = useState<NewsItem[]>(news);
  const [newsRefreshing, setNewsRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch(
        `/api/stocks/${encodeURIComponent(stock.ticker)}/fundamentals?market=${stock.market}`,
        { method: 'POST' },
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? '갱신에 실패했습니다.');
        return;
      }
      setFund({ metrics: data.metrics, dividends: data.dividends, disclosures: data.disclosures });
      if (data.outcome) reportOutcome(data.outcome as RefreshOutcome);
    } catch {
      toast.error('네트워크 오류로 갱신하지 못했습니다.');
    } finally {
      setRefreshing(false);
    }
  }

  async function refreshNewsFeed() {
    setNewsRefreshing(true);
    try {
      const res = await fetch(`/api/stocks/${encodeURIComponent(stock.ticker)}/news?market=${stock.market}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? '뉴스 갱신에 실패했습니다.');
        return;
      }
      setNewsItems(data.news ?? []);
      const o = data.outcome;
      if (o?.status === 'skipped') toast.warning(o.reason ?? '뉴스 소스 키가 설정되지 않았습니다.');
      else if (o?.status === 'error') toast.error(o.reason ?? '뉴스 갱신 실패');
      else toast.success(`뉴스 ${o?.count ?? 0}건 갱신 (요약 ${o?.summarized ?? 0}건)`);
    } catch {
      toast.error('네트워크 오류로 뉴스를 갱신하지 못했습니다.');
    } finally {
      setNewsRefreshing(false);
    }
  }

  const name = stock.name_kr ?? stock.name_en ?? stock.ticker;

  return (
    <div className="mx-auto max-w-[1240px] space-y-5 p-6">
      <Link
        href="/stocks"
        className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-2 self-start text-muted-foreground' })}
      >
        <ChevronLeft data-icon="inline-start" /> 내 종목
      </Link>

      <header className="flex flex-wrap items-start gap-4">
        <CompanyLogo ticker={stock.ticker} name={name} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
            <Badge variant="secondary">{stock.market}</Badge>
            {stock.is_active === false && <Badge variant="destructive">거래정지/상폐</Badge>}
            <span className="font-mono text-sm text-muted-foreground">{stock.ticker}</span>
          </div>
          <div className="mt-1.5">
            {loading && !quote ? (
              <Skeleton className="h-9 w-40" />
            ) : error && !quote ? (
              <p className="text-sm text-muted-foreground">시세를 불러오지 못했습니다: {error}</p>
            ) : quote ? (
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-[34px] leading-none font-bold tracking-tight tabular-nums">
                  {formatMoney(quote.price, quote.currency)}
                </span>
                <span className={`text-base font-semibold tabular-nums ${changeColor(quote.change)}`}>
                  {quote.change > 0 ? '+' : ''}
                  {formatMoney(quote.change, quote.currency)} ({quote.change > 0 ? '+' : ''}
                  {quote.changeRate}%)
                </span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {source && (
            <Badge variant="outline" className="gap-1">
              <Clock /> 시세 출처: {source === 'kis' ? 'KIS' : 'Yahoo'}
            </Badge>
          )}
          <Button variant="outline" size="sm">
            <Star data-icon="inline-start" /> 관심
          </Button>
        </div>
      </header>

      <Tabs defaultValue="overview">
        <TabsList variant="line" className="w-full justify-start border-b">
          <TabsTrigger value="overview">개요</TabsTrigger>
          <TabsTrigger value="chart">차트</TabsTrigger>
          <TabsTrigger value="news">뉴스</TabsTrigger>
          <TabsTrigger value="ai">AI분석</TabsTrigger>
          <TabsTrigger value="notes">노트</TabsTrigger>
        </TabsList>

        {/* 개요 — 핵심 지표 + 배당 + 손익 계산기 */}
        <TabsContent value="overview" className="space-y-5 pt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">기업 정보</h2>
            <Button onClick={refresh} variant="outline" size="sm" disabled={refreshing}>
              <RefreshCw data-icon="inline-start" className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? '갱신 중…' : '갱신'}
            </Button>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="gap-3 p-[18px] lg:col-span-2">
              <h3 className="font-semibold">핵심 지표</h3>
              <MetricsPanel metrics={fund.metrics} currency={stock.currency} />
            </Card>
            <div className="flex flex-col gap-5">
              <Card className="gap-3 p-[18px]">
                <h3 className="font-semibold">배당</h3>
                <DividendCard dividends={fund.dividends} currency={stock.currency} />
              </Card>
              <Card className="gap-3 p-[18px]">
                <h3 className="font-semibold">손익 계산기</h3>
                <ProfitCalculator priceMinor={quote?.price ?? null} currency={stock.currency} />
              </Card>
            </div>
          </div>

          <HoldingsTradesPanel stock={stock} initialTrades={trades} currentPriceMinor={quote?.price ?? null} />
        </TabsContent>

        {/* 차트 */}
        <TabsContent value="chart" className="pt-5">
          <Card className="p-[18px]">
            <PriceChart
              ticker={stock.ticker}
              market={stock.market}
              currency={stock.currency}
              newsMarkers={newsItems.map((n) => ({ date: n.publishedAt, title: n.title }))}
            />
          </Card>
        </TabsContent>

        {/* 뉴스 — 뉴스 + 공시 */}
        <TabsContent value="news" className="grid gap-5 pt-5 lg:grid-cols-3">
          <Card className="gap-3 p-[18px] lg:col-span-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">뉴스</h3>
              <Button onClick={refreshNewsFeed} variant="outline" size="sm" disabled={newsRefreshing}>
                <RefreshCw data-icon="inline-start" className={newsRefreshing ? 'animate-spin' : ''} />
                {newsRefreshing ? '갱신 중…' : '뉴스 갱신'}
              </Button>
            </div>
            <NewsFeed news={newsItems} />
          </Card>
          <Card className="gap-3 p-[18px]">
            <h3 className="font-semibold">공시</h3>
            <DisclosureFeed disclosures={fund.disclosures} />
          </Card>
        </TabsContent>

        {/* AI 분석 (F7) */}
        <TabsContent value="ai" className="pt-5">
          <Card className="max-w-3xl gap-3 p-[18px]">
            <AnalysisPanel stock={stock} initialAnalyses={analyses} />
          </Card>
        </TabsContent>

        {/* 노트 */}
        <TabsContent value="notes" className="pt-5">
          <Card className="max-w-3xl gap-3 p-[18px]">
            <h3 className="font-semibold">노트</h3>
            <NotesClient initialNotes={stockNotes} stockId={stock.id} />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
