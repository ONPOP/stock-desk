// KIS 실시간 프레임 파서 — 순수 함수로 분리해 단위 테스트로 검증(휴장·데스크톱 미가동 시에도).
// 데이터 프레임 형식: `<암호화플래그>|<TR_ID>|<건수>|<필드^필드^…>` (여러 건이면 필드가 이어 붙음).
// 참고: 필드 인덱스는 KIS 공식 H0STCNT0/H0STASP0 레이아웃 기준(배포 전 apiportal 최종 대조 권장).

import type { RealtimeTick, RealtimeOrderbook } from '@/types';

export interface ParsedFrame {
  kind: 'pingpong' | 'control' | 'tick' | 'orderbook' | 'unknown';
  trId?: string;
  tick?: RealtimeTick;
  orderbook?: RealtimeOrderbook;
  raw: string;
}

const SIGN_NEG = new Set(['4', '5']); // 4=하한 5=하락 → 음수

/** 등락 부호(PRDY_VRSS_SIGN) 적용해 전일대비를 부호 있는 정수로 */
function signedChange(sign: string, absChange: string): number {
  const n = Math.abs(Math.trunc(Number(absChange) || 0));
  return SIGN_NEG.has(sign) ? -n : n;
}

/** H0STCNT0 체결가 필드 → RealtimeTick. asOf는 주입(테스트 결정성) */
export function parseTradeFields(f: string[], asOf: string): RealtimeTick | null {
  if (f.length < 14 || !/^\d{6}$/.test(f[0])) return null;
  return {
    ticker: f[0],
    cntgTime: f[1],
    price: Math.trunc(Number(f[2]) || 0),
    change: signedChange(f[3], f[4]),
    changeRate: f[5] ?? '0',
    volume: Math.trunc(Number(f[13]) || 0),
    asOf,
  };
}

/** H0STASP0 호가 필드 → RealtimeOrderbook. 매도/매수 10단 + 총잔량 */
export function parseAskingFields(f: string[], asOf: string): RealtimeOrderbook | null {
  if (f.length < 45 || !/^\d{6}$/.test(f[0])) return null;
  // 3~12: 매도호가1~10, 13~22: 매수호가1~10, 23~32: 매도잔량1~10, 33~42: 매수잔량1~10
  const asks = [];
  const bids = [];
  for (let i = 0; i < 10; i++) {
    const askP = Math.trunc(Number(f[3 + i]) || 0);
    const askQ = Math.trunc(Number(f[23 + i]) || 0);
    const bidP = Math.trunc(Number(f[13 + i]) || 0);
    const bidQ = Math.trunc(Number(f[33 + i]) || 0);
    if (askP > 0) asks.push({ price: askP, qty: askQ });
    if (bidP > 0) bids.push({ price: bidP, qty: bidQ });
  }
  return {
    ticker: f[0],
    asks,
    bids,
    totalAskQty: Math.trunc(Number(f[43]) || 0),
    totalBidQty: Math.trunc(Number(f[44]) || 0),
    asOf,
  };
}

/**
 * KIS가 보낸 원시 텍스트 프레임 1건 파싱.
 * - JSON(`{`로 시작): PINGPONG 또는 구독 응답(control)
 * - 데이터(`0|`/`1|`): 체결가·호가. 암호화(`1`) 프레임은 이 설계(모의 시세)에서 미사용 → unknown 처리.
 */
export function parseFrame(raw: string, asOf: string): ParsedFrame {
  if (raw.startsWith('{')) {
    try {
      const j = JSON.parse(raw);
      const trId = j?.header?.tr_id;
      if (trId === 'PINGPONG') return { kind: 'pingpong', trId, raw };
      return { kind: 'control', trId, raw };
    } catch {
      return { kind: 'unknown', raw };
    }
  }
  const bar = raw.split('|');
  if (bar.length < 4) return { kind: 'unknown', raw };
  const [enc, trId, , payload] = bar;
  if (enc !== '0') return { kind: 'unknown', trId, raw }; // 암호화 프레임(체결통보 등) 미지원
  const f = payload.split('^');
  if (trId === 'H0STCNT0') {
    const tick = parseTradeFields(f, asOf);
    return tick ? { kind: 'tick', trId, tick, raw } : { kind: 'unknown', trId, raw };
  }
  if (trId === 'H0STASP0') {
    const ob = parseAskingFields(f, asOf);
    return ob ? { kind: 'orderbook', trId, orderbook: ob, raw } : { kind: 'unknown', trId, raw };
  }
  return { kind: 'unknown', trId, raw };
}

/** 구독/해지 요청 프레임(JSON) 생성. tr_type: '1'=구독 '2'=해지 */
export function buildSubscribeFrame(
  approvalKey: string,
  trId: string,
  trKey: string,
  subscribe: boolean,
): string {
  return JSON.stringify({
    header: {
      approval_key: approvalKey,
      custtype: 'P',
      tr_type: subscribe ? '1' : '2',
      'content-type': 'utf-8',
    },
    body: { input: { tr_id: trId, tr_key: trKey } },
  });
}
