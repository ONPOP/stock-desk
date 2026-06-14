// DART corp_code 매핑 — corpCode.xml(zip) 다운로드 → 상장사 종목코드↔고유번호 매핑.
// sync:corp-codes 스크립트에서 사용. 상장사(stock_code 6자리)만 추출.
import { unzipSync, strFromU8 } from 'fflate';
import { ExternalApiError } from '@/lib/errors';
import { DartClient } from '@/lib/providers/dart/client';

export interface CorpCodeEntry {
  corpCode: string; // 8자리 고유번호
  stockCode: string; // 6자리 종목코드
  corpName: string;
}

/**
 * CORPCODE.xml 본문 파싱. 정규식 기반(수만 건, 의존성 최소화).
 * stock_code가 6자리 숫자인 상장사만 반환.
 */
export function parseCorpCodeXml(xml: string): CorpCodeEntry[] {
  const out: CorpCodeEntry[] = [];
  const re = /<list>([\s\S]*?)<\/list>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const corpCode = extractTag(block, 'corp_code');
    const stockCode = extractTag(block, 'stock_code');
    const corpName = extractTag(block, 'corp_name');
    if (corpCode && /^\d{6}$/.test(stockCode)) {
      out.push({ corpCode, stockCode, corpName });
    }
  }
  return out;
}

function extractTag(block: string, tag: string): string {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
  return (m?.[1] ?? '').trim();
}

/** DART에서 corpCode.xml(zip) 받아 압축 해제 후 파싱. */
export async function fetchCorpCodeMap(client: DartClient): Promise<CorpCodeEntry[]> {
  const buf = await client.getBuffer('corpCode.xml', {});
  // 무효 키 등으로 DART가 zip 대신 에러 본문(XML/JSON)을 200으로 반환하면 unzip이 실패한다.
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buf));
  } catch {
    const head = strFromU8(new Uint8Array(buf).slice(0, 200), true);
    throw new ExternalApiError(
      'dart',
      'DART corpCode 다운로드에 실패했습니다. 인증키가 유효한지 확인해주세요.',
      `not a zip — head: ${head}`,
    );
  }
  const entry = Object.keys(files).find((n) => n.toUpperCase().endsWith('.XML'));
  if (!entry) throw new ExternalApiError('dart', 'corpCode.xml 형식이 올바르지 않습니다.', 'no xml in zip');
  return parseCorpCodeXml(strFromU8(files[entry]));
}
