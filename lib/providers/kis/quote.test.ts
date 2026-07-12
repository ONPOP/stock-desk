import { describe, expect, it } from 'vitest';
import { getOverseasQuote } from '@/lib/providers/kis/quote';
import type { KisClient } from '@/lib/providers/kis/client';

// KIS 해외 시세는 diff(전일대비)를 부호 없는 절대값으로, rate(등락률)를 +/- 부호 포함으로 준다.
// getOverseasQuote 가 이를 국내/Yahoo 와 동일 규약(change=부호 있는 수, changeRate=양수 무부호·음수 '-')으로
// 정규화해 표시 레이어의 중복 + / 항상 빨강 버그를 막는지 검증한다.
function fakeClient(output: Record<string, unknown>): KisClient {
  return { request: async () => ({ output }) } as unknown as KisClient;
}

describe('getOverseasQuote — 해외 등락 정규화', () => {
  it('상승: change 양수, changeRate 무부호 (표시 레이어 + 중복 방지)', async () => {
    const q = await getOverseasQuote(
      fakeClient({ last: '409.26', diff: '16.36', rate: '+4.16', sign: '2', tvol: '1000' }),
      'AVGO',
      'NASDAQ',
    );
    expect(q.change).toBe(1636); // $16.36 → 1636센트
    expect(q.changeRate).toBe('4.16'); // '+' 제거 → 표시 레이어가 한 번만 부여
  });

  it('하락: diff 가 절대값이어도 change 음수, changeRate 는 -부호', async () => {
    const q = await getOverseasQuote(
      fakeClient({ last: '180.65', diff: '11.18', rate: '-5.83', sign: '5', tvol: '1' }),
      'TSLA',
      'NASDAQ',
    );
    expect(q.change).toBe(-1118); // 절대값 1118 에 음수 방향 적용
    expect(q.changeRate).toBe('-5.83');
  });

  it('sign 코드가 없으면 rate 문자열 부호로 방향을 판정한다', async () => {
    const q = await getOverseasQuote(
      fakeClient({ last: '180.65', diff: '11.18', rate: '-5.83', tvol: '1' }),
      'TSLA',
      'NASDAQ',
    );
    expect(q.change).toBe(-1118);
    expect(q.changeRate).toBe('-5.83');
  });

  it('보합: sign=3 이면 change 0', async () => {
    const q = await getOverseasQuote(
      fakeClient({ last: '100', diff: '0', rate: '0.00', sign: '3', tvol: '0' }),
      'AAPL',
      'NASDAQ',
    );
    expect(q.change).toBe(0);
    expect(q.changeRate).toBe('0.00');
  });
});
