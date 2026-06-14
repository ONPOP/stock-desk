import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from '@/lib/providers/kis/rate-limiter';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RateLimiter — 정상 동작', () => {
  it('한도 내 요청은 즉시 통과한다', async () => {
    const limiter = new RateLimiter({ maxPerSecond: 20 });
    const results = await Promise.all(
      Array.from({ length: 20 }, () => limiter.acquire().then(() => 'ok')),
    );
    expect(results).toHaveLength(20);
    expect(limiter.pending).toBe(0);
  });

  it('초당 한도를 초과하는 요청은 다음 윈도우로 지연된다', async () => {
    const limiter = new RateLimiter({ maxPerSecond: 20 });
    let completed = 0;
    const all = Array.from({ length: 25 }, () => limiter.acquire().then(() => completed++));

    await vi.advanceTimersByTimeAsync(0);
    expect(completed).toBe(20); // 첫 1초 윈도우에는 정확히 20건만
    expect(limiter.pending).toBe(5);

    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all(all);
    expect(completed).toBe(25);
  });

  it('대기 요청은 FIFO 순서로 실행된다', async () => {
    const limiter = new RateLimiter({ maxPerSecond: 2 });
    const order: number[] = [];
    const all = [1, 2, 3, 4].map((n) => limiter.acquire().then(() => order.push(n)));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all(all);
    expect(order).toEqual([1, 2, 3, 4]);
  });
});

describe('RateLimiter — 비정상 사용', () => {
  it('큐 포화 시 새 요청을 즉시 거부한다 (무한 대기 방지)', async () => {
    const limiter = new RateLimiter({ maxPerSecond: 1, maxQueueSize: 3 });
    await limiter.acquire(); // 슬롯 소진
    const queued = [limiter.acquire(), limiter.acquire(), limiter.acquire()]; // 큐 가득
    await expect(limiter.acquire()).rejects.toThrow(/포화/);
    // 정리: 큐 비우기
    await vi.advanceTimersByTimeAsync(4000);
    await Promise.all(queued);
  });

  it('maxPerSecond < 1 설정을 거부한다', () => {
    expect(() => new RateLimiter({ maxPerSecond: 0 })).toThrow();
  });
});
