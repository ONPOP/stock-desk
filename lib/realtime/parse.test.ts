import { describe, it, expect } from 'vitest';
import { parseFrame, parseTradeFields, parseAskingFields, buildSubscribeFrame } from './parse';

const AS_OF = '2026-07-13T00:30:00Z';

// H0STCNT0 최소 14필드: [종목,시각,현재가,부호,전일대비,등락률,가중평균,시가,고가,저가,매도1,매수1,체결량,누적량]
function tradeFields(over: Record<number, string> = {}): string[] {
  const base = ['005930', '093015', '72000', '2', '500', '0.70', '71800', '71500', '72200', '71400', '72100', '71900', '10', '1234567'];
  for (const [k, v] of Object.entries(over)) base[Number(k)] = v as string;
  return base;
}

describe('parseTradeFields (H0STCNT0)', () => {
  it('현재가·거래량·상승 부호', () => {
    const t = parseTradeFields(tradeFields(), AS_OF)!;
    expect(t.ticker).toBe('005930');
    expect(t.price).toBe(72000);
    expect(t.change).toBe(500); // sign '2'=상승 → 양수
    expect(t.changeRate).toBe('0.70');
    expect(t.volume).toBe(1234567);
    expect(t.cntgTime).toBe('093015');
  });
  it('하락 부호(5)면 전일대비 음수', () => {
    const t = parseTradeFields(tradeFields({ 3: '5', 4: '300' }), AS_OF)!;
    expect(t.change).toBe(-300);
  });
  it('필드 부족·비정형 종목코드 → null', () => {
    expect(parseTradeFields(['005930', '09'], AS_OF)).toBeNull();
    expect(parseTradeFields(tradeFields({ 0: 'AAPL' }), AS_OF)).toBeNull();
  });
});

// H0STASP0 최소 45필드
function askFields(): string[] {
  const f = new Array(45).fill('0');
  f[0] = '005930';
  f[1] = '093015';
  f[2] = '0';
  for (let i = 0; i < 10; i++) {
    f[3 + i] = String(72100 + i * 100); // 매도호가1~10
    f[13 + i] = String(71900 - i * 100); // 매수호가1~10
    f[23 + i] = String((i + 1) * 10); // 매도잔량
    f[33 + i] = String((i + 1) * 20); // 매수잔량
  }
  f[43] = '5500';
  f[44] = '6600';
  return f;
}

describe('parseAskingFields (H0STASP0)', () => {
  it('매도/매수 10단 + 총잔량', () => {
    const ob = parseAskingFields(askFields(), AS_OF)!;
    expect(ob.asks).toHaveLength(10);
    expect(ob.bids).toHaveLength(10);
    expect(ob.asks[0]).toEqual({ price: 72100, qty: 10 });
    expect(ob.bids[0]).toEqual({ price: 71900, qty: 20 });
    expect(ob.totalAskQty).toBe(5500);
    expect(ob.totalBidQty).toBe(6600);
  });
  it('0 호가는 제외', () => {
    const f = askFields();
    f[3] = '0'; // 매도1 없음
    const ob = parseAskingFields(f, AS_OF)!;
    expect(ob.asks).toHaveLength(9);
  });
});

describe('parseFrame', () => {
  it('PINGPONG 인식', () => {
    expect(parseFrame(JSON.stringify({ header: { tr_id: 'PINGPONG' } }), AS_OF).kind).toBe('pingpong');
  });
  it('구독 응답 = control', () => {
    expect(parseFrame(JSON.stringify({ header: { tr_id: 'H0STCNT0' }, body: { rt_cd: '0' } }), AS_OF).kind).toBe('control');
  });
  it('체결가 데이터 프레임', () => {
    const raw = `0|H0STCNT0|001|${tradeFields().join('^')}`;
    const p = parseFrame(raw, AS_OF);
    expect(p.kind).toBe('tick');
    expect(p.tick?.price).toBe(72000);
  });
  it('호가 데이터 프레임', () => {
    const raw = `0|H0STASP0|001|${askFields().join('^')}`;
    const p = parseFrame(raw, AS_OF);
    expect(p.kind).toBe('orderbook');
    expect(p.orderbook?.asks).toHaveLength(10);
  });
  it('암호화 프레임(1|)은 미지원 → unknown', () => {
    expect(parseFrame('1|H0STCNI0|001|encrypted', AS_OF).kind).toBe('unknown');
  });
  it('깨진 프레임 → unknown', () => {
    expect(parseFrame('garbage', AS_OF).kind).toBe('unknown');
    expect(parseFrame('{bad json', AS_OF).kind).toBe('unknown');
  });
});

describe('buildSubscribeFrame', () => {
  it('구독/해지 tr_type', () => {
    expect(JSON.parse(buildSubscribeFrame('KEY', 'H0STCNT0', '005930', true)).header.tr_type).toBe('1');
    expect(JSON.parse(buildSubscribeFrame('KEY', 'H0STCNT0', '005930', false)).header.tr_type).toBe('2');
    const body = JSON.parse(buildSubscribeFrame('KEY', 'H0STASP0', '000660', true)).body;
    expect(body.input).toEqual({ tr_id: 'H0STASP0', tr_key: '000660' });
  });
});
