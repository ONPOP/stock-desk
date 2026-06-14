// DART 재무 지표 (F4) — fnlttSinglAcnt.json 주요계정.
// 최근 사업보고서 1회 호출로 당기/전기/전전기 3개 연도 매출·영익·순익·부채비율을 추출.
// PER/PBR/EPS/시총/배당수익률은 DART가 제공하지 않으므로 KIS 시세지표로 보강(fundamentals-source).
import Decimal from 'decimal.js';
import type { StockMetrics } from '@/types';
import { DartClient, DartNoDataError } from '@/lib/providers/dart/client';

interface DartAcntItem {
  fs_div?: string; // OFS(개별)/CFS(연결)
  sj_div?: string; // BS/IS/CIS/CF
  account_nm?: string;
  thstrm_amount?: string; // 당기
  frmtrm_amount?: string; // 전기
  bfefrmtrm_amount?: string; // 전전기
}

interface DartAcntResponse {
  status?: string;
  list?: DartAcntItem[];
}

/** 콤마 포함 금액 문자열 → 정수(원). 빈값/'-'/비수치는 null. */
export function parseDartAmount(raw: string | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).replace(/,/g, '').trim();
  if (s === '' || s === '-') return null;
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

const REPRT_ANNUAL = '11011'; // 사업보고서

/** 연결(CFS) 우선, 없으면 개별(OFS)에서 계정 금액 3개 연도 추출 */
function pickAccount(list: DartAcntItem[], match: (nm: string) => boolean): [number | null, number | null, number | null] {
  const candidates = list.filter((it) => it.account_nm && match(it.account_nm.replace(/\s/g, '')));
  const cfs = candidates.find((it) => it.fs_div === 'CFS') ?? candidates[0];
  if (!cfs) return [null, null, null];
  return [parseDartAmount(cfs.thstrm_amount), parseDartAmount(cfs.frmtrm_amount), parseDartAmount(cfs.bfefrmtrm_amount)];
}

function debtRatio(liabilities: number | null, equity: number | null): number | null {
  if (liabilities === null || equity === null || equity === 0) return null;
  return new Decimal(liabilities).div(equity).mul(100).toDecimalPlaces(2).toNumber();
}

/**
 * @param baseYear 가장 최근 확정 사업연도. 미지정 시 (현재연도-1). 013(데이터 없음)이면 한 해 더 과거로 1회 재시도.
 */
export async function getDartMetrics(
  client: DartClient,
  corpCode: string,
  opts?: { baseYear?: number },
): Promise<StockMetrics[]> {
  const baseYear = opts?.baseYear ?? new Date().getUTCFullYear() - 1;
  let data: DartAcntResponse | null = null;
  let usedYear = baseYear;
  for (const year of [baseYear, baseYear - 1]) {
    try {
      data = await client.getJson<DartAcntResponse>('fnlttSinglAcnt.json', {
        corp_code: corpCode,
        bsns_year: String(year),
        reprt_code: REPRT_ANNUAL,
      });
      usedYear = year;
      break;
    } catch (e) {
      if (e instanceof DartNoDataError) continue;
      throw e;
    }
  }
  if (!data) return [];
  const list = data.list ?? [];

  const revenue = pickAccount(list, (nm) => nm === '매출액' || nm.includes('매출액') || nm.includes('수익(매출액)'));
  const opIncome = pickAccount(list, (nm) => nm === '영업이익' || nm === '영업이익(손실)');
  const netIncome = pickAccount(list, (nm) => nm === '당기순이익' || nm.includes('당기순이익'));
  const liabilities = pickAccount(list, (nm) => nm === '부채총계');
  const equity = pickAccount(list, (nm) => nm === '자본총계');

  // [당기, 전기, 전전기] → 연도 [usedYear, usedYear-1, usedYear-2]
  const rows: StockMetrics[] = [];
  for (let i = 0; i < 3; i++) {
    const year = usedYear - i;
    const rev = revenue[i];
    const op = opIncome[i];
    const net = netIncome[i];
    const liab = liabilities[i];
    const eq = equity[i];
    // 셋 다 없으면 해당 연도 데이터 미존재로 간주, 건너뜀
    if (rev === null && op === null && net === null) continue;
    rows.push({
      marketCap: null,
      per: null,
      pbr: null,
      roe: null,
      eps: null,
      revenueQ: rev,
      operatingIncomeQ: op,
      netIncomeQ: net,
      capex: null, // 현금흐름표 별도 — V1+
      debtRatio: debtRatio(liab, eq),
      dividendYield: null,
      fiscalQuarter: `${year}`,
      asOfDate: `${year}-12-31`,
      source: 'dart',
    });
  }
  return rows;
}
