import { describe, expect, it, vi } from 'vitest';
import { withNetworkRetry } from './net-retry';

const fast = { attempts: 3, backoffMs: 1 };

describe('withNetworkRetry', () => {
  it('한 번에 성공하면 그대로 돌려준다', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(withNetworkRetry(fn, '테스트', fast)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('일시적 실패는 다시 시도해서 성공시킨다', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue('ok');

    await expect(withNetworkRetry(fn, '테스트', fast)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('끝내 실패하면 마지막 오류를 던진다', async () => {
    const fn = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(withNetworkRetry(fn, '적재', fast)).rejects.toThrow('fetch failed');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('네트워크 문제가 아닌 오류는 재시도하지 않는다', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('컬럼이 없습니다'));

    await expect(withNetworkRetry(fn, '적재', fast)).rejects.toThrow('컬럼이 없습니다');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
