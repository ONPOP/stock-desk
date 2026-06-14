// KIS 레이트리밋 큐 — 초당 N건 제한 중앙 관리 (PRD 16장, D3)
// 슬라이딩 윈도우 방식: 직전 1초간 실행된 요청이 한도 미만일 때만 실행

interface QueueItem {
  resolve: () => void;
  reject: (e: Error) => void;
  enqueuedAt: number;
}

export class RateLimiter {
  private readonly maxPerSecond: number;
  private readonly maxQueueSize: number;
  private readonly timestamps: number[] = [];
  private readonly queue: QueueItem[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts?: { maxPerSecond?: number; maxQueueSize?: number }) {
    this.maxPerSecond = opts?.maxPerSecond ?? 20;
    this.maxQueueSize = opts?.maxQueueSize ?? 500;
    if (this.maxPerSecond < 1) throw new Error('maxPerSecond는 1 이상이어야 합니다.');
  }

  /** 실행 슬롯 확보까지 대기. 큐 포화 시 즉시 거부(무한 대기 방지). */
  acquire(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.queue.length >= this.maxQueueSize) {
        reject(new Error(`KIS 요청 큐가 포화 상태입니다 (대기 ${this.queue.length}건).`));
        return;
      }
      this.queue.push({ resolve, reject, enqueuedAt: Date.now() });
      this.drain();
    });
  }

  /** 대기 중인 요청 수 (모니터링용) */
  get pending(): number {
    return this.queue.length;
  }

  private drain(): void {
    const now = Date.now();
    // 1초 윈도우 밖 타임스탬프 제거
    while (this.timestamps.length > 0 && now - this.timestamps[0] >= 1000) {
      this.timestamps.shift();
    }
    while (this.queue.length > 0 && this.timestamps.length < this.maxPerSecond) {
      const item = this.queue.shift()!;
      this.timestamps.push(Date.now());
      item.resolve();
    }
    if (this.queue.length > 0 && !this.timer) {
      const waitMs = Math.max(1, 1000 - (now - this.timestamps[0]));
      this.timer = setTimeout(() => {
        this.timer = null;
        this.drain();
      }, waitMs);
      // Node가 큐 대기만으로 프로세스를 붙잡지 않도록
      this.timer.unref?.();
    }
  }
}
