// KIS OpenAPI 검증 스크립트 — W1 최우선 리스크 (PRD 부록 A)
// 실행: npm run verify:kis
// 검증 항목: ① 토큰 발급 ② 국내 시세 ③ 해외(미국) 시세 + 실시간/지연 판별 ④ 국내·해외 캔들
// 주의: 키 값은 절대 출력하지 않는다 (마스킹만)
import './_bootstrap';

import { KisClient } from '../lib/providers/kis/client';
import { getCandles } from '../lib/providers/kis/candle';
import { getDomesticQuote, getOverseasQuote } from '../lib/providers/kis/quote';
import { formatMoney } from '../lib/utils/money';
import { maskSecret } from './mask';

async function main() {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) {
    console.error('❌ KIS_APP_KEY / KIS_APP_SECRET 환경변수가 없습니다. .env.local을 확인하세요.');
    process.exit(1);
  }
  console.log(`🔑 앱키: ${maskSecret(appKey)}\n`);

  const client = new KisClient({ appKey, appSecret });
  const report: string[] = [];

  // ① 토큰 발급
  try {
    const token = await client.getAccessToken();
    report.push(`✅ ① 토큰 발급 성공 (${maskSecret(token)})`);
  } catch (e) {
    report.push(`❌ ① 토큰 발급 실패: ${e instanceof Error ? e.message : String(e)}`);
    console.log(report.join('\n'));
    process.exit(1);
  }

  // ② 국내 시세 (삼성전자)
  try {
    const q = await getDomesticQuote(client, '005930');
    report.push(`✅ ② 국내 시세: 삼성전자 ${formatMoney(q.price, 'KRW')} (${q.changeRate}%) 거래량 ${q.volume.toLocaleString()}`);
  } catch (e) {
    report.push(`❌ ② 국내 시세 실패: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ③ 해외 시세 (AAPL) + 실시간/지연 판별
  try {
    const raw = await client.request<{ output?: Record<string, string> }>({
      path: '/uapi/overseas-price/v1/quotations/price',
      trId: 'HHDFS00000300',
      params: { AUTH: '', EXCD: 'NAS', SYMB: 'AAPL' },
    });
    const q = await getOverseasQuote(client, 'AAPL', 'NASDAQ');
    const rsym = raw.output?.rsym ?? '';
    // rsym 첫 글자: D=지연(Delayed), R=실시간(Realtime) — KIS 실시간조회심볼 규칙
    const rt = rsym.startsWith('R') ? '실시간' : rsym.startsWith('D') ? '지연(15분)' : `판별 불가(rsym=${rsym})`;
    report.push(`✅ ③ 해외 시세: AAPL ${formatMoney(q.price, 'USD')} (${q.changeRate}%)`);
    report.push(`   └ 시세 구분: ${rt}  [rsym=${rsym}]`);
    if (!rsym.startsWith('R')) {
      report.push('   ⚠ 지연시세입니다. KIS Developers(apiportal.koreainvestment.com) → 마이페이지 →');
      report.push('     "해외주식 실시간시세 신청"(무료, 나스닥·뉴욕 기본시세)을 신청하면 실시간 전환됩니다.');
    }
  } catch (e) {
    report.push(`❌ ③ 해외 시세 실패: ${e instanceof Error ? e.message : String(e)}`);
    report.push('   ⚠ 해외주식 시세 권한 미신청일 수 있습니다. KIS Developers에서 해외시세 신청을 확인하세요.');
  }

  // ④ 캔들 조회
  try {
    const kr = await getCandles(client, '005930', 'KOSPI', '1d', 5);
    report.push(`✅ ④-1 국내 일봉 5건: ${kr.map((c) => `${c.ts.slice(0, 10)} ${formatMoney(c.c, 'KRW')}`).join(' · ')}`);
  } catch (e) {
    report.push(`❌ ④-1 국내 캔들 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    const us = await getCandles(client, 'AAPL', 'NASDAQ', '1d', 5);
    report.push(`✅ ④-2 해외 일봉 5건: ${us.map((c) => `${c.ts.slice(0, 10)} ${formatMoney(c.c, 'USD')}`).join(' · ')}`);
  } catch (e) {
    report.push(`❌ ④-2 해외 캔들 실패: ${e instanceof Error ? e.message : String(e)}`);
  }

  console.log(report.join('\n'));
  const failed = report.some((l) => l.startsWith('❌'));
  process.exit(failed ? 1 : 0);
}

main();
