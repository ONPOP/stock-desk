// DART 공시검색 (F12) — list.json. 종목 corp_code 기준 최근 공시 목록.
import type { DisclosureItem } from '@/types';
import { DartClient, DartNoDataError } from '@/lib/providers/dart/client';

interface DartListItem {
  corp_code: string;
  corp_name: string;
  stock_code: string;
  report_nm: string;
  rcept_no: string;
  flr_nm: string;
  rcept_dt: string; // YYYYMMDD (KST)
  rm?: string;
}

interface DartListResponse {
  status?: string;
  list?: DartListItem[];
}

/**
 * 보고서명 → 한국어 유형 라벨 (PRD F12 필터 기준).
 * 키워드 우선순위로 매칭, 미매칭은 null(전체 피드엔 표시).
 */
export function classifyDartReport(reportNm: string): string | null {
  const nm = reportNm.replace(/\s/g, '');
  if (/잠정실적|영업[(]?잠정[)]?|매출액또는손익구조/.test(nm)) return '잠정실적';
  if (/분기보고서|반기보고서|사업보고서/.test(nm)) return '정기보고서';
  if (/유상증자/.test(nm)) return '유상증자';
  if (/무상증자/.test(nm)) return '무상증자';
  if (/전환사채|신주인수권부사채|교환사채/.test(nm)) return '사채발행';
  if (/자기주식|자사주/.test(nm)) return '자기주식';
  if (/주식등의대량보유|대량보유상황|임원ㆍ주요주주특정증권/.test(nm)) return '지분변동';
  if (/주요사항보고서/.test(nm)) return '주요사항';
  if (/배당/.test(nm)) return '배당';
  if (/합병|분할|영업양수도/.test(nm)) return '구조변경';
  return null;
}

/** rcept_dt(YYYYMMDD, KST) → UTC ISO. DART는 날짜만 제공하므로 KST 자정 기준. */
export function dartDateToIso(rceptDt: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(rceptDt.trim());
  if (!m) throw new Error(`잘못된 접수일자: ${rceptDt}`);
  return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+09:00`).toISOString();
}

export async function getDartDisclosures(
  client: DartClient,
  corpCode: string,
  opts?: { since?: string; pageCount?: number },
): Promise<DisclosureItem[]> {
  // since 미지정 시 최근 1년. bgn_de는 필수.
  const since = opts?.since ?? defaultSince();
  let data: DartListResponse;
  try {
    data = await client.getJson<DartListResponse>('list.json', {
      corp_code: corpCode,
      bgn_de: since.replace(/-/g, ''),
      page_no: '1',
      page_count: String(opts?.pageCount ?? 50),
    });
  } catch (e) {
    if (e instanceof DartNoDataError) return [];
    throw e;
  }
  const list = data.list ?? [];
  return list.map((it) => ({
    source: 'dart' as const,
    formType: it.report_nm.trim(),
    typeLabelKr: classifyDartReport(it.report_nm),
    title: it.report_nm.trim(),
    filedAt: dartDateToIso(it.rcept_dt),
    url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${it.rcept_no}`,
    summaryAi: null,
  }));
}

/** 기본 조회 시작일 = 1년 전 (YYYY-MM-DD). */
function defaultSince(): string {
  const now = new Date();
  const y = now.getUTCFullYear() - 1;
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}
