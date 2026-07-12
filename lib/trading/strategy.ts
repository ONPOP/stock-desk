// 자동매매 전략 (D15) — VWAP 추세필터 + MACD 트리거 + RSI 가드 + 거래량 검증.
// 순수 함수: 사이드이펙트 없음 → 백테스트와 실매매가 같은 함수를 사용한다.
// 가격은 최소 단위 정수. % 비교는 비율 연산만 하므로 부동소수점 허용(금액 연산 아님).
import { macd, rsi, sma, vwap } from '@/lib/utils/indicators';
import { dateInTz, minutesAndWeekdayInTz, KST_TZ } from '@/lib/utils/date';
import type { Candle, StrategyParams } from '@/types';

export const DEFAULT_PARAMS: StrategyParams = {
  vwapHoldBars: 3,
  rsiPeriod: 14,
  rsiEntryMin: 50,
  rsiEntryMax: 70,
  rsiExit: 75,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  macdCrossWithinBars: 4,
  volAvgBars: 20,
  volMultiplier: 1.5,
  stopLossPct: 2,
  takeProfitPct: 3,
  vwapExitBars: 2,
  orderPct: 10,
  maxPositions: 3,
  dailyLossLimitPct: 3,
  maxEntriesPerDay: 2,
  reentryCooldownMin: 30,
  exitTimeKst: '14:50',
};

export interface PositionState {
  qty: number;
  /** 평균 매입가 (최소 단위 정수) */
  avgPrice: number;
}

/** 같은 종목의 당일 이력 — 재진입 제한 판정용 */
export interface TickerDayState {
  entriesToday: number;
  /** 마지막 손절 매도 시각 (UTC ISO) — 없으면 null */
  lastStopLossAt: string | null;
}

export interface Decision {
  action: 'buy' | 'sell' | 'hold';
  reason: string;
  /** 판단 시점 지표 스냅샷 (로그·UI 표시용) */
  indicators: Record<string, number | null>;
}

export interface StrategyInput {
  /** 1분봉, 과거→최신 순. 마지막 봉 = 현재 진행 봉 */
  candles: Candle[];
  position: PositionState | null;
  day: TickerDayState;
  params: StrategyParams;
  now: Date;
}

const hold = (reason: string, indicators: Record<string, number | null> = {}): Decision => ({
  action: 'hold',
  reason,
  indicators,
});

function parseExitMinutes(exitTimeKst: string): number {
  const [h, m] = exitTimeKst.split(':').map(Number);
  return h * 60 + m;
}

/** 전략 판단 — 진입은 4조건 AND, 청산은 우선순위 OR */
export function evaluateStrategy(input: StrategyInput): Decision {
  const { candles, position, day, params: p, now } = input;

  const warmup = Math.max(p.macdSlow + p.macdSignal, p.volAvgBars, p.rsiPeriod + 1) + 1;
  if (candles.length < warmup) return hold(`데이터 부족 (${candles.length}/${warmup}봉)`);

  const closes = candles.map((c) => c.c);
  const vols = candles.map((c) => c.volume);
  const vwapArr = vwap(candles, (ts) => dateInTz(ts, KST_TZ));
  const { hist } = macd(closes, p.macdFast, p.macdSlow, p.macdSignal);
  const rsiArr = rsi(closes, p.rsiPeriod);
  const volAvg = sma(vols, p.volAvgBars);

  const i = candles.length - 1;
  const close = closes[i];
  const snapshot: Record<string, number | null> = {
    close,
    vwap: vwapArr[i],
    rsi: rsiArr[i],
    macdHist: hist[i],
    volume: vols[i],
    volAvg: volAvg[i],
  };
  if (vwapArr[i] === null || hist[i] === null || rsiArr[i] === null || volAvg[i] === null) {
    return hold('지표 워밍업 중', snapshot);
  }

  const { minutes } = minutesAndWeekdayInTz(now, KST_TZ);
  const exitMin = parseExitMinutes(p.exitTimeKst);

  // ── 보유 중 → 청산 판정 (우선순위: 시간 > 손절 > 익절 > 과열 > VWAP 이탈 > 모멘텀)
  if (position && position.qty > 0) {
    const retPct = ((close - position.avgPrice) / position.avgPrice) * 100;
    snapshot.returnPct = retPct;

    if (minutes >= exitMin) return { action: 'sell', reason: `시간 청산 (${p.exitTimeKst} KST)`, indicators: snapshot };
    if (retPct <= -p.stopLossPct)
      return { action: 'sell', reason: `손절 ${retPct.toFixed(2)}% (한도 -${p.stopLossPct}%)`, indicators: snapshot };
    if (retPct >= p.takeProfitPct)
      return { action: 'sell', reason: `익절 ${retPct.toFixed(2)}% (목표 +${p.takeProfitPct}%)`, indicators: snapshot };
    if ((rsiArr[i] as number) >= p.rsiExit)
      return { action: 'sell', reason: `RSI 과열 ${(rsiArr[i] as number).toFixed(1)} ≥ ${p.rsiExit}`, indicators: snapshot };

    let belowVwap = 0;
    for (let k = i; k >= 0 && vwapArr[k] !== null && closes[k] < (vwapArr[k] as number); k--) belowVwap++;
    if (belowVwap >= p.vwapExitBars)
      return { action: 'sell', reason: `VWAP 하향 이탈 ${belowVwap}봉 연속`, indicators: snapshot };

    if (hist[i - 1] !== null && (hist[i - 1] as number) >= 0 && (hist[i] as number) < 0)
      return { action: 'sell', reason: 'MACD 히스토그램 양→음 전환 (모멘텀 소멸)', indicators: snapshot };

    return hold('보유 유지', snapshot);
  }

  // ── 미보유 → 진입 판정
  if (minutes >= exitMin) return hold('청산 시각 이후 — 신규 진입 금지', snapshot);
  if (day.lastStopLossAt) {
    const elapsedMin = (now.getTime() - new Date(day.lastStopLossAt).getTime()) / 60_000;
    if (elapsedMin < p.reentryCooldownMin)
      return hold(`손절 후 재진입 대기 (${Math.ceil(p.reentryCooldownMin - elapsedMin)}분 남음)`, snapshot);
  }
  if (day.entriesToday >= p.maxEntriesPerDay)
    return hold(`일 진입 한도 도달 (${day.entriesToday}/${p.maxEntriesPerDay})`, snapshot);

  // 조건 1 — 추세: 현재가 > VWAP 연속 N봉 (휩쏘 방지)
  for (let k = 0; k < p.vwapHoldBars; k++) {
    const idx = i - k;
    if (idx < 0 || vwapArr[idx] === null || closes[idx] <= (vwapArr[idx] as number))
      return hold('추세 조건 미충족 (가격 ≤ VWAP)', snapshot);
  }
  // 조건 2 — 트리거: MACD 히스토그램 음→양 전환이 최근 N봉 이내.
  // 크로스 시점 ≈ VWAP 돌파 시점인 경우가 많아, 창이 vwapHoldBars보다 좁으면 4조건이 구조적으로 못 겹친다.
  const crossedAt = (k: number) =>
    k > 0 && hist[k] !== null && hist[k - 1] !== null && (hist[k] as number) > 0 && (hist[k - 1] as number) <= 0;
  let crossed = false;
  for (let k = 0; k < p.macdCrossWithinBars && !crossed; k++) crossed = crossedAt(i - k);
  if (!crossed) return hold('트리거 없음 (MACD 전환 아님)', snapshot);
  if ((hist[i] as number) <= 0) return hold('MACD 히스토그램 재하락 (전환 무효)', snapshot);
  // 조건 3 — 가드: RSI 밴드
  const r = rsiArr[i] as number;
  if (r < p.rsiEntryMin || r >= p.rsiEntryMax)
    return hold(`RSI 밴드 밖 (${r.toFixed(1)} ∉ [${p.rsiEntryMin}, ${p.rsiEntryMax}))`, snapshot);
  // 조건 4 — 검증: 거래량 급증
  if (vols[i] <= (volAvg[i] as number) * p.volMultiplier)
    return hold('거래량 미달 (평균 대비 부족)', snapshot);

  return {
    action: 'buy',
    reason: `진입: VWAP 상방 ${p.vwapHoldBars}봉 + MACD 전환 + RSI ${r.toFixed(1)} + 거래량 ${p.volMultiplier}×`,
    indicators: snapshot,
  };
}
