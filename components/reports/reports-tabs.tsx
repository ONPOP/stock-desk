'use client';

// 분석 리포트 (D16) — [아카이브] 열람 · [설정] 엔진 구성.
// 엔진 설정이 /settings와 나뉘지 않도록 여기 한 곳에 모은다.
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ReportsView } from '@/components/reports/reports-view';
import { SlotSchedulePanel } from '@/components/reports/settings/slot-schedule-panel';
import { RulesPanel } from '@/components/reports/settings/rules-panel';
import { ThemesPanel } from '@/components/reports/settings/themes-panel';
import { EngineStorageSettings } from '@/components/settings/engine-storage-settings';
import { EngineTelegramSettings } from '@/components/settings/engine-telegram-settings';
import type { ReportSummary } from '@/lib/supabase/queries/reports';
import type { RuleVersion, SlotRow, ThemeRow } from '@/lib/supabase/queries/engine-config';
import type { EngineSettings } from '@/lib/engine/repository';

interface Props {
  dates: string[];
  initialDate: string | null;
  initialReports: ReportSummary[];
  slots: SlotRow[];
  ruleVersions: RuleVersion[];
  themes: ThemeRow[];
  engineSettings: EngineSettings;
}

export function ReportsTabs(props: Props) {
  return (
    <Tabs defaultValue="archive" className="gap-5">
      <TabsList>
        <TabsTrigger value="archive">아카이브</TabsTrigger>
        <TabsTrigger value="settings">설정</TabsTrigger>
      </TabsList>

      <TabsContent value="archive">
        <ReportsView
          dates={props.dates}
          initialDate={props.initialDate}
          initialReports={props.initialReports}
        />
      </TabsContent>

      <TabsContent value="settings">
        <div className="max-w-5xl space-y-5">
          <SlotSchedulePanel initial={props.slots} />
          <RulesPanel initial={props.ruleVersions} />
          <ThemesPanel initial={props.themes} />
          <EngineStorageSettings initial={props.engineSettings} />
          <EngineTelegramSettings slots={props.slots} />
        </div>
      </TabsContent>
    </Tabs>
  );
}
