import { describe, it, expect } from 'vitest';
import { parseOrderbook } from './orderbook';

const AS_OF = '2026-07-10T01:00:00Z';

describe('parseOrderbook', () => {
  it('10호가 파싱 + 0/빈 값 필터', () => {
    const out: Record<string, string> = {
      total_askp_rsqn: '5000',
      total_bidp_rsqn: '4000',
    };
    for (let i = 1; i <= 10; i++) {
      out[`askp${i}`] = String(70000 + i * 100);
      out[`askp_rsqn${i}`] = String(i * 10);
      out[`bidp${i}`] = String(69900 - i * 100);
      out[`bidp_rsqn${i}`] = String(i * 20);
    }
    const ob = parseOrderbook(out, '005930', AS_OF);
    expect(ob.asks).toHaveLength(10);
    expect(ob.bids).toHaveLength(10);
    expect(ob.asks[0]).toEqual({ price: 70100, qty: 10 });
    expect(ob.bids[0]).toEqual({ price: 69800, qty: 20 });
    expect(ob.totalAskQty).toBe(5000);
    expect(ob.totalBidQty).toBe(4000);
    expect(ob.asOf).toBe(AS_OF);
  });

  it('휴장·장외 빈 호가 → 빈 배열 (throw 아님)', () => {
    // 회귀 방지: 주말 폴링마다 502 던지던 버그
    const ob = parseOrderbook({}, '005930', AS_OF);
    expect(ob.asks).toHaveLength(0);
    expect(ob.bids).toHaveLength(0);
    expect(ob.totalAskQty).toBe(0);
  });

  it('일부만 채워진 호가는 있는 단만 반환', () => {
    const ob = parseOrderbook({ askp1: '70000', askp_rsqn1: '5', bidp1: '69900', bidp_rsqn1: '3' }, '005930', AS_OF);
    expect(ob.asks).toHaveLength(1);
    expect(ob.bids).toHaveLength(1);
  });
});
