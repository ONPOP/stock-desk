// DART 기업설명회(IR)개최(안내공시) 원문 파싱 → 미래 실적발표 예정일.
// list.json은 접수일(과거)만 주므로, IR 개최 공시의 원문(document.xml)에서
// "일시" 필드(개최 예정일)와 "개최목적"을 추출한다.
import { unzipSync, strFromU8 } from 'fflate';
import type { DartClient } from '@/lib/providers/dart/client';

export interface IrInfo {
  /** 개최 예정일 YYYY-MM-DD (파싱 실패 시 null) */
  date: string | null;
  /** 개최목적 텍스트 (예: "2026년 1분기 경영실적 발표") */
  purpose: string;
}

/** IR 개최 공시인지 보고서명으로 판별 */
export function isIrOpenReport(reportNm: string): boolean {
  return /기업설명회\(IR\)개최/.test(reportNm.replace(/\s/g, ''));
}

/**
 * IR 개최 공시 원문(XML/HTML)에서 개최 예정일·목적 추출.
 * 표준 서식: "1. 일시 및 장소  일시 2026-06-23 10:00  ...  3. 개최목적 <목적>  4. 개최방법 …"
 */
export function parseIrDocument(xml: string): IrInfo {
  const plain = xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ');
  // "일시" 라벨 뒤의 날짜(첫 "일시 및 장소" 헤더는 날짜가 없어 건너뜀)
  const dateM = /일\s*시\s*(\d{4}-\d{2}-\d{2})/.exec(plain);
  // "개최목적" ~ 다음 번호 항목("4. " 등) 사이
  const purposeM = /개최\s*목적\s*(.+?)\s*[1-9]\s*\.\s/.exec(plain);
  return {
    date: dateM?.[1] ?? null,
    purpose: (purposeM?.[1] ?? '').trim(),
  };
}

/** IR 개최 공시 rcept_no로 원문을 받아 예정일·목적 파싱 */
export async function fetchIrInfo(client: DartClient, rceptNo: string): Promise<IrInfo> {
  const buf = await client.getBuffer('document.xml', { rcept_no: rceptNo });
  const files = unzipSync(new Uint8Array(buf));
  const name = Object.keys(files)[0];
  if (!name) return { date: null, purpose: '' };
  return parseIrDocument(strFromU8(files[name]));
}
