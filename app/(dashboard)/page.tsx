// S1 대시보드 — F11 시장 위젯 + F1 데일리 브리핑(W4).
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MarketWidget } from '@/components/dashboard/market-widget';
import { BriefingCard } from '@/components/dashboard/briefing-card';
import { requireUser } from '@/lib/supabase/server';
import { getLatestBriefing } from '@/lib/supabase/queries/briefings';

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  const briefing = await getLatestBriefing(supabase, user.id);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">대시보드</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">시장 지수 (F11)</CardTitle>
        </CardHeader>
        <CardContent>
          <MarketWidget />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>오늘의 브리핑 (F1)</CardTitle>
          <CardDescription>매 영업일 06:30 자동 생성 · 수동 생성 가능</CardDescription>
        </CardHeader>
        <CardContent>
          <BriefingCard initial={briefing} />
        </CardContent>
      </Card>
    </div>
  );
}
