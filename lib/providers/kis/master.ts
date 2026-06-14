// KIS 종목마스터 파일 다운로드·파싱 — 종목검색의 데이터 소스 (PRD 10장: "KIS 종목마스터 기반")
// 마스터 파일은 인증 불필요한 공개 zip. EUC-KR 인코딩 고정폭/탭 구분 텍스트.
import { unzipSync } from 'fflate';
import { ExternalApiError } from '@/lib/errors';
import type { Market, StockSearchResult } from '@/types';

const MASTER_BASE = 'https://new.real.download.dws.co.kr/common/master';

const DOMESTIC_FILES: Record<'KOSPI' | 'KOSDAQ', string> = {
  KOSPI: 'kospi_code.mst.zip',
  KOSDAQ: 'kosdaq_code.mst.zip',
};

const OVERSEAS_FILES: Record<'NASDAQ' | 'NYSE' | 'AMEX', string> = {
  NASDAQ: 'nasmst.cod.zip',
  NYSE: 'nysmst.cod.zip',
  AMEX: 'amsmst.cod.zip',
};

async function downloadAndUnzip(fileName: string): Promise<Uint8Array> {
  const res = await fetch(`${MASTER_BASE}/${fileName}`);
  if (!res.ok) {
    throw new ExternalApiError('kis', '종목마스터 파일을 내려받지 못했습니다.', `${fileName}: HTTP ${res.status}`);
  }
  const zipped = new Uint8Array(await res.arrayBuffer());
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zipped);
  } catch (e) {
    throw new ExternalApiError('kis', '종목마스터 파일 압축 해제에 실패했습니다.', `${fileName}: ${String(e)}`);
  }
  const first = Object.values(entries)[0];
  if (!first || first.length === 0) {
    throw new ExternalApiError('kis', '종목마스터 파일이 비어 있습니다.', fileName);
  }
  return first;
}

/**
 * 국내 마스터(.mst) 파싱 — 각 행의 뒤 228바이트는 고정폭 수치부,
 * 앞부분은 [단축코드 9][표준코드 12][한글명 …] 구조 (KIS 공식 샘플 코드 기준)
 */
export function parseDomesticMaster(buf: Uint8Array, market: 'KOSPI' | 'KOSDAQ'): StockSearchResult[] {
  const TAIL = 228;
  const results: StockSearchResult[] = [];
  const decoder = new TextDecoder('euc-kr');
  // 줄 단위 분리 (LF=10)
  let start = 0;
  for (let i = 0; i <= buf.length; i++) {
    if (i === buf.length || buf[i] === 10) {
      let end = i;
      if (end > start && buf[end - 1] === 13) end--; // CR 제거
      const line = buf.subarray(start, end);
      start = i + 1;
      if (line.length <= TAIL) continue;
      const head = line.subarray(0, line.length - TAIL);
      const headText = decoder.decode(head);
      // headText: 단축코드(9) + 표준코드(12) + 한글명 — 바이트가 아닌 문자 기준이 아니므로
      // 단축코드/표준코드는 ASCII라 문자 인덱스와 바이트 인덱스가 일치
      const shortCode = headText.slice(0, 9).trim();
      const nameKr = headText.slice(21).trim();
      if (!/^\d{6}$/.test(shortCode)) continue; // ETN·ELW 등 비표준 코드 제외
      if (!nameKr) continue;
      results.push({ ticker: shortCode, name_kr: nameKr, name_en: null, market, currency: 'KRW' });
    }
  }
  if (results.length === 0) {
    throw new ExternalApiError('kis', '종목마스터 파싱 결과가 비어 있습니다.', `${market} master parse`);
  }
  return results;
}

/**
 * 해외 마스터(.cod) 파싱 — 탭 구분. 컬럼: [4]=심볼, [6]=한글명, [7]=영문명,
 * [8]=증권유형(2=주식, 3=ETP), [9]=통화
 */
export function parseOverseasMaster(buf: Uint8Array, market: 'NASDAQ' | 'NYSE' | 'AMEX'): StockSearchResult[] {
  const text = new TextDecoder('euc-kr').decode(buf);
  const results: StockSearchResult[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line) continue;
    const cols = line.split('\t');
    if (cols.length < 10) continue;
    const symbol = cols[4]?.trim();
    const nameKr = cols[6]?.trim() || null;
    const nameEn = cols[7]?.trim() || null;
    const secType = cols[8]?.trim();
    if (!symbol || !/^[A-Z][A-Z0-9.\-]{0,15}$/.test(symbol)) continue;
    if (secType !== '2' && secType !== '3') continue; // 주식·ETP만
    results.push({ ticker: symbol, name_kr: nameKr, name_en: nameEn, market, currency: 'USD' });
  }
  if (results.length === 0) {
    throw new ExternalApiError('kis', '해외 종목마스터 파싱 결과가 비어 있습니다.', `${market} master parse`);
  }
  return results;
}

export async function fetchMaster(market: Market): Promise<StockSearchResult[]> {
  if (market === 'KOSPI' || market === 'KOSDAQ') {
    return parseDomesticMaster(await downloadAndUnzip(DOMESTIC_FILES[market]), market);
  }
  return parseOverseasMaster(await downloadAndUnzip(OVERSEAS_FILES[market]), market);
}

export async function fetchAllMasters(): Promise<StockSearchResult[]> {
  const markets: Market[] = ['KOSPI', 'KOSDAQ', 'NASDAQ', 'NYSE', 'AMEX'];
  const all: StockSearchResult[] = [];
  for (const m of markets) {
    all.push(...await fetchMaster(m));
  }
  return all;
}
