import { describe, expect, it } from 'vitest';
import { CronUiError, describeSlotTime, fromCron, toCron } from './cron-ui';

describe('toCron', () => {
  it('시:분 + 요일을 크론으로 만든다', () => {
    expect(toCron({ hour: 14, minute: 50, weekdays: [1, 2, 3, 4, 5] })).toBe('50 14 * * 1,2,3,4,5');
  });

  it('요일이 비었거나 7개면 매일(*)', () => {
    expect(toCron({ hour: 7, minute: 0, weekdays: [] })).toBe('0 7 * * *');
    expect(toCron({ hour: 7, minute: 0, weekdays: [0, 1, 2, 3, 4, 5, 6] })).toBe('0 7 * * *');
  });

  it('중복 요일은 정리하고 정렬한다', () => {
    expect(toCron({ hour: 9, minute: 5, weekdays: [5, 1, 1] })).toBe('5 9 * * 1,5');
  });

  it('범위를 벗어나면 예외', () => {
    expect(() => toCron({ hour: 24, minute: 0, weekdays: [] })).toThrow(CronUiError);
    expect(() => toCron({ hour: 9, minute: 60, weekdays: [] })).toThrow(CronUiError);
    expect(() => toCron({ hour: 9, minute: 0, weekdays: [7] })).toThrow(CronUiError);
  });
});

describe('fromCron', () => {
  it('왕복 변환이 보존된다', () => {
    const ui = { hour: 14, minute: 50, weekdays: [1, 2, 3, 4, 5] };
    expect(fromCron(toCron(ui))).toEqual(ui);
  });

  it('설계서 기본 슬롯 크론을 읽는다', () => {
    expect(fromCron('50 14 * * 1-5')).toEqual({ hour: 14, minute: 50, weekdays: [1, 2, 3, 4, 5] });
    expect(fromCron('30 4 * * 2-6')).toEqual({ hour: 4, minute: 30, weekdays: [2, 3, 4, 5, 6] });
    expect(fromCron('0 7 * * *')).toEqual({ hour: 7, minute: 0, weekdays: [] });
  });

  it('UI로 표현할 수 없는 크론은 null (편집 불가로 표시)', () => {
    expect(fromCron('0,30 9 * * 1')).toBeNull();
    expect(fromCron('0 9-17 * * 1')).toBeNull();
    expect(fromCron('말도 안 되는 값')).toBeNull();
  });
});

describe('describeSlotTime', () => {
  it('사람이 읽는 요약을 만든다', () => {
    expect(describeSlotTime('50 14 * * 1-5')).toBe('14:50 · 월화수목금');
    expect(describeSlotTime('0 10 * * 6')).toBe('10:00 · 토');
    expect(describeSlotTime('0 7 * * *')).toBe('07:00 · 매일');
  });

  it('표현 불가한 크론은 원문을 그대로 보여준다', () => {
    expect(describeSlotTime('0,30 9 * * 1')).toBe('0,30 9 * * 1');
  });
});
