'use client';

// 분야별 가상 시장 팝업 — 모의투자 테스트의 매매·종목 탐색 모달.
// 내부에 SimMarketClient(테마탭·빨리감기 시계·그리드·이벤트·매수/매도)를 호스팅한다.
import { X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SimMarketClient } from '@/components/sim/sim-market-client';
import { SIM_THEMES } from '@/lib/sim/universe';

export function SimMarketDialog({
  initialYearsAgo,
  onClose,
  onTraded,
}: {
  initialYearsAgo: number;
  onClose: () => void;
  onTraded?: (date: string) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="분야별 가상 시장"
      onClick={onClose}
    >
      <Card className="my-2 w-full max-w-6xl gap-4 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">분야별 가상 시장 · 매매</h3>
            <p className="text-[13px] text-muted-foreground">
              현재 시각의 종가로 매수·매도합니다. 시계를 재생해 흐름을 읽고 매매하세요.
            </p>
          </div>
          <Button size="icon-sm" variant="ghost" aria-label="닫기" onClick={onClose}>
            <X />
          </Button>
        </div>
        <SimMarketClient themes={SIM_THEMES} initialYearsAgo={initialYearsAgo} tradingEnabled onTraded={onTraded} />
      </Card>
    </div>
  );
}
