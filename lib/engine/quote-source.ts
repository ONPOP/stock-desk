// 배치 엔진용 시세 소스 (D16) — lib/providers/quote-source.ts와 같은 우선순위(KIS → Yahoo)를 따르되
// server-only 의존(SupabaseTokenStore·crypto) 없이 구성한다. tsx로 실행되는 스크립트에서 쓰기 위함.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Candle, CandleInterval, Market } from '@/types';
import { decryptSecret } from '@/lib/utils/crypto-core';
import { KisClient } from '@/lib/providers/kis/client';
import { getCandles as kisGetCandles } from '@/lib/providers/kis/candle';
import { getCandles as yahooGetCandles } from '@/lib/providers/yahoo/quote';
import { ScriptKisTokenStore } from '@/lib/engine/kis-token-store';

/** KIS 일봉 조회 상한 */
const KIS_MAX_COUNT = 2_000;

export interface EngineQuoteSource {
  name: 'kis' | 'yahoo';
  getCandles(ticker: string, market: Market, interval: CandleInterval, count: number): Promise<Candle[]>;
}

/** 사용자 설정(암호화 컬럼) → 환경변수 순으로 KIS 자격증명을 찾는다. 값은 로그에 남기지 않는다 */
async function findKisCredentials(
  db: SupabaseClient,
  userId: string,
): Promise<{ appKey: string; appSecret: string } | null> {
  const { data } = await db
    .from('user_settings')
    .select('kis_app_key_enc, kis_app_secret_enc')
    .eq('user_id', userId)
    .maybeSingle();

  if (data?.kis_app_key_enc && data?.kis_app_secret_enc) {
    try {
      return {
        appKey: decryptSecret(data.kis_app_key_enc),
        appSecret: decryptSecret(data.kis_app_secret_enc),
      };
    } catch {
      // 복호화 실패(키 교체 등)는 env 폴백으로 넘긴다
    }
  }

  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  return appKey && appSecret ? { appKey, appSecret } : null;
}

/**
 * 시세 소스 결정. KIS 자격증명이 없거나 구성에 실패하면 Yahoo로 폴백한다
 * (시세가 아예 끊기는 것보다 낫다 — 기존 quote-source와 동일한 판단).
 */
export async function resolveEngineQuoteSource(
  db: SupabaseClient,
  userId: string,
): Promise<EngineQuoteSource> {
  const creds = await findKisCredentials(db, userId).catch(() => null);
  if (!creds) {
    return { name: 'yahoo', getCandles: yahooGetCandles };
  }

  const client = new KisClient(creds, { tokenStore: new ScriptKisTokenStore(db) });
  return {
    name: 'kis',
    getCandles: (ticker, market, interval, count) =>
      kisGetCandles(client, ticker, market, interval, Math.min(count, KIS_MAX_COUNT)),
  };
}
