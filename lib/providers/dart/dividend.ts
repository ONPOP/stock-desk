// DART 배당 (F15) — alotMatter.json "배당에 관한 사항".
// 주당 현금배당금·현금배당수익률을 당기/전기/전전기 3개 연도로 추출. 한국은 대부분 연 1회.
// 배당락일/지급일은 alotMatter에 없어 null(별도 공시 필요 — V1+).
import type { DividendInfo } from '@/types';
import { DartClient, DartNoDataError } from '@/lib/providers/dart/client';

interface DartAlotItem {
  se?: string; // 구분
  stock_knd?: string; // 주식종류 (보통주/우선주)
  thstrm?: string;
  frmtrm?: string;
  lwfr?: string;
}

interface DartAlotResponse {
  status?: string;
  list?: DartAlotItem[];
}

/** 콤마/소수 포함 비율·수치 문자열 → number. 빈값/'-'는 null. */
function parseDecimal(raw: string | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).replace(/,/g, '').trim();
  if (s === '' || s === '-') return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

const REPRT_ANNUAL = '11011';

function isCommonStock(stockKnd: string | undefined): boolean {
  // 미지정이거나 보통주만 채택(우선주 배당은 제외해 단일 시계열 유지)
  if (!stockKnd) return true;
  return /보통주/.test(stockKnd);
}

export async function getDartDividends(
  client: DartClient,
  corpCode: string,
  opts?: { baseYear?: number },
): Promise<DividendInfo[]> {
  const baseYear = opts?.baseYear ?? new Date().getUTCFullYear() - 1;
  let data: DartAlotResponse | null = null;
  let usedYear = baseYear;
  for (const year of [baseYear, baseYear - 1]) {
    try {
      data = await client.getJson<DartAlotResponse>('alotMatter.json', {
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
  const list = (data.list ?? []).filter((it) => isCommonStock(it.stock_knd));

  const dpsRow = list.find((it) => {
    const se = (it.se ?? '').replace(/\s/g, '');
    return se.includes('주당') && se.includes('현금배당금');
  });
  const yieldRow = list.find((it) => {
    const se = (it.se ?? '').replace(/\s/g, '');
    return se.includes('현금배당수익률');
  });
  if (!dpsRow && !yieldRow) return [];

  const dpsByYear = [parseDecimal(dpsRow?.thstrm), parseDecimal(dpsRow?.frmtrm), parseDecimal(dpsRow?.lwfr)];
  const yieldByYear = [parseDecimal(yieldRow?.thstrm), parseDecimal(yieldRow?.frmtrm), parseDecimal(yieldRow?.lwfr)];

  const rows: DividendInfo[] = [];
  for (let i = 0; i < 3; i++) {
    const dps = dpsByYear[i];
    const y = yieldByYear[i];
    if (dps === null && y === null) continue;
    rows.push({
      fiscalYear: usedYear - i,
      dps,
      frequency: 'annual',
      exDate: null,
      payDate: null,
      yieldAtRecord: y,
      source: 'dart',
    });
  }
  return rows;
}

export { parseDecimal as _parseDecimal };
