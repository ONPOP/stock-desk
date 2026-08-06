import { describe, expect, it } from 'vitest';
import { MEDIA_GROUP_MAX, planSends, shouldNotify } from './telegram-dispatch';

describe('planSends', () => {
  it('0장은 빈 배열을 반환한다', () => {
    const result = planSends([]);
    expect(result).toEqual([]);
  });

  it('1장은 photo 단위로 반환한다', () => {
    const paths = ['slide_1.png'];
    const result = planSends(paths);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ kind: 'photo', paths: ['slide_1.png'] });
  });

  it('2장은 group으로 묶어 반환한다', () => {
    const paths = ['slide_1.png', 'slide_2.png'];
    const result = planSends(paths);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ kind: 'group', paths: ['slide_1.png', 'slide_2.png'] });
  });

  it('10장은 단일 group으로 반환한다', () => {
    const paths = Array.from({ length: 10 }, (_, i) => `slide_${i + 1}.png`);
    const result = planSends(paths);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('group');
    expect(result[0].paths).toHaveLength(10);
  });

  it('11장은 group(10) + photo로 분할한다', () => {
    const paths = Array.from({ length: 11 }, (_, i) => `slide_${i + 1}.png`);
    const result = planSends(paths);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ kind: 'group', paths: paths.slice(0, 10) });
    expect(result[1]).toEqual({ kind: 'photo', paths: [paths[10]] });
  });

  it('13장은 group(10) + group(3)으로 분할한다', () => {
    const paths = Array.from({ length: 13 }, (_, i) => `slide_${i + 1}.png`);
    const result = planSends(paths);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ kind: 'group', paths: paths.slice(0, 10) });
    expect(result[1]).toEqual({ kind: 'group', paths: paths.slice(10, 13) });
  });

  it('20장은 group(10) + group(10)으로 분할한다', () => {
    const paths = Array.from({ length: 20 }, (_, i) => `slide_${i + 1}.png`);
    const result = planSends(paths);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ kind: 'group', paths: paths.slice(0, 10) });
    expect(result[1]).toEqual({ kind: 'group', paths: paths.slice(10, 20) });
  });

  it('21장은 group(10) + group(10) + photo로 분할한다', () => {
    const paths = Array.from({ length: 21 }, (_, i) => `slide_${i + 1}.png`);
    const result = planSends(paths);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ kind: 'group', paths: paths.slice(0, 10) });
    expect(result[1]).toEqual({ kind: 'group', paths: paths.slice(10, 20) });
    expect(result[2]).toEqual({ kind: 'photo', paths: [paths[20]] });
  });

  it('모든 경계 케이스에서 원본 순서가 보존된다', () => {
    const testCases = [1, 2, 10, 11, 13, 20, 21];
    for (const count of testCases) {
      const paths = Array.from({ length: count }, (_, i) => `slide_${i + 1}.png`);
      const result = planSends(paths);
      const flattened = result.flatMap((unit) => unit.paths);
      expect(flattened).toEqual(paths);
    }
  });

  it('group의 paths.length는 항상 2 이상 10 이하다', () => {
    const testCases = [2, 3, 10, 11, 13, 20, 21];
    for (const count of testCases) {
      const paths = Array.from({ length: count }, (_, i) => `slide_${i + 1}.png`);
      const result = planSends(paths);
      for (const unit of result) {
        if (unit.kind === 'group') {
          expect(unit.paths.length).toBeGreaterThanOrEqual(2);
          expect(unit.paths.length).toBeLessThanOrEqual(MEDIA_GROUP_MAX);
        }
      }
    }
  });

  it('photo는 항상 단일 경로를 갖는다', () => {
    const testCases = [1, 11, 21];
    for (const count of testCases) {
      const paths = Array.from({ length: count }, (_, i) => `slide_${i + 1}.png`);
      const result = planSends(paths);
      for (const unit of result) {
        if (unit.kind === 'photo') {
          expect(unit.paths).toHaveLength(1);
        }
      }
    }
  });
});

describe('shouldNotify', () => {
  it('켠 슬롯은 true를 반환한다', () => {
    const result = shouldNotify('kr_close_buy', ['kr_close_buy', 'kr_premarket']);
    expect(result).toBe(true);
  });

  it('끈 슬롯은 false를 반환한다', () => {
    const result = shouldNotify('kr_close_buy', []);
    expect(result).toBe(false);
  });

  it('목록에 없는 슬롯은 false를 반환한다', () => {
    const result = shouldNotify('us_close_buy', ['kr_close_buy', 'kr_premarket']);
    expect(result).toBe(false);
  });

  it('빈 배열은 false를 반환한다', () => {
    const result = shouldNotify('kr_close_buy', []);
    expect(result).toBe(false);
  });
});
