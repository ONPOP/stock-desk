// 분석 리포트 (D16) — 배치가 만든 슬라이드 이미지 열람 + 엔진 설정.
import { requireUser } from '@/lib/supabase/server';
import { latestReportDate, listReportDates, listReportsByDate } from '@/lib/supabase/queries/reports';
import { listRuleVersions, listSlots, listThemes } from '@/lib/supabase/queries/engine-config';
import { loadEngineSettings } from '@/lib/engine/repository';
import { ReportsTabs } from '@/components/reports/reports-tabs';

export default async function ReportsPage() {
  const { supabase, user } = await requireUser();
  const [dates, latest, slots, ruleVersions, themes, engineSettings] = await Promise.all([
    listReportDates(supabase, user.id),
    latestReportDate(supabase, user.id),
    listSlots(supabase, user.id),
    listRuleVersions(supabase, user.id),
    listThemes(supabase, user.id),
    loadEngineSettings(supabase, user.id),
  ]);
  const initialReports = latest ? await listReportsByDate(supabase, user.id, latest) : [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">분석 리포트</h1>
        <p className="text-sm text-muted-foreground">
          정기 슬롯이 생성한 슬라이드를 날짜·시간별로 모아 보고, 종목 선정 규칙과 실행 시각을 여기서 설정합니다.
        </p>
      </div>
      <ReportsTabs
        dates={dates}
        initialDate={latest}
        initialReports={initialReports}
        slots={slots}
        ruleVersions={ruleVersions}
        themes={themes}
        engineSettings={engineSettings}
      />
    </div>
  );
}
