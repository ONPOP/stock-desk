// 규칙 미리보기 (D16) — 최근 스냅샷에 바뀐 규칙만 다시 적용한다.
// 시세를 재조회하지 않는 게 핵심: KIS 호출 0회로 "이 룰이면 어떤 종목이 뽑히나"를 즉시 보여준다.
import { NextResponse } from 'next/server';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { requireUser } from '@/lib/supabase/server';
import { latestSnapshotSet } from '@/lib/supabase/queries/engine-config';
import { loadEngineSettings } from '@/lib/engine/repository';
import { scoreStock, selectForSlot } from '@/lib/engine/scorer';
import { selectRadar } from '@/lib/engine/radar';
import { rulesPreviewSchema } from '@/lib/validation/engine';
import type { Market } from '@/types';
import type { SlotIndicators, SlotPriceData, StockSnapshot } from '@/lib/engine/types';

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      throw new ValidationError('요청 본문이 JSON 형식이 아닙니다.');
    }
    const parsed = rulesPreviewSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '규칙 값이 올바르지 않습니다.');
    }

    const set = await latestSnapshotSet(supabase, user.id, parsed.data.slotId);
    if (!set) {
      return NextResponse.json({
        available: false,
        message: '미리보기에 쓸 스냅샷이 없습니다. 슬롯을 한 번 실행한 뒤 다시 시도하세요.',
      });
    }

    const settings = await loadEngineSettings(supabase, user.id);
    const snapshots: StockSnapshot[] = set.rows.map((r) => ({
      stock: {
        stockId: r.stockId,
        ticker: r.ticker,
        name: r.name,
        market: r.market as Market,
        alwaysBrief: r.alwaysBrief,
        radarPin: r.radarPin,
      },
      priceData: r.priceData as SlotPriceData,
      indicators: r.indicators as SlotIndicators,
      flowData: null,
    }));

    // 실적 이벤트는 스냅샷 시점 값을 다시 알 수 없으므로 미리보기에서는 제외하고 계산한다
    const scored = snapshots.map((s) =>
      scoreStock(s, parsed.data.rules, { earningsTonight: false, netBuyKr: null }),
    );
    const { selected, dropped } = selectForSlot(scored, settings.maxStocksPerSlot);
    const radar = selectRadar({
      scored,
      zone: parsed.data.rules.watchZone,
      pinnedStockIds: new Set(snapshots.filter((s) => s.stock.radarPin).map((s) => s.stock.stockId)),
      selectedStockIds: new Set(selected.map((s) => s.snapshot.stock.stockId)),
    });

    return NextResponse.json({
      available: true,
      basedOn: { runDate: set.runDate, slotId: set.slotId, stockCount: snapshots.length },
      note: '스냅샷 기준 재계산이며 실적 이벤트 제외는 반영되지 않습니다.',
      selected: selected.map((s) => ({
        ticker: s.snapshot.stock.ticker,
        name: s.snapshot.stock.name,
        score: s.score,
        grade: s.grade,
        alwaysBrief: s.snapshot.stock.alwaysBrief,
      })),
      droppedCount: dropped.length,
      radar: radar.map((r) => ({
        ticker: r.snapshot.stock.ticker,
        name: r.snapshot.stock.name,
        state: r.state,
        pinned: r.pinned,
        disparityBp: r.disparityBp,
      })),
    });
  } catch (e) {
    const { body, status } = toErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
