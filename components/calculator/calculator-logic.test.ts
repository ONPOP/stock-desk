import { describe, it, expect } from 'vitest';
import { reducer, group, compute, INITIAL, MAX_HISTORY, type Action, type State } from './calculator-logic';

const run = (actions: Action[]): State => actions.reduce(reducer, INITIAL);
const digits = (s: string): Action[] => s.split('').map((d) => ({ type: 'digit', d }) as Action);

describe('group (천단위 콤마)', () => {
  it('정수·소수·음수·에러', () => {
    expect(group('1234567')).toBe('1,234,567');
    expect(group('-1234.5')).toBe('-1,234.5');
    expect(group('999')).toBe('999');
    expect(group('Error')).toBe('Error');
  });
});

describe('compute', () => {
  it('사칙연산', () => {
    expect(compute(2, 3, 'add')).toBe(5);
    expect(compute(7, 2, 'sub')).toBe(5);
    expect(compute(4, 3, 'mul')).toBe(12);
    expect(compute(8, 2, 'div')).toBe(4);
  });
  it('0 나누기 → null', () => {
    expect(compute(5, 0, 'div')).toBeNull();
  });
});

describe('reducer', () => {
  it('2 + 3 = 5 (히스토리 기록)', () => {
    const s = run([...digits('2'), { type: 'op', op: 'add' }, ...digits('3'), { type: 'eq' }]);
    expect(s.current).toBe('5');
    expect(s.history[0]?.result).toBe('5');
  });

  it('0 나누기 → Error', () => {
    const s = run([...digits('5'), { type: 'op', op: 'div' }, ...digits('0'), { type: 'eq' }]);
    expect(s.error).toBe(true);
    expect(s.current).toBe('Error');
  });

  it('Error 상태에서 숫자 입력 시 초기화', () => {
    const err = run([...digits('5'), { type: 'op', op: 'div' }, ...digits('0'), { type: 'eq' }]);
    const s = reducer(err, { type: 'digit', d: '7' });
    expect(s.error).toBe(false);
    expect(s.current).toBe('7');
  });

  it('연속 연산 누적: 2 + 3 + → stored 5', () => {
    const s = run([...digits('2'), { type: 'op', op: 'add' }, ...digits('3'), { type: 'op', op: 'add' }]);
    expect(s.stored).toBe(5);
  });

  it('12자리 입력 제한', () => {
    const s = run(digits('1234567890123')); // 13자리 입력
    expect(s.current).toBe('123456789012'); // 12자리에서 멈춤
  });

  it('퍼센트: 50 % → 0.5', () => {
    const s = run([...digits('50'), { type: 'pct' }]);
    expect(s.current).toBe('0.5');
  });

  it('부호 토글: 5 → -5 → 5, 0은 토글 안 됨', () => {
    let s = run([...digits('5'), { type: 'sign' }]);
    expect(s.current).toBe('-5');
    s = reducer(s, { type: 'sign' });
    expect(s.current).toBe('5');
    expect(reducer(INITIAL, { type: 'sign' }).current).toBe('0');
  });

  it('백스페이스', () => {
    expect(run([...digits('123'), { type: 'back' }]).current).toBe('12');
    expect(run([...digits('1'), { type: 'back' }]).current).toBe('0');
  });

  it('소수점 중복 방지', () => {
    const s = run([...digits('1'), { type: 'dot' }, ...digits('5'), { type: 'dot' }, ...digits('2')]);
    expect(s.current).toBe('1.52');
  });

  it('AC 초기화', () => {
    expect(run([...digits('99'), { type: 'clear' }]).current).toBe('0');
  });

  it('히스토리 최대 8개 유지', () => {
    let s: State = INITIAL;
    for (let i = 0; i < 10; i++) {
      const seq: Action[] = [...digits('1'), { type: 'op', op: 'add' }, ...digits('1'), { type: 'eq' }];
      s = seq.reduce(reducer, s);
    }
    expect(s.history.length).toBe(MAX_HISTORY);
  });

  it('pickHistory가 결과를 current로 복원', () => {
    const withHist = run([...digits('2'), { type: 'op', op: 'add' }, ...digits('3'), { type: 'eq' }]);
    const s = reducer(withHist, { type: 'pickHistory', result: '5' });
    expect(s.current).toBe('5');
    expect(s.overwrite).toBe(true);
  });

  it('clearHistory', () => {
    const withHist = run([...digits('2'), { type: 'op', op: 'add' }, ...digits('3'), { type: 'eq' }]);
    expect(reducer(withHist, { type: 'clearHistory' }).history.length).toBe(0);
  });
});
