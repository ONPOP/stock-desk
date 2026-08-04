// 자동매매 리스크 관문 (D15) — 모든 주문이 통과해야 하는 최종 검문소. 순수 함수.
// 계층: 시스템(kill switch/enabled) > 일간 손실 한도 > 종목 수 > 주문 크기.
// 매도는 손절·청산 경로이므로 시스템 차단 외에는 막지 않는다.
import type { StrategyParams } from '@/types';

export interface RiskInput {
  enabled: boolean;
  killSwitch: boolean;
  side: 'buy' | 'sell';
  /** 주문 금액 (최소 단위 정수) — buy일 때만 의미 */
  orderCost: number;
  cashBalance: number;
  /** 시즌 시드 (일간 손실 한도·주문 크기 기준) */
  seedKrw: number;
  positionsCount: number;
  alreadyHolding: boolean;
  /** 당일 실현손익 합 (최소 단위 정수, 손실 = 음수) */
  dailyRealizedPnl: number;
  params: StrategyParams;
}

export type RiskVerdict = { allowed: true } | { allowed: false; reason: string };

export function checkRisk(input: RiskInput): RiskVerdict {
  const { params: p } = input;

  if (input.killSwitch) return { allowed: false, reason: 'Kill switch 작동 중' };
  if (!input.enabled) return { allowed: false, reason: '자동매매 비활성 상태' };

  if (input.side === 'sell') return { allowed: true };

  // lossLimit이 0(시드 미설정·오염)이면 손익 0에서도 차단(0 <= -0)되는 오탐 → 양수일 때만 판정
  const lossLimit = Math.floor((input.seedKrw * p.dailyLossLimitPct) / 100);
  if (lossLimit > 0 && input.dailyRealizedPnl <= -lossLimit)
    return { allowed: false, reason: `일간 손실 한도 도달 (-${p.dailyLossLimitPct}%) — 당일 신규 진입 중지` };

  if (input.alreadyHolding) return { allowed: false, reason: '이미 보유 중인 종목 (중복 진입 금지)' };
  if (input.positionsCount >= p.maxPositions)
    return { allowed: false, reason: `동시 보유 한도 도달 (${input.positionsCount}/${p.maxPositions})` };

  if (input.orderCost <= 0) return { allowed: false, reason: '주문 수량 0 (시드 부족 또는 가격 초과)' };
  const maxOrder = Math.floor((input.seedKrw * p.orderPct) / 100);
  if (input.orderCost > maxOrder)
    return { allowed: false, reason: `주문 금액이 1회 한도 초과 (시드의 ${p.orderPct}%)` };
  if (input.orderCost > input.cashBalance) return { allowed: false, reason: '잔고 부족' };

  return { allowed: true };
}
