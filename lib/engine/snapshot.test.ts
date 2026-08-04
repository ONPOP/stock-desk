import { describe, expect, it } from 'vitest';
import type { Candle } from '@/types';
import { buildSnapshot, InsufficientCandlesError, MIN_CANDLES } from './snapshot';
import type { EngineStock } from './types';

const STOCK: EngineStock = {
  stockId: 'uuid-1',
  ticker: '005930',
  name: '삼성전자',
  market: 'KOSPI',
  alwaysBrief: false,
  radarPin: false,
};

function candles(n: number): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    ts: new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString(),
    o: 1_000 + i,
    h: 1_010 + i,
    l: 990 + i,
    c: 1_000 + i,
    volume: 100 + i,
  }));
}

describe('buildSnapshot', () => {
  it('마지막 봉으로 price_data를 만들고 전일 대비를 bp로 낸다', () => {
    const snap = buildSnapshot(STOCK, candles(60));
    expect(snap.priceData.currency).toBe('KRW');
    expect(snap.priceData.close).toBe(1_059);
    expect(snap.priceData.prevClose).toBe(1_058);
    expect(snap.priceData.changeBp).toBe(9); // (1059-1058)/1058 ≈ 0.0945%
  });

  it('미국 종목은 USD로 판정한다', () => {
    const snap = buildSnapshot({ ...STOCK, ticker: 'NVDA', market: 'NASDAQ' }, candles(60));
    expect(snap.priceData.currency).toBe('USD');
  });

  it('역순·중복 캔들이 들어와도 정렬·중복 제거 후 계산한다', () => {
    const base = candles(60);
    const shuffled = [...base].reverse();
    shuffled.push(base[base.length - 1]); // 중복 1건

    const snap = buildSnapshot(STOCK, shuffled);
    expect(snap.priceData.close).toBe(1_059);
    expect(snap.indicators.ma.ma20).not.toBeNull();
  });

  it('봉이 최소 개수 미만이면 예외 (호출부가 종목 단위로 스킵)', () => {
    expect(() => buildSnapshot(STOCK, candles(MIN_CANDLES - 1))).toThrow(InsufficientCandlesError);
  });

  it('수급 데이터는 그대로 보존한다', () => {
    const snap = buildSnapshot(STOCK, candles(60), { foreignNetBuy: 1_000 });
    expect(snap.flowData).toEqual({ foreignNetBuy: 1_000 });
  });
});
