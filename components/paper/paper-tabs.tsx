'use client';

// 모의투자 페이지 탭 — [실시간 모의투자(기본) | 모의투자 테스트(백테스트)].
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PaperClient } from '@/components/paper/paper-client';
import { SimTestPanel } from '@/components/sim/sim-test-panel';
import type { PaperState } from '@/types';

export function PaperTabs({ initialState }: { initialState: PaperState }) {
  return (
    <Tabs defaultValue="live" className="gap-5">
      <TabsList>
        <TabsTrigger value="live">실시간 모의투자</TabsTrigger>
        <TabsTrigger value="test">모의투자 테스트</TabsTrigger>
      </TabsList>
      <TabsContent value="live">
        <PaperClient initialState={initialState} />
      </TabsContent>
      <TabsContent value="test">
        <SimTestPanel />
      </TabsContent>
    </Tabs>
  );
}
