// 공통 도메인 타입 — PRD 9장 데이터 모델 기준

export type Market = 'KOSPI' | 'KOSDAQ' | 'NYSE' | 'NASDAQ' | 'AMEX';
export type Currency = 'KRW' | 'USD';
export type CandleInterval = '1m' | '1d' | '1w';

export interface Stock {
  id: string;
  ticker: string;
  name_kr: string | null;
  name_en: string | null;
  market: Market;
  currency: Currency;
  sector: string | null;
  /** 거래정지·상폐 시 false (PRD 13장 — 뱃지·갱신 중단). 미조회 시 undefined */
  is_active?: boolean;
}

/** 현재가 스냅샷 — 금액은 최소 통화 단위 정수 (KRW: 원, USD: 센트) */
export interface Quote {
  ticker: string;
  market: Market;
  currency: Currency;
  /** 현재가 (최소 단위 정수) */
  price: number;
  /** 전일 대비 (최소 단위 정수, 음수 가능) */
  change: number;
  /** 등락률(%) 문자열 그대로 보존 — 부동소수점 연산 금지 */
  changeRate: string;
  volume: number;
  /** 시세 기준 시각 (UTC ISO) */
  asOf: string;
}

/** 캔들 — 가격은 최소 통화 단위 정수 */
export interface Candle {
  ts: string; // UTC ISO
  o: number;
  h: number;
  l: number;
  c: number;
  volume: number;
}

export interface StockSearchResult {
  ticker: string;
  name_kr: string | null;
  name_en: string | null;
  market: Market;
  currency: Currency;
}

/** 워치리스트 탭(컬렉션) — 내 종목을 탭 단위로 분리 관리. 기본 탭은 삭제·이름변경 불가 */
export interface WatchlistTab {
  id: string;
  name: string;
  isDefault: boolean;
  sortOrder: number;
}

/** 워치리스트 항목 — 종목 정보 + 그룹/자동분석 플래그 */
export interface WatchlistItem {
  stock_id: string;
  ticker: string;
  name_kr: string | null;
  name_en: string | null;
  market: Market;
  currency: Currency;
  group_name: string;
  auto_analysis: boolean;
  isFavorite: boolean;
  sortOrder: number;
}

/** 시장 위젯(F11) 지수/환율/금리 — 표시값(금액 아님) */
export interface MarketIndex {
  key: string;
  label: string;
  value: number;
  change: number;
  changeRate: string;
  unit: '' | '%' | '원';
}

export interface UserSettingsView {
  /** 키는 마스킹된 형태로만 클라이언트에 전달 (예: "PSxx****xxQz") */
  kis_app_key_masked: string | null;
  kis_app_secret_set: boolean;
  openai_key_masked: string | null;
  anthropic_key_masked: string | null;
  /** 데이터 소스 키 (W3) — DART(한국)·Finnhub(미국 재무)·FMP(미국 배당) */
  dart_key_masked: string | null;
  finnhub_key_masked: string | null;
  fmp_key_masked: string | null;
  /** 네이버 뉴스 검색 API (W4, 한국 뉴스) */
  naver_client_id_masked: string | null;
  naver_client_secret_set: boolean;
  seed_krw: number;
  seed_usd_cents: number;
}

// ───────────────────────── 펀더멘털 (W3) ─────────────────────────

export type FundamentalsSource = 'dart' | 'finnhub' | 'fmp' | 'edgar' | 'kis';
export type DividendFrequency = 'annual' | 'semiannual' | 'quarterly' | 'monthly';

/**
 * 종목 핵심 지표 (F4). 금액은 최소 통화 단위 정수(KRW=원, USD=센트).
 * 비율(per/pbr/roe/dividendYield/debtRatio)·eps는 표시용 수치 그대로(부동소수점 연산 금지).
 * 분기 시계열은 fiscalQuarter로 구분된 여러 행으로 표현(stock_metrics).
 */
export interface StockMetrics {
  marketCap: number | null;
  per: number | null;
  pbr: number | null;
  roe: number | null;
  eps: number | null;
  revenueQ: number | null;
  operatingIncomeQ: number | null;
  netIncomeQ: number | null;
  capex: number | null;
  debtRatio: number | null;
  dividendYield: number | null;
  /** 회계 분기 라벨 (예: "2024Q3") */
  fiscalQuarter: string | null;
  /** 기준일 (YYYY-MM-DD) */
  asOfDate: string;
  source: FundamentalsSource;
}

/** 배당 정보 (F15). dps는 표시용 수치(주당 배당금). */
export interface DividendInfo {
  fiscalYear: number;
  dps: number | null;
  frequency: DividendFrequency | null;
  /** 배당락일 (YYYY-MM-DD) */
  exDate: string | null;
  /** 지급일 (YYYY-MM-DD) */
  payDate: string | null;
  yieldAtRecord: number | null;
  source: FundamentalsSource;
}

/** 공시 항목 (F12). summary_ai는 W3에서 비움(W4 통합). */
export interface DisclosureItem {
  source: 'dart' | 'edgar';
  /** 원문 양식 코드 (예: "8-K", DART 보고서명) */
  formType: string;
  /** 한국어 유형 라벨 (예: "실적", "유상증자") */
  typeLabelKr: string | null;
  title: string;
  /** 제출 시각 (UTC ISO) */
  filedAt: string;
  url: string;
  summaryAi?: string | null;
}

// ───────────────────────── 뉴스·브리핑 (W4) ─────────────────────────

export type Sentiment = 'positive' | 'negative' | 'neutral';

/** Provider가 반환하는 원시 뉴스 (요약·감성 전) */
export interface NewsItemRaw {
  title: string;
  url: string;
  source: string | null;
  /** 발행 시각 (UTC ISO) */
  publishedAt: string | null;
  /** 요약 입력용 본문/설명 (있으면) */
  body?: string | null;
}

/** F5 뉴스 카드 — AI 요약·감성·클러스터 포함 */
export interface NewsItem extends NewsItemRaw {
  summaryAi: string | null;
  sentiment: Sentiment | null;
  clusterId: string | null;
}

/** F1 데일리 브리핑 */
export interface Briefing {
  date: string;
  contentMd: string | null;
  generatedAt: string;
  status: 'success' | 'failed' | 'generating';
}

// ───────────────────────── 노트·사용량 (W5) ─────────────────────────

/** F13 투자 노트 */
export interface Note {
  id: string;
  stockId: string | null;
  /** 표시용 종목명·티커 (조인) */
  stockName: string | null;
  stockTicker: string | null;
  contentMd: string;
  attachedAnalysisId: string | null;
  attachedTradeId: string | null;
  createdAt: string;
}

// ───────────────────────── 종목 비교 (V2 F16) ─────────────────────────

export interface CompareItem {
  stockId: string;
  ticker: string;
  name: string;
  currency: Currency;
  metrics: StockMetrics | null;
}

// ───────────────────────── 대시보드 풀구성 (V2) ─────────────────────────

/** 대시보드 신규 AI 분석 타일용 — ai_analyses + stocks 조인 */
export interface RecentAnalysis {
  id: string;
  stockId: string;
  ticker: string;
  name: string;
  market: Market;
  currency: Currency;
  position: AnalysisPosition | null;
  confidence: number | null;
  model: string;
  createdAt: string;
}

// ───────────────────────── 실거래 매매일지 (V2) ─────────────────────────

export type TradeSide = 'buy' | 'sell';

/** 실거래 매매 기록(원천 데이터) */
export interface RealTrade {
  id: string;
  stockId: string;
  ticker: string;
  name: string;
  market: Market;
  currency: Currency;
  side: TradeSide;
  qty: number;
  price: number; // 체결 단가(최소 단위)
  tradeDate: string; // YYYY-MM-DD
  memo: string | null;
  isEtf: boolean; // 국내 ETF 여부(매도 거래세 면제). 기본 false
  fee: number; // 매매비용(세금+수수료, 최소 단위 정수). 매도 시 실현손익에서 차감. 기본 0
  createdAt: string;
}

/** 종목별 보유 현황(매매 기록 파생) */
export interface RealHolding {
  stockId: string;
  ticker: string;
  name: string;
  market: Market;
  currency: Currency;
  qty: number; // 순 보유 수량(매수-매도)
  avgBuyPrice: number; // 매수 가중평균 평단가(최소 단위)
  buyAmount: number; // 보유분 매입금액 = qty * avgBuyPrice
  realizedPnl: number; // 누적 실현손익(최소 단위)
}

/** 매도 1건의 실현 손익(기간별 수익률용) */
export interface RealizedTrade {
  id: string;
  stockId: string;
  ticker: string;
  name: string;
  market: Market;
  currency: Currency;
  qty: number;
  sellPrice: number;
  avgBuyPrice: number; // 매도 시점 평단가
  fee: number; // 매매비용(세금+수수료, 최소 단위). 실현손익에서 차감됨
  realizedPnl: number; // (sellPrice - avgBuyPrice) * qty - fee
  realizedRate: number; // % (매매비용 차감 후 순수익률)
  buyDate: string; // 보유 구간 최초 매수일(YYYY-MM-DD). 매수 기록 없으면 ''
  tradeDate: string; // 매도일(수익 실현일)
}

/** 통화별 합계 */
export interface CurrencyTotals {
  currency: Currency;
  buyAmount: number;
  currentValue: number;
  evalPnl: number;
  realizedPnl: number;
}

/** 포트폴리오 요약 — 통화별 분리 + 원화 환산 통합(하이브리드) */
export interface PortfolioSummary {
  byCurrency: CurrencyTotals[];
  krwUnified: {
    buyAmount: number;
    currentValue: number;
    evalPnl: number;
    evalRate: number; // %
    realizedPnl: number;
  };
}

// ───────────────────────── 예수금·자산현황 (V2 · D11) ─────────────────────────

export type CashTxType = 'deposit' | 'withdraw';

/** 현금 입출금 기록(cash_ledger). amount는 양수, 방향은 type. */
export interface CashTransaction {
  id: string;
  currency: Currency;
  type: CashTxType;
  amount: number; // 최소 단위 정수(양수)
  txDate: string; // YYYY-MM-DD
  memo: string | null;
  createdAt: string;
}

/** 통화별 예수금 잔고(최소 단위 정수, 음수 가능) */
export type CashBalance = Record<Currency, number>;

/** 통화별 자산 1줄 */
export interface AssetByCurrency {
  currency: Currency;
  cash: number; // 예수금
  buyAmount: number; // 보유분 매입금액
  currentValue: number; // 평가금액
  evalPnl: number; // 평가손익
}

/** 자산 현황 요약 — 통화별 + 원화 환산 통합 */
export interface AssetSummary {
  byCurrency: AssetByCurrency[];
  krwUnified: {
    totalAsset: number; // 전체 자산 = 예수금 + 평가금액
    cash: number; // 예수금
    buyAmount: number; // 매입금액
    currentValue: number; // 평가금액
    evalPnl: number; // 평가손익
    evalRate: number; // 수익률 %(보유 주식 기준)
  };
}

// ───────────────────────── 모의투자 (V1 F9) ─────────────────────────

export interface PaperAccount {
  currency: Currency;
  /** 현금 잔고 (최소 단위 정수) */
  cashBalance: number;
}

export interface PaperPosition {
  stockId: string;
  ticker: string;
  name: string;
  market: Market;
  currency: Currency;
  qty: number;
  /** 평단가 (최소 단위 정수) */
  avgPrice: number | null;
}

export interface PaperTrade {
  id: string;
  ticker: string;
  name: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number | null;
  currency: Currency;
  orderType: 'market' | 'reserved' | 'limit';
  status: 'pending' | 'done' | 'canceled';
  memo: string | null;
  createdAt: string;
  executedAt: string | null;
}

export interface PaperState {
  seasonNo: number;
  seasonStartDate: string | null; // 시즌 목표 시작일 "YYYY-MM-DD"
  seasonEndDate: string | null; // 시즌 목표 종료일 "YYYY-MM-DD"
  accounts: PaperAccount[];
  positions: PaperPosition[];
  trades: PaperTrade[];
}

// 종료(아카이브)된 시즌 — 기록 보존. 삭제되지 않고 '지난 시즌'에서 열람.
export interface ArchivedSeason {
  id: string;
  seasonNo: number;
  seedKrw: number; // 시드(원)
  seedUsdCents: number; // 시드(센트)
  startDate: string | null;
  endDate: string | null;
  endedAt: string; // 종료 시각(ISO)
  realizedKrw: number; // 시즌 실현손익(원)
  realizedUsdCents: number; // 시즌 실현손익(센트)
  trades: PaperTrade[]; // 거래 내역(최신순)
}

// ───────────────────────── AI 분석 (V1 F7) ─────────────────────────

export type AnalysisPosition = 'buy' | 'neutral' | 'sell';

export interface AiAnalysis {
  id: string;
  model: 'gpt' | 'claude';
  triggerType: 'auto' | 'manual';
  resultMd: string | null;
  position: AnalysisPosition | null;
  confidence: number | null;
  createdAt: string;
}

// ───────────────────────── 캘린더 (V1 F2) ─────────────────────────

export type CalendarEventType = 'macro' | 'earnings' | 'custom' | 'options' | 'dividend';

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  stockId: string | null;
  title: string;
  /** YYYY-MM-DD */
  eventDate: string;
  /** false = "(예정)" 라벨 */
  confirmed: boolean;
  source: string | null;
  memo: string | null;
  /** 종목 일정일 때 표시·필터용 (조인) */
  ticker?: string | null;
  name?: string | null;
}

/** API 사용량 집계 1행 */
export interface UsageRow {
  provider: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
}

/** 사용량 요약 (오늘·이번달) */
export interface UsageSummary {
  today: UsageRow[];
  month: UsageRow[];
}

// ───────────────────────── 자동매매 (D15) ─────────────────────────

/**
 * 전략 파라미터 — VWAP 추세필터 + MACD 트리거 + RSI 가드 + 거래량 검증.
 * 전부 사용자 조정 가능(설정 UI), 서버에서 zod로 범위 검증 후 저장.
 */
export interface StrategyParams {
  /** 진입: 현재가 > VWAP 연속 유지 봉 수 */
  vwapHoldBars: number;
  rsiPeriod: number;
  /** 진입 허용 RSI 하한(이상) */
  rsiEntryMin: number;
  /** 진입 허용 RSI 상한(미만) */
  rsiEntryMax: number;
  /** 청산: RSI 과열 기준(이상) */
  rsiExit: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  /** 진입: MACD 히스토그램 음→양 전환이 최근 N봉 이내 (VWAP 유지 봉 수보다 크게) */
  macdCrossWithinBars: number;
  /** 거래량 평균 봉 수 */
  volAvgBars: number;
  /** 진입: 현재 봉 거래량 > 평균 × 배수 */
  volMultiplier: number;
  /** 손절 % (진입가 대비) */
  stopLossPct: number;
  /** 익절 % (진입가 대비) */
  takeProfitPct: number;
  /** 청산: 종가 VWAP 하향 이탈 연속 봉 수 */
  vwapExitBars: number;
  /** 1회 주문 = 시드의 % */
  orderPct: number;
  /** 동시 보유 최대 종목 수 */
  maxPositions: number;
  /** 당일 실현손실 한도 % (시드 대비) — 도달 시 신규 진입 중지 */
  dailyLossLimitPct: number;
  /** 같은 종목 일 최대 진입 횟수 */
  maxEntriesPerDay: number;
  /** 손절 후 재진입 금지(분) */
  reentryCooldownMin: number;
  /** 전량 청산 시각 (KST HH:mm) — 이후 신규 진입도 금지 */
  exitTimeKst: string;
}

/** 자동매매 감시 대상 종목 (국내 한정 — D15) */
export interface TradingUniverseItem {
  ticker: string;
  market: 'KOSPI' | 'KOSDAQ';
}

export interface AutoTradingConfig {
  enabled: boolean;
  /** 수동 비상정지 — enabled와 별개로 최우선 차단 */
  killSwitch: boolean;
  params: StrategyParams;
  universe: TradingUniverseItem[];
  updatedAt: string | null;
}

/** 전략 판단·주문 기록 1행 (HOLD는 기록하지 않음) */
export interface TradeSignalRow {
  id: string;
  ticker: string;
  market: Market;
  action: 'buy' | 'sell';
  reason: string;
  /** 판단 시점 지표 스냅샷 (표시용) */
  indicators: Record<string, number | null> | null;
  executed: boolean;
  rejectReason: string | null;
  /** 체결가 (최소 단위 정수) */
  price: number | null;
  qty: number | null;
  /** 매도 실현손익 (최소 단위 정수) — 일간 손실 한도 판정에 사용 */
  pnl: number | null;
  decidedAt: string;
}

/** 백테스트 체결 1건 */
export interface BacktestTrade {
  entryTs: string;
  exitTs: string;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  pnl: number;
  exitReason: string;
}

export interface BacktestResult {
  trades: BacktestTrade[];
  stats: {
    tradeCount: number;
    wins: number;
    winRate: number;
    totalPnl: number;
    /** 최대 낙폭 (에쿼티 기준 최소 단위 정수) */
    maxDrawdown: number;
    endingEquity: number;
    returnPct: number;
  };
}

/** 국내 호가 (KIS FHKST01010200) — 가격은 최소 단위 정수 */
export interface OrderbookLevel {
  price: number;
  qty: number;
}

export interface Orderbook {
  ticker: string;
  /** 매도호가 1~10 (1이 최우선 = 가장 낮은 매도가) */
  asks: OrderbookLevel[];
  /** 매수호가 1~10 (1이 최우선 = 가장 높은 매수가) */
  bids: OrderbookLevel[];
  totalAskQty: number;
  totalBidQty: number;
  asOf: string;
}

// ───────────────────────── 실시간(WebSocket) — 데스크톱 전용, 모의 시세 ─────────────────────────

/** KIS 실시간 체결가(H0STCNT0) 정규화 틱 — 가격은 최소 단위 정수(원) */
export interface RealtimeTick {
  ticker: string;
  price: number;
  /** 전일 대비 (부호 있는 정수) */
  change: number;
  /** 등락률(%) 문자열 — 부동소수점 연산 금지 */
  changeRate: string;
  /** 누적 거래량 */
  volume: number;
  /** 체결 시각 HHMMSS (KST) */
  cntgTime: string;
  /** 수신 시각 UTC ISO */
  asOf: string;
}

/** KIS 실시간 호가(H0STASP0) 정규화 — Orderbook과 동일 형태 재사용 */
export type RealtimeOrderbook = Orderbook;

/** 렌더러 → 릴레이: 구독 희망 종목 집합(≤5) 갱신 */
export interface RealtimeSubscribeMsg {
  type: 'subscribe';
  tickers: string[];
}

/** 릴레이 → 렌더러 메시지 */
export type RealtimeServerMsg =
  | { type: 'tick'; data: RealtimeTick }
  | { type: 'orderbook'; data: RealtimeOrderbook }
  | { type: 'status'; connected: boolean; mode: 'live' | 'mock'; subscribed: string[] };
