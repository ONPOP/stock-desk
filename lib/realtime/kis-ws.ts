// KIS 실시간 WS 클라이언트 (모의 시세 조회 전용) — 상시 프로세스(릴레이)에서만 구동.
// 체결가(H0STCNT0)·호가(H0STASP0) 구독. 재연결·approval_key 재발급·PINGPONG 담당.
// Node 24 내장 WebSocket(클라이언트) 사용 — 무의존. appSecret은 이 프로세스 밖으로 나가지 않는다.
import { parseFrame, buildSubscribeFrame } from '@/lib/realtime/parse';
import type { RealtimeTick, RealtimeOrderbook } from '@/types';

export type WsEnv = 'vts' | 'prod';

// 모의(vts): 승인 도메인 29443 / WS 31000. 실전(prod): 9443 / 21000.
const ENDPOINTS: Record<WsEnv, { approval: string; ws: string }> = {
  vts: { approval: 'https://openapivts.koreainvestment.com:29443', ws: 'ws://ops.koreainvestment.com:31000' },
  prod: { approval: 'https://openapi.koreainvestment.com:9443', ws: 'ws://ops.koreainvestment.com:21000' },
};

const TR_IDS = ['H0STCNT0', 'H0STASP0'] as const; // 체결가 + 호가

export interface KisRealtimeHandlers {
  onTick: (t: RealtimeTick) => void;
  onOrderbook: (o: RealtimeOrderbook) => void;
  onStatus: (connected: boolean) => void;
}

/** WS 접속키 발급 (REST 토큰과 별개). 만료 시 재발급. */
export async function fetchApprovalKey(env: WsEnv, appKey: string, appSecret: string): Promise<string> {
  const res = await fetch(`${ENDPOINTS[env].approval}/oauth2/Approval`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ grant_type: 'client_credentials', appkey: appKey, secretkey: appSecret }),
  });
  if (!res.ok) throw new Error(`approval_key 발급 실패: HTTP ${res.status}`);
  const j = (await res.json()) as { approval_key?: string };
  if (!j.approval_key) throw new Error('approval_key 응답 없음');
  return j.approval_key;
}

export class KisRealtimeClient {
  private ws: WebSocket | null = null;
  private approvalKey = '';
  private subscribed = new Set<string>(); // 현재 KIS에 등록된 종목
  private desired = new Set<string>(); // 목표 종목(≤5)
  private reconnectMs = 1_000;
  private closedByUs = false;

  constructor(
    private env: WsEnv,
    private appKey: string,
    private appSecret: string,
    private handlers: KisRealtimeHandlers,
  ) {}

  async start(): Promise<void> {
    this.closedByUs = false;
    await this.connect();
  }

  stop(): void {
    this.closedByUs = true;
    this.ws?.close();
    this.ws = null;
    this.subscribed.clear();
  }

  /** 목표 구독 집합 갱신 — 연결돼 있으면 즉시 diff 반영 */
  setTickers(tickers: string[]): void {
    this.desired = new Set(tickers.filter((t) => /^\d{6}$/.test(t)).slice(0, 5));
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.reconcile();
  }

  private async connect(): Promise<void> {
    try {
      this.approvalKey = await fetchApprovalKey(this.env, this.appKey, this.appSecret);
    } catch {
      this.handlers.onStatus(false);
      return this.scheduleReconnect();
    }
    const ws = new WebSocket(ENDPOINTS[this.env].ws);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectMs = 1_000;
      this.handlers.onStatus(true);
      this.subscribed.clear();
      this.reconcile(); // 재연결 시 목표 집합 재구독
    };
    ws.onmessage = (ev) => this.onMessage(typeof ev.data === 'string' ? ev.data : String(ev.data));
    ws.onerror = () => {
      /* onclose에서 재연결 처리 */
    };
    ws.onclose = () => {
      this.handlers.onStatus(false);
      this.ws = null;
      if (!this.closedByUs) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.closedByUs) return;
    const delay = this.reconnectMs;
    this.reconnectMs = Math.min(this.reconnectMs * 2, 30_000); // 지수 백오프 (최대 30s)
    setTimeout(() => this.connect(), delay);
  }

  private onMessage(raw: string): void {
    const frame = parseFrame(raw, new Date().toISOString());
    if (frame.kind === 'pingpong') {
      this.ws?.send(raw); // heartbeat echo
      return;
    }
    if (frame.kind === 'tick' && frame.tick) this.handlers.onTick(frame.tick);
    else if (frame.kind === 'orderbook' && frame.orderbook) this.handlers.onOrderbook(frame.orderbook);
    // control/unknown 은 무시
  }

  /** 목표(desired)와 실제(subscribed) 차이만큼 KIS에 구독/해지 전송 */
  private reconcile(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    for (const t of this.desired) {
      if (!this.subscribed.has(t)) {
        for (const tr of TR_IDS) this.ws.send(buildSubscribeFrame(this.approvalKey, tr, t, true));
        this.subscribed.add(t);
      }
    }
    for (const t of [...this.subscribed]) {
      if (!this.desired.has(t)) {
        for (const tr of TR_IDS) this.ws.send(buildSubscribeFrame(this.approvalKey, tr, t, false));
        this.subscribed.delete(t);
      }
    }
  }
}
