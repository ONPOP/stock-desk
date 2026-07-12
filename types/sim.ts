// 모의투자 테스트(과거 10년 백테스트) 도메인 타입 — 실시간 모의투자(paper)와 분리.
// 데이터는 1회 수집 후 동결(요구 6): Yahoo 일봉 + 코드 내 사전 이벤트 데이터셋.
import type { Market } from '@/types';

export type SimMarket = Extract<Market, 'NASDAQ' | 'NYSE' | 'AMEX'>;

export interface SimTheme {
  slug: string;
  name: string; // 한국어 테마명
  description?: string;
}

export interface SimStock {
  ticker: string;
  nameEn: string;
  nameKr?: string; // 통용 한국어명이 있으면 표기, 없으면 UI 가 nameEn 폴백
  market: SimMarket;
  theme: string; // SimTheme.slug
}

export type SimEventImpact = 'up' | 'down' | 'neutral';
export type SimEventCategory = 'macro' | 'earnings' | 'product' | 'mna' | 'regulation' | 'crisis';

/** 사전 설계된 주가 변동 원인(요구 5). ticker=null 이면 시장 전체 사건. */
export interface SimEvent {
  date: string; // 'YYYY-MM-DD'
  ticker: string | null;
  title: string;
  detail: string;
  impact: SimEventImpact;
  category: SimEventCategory;
}

/** 테마 시장 시계열 API 응답 — 클라이언트 시계가 로컬로 인덱싱. */
export interface SimStockSeries {
  ticker: string;
  nameEn: string;
  nameKr?: string;
  market: string;
  closes: (number | null)[]; // dates 와 정렬, 상장 전 구간 null (센트 정수)
}

export interface SimSeriesResponse {
  theme: string;
  dates: string[]; // 공통 거래일 축 (YYYY-MM-DD, 오름차순)
  series: SimStockSeries[];
  empty: boolean; // 수집된 캔들이 없으면 true (ingest 미실행)
}

// ── Phase 2 매매 ──
export interface SimSession {
  id: string;
  seedUsdCents: number;
  startDate: string; // YYYY-MM-DD
  curDate: string; // 현재 재생 위치
}

export interface SimTrade {
  id: string;
  ticker: string;
  side: 'buy' | 'sell';
  qty: number;
  priceCents: number;
  tradeDate: string; // YYYY-MM-DD
  createdAt: string;
}

export interface SimPosition {
  ticker: string;
  qty: number;
  avgCostCents: number;
}

/** 서버 계산 상태(평가금액은 클라가 현재 시세로 계산). */
export interface SimTradingState {
  session: SimSession | null;
  cashCents: number;
  positions: SimPosition[];
  realizedPnlCents: number;
  trades: SimTrade[];
}
