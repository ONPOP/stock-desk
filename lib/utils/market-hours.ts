// 개장시간·휴장일 단일 관리 (PRD 16장)
// 한국: 09:00~15:30 KST / 미국: 09:30~16:00 ET (정규장 기준)
import { EST_TZ, KST_TZ, minutesAndWeekdayInTz } from '@/lib/utils/date';
import type { Market } from '@/types';

export type MarketRegion = 'KR' | 'US';

export function regionOf(market: Market): MarketRegion {
  return market === 'KOSPI' || market === 'KOSDAQ' ? 'KR' : 'US';
}

interface MarketSession {
  tz: string;
  openMin: number; // 현지 분
  closeMin: number;
}

const SESSIONS: Record<MarketRegion, MarketSession> = {
  KR: { tz: KST_TZ, openMin: 9 * 60, closeMin: 15 * 60 + 30 },
  US: { tz: EST_TZ, openMin: 9 * 60 + 30, closeMin: 16 * 60 },
};

// 휴장일 (현지 날짜 기준). 데이터 소스 연동 전까지 시드로 관리 — 매년 갱신 필요.
// 2026년 기준: 한국 KRX / 미국 NYSE·NASDAQ
const HOLIDAYS: Record<MarketRegion, string[]> = {
  KR: [
    '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', // 신정·설연휴
    '2026-03-02', // 삼일절 대체
    '2026-05-01', '2026-05-05', '2026-05-25', // 노동절·어린이날·부처님오신날 대체
    '2026-06-03', '2026-08-17', // 지방선거일·광복절 대체
    '2026-09-24', '2026-09-25', // 추석연휴
    '2026-10-05', '2026-10-09', // 개천절 대체·한글날
    '2026-12-25', '2026-12-31', // 성탄절·연말휴장
  ],
  US: [
    '2026-01-01', '2026-01-19', '2026-02-16', // New Year·MLK·Presidents
    '2026-04-03', '2026-05-25', '2026-06-19', // Good Friday·Memorial·Juneteenth
    '2026-07-03', '2026-09-07', '2026-11-26', // Independence(관측)·Labor·Thanksgiving
    '2026-12-25',
  ],
};

export function isHoliday(region: MarketRegion, localIsoDate: string): boolean {
  return HOLIDAYS[region].includes(localIsoDate);
}

/** 해당 시각(UTC)에 해당 시장이 정규장 개장 중인지 */
export function isMarketOpen(region: MarketRegion, at: Date = new Date()): boolean {
  const session = SESSIONS[region];
  const { minutes, weekday, isoDate } = minutesAndWeekdayInTz(at, session.tz);
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  if (isHoliday(region, isoDate)) return false;
  return minutes >= session.openMin && minutes < session.closeMin;
}

/** 두 시장 중 하나라도 개장 중이면 "장중" — 뉴스 갱신 주기(D8) 판단용 */
export function isAnyMarketOpen(at: Date = new Date()): boolean {
  return isMarketOpen('KR', at) || isMarketOpen('US', at);
}
