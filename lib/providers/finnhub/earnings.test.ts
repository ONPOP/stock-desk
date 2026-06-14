import { describe, it, expect } from 'vitest';
import { buildEarningsEvents } from './earnings';

describe('buildEarningsEvents', () => {
  it('유효 일자·심볼 이벤트만, 심볼 대문자', () => {
    const evs = buildEarningsEvents({
      earningsCalendar: [
        { date: '2026-07-30', symbol: 'aapl', hour: 'amc' },
        { date: '2026-10-29', symbol: 'AAPL' },
      ],
    });
    expect(evs).toEqual([
      { date: '2026-07-30', symbol: 'AAPL' },
      { date: '2026-10-29', symbol: 'AAPL' },
    ]);
  });
  it('날짜·심볼 누락은 제외, 빈 응답 안전', () => {
    expect(buildEarningsEvents({ earningsCalendar: [{ symbol: 'AAPL' }, { date: 'bad', symbol: 'X' }] })).toEqual([]);
    expect(buildEarningsEvents({})).toEqual([]);
  });
});
