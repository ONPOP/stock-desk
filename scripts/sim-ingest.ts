// 모의투자 테스트용 과거 일봉 수집 (요구 1·6) — sim_candles 동결 저장.
// 1회 실행: npm run sim:ingest  (이후 동결, 실시간 학습 없음)
//
// 소스 우선순위: KIS(앱 검증 소스, 해외 일봉 페이지네이션) → Yahoo 폴백.
//   Yahoo 비공식 API는 데이터센터/일부 IP를 429로 차단하므로 대량 수집엔 KIS가 안정적이다.
//   환경변수 SIM_SOURCE=yahoo|kis 로 강제 지정 가능.
import './_bootstrap';

import { createDecipheriv } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { KisClient } from '../lib/providers/kis/client';
import { getCandles as getKisCandles } from '../lib/providers/kis/candle';
import { getCandles as getYahooCandles } from '../lib/providers/yahoo/quote';
import { SIM_STOCKS } from '../lib/sim/universe';
import type { Candle } from '../types';

const YEARS = 10;
const KIS_COUNT = 2000; // KIS getCandles 상한(≈8년)
const YAHOO_COUNT = 2600; // ≈10년 + 여유
const BATCH = 1000;
const RETRIES = 2;

// crypto.ts(server-only 모듈)와 동일한 AES-256-GCM 복호화 — 스크립트에서 DB 키를 직접 해석.
function decryptSecret(encoded: string): string {
  const [v, ivB64, tagB64, dataB64] = encoded.split('.');
  if (v !== 'v1') throw new Error('형식 불일치');
  const key = Buffer.from(process.env.APP_ENCRYPTION_KEY ?? '', 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

async function resolveKisClient(db: SupabaseClient): Promise<KisClient | null> {
  let appKey = process.env.KIS_APP_KEY;
  let appSecret = process.env.KIS_APP_SECRET;
  let origin = 'env';
  if (!appKey || !appSecret) {
    const { data } = await db
      .from('user_settings')
      .select('kis_app_key_enc, kis_app_secret_enc')
      .not('kis_app_key_enc', 'is', null)
      .limit(1);
    const row = data?.[0];
    if (row?.kis_app_key_enc && row?.kis_app_secret_enc && process.env.APP_ENCRYPTION_KEY) {
      try {
        appKey = decryptSecret(row.kis_app_key_enc);
        appSecret = decryptSecret(row.kis_app_secret_enc);
        origin = 'DB(복호화)';
      } catch (e) {
        console.warn(`⚠️ DB KIS 키 복호화 실패: ${(e as Error).message}`);
      }
    }
  }
  if (!appKey || !appSecret) return null;
  console.log(`🔑 KIS 키 출처: ${origin}`);
  return new KisClient({ appKey, appSecret });
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < RETRIES) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

const US_EXCHANGES: Array<'NASDAQ' | 'NYSE' | 'AMEX'> = ['NASDAQ', 'NYSE', 'AMEX'];

// KIS 해외는 거래소(EXCD)가 정확해야 데이터를 준다. 힌트 거래소부터 시도해 처음 데이터가 잡힌 곳을 채택.
async function fetchKisAnyExchange(
  client: KisClient,
  ticker: string,
  hint: 'NASDAQ' | 'NYSE' | 'AMEX',
): Promise<Candle[]> {
  const order = [hint, ...US_EXCHANGES.filter((m) => m !== hint)];
  for (const m of order) {
    try {
      const c = await getKisCandles(client, ticker, m, '1d', KIS_COUNT);
      if (c.length > 0) return c;
    } catch {
      // 다음 거래소 시도
    }
  }
  return [];
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('❌ Supabase 환경변수가 없습니다. .env.local을 확인하세요.');
    process.exit(1);
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const forced = (process.env.SIM_SOURCE ?? '').toLowerCase();
  const kis = forced === 'yahoo' ? null : await resolveKisClient(admin);
  const source: 'kis' | 'yahoo' = kis ? 'kis' : 'yahoo';
  console.log(`📡 수집 소스: ${source.toUpperCase()}${source === 'yahoo' ? ' (KIS 키 없음 — Yahoo 폴백)' : ''}\n`);

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - YEARS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const force = process.env.SIM_FORCE === '1';
  let ok = 0;
  let fail = 0;
  let skipped = 0;
  let totalRows = 0;

  for (const s of SIM_STOCKS) {
    try {
      // 이어받기: 이미 수집된 종목은 건너뜀 (SIM_FORCE=1 로 재수집)
      if (!force) {
        const { count } = await admin
          .from('sim_candles')
          .select('ticker', { count: 'exact', head: true })
          .eq('ticker', s.ticker);
        if ((count ?? 0) > 0) {
          skipped++;
          continue;
        }
      }
      const candles: Candle[] = await withRetry(s.ticker, () =>
        source === 'kis'
          ? fetchKisAnyExchange(kis!, s.ticker, s.market)
          : getYahooCandles(s.ticker, s.market, '1d', YAHOO_COUNT),
      );
      const rows = candles
        .map((c) => ({ ticker: s.ticker, ts: c.ts.slice(0, 10), o: c.o, h: c.h, l: c.l, c: c.c, volume: c.volume }))
        .filter((r) => r.ts >= cutoffStr);
      if (rows.length === 0) {
        console.warn(`⚠️ ${s.ticker} (${s.nameEn}): 수신 데이터 없음 — 건너뜀`);
        fail++;
        continue;
      }
      for (let i = 0; i < rows.length; i += BATCH) {
        const { error } = await admin
          .from('sim_candles')
          .upsert(rows.slice(i, i + BATCH), { onConflict: 'ticker,ts', ignoreDuplicates: false });
        if (error) throw new Error(error.message);
      }
      ok++;
      totalRows += rows.length;
      console.log(`✅ ${s.ticker.padEnd(6)} ${s.nameEn.padEnd(26)} ${String(rows.length).padStart(4)}일 (${rows[0].ts}~${rows[rows.length - 1].ts})`);
      if (source === 'yahoo') await new Promise((r) => setTimeout(r, 300)); // Yahoo 레이트리밋 완화
    } catch (e) {
      fail++;
      console.error(`❌ ${s.ticker}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\n수집 완료 — 성공 ${ok} · 건너뜀 ${skipped} · 실패 ${fail} · 총 ${totalRows.toLocaleString()}행`);
  if (ok === 0 && skipped === 0) process.exitCode = 1;
}

main();
