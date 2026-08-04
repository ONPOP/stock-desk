// 분석 엔진 공통 타입 (D16).
// 비율은 전부 베이시스포인트(bp) 정수 — 1.00% = 100. 부동소수 누적오차를 스냅샷에 남기지 않기 위함.
// 금액은 최소 통화 단위 정수 (KRW: 원, USD: 센트) — 기존 Quote/Candle과 동일 스케일.

import type { Market } from '@/types';

export type SlotType = 'quick' | 'detail' | 'grade' | 'weekly';
export type SlotMarket = 'KR' | 'US' | 'BOTH';

/** 이동평균 집합 — 값은 최소 통화 단위 정수(반올림). 데이터 부족 구간은 null */
export interface MaSet {
  ma10: number | null;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
  ma200: number | null;
}

/** 종가 대비 각 MA 이격률 (bp). MA가 null이면 null */
export type DisparityBp = Record<keyof MaSet, number | null>;

/** MA 배열 상태 — bull: 단기>장기 정배열, bear: 역배열, mixed: 그 외 */
export type MaAlignment = 'bull' | 'bear' | 'mixed';

/** 룰 기반 1차 국면 판정. Claude는 이 플래그와 다르게 판단할 수 있고, 그 경우 사유를 남긴다 */
export interface PhaseFlags {
  uptrend: boolean;
  /** 눌림목 반등 확인 (터치 후 MA10 회복) — '진입임박' */
  pullback: boolean;
  /** 눌림 진행 중 (터치했으나 아직 MA10 아래) — '관찰중' */
  pullbackWatch: boolean;
  overheated: boolean;
  downtrend: boolean;
}

/** 타임프레임별 수익률 (bp). 거래일 기준 룩백 */
export interface PeriodReturnsBp {
  m1: number | null;
  m3: number | null;
  m6: number | null;
  m12: number | null;
  y3: number | null;
}

/** market_snapshots.indicators에 그대로 적재되는 구조 */
export interface SlotIndicators {
  ma: MaSet;
  disparityBp: DisparityBp;
  /** MA20 5일 기울기 / MA60 20일 기울기 (bp) */
  slopeBp: { ma20_5d: number | null; ma60_20d: number | null };
  alignment: MaAlignment;
  rsi14: number | null;
  /** 최근 5일 RSI 방향 */
  rsiTrend: 'up' | 'down' | 'flat' | null;
  /** 당일 거래량 / 20일 평균 (bp — 10000 = 1.0배) */
  volumeRatioBp: number | null;
  /** 거래대금 (최소 통화 단위) */
  turnover: number | null;
  returnsBp: PeriodReturnsBp;
  /** 종가가 당일 고저 범위에서 차지하는 위치 (bp — 10000 = 고가 마감) */
  closePositionBp: number | null;
  /**
   * 각 MA를 저가로 마지막에 터치(하회)한 시점. 0=당일, null=추적 창 내 없음.
   * 관찰 규칙(watchZone)의 기준선·되돌아보기를 스냅샷만으로 다시 평가하기 위해 저장한다
   * — 규칙 미리보기가 시세를 재조회하지 않아도 되는 이유.
   */
  touchBarsAgo: { ma10: number | null; ma20: number | null; ma60: number | null };
  /** 종가가 MA10 위인지 — 관찰중/진입임박을 가르는 기준 */
  recoveredAboveMa10: boolean;
  phase: PhaseFlags;
}

/** market_snapshots.price_data */
export interface SlotPriceData {
  currency: 'KRW' | 'USD';
  close: number;
  open: number;
  high: number;
  low: number;
  prevClose: number | null;
  changeBp: number | null;
  volume: number;
  /** 캔들 기준 시각 (UTC ISO) */
  asOf: string;
}

/** 파이프라인이 다루는 종목 단위 */
export interface EngineStock {
  stockId: string;
  ticker: string;
  name: string;
  market: Market;
  /** 신호 강도와 무관하게 매 슬롯 분석 대상에 포함 */
  alwaysBrief: boolean;
  /** 조건과 무관하게 눌림목 관찰 표에 항상 표시 */
  radarPin: boolean;
}

/** 한 종목의 스냅샷 (DB 적재 직전 형태) */
export interface StockSnapshot {
  stock: EngineStock;
  priceData: SlotPriceData;
  indicators: SlotIndicators;
  flowData: Record<string, unknown> | null;
}
