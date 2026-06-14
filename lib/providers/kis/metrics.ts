// KIS 국내 시세지표 (F4 보강) — inquire-price output의 PER/PBR/EPS/시가총액.
// DART는 재무(매출·영익·순익)만 제공하므로 시세 기반 밸류에이션 지표를 KIS에서 보강한다.
import { ExternalApiError } from '@/lib/errors';
import type { KisClient } from '@/lib/providers/kis/client';

export interface KisDomesticMetrics {
  per: number | null;
  pbr: number | null;
  eps: number | null;
  /** 시가총액 (원) */
  marketCap: number | null;
}

interface PriceOutput {
  per?: string;
  pbr?: string;
  eps?: string;
  hts_avls?: string; // HTS 시가총액 (억원)
}

function numOrNull(raw: string | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return n === 0 ? null : n; // 0 = 미산출(적자 등)로 간주
}

export async function getKisDomesticMetrics(client: KisClient, ticker: string): Promise<KisDomesticMetrics> {
  if (!/^\d{6}$/.test(ticker)) {
    throw new ExternalApiError('kis', '국내 종목코드는 6자리 숫자여야 합니다.', `invalid ticker: ${ticker}`);
  }
  const data = await client.request<{ output?: PriceOutput }>({
    path: '/uapi/domestic-stock/v1/quotations/inquire-price',
    trId: 'FHKST01010100',
    params: { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: ticker },
  });
  const out = data.output ?? {};
  const avlsEok = numOrNull(out.hts_avls); // 억원
  return {
    per: numOrNull(out.per),
    pbr: numOrNull(out.pbr),
    eps: numOrNull(out.eps),
    marketCap: avlsEok === null ? null : Math.round(avlsEok * 1e8),
  };
}
