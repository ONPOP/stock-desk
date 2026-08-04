// 신호 규칙 (D16) — 종가 매수 → 익일 시초 매도 오버나잇 갭 전략 전용.
// DB `signal_rules.rules`(jsonb)에 버전별로 보존하되, 기본값의 단일 원천은 이 코드다
// (D15 auto_trading_configs / DEFAULT_PARAMS와 동일 패턴).
// 모든 수치는 성적표(slot_signals) 데이터로 튜닝하는 대상이며, 변경 시 새 version 행을 추가한다.

import { z } from 'zod';

export const closeBuyRulesSchema = z.object({
  /** 상승추세: 종가 > MA20 + MA20 5일 우상향 + MA60 20일 우상향 */
  trend: z.object({ weight: z.number().int().min(0).max(100) }),
  /** 눌림목: 추세 중 최근 5봉 내 10MA 터치 후 종가 반등 */
  pullback: z.object({ weight: z.number().int().min(0).max(100) }),
  /** RSI 밴드 — 과열도 침체도 아닌 구간 */
  rsi: z.object({
    weight: z.number().int().min(0).max(100),
    minRsi: z.number().min(0).max(100),
    maxRsi: z.number().min(0).max(100),
  }),
  /** 거래량: 20일 평균 대비 배수 (bp — 12000 = 1.2배) */
  volume: z.object({
    weight: z.number().int().min(0).max(100),
    minRatioBp: z.number().int().min(0),
  }),
  /** KR 전용 수급: 외인+기관 합산 순매수. 미국 종목에는 적용하지 않는다(가중치 정규화로 흡수) */
  flowKr: z.object({ weight: z.number().int().min(0).max(100) }),
  /** 종가 강도: 당일 고저 범위 상위 구간 마감 (bp — 6000 = 상위 40% 이내) */
  closeStrength: z.object({
    weight: z.number().int().min(0).max(100),
    minPositionBp: z.number().int().min(0).max(10_000),
  }),
  /** 점수와 무관하게 BUY 후보에서 제외하는 하드 조건 */
  excludeHard: z.object({
    /** 당일 밤 실적발표 */
    earningsTonight: z.boolean(),
    /** MA200 하회 + 역배열 */
    belowMa200AndBear: z.boolean(),
    /** 당일 급락 임계 (bp, 음수 — -500 = -5%) */
    dailyCrashBp: z.number().int().max(0),
  }),
});

/**
 * 눌림목 관찰 구간 — 점수 상위 8종목(진입 후보)과 별개 트랙.
 * closeBuy의 pullback이 '반등 완료'만 잡는 것과 달리, 여기는 '아직 밀리는 중'까지 포함해
 * 진입 타이밍을 미리 지켜볼 수 있게 한다.
 */
export const watchZoneSchema = z.object({
  enabled: z.boolean(),
  /**
   * 추세 판정 강도.
   * strict = 종가>MA20 + MA20(5일)·MA60(20일) 모두 우상향 (교과서적 상승추세)
   * loose  = 종가>MA20 (급락 후 반등처럼 MA 기울기가 아직 음수인 국면도 포함)
   * off    = 추세 무관
   *
   * strict는 조건이 강해 하락장 후 반등 구간에서는 후보가 0이 되기 쉽다.
   * 기본을 loose로 두는 이유: 관찰 목적은 '진입 판단'이 아니라 '지켜볼 대상 발굴'이기 때문.
   */
  trendMode: z.enum(['strict', 'loose', 'off']).default('loose'),
  /** 눌림 판정 기준선 */
  baseMa: z.enum(['ma10', 'ma20', 'ma60']),
  /** 기준선 대비 이격률 허용 밴드 (bp). 아래로 너무 깨졌거나 위로 과열이면 관찰 대상이 아니다 */
  minDisparityBp: z.number().int(),
  maxDisparityBp: z.number().int(),
  rsi: z.object({ min: z.number().min(0).max(100), max: z.number().min(0).max(100) }),
  /** 기준선 터치를 되돌아볼 봉 수 (지표의 터치 추적 창 이내여야 한다) */
  lookbackBars: z.number().int().min(1).max(20),
  maxCount: z.number().int().min(1).max(30),
});

export type WatchZoneRules = z.infer<typeof watchZoneSchema>;

export const DEFAULT_WATCH_ZONE: WatchZoneRules = {
  enabled: true,
  trendMode: 'loose',
  baseMa: 'ma20',
  minDisparityBp: -500,
  maxDisparityBp: 300,
  rsi: { min: 35, max: 55 },
  lookbackBars: 5,
  maxCount: 10,
};

export const signalRulesSchema = z.object({
  closeBuy: closeBuyRulesSchema,
  scoreThreshold: z.object({
    strongBuy: z.number().int().min(0).max(100),
    watch: z.number().int().min(0).max(100),
  }),
  // 기존 v1 행에는 이 섹션이 없다 — 기본값으로 채워 마이그레이션 없이 호환시킨다
  watchZone: watchZoneSchema.default(DEFAULT_WATCH_ZONE),
});

export type CloseBuyRules = z.infer<typeof closeBuyRulesSchema>;
export type SignalRules = z.infer<typeof signalRulesSchema>;

/** 설계서 §5 초기값. 가중치 합 = 100 (KR 기준, US는 flowKr 제외 후 정규화) */
export const DEFAULT_SIGNAL_RULES: SignalRules = {
  closeBuy: {
    trend: { weight: 25 },
    pullback: { weight: 20 },
    rsi: { weight: 15, minRsi: 40, maxRsi: 65 },
    volume: { weight: 15, minRatioBp: 12_000 },
    flowKr: { weight: 15 },
    closeStrength: { weight: 10, minPositionBp: 6_000 },
    excludeHard: {
      earningsTonight: true,
      belowMa200AndBear: true,
      dailyCrashBp: -500,
    },
  },
  scoreThreshold: { strongBuy: 75, watch: 55 },
  watchZone: DEFAULT_WATCH_ZONE,
};

export const DEFAULT_RULE_VERSION = 1;

/** DB에서 읽은 jsonb를 검증해 규칙으로. 깨진 행이면 기본값으로 폴백하지 않고 던진다(조용한 오작동 방지) */
export function parseSignalRules(raw: unknown): SignalRules {
  return signalRulesSchema.parse(raw);
}
