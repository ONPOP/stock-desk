// 사전 설계된 '주가 변동 원인' 데이터셋(요구 5) — 2015~2025 미국 시장.
// 동결 데이터(요구 6): 실시간 학습 없이 코드에 보존한다. 매수·매도 시 해당 시점 근방의
// 시장 전체 사건 + 종목 사건을 보여 "왜 움직였는가"를 학습하게 한다(요구 4·5).
import type { SimEvent } from '@/types/sim';

// 시장 전체 사건 (ticker=null) — 매크로·위기·정책
const MARKET_EVENTS: SimEvent[] = [
  { date: '2015-08-24', ticker: null, title: '중국발 블랙먼데이', detail: '위안화 평가절하·중국 증시 급락이 글로벌 위험자산 동반 급락을 촉발.', impact: 'down', category: 'macro' },
  { date: '2016-02-11', ticker: null, title: '유가 폭락·경기침체 공포 저점', detail: 'WTI 26달러까지 하락, 에너지·은행주 동반 약세 후 반등 시작.', impact: 'down', category: 'macro' },
  { date: '2016-06-24', ticker: null, title: '브렉시트 국민투표 가결', detail: '영국 EU 탈퇴 결정으로 글로벌 증시 충격, 안전자산 선호.', impact: 'down', category: 'macro' },
  { date: '2016-11-09', ticker: null, title: '트럼프 대선 승리', detail: '감세·규제완화 기대로 금융·산업주 랠리(리플레이션 트레이드).', impact: 'up', category: 'macro' },
  { date: '2018-02-05', ticker: null, title: 'Volmageddon(변동성 폭발)', detail: '금리 급등 우려로 VIX 급등, 단기 변동성 ETN 청산 사태.', impact: 'down', category: 'crisis' },
  { date: '2018-10-10', ticker: null, title: '2018 4분기 급락 시작', detail: '연준 금리인상·미중 무역전쟁 우려로 성장주 중심 큰 폭 조정.', impact: 'down', category: 'macro' },
  { date: '2018-12-24', ticker: null, title: '크리스마스 이브 저점', detail: 'S&P500 고점 대비 약 20% 하락, 약세장 진입 직전 바닥.', impact: 'down', category: 'macro' },
  { date: '2019-07-31', ticker: null, title: '연준 10년 만의 금리인하', detail: '보험성 인하 사이클 시작, 위험자산 우호적.', impact: 'up', category: 'macro' },
  { date: '2020-02-24', ticker: null, title: '코로나19 팬데믹 급락 시작', detail: '글로벌 확산 공포로 사상 최단기 약세장 진입.', impact: 'down', category: 'crisis' },
  { date: '2020-03-23', ticker: null, title: '코로나 저점·연준 무제한 QE', detail: '연준 무제한 양적완화·재정부양 발표 후 역사적 반등 시작.', impact: 'up', category: 'macro' },
  { date: '2020-11-09', ticker: null, title: '백신 효과 발표·가치주 순환', detail: '화이자 백신 90%+ 효능 발표로 리오프닝·가치주 급등.', impact: 'up', category: 'macro' },
  { date: '2021-01-27', ticker: null, title: '밈주식 광풍(게임스톱)', detail: '개인투자자 숏스퀴즈로 일부 종목 폭등, 시장 변동성 확대.', impact: 'neutral', category: 'crisis' },
  { date: '2022-01-05', ticker: null, title: '긴축 전환·성장주 고점', detail: '연준 매파 회의록으로 금리 급등, 고밸류 성장주 하락 전환.', impact: 'down', category: 'macro' },
  { date: '2022-06-13', ticker: null, title: '인플레 9%·약세장 확정', detail: 'CPI 충격으로 S&P500 약세장 진입, 75bp 자이언트 스텝.', impact: 'down', category: 'macro' },
  { date: '2022-10-13', ticker: null, title: '2022 약세장 저점권', detail: '고강도 긴축 속 CPI 정점 통과 기대, 바닥 다지기.', impact: 'up', category: 'macro' },
  { date: '2023-03-10', ticker: null, title: 'SVB 파산·지역은행 위기', detail: '실리콘밸리은행 붕괴로 은행권 시스템 우려, 금리인하 기대.', impact: 'down', category: 'crisis' },
  { date: '2023-05-25', ticker: null, title: 'AI 랠리 본격화', detail: '엔비디아 AI 가이던스 충격 이후 반도체·AI 테마 시장 주도.', impact: 'up', category: 'macro' },
  { date: '2024-08-05', ticker: null, title: '엔캐리 청산 쇼크', detail: '일본 금리인상·약한 고용지표로 글로벌 급락 후 빠른 회복.', impact: 'down', category: 'crisis' },
  { date: '2024-09-18', ticker: null, title: '연준 50bp 금리인하 시작', detail: '인하 사이클 개시로 위험자산 우호 환경.', impact: 'up', category: 'macro' },
  { date: '2025-04-03', ticker: null, title: '관세 충격', detail: '광범위 관세 발표로 글로벌 공급망·교역 우려, 변동성 급등.', impact: 'down', category: 'macro' },
];

// 종목 사건 — 대표 종목의 실적·제품·구조 이벤트 (확장 가능한 큐레이션)
const STOCK_EVENTS: SimEvent[] = [
  { date: '2023-05-24', ticker: 'NVDA', title: 'AI 데이터센터 가이던스 폭탄', detail: '차분기 매출 가이던스가 컨센서스를 50% 상회, AI 수요 본격 확인.', impact: 'up', category: 'earnings' },
  { date: '2024-06-07', ticker: 'NVDA', title: '10:1 액면분할', detail: '주가 접근성 개선 목적 액면분할로 개인 수급 유입.', impact: 'up', category: 'product' },
  { date: '2020-08-31', ticker: 'AAPL', title: '4:1 액면분할', detail: '액면분할 단행으로 개인 매수세 확대.', impact: 'up', category: 'product' },
  { date: '2020-08-31', ticker: 'TSLA', title: '5:1 액면분할', detail: '액면분할·성장 기대로 급등.', impact: 'up', category: 'product' },
  { date: '2021-10-25', ticker: 'TSLA', title: '시총 1조 달러 돌파', detail: '허츠 대량주문 보도로 시가총액 1조 달러 첫 돌파.', impact: 'up', category: 'product' },
  { date: '2022-02-03', ticker: 'META', title: '하루 -26% 사상 최대 시총 증발', detail: '이용자 정체·애플 ATT 광고 타격으로 폭락.', impact: 'down', category: 'earnings' },
  { date: '2023-02-01', ticker: 'META', title: "'효율성의 해' 자사주·비용절감", detail: '대규모 비용절감·자사주 매입 발표로 급반등.', impact: 'up', category: 'earnings' },
  { date: '2022-04-20', ticker: 'NFLX', title: '구독자 첫 순감소 쇼크', detail: '11년 만의 구독자 감소로 하루 -35% 급락.', impact: 'down', category: 'earnings' },
  { date: '2020-11-09', ticker: 'PFE', title: '코로나 백신 90%+ 효능', detail: '백신 3상 결과 발표로 급등, 시장 전체 리오프닝 촉발.', impact: 'up', category: 'product' },
  { date: '2024-03-05', ticker: 'LLY', title: '비만·당뇨 신약 수요 폭증', detail: 'GLP-1 계열(젭바운드·마운자로) 수요로 사상 최고가 경신.', impact: 'up', category: 'product' },
  { date: '2019-04-04', ticker: 'BA', title: '737 MAX 운항중단 여파', detail: '두 차례 추락 사고로 전 기종 운항중단, 생산·인도 차질.', impact: 'down', category: 'crisis' },
  { date: '2024-01-05', ticker: 'BA', title: '737 MAX 9 도어 이탈 사고', detail: '비행 중 도어플러그 이탈로 안전·품질 우려 재점화.', impact: 'down', category: 'crisis' },
  { date: '2021-11-10', ticker: 'RIVN', title: '리비안 IPO 직후 광풍', detail: '상장 직후 시총 급등(아마존·포드 투자 부각).', impact: 'up', category: 'product' },
  { date: '2021-04-14', ticker: 'COIN', title: '코인베이스 직상장', detail: '암호화폐 거래소 첫 직상장, 가상자산 사이클과 동조.', impact: 'neutral', category: 'product' },
  { date: '2024-07-19', ticker: 'CRWD', title: '글로벌 IT 대란 업데이트 사고', detail: '결함 업데이트로 전 세계 시스템 마비, 신뢰·실적 우려.', impact: 'down', category: 'crisis' },
];

const ALL_EVENTS: SimEvent[] = [...MARKET_EVENTS, ...STOCK_EVENTS].sort((a, b) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
);

function diffDays(a: string, b: string): number {
  return Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000);
}

/**
 * 특정 일자 근방의 사건. 해당 ticker 사건 + 시장 전체 사건을 함께 반환.
 * @param windowDays 앞뒤 허용 일수 (기본 5일)
 */
export function getEventsAround(date: string, windowDays = 5, ticker?: string | null): SimEvent[] {
  const up = ticker?.toUpperCase();
  return ALL_EVENTS.filter((e) => {
    if (e.ticker !== null && e.ticker !== up) return false;
    return diffDays(e.date, date) <= windowDays;
  });
}

/** 기간 [from, to] 내 모든 사건 (시장뷰 타임라인용). */
export function getEventsInRange(from: string, to: string, ticker?: string | null): SimEvent[] {
  const up = ticker?.toUpperCase();
  return ALL_EVENTS.filter((e) => {
    if (e.ticker !== null && up && e.ticker !== up) return false;
    return e.date >= from && e.date <= to;
  });
}

export { ALL_EVENTS };
