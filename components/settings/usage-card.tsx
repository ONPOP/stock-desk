// API 사용량 카드 (PRD 14장) — 오늘·이번달 제공자별 호출·토큰. 표시 전용(서버 컴포넌트).
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { UsageRow, UsageSummary } from '@/types';

function totalTokens(rows: UsageRow[]): number {
  return rows.reduce((a, r) => a + r.promptTokens + r.completionTokens, 0);
}
function totalCalls(rows: UsageRow[]): number {
  return rows.reduce((a, r) => a + r.calls, 0);
}

export function UsageCard({ usage }: { usage: UsageSummary }) {
  const hasData = usage.month.length > 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>API 사용량</CardTitle>
        <CardDescription>AI 토큰·외부 API 호출량 (비용 추적). AI 요약·브리핑 실행 시 누적됩니다.</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-sm text-muted-foreground">아직 기록된 사용량이 없습니다.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">오늘</p>
              <p className="tabular-nums">호출 {totalCalls(usage.today).toLocaleString()}회</p>
              <p className="tabular-nums">토큰 {totalTokens(usage.today).toLocaleString()}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">이번 달</p>
              <p className="tabular-nums">호출 {totalCalls(usage.month).toLocaleString()}회</p>
              <p className="tabular-nums">토큰 {totalTokens(usage.month).toLocaleString()}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
