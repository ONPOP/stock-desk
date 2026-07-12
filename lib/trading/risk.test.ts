import { describe, it, expect } from 'vitest';
import { checkRisk, type RiskInput } from './risk';
import { DEFAULT_PARAMS } from './strategy';

const base: RiskInput = {
  enabled: true,
  killSwitch: false,
  side: 'buy',
  orderCost: 500_000,
  cashBalance: 5_000_000,
  seedKrw: 10_000_000,
  positionsCount: 0,
  alreadyHolding: false,
  dailyRealizedPnl: 0,
  params: DEFAULT_PARAMS,
};

describe('checkRisk', () => {
  it('정상 매수는 통과', () => {
    expect(checkRisk(base)).toEqual({ allowed: true });
  });

  it('kill switch는 매도까지 전부 차단 (최우선)', () => {
    expect(checkRisk({ ...base, killSwitch: true }).allowed).toBe(false);
    expect(checkRisk({ ...base, killSwitch: true, side: 'sell' }).allowed).toBe(false);
  });

  it('비활성 상태 차단', () => {
    expect(checkRisk({ ...base, enabled: false }).allowed).toBe(false);
  });

  it('매도는 손실 한도·보유 수와 무관하게 허용 (손절 경로 보장)', () => {
    const v = checkRisk({ ...base, side: 'sell', dailyRealizedPnl: -9_999_999, positionsCount: 99 });
    expect(v.allowed).toBe(true);
  });

  it('일간 손실 한도 도달 시 신규 매수 차단 (-3% = -30만)', () => {
    const v = checkRisk({ ...base, dailyRealizedPnl: -300_000 });
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toContain('일간 손실 한도');
  });

  it('중복 보유 차단', () => {
    expect(checkRisk({ ...base, alreadyHolding: true }).allowed).toBe(false);
  });

  it('동시 보유 한도 차단', () => {
    expect(checkRisk({ ...base, positionsCount: 3 }).allowed).toBe(false);
  });

  it('1회 주문 한도(시드 10% = 100만) 초과 차단', () => {
    expect(checkRisk({ ...base, orderCost: 1_000_001 }).allowed).toBe(false);
    expect(checkRisk({ ...base, orderCost: 1_000_000 }).allowed).toBe(true);
  });

  it('잔고 부족 차단', () => {
    expect(checkRisk({ ...base, orderCost: 900_000, cashBalance: 800_000 }).allowed).toBe(false);
  });

  it('수량 0 (주문 금액 0) 차단', () => {
    expect(checkRisk({ ...base, orderCost: 0 }).allowed).toBe(false);
  });

  it('시드 0(오염)이어도 손익 0에서 손실 한도 오탐으로 차단하지 않는다', () => {
    // 0 <= -0 오탐 회귀 방지 — 시드 0이면 주문 크기 한도(0원)에서 걸리는 게 올바른 사유
    const v = checkRisk({ ...base, seedKrw: 0, dailyRealizedPnl: 0 });
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).not.toContain('일간 손실 한도');
  });

  it('한도 정확히 도달(-lossLimit)은 차단, 1원 모자라면 통과', () => {
    expect(checkRisk({ ...base, dailyRealizedPnl: -300_000 }).allowed).toBe(false);
    expect(checkRisk({ ...base, dailyRealizedPnl: -299_999 }).allowed).toBe(true);
  });
});
