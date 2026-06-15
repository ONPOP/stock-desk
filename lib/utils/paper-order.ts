// 모의투자 지정가 체결 조건 (F9) — 순수 함수로 분리해 단위 테스트로 검증.
// 가격은 최소 단위 정수(원·센트) 기준. 부동소수점 연산 없음(정수 비교).

/**
 * 지정가 주문 체결 조건.
 * - 매수: 현재가가 지정가 이하로 내려오면 체결 (더 싸게 사는 주문)
 * - 매도: 현재가가 지정가 이상으로 올라오면 체결 (더 비싸게 파는 주문)
 */
export function shouldFillLimitOrder(
  side: 'buy' | 'sell',
  currentPriceMinor: number,
  limitPriceMinor: number,
): boolean {
  return side === 'buy'
    ? currentPriceMinor <= limitPriceMinor
    : currentPriceMinor >= limitPriceMinor;
}
