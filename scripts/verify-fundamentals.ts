// 펀더멘털 어댑터 실 API 검증 (W3) — EDGAR(무인증)·Finnhub·FMP·DART를 실제로 호출.
// 키는 .env.local의 환경변수에서 읽는다(검증 전용 — 앱 런타임은 설정 화면 DB 키 사용).
// 실행: npm run verify:fundamentals
import './_bootstrap';

import { EdgarClient } from '../lib/providers/edgar/client';
import { getEdgarDisclosures } from '../lib/providers/edgar/disclosure';
import { FinnhubClient } from '../lib/providers/finnhub/client';
import { getFinnhubMetrics } from '../lib/providers/finnhub/metrics';
import { FmpClient } from '../lib/providers/fmp/client';
import { getFmpDividends } from '../lib/providers/fmp/dividend';
import { DartClient } from '../lib/providers/dart/client';
import { fetchCorpCodeMap } from '../lib/providers/dart/corp-code';
import { getDartDisclosures } from '../lib/providers/dart/disclosure';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const US_TICKER = 'AAPL';

async function main() {
  console.log('— 펀더멘털 어댑터 실 API 검증 —\n');
  console.log(
    `[env] FINNHUB=${!!(process.env.FINNHUB_API_KEY || process.env.FINNHUB_KEY)} FMP=${!!(process.env.FMP_API_KEY || process.env.FMP_KEY)} DART=${!!process.env.DART_API_KEY}`,
  );

  // 1) SEC EDGAR (무인증)
  try {
    const d = await getEdgarDisclosures(new EdgarClient(), '0000320193', { limit: 3 });
    console.log(`✅ EDGAR(AAPL): 공시 ${d.length}건`);
    if (d[0]) console.log(`   최신: [${d[0].formType}] ${d[0].title} · ${d[0].filedAt.slice(0, 10)}`);
  } catch (e) {
    console.error(`❌ EDGAR: ${msg(e)}`);
  }

  // 2) Finnhub (env: FINNHUB_API_KEY | FINNHUB_KEY)
  const finnhubKey = process.env.FINNHUB_API_KEY || process.env.FINNHUB_KEY;
  if (finnhubKey) {
    try {
      const m = await getFinnhubMetrics(new FinnhubClient(finnhubKey), US_TICKER);
      console.log(`✅ Finnhub(AAPL): 지표 ${m.length}행`);
      if (m[0]) {
        console.log(
          `   최신(${m[0].fiscalQuarter ?? m[0].asOfDate}): 시총=${m[0].marketCap} PER=${m[0].per} PBR=${m[0].pbr} ROE=${m[0].roe} 분기매출(센트)=${m[0].revenueQ}`,
        );
      }
    } catch (e) {
      console.error(`❌ Finnhub: ${msg(e)}`);
    }
  } else {
    console.log('⏭️  Finnhub 키 없음 (env FINNHUB_API_KEY 또는 FINNHUB_KEY)');
  }

  // 3) FMP (env: FMP_API_KEY | FMP_KEY) — 무료티어 배당 엔드포인트 동작 확인
  const fmpKey = process.env.FMP_API_KEY || process.env.FMP_KEY;
  if (fmpKey) {
    try {
      const dv = await getFmpDividends(new FmpClient(fmpKey), US_TICKER);
      console.log(`✅ FMP(AAPL): 배당 이벤트 ${dv.length}건`);
      if (dv[0]) console.log(`   최신: ${dv[0].exDate} DPS=${dv[0].dps} 지급=${dv[0].payDate} 수익률=${dv[0].yieldAtRecord} 주기=${dv[0].frequency}`);
      else console.log('   (무배당 — 빈 응답)');
    } catch (e) {
      console.error(`❌ FMP: ${msg(e)}`);
    }
  } else {
    console.log('⏭️  FMP 키 없음 (env FMP_API_KEY 또는 FMP_KEY)');
  }

  // 4) DART (env: DART_API_KEY) — 키 있으면 corp_code 다운로드 + 삼성전자 공시 확인
  const dartKey = process.env.DART_API_KEY;
  if (dartKey) {
    try {
      const map = await fetchCorpCodeMap(new DartClient(dartKey));
      const samsung = map.find((e) => e.stockCode === '005930');
      console.log(`✅ DART corpCode: 상장사 ${map.length}건 (삼성전자 corp_code=${samsung?.corpCode})`);
      if (samsung) {
        const dis = await getDartDisclosures(new DartClient(dartKey), samsung.corpCode, { pageCount: 3 });
        console.log(`✅ DART(삼성전자): 공시 ${dis.length}건`);
        if (dis[0]) console.log(`   최신: [${dis[0].typeLabelKr ?? dis[0].formType}] ${dis[0].title}`);
      }
    } catch (e) {
      console.error(`❌ DART: ${msg(e)}`);
    }
  } else {
    console.log('⏭️  DART 키 없음 (env DART_API_KEY) — 발급 후 검증');
  }

  console.log('\n— 검증 종료 —');
}

// RateLimiter는 큐 대기 시 unref 타이머를 쓴다(서버에선 올바름). CLI에서는 동시 요청 중
// 첫 요청 완료 후 나머지가 큐 대기에 들어가면 ref 핸들이 사라져 Node가 조기 종료하므로,
// main 동안 ref 핸들을 유지한다.
const keepAlive = setInterval(() => {}, 2_147_483_647);
main().finally(() => clearInterval(keepAlive));
