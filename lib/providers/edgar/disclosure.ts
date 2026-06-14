// SEC EDGAR 공시 (F12) — submissions/CIK##########.json. 주요 양식만 필터.
import type { DisclosureItem } from '@/types';
import type { EdgarClient } from '@/lib/providers/edgar/client';
import { padCik } from '@/lib/providers/edgar/cik';

interface RecentFilings {
  accessionNumber?: string[];
  form?: string[];
  filingDate?: string[];
  primaryDocument?: string[];
  primaryDocDescription?: string[];
}
interface SubmissionsResponse {
  cik?: string | number;
  filings?: { recent?: RecentFilings };
}

/** PRD F12 주요 양식 → 한국어 라벨. 미지정 양식은 라벨 null(전체 피드엔 표시). */
const FORM_LABELS: Record<string, string> = {
  '8-K': '수시공시',
  '10-Q': '분기보고서',
  '10-K': '연차보고서',
  'S-1': '증권신고',
  '4': '내부자거래',
  '3': '내부자등록',
  '5': '내부자연간',
  'SC 13D': '대량보유',
  'SC 13G': '대량보유',
  'DEF 14A': '주주총회',
  '6-K': '수시공시',
  '20-F': '연차보고서',
};

/** 기본 수집 대상 양식 (주요 공시) */
const DEFAULT_FORMS = new Set(Object.keys(FORM_LABELS));

export function labelForForm(form: string): string | null {
  return FORM_LABELS[form.trim().toUpperCase()] ?? FORM_LABELS[form.trim()] ?? null;
}

/** 순수 변환: submissions → DisclosureItem[]. 주요 양식 필터 + 최신순 limit. */
export function buildEdgarDisclosures(
  resp: SubmissionsResponse,
  cikInput: string | number,
  opts?: { since?: string; limit?: number; forms?: Set<string> },
): DisclosureItem[] {
  const r = resp.filings?.recent;
  if (!r || !r.accessionNumber || !r.form) return [];
  const cikInt = String(Number(padCik(cikInput))); // 선행 0 제거 (URL용)
  const forms = opts?.forms ?? DEFAULT_FORMS;
  const limit = opts?.limit ?? 50;
  const since = opts?.since ?? null;

  const items: DisclosureItem[] = [];
  for (let i = 0; i < r.accessionNumber.length; i++) {
    const form = (r.form[i] ?? '').trim();
    if (!forms.has(form.toUpperCase()) && !forms.has(form)) continue;
    const filingDate = r.filingDate?.[i] ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filingDate)) continue;
    if (since && filingDate < since) continue;
    const accNo = r.accessionNumber[i] ?? '';
    const accNoDash = accNo.replace(/-/g, '');
    const primaryDoc = r.primaryDocument?.[i] ?? '';
    const desc = r.primaryDocDescription?.[i] ?? '';
    const url = primaryDoc
      ? `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accNoDash}/${primaryDoc}`
      : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cikInt}&type=${encodeURIComponent(form)}`;
    items.push({
      source: 'edgar',
      formType: form,
      typeLabelKr: labelForForm(form),
      title: desc ? `${form} — ${desc}` : form,
      filedAt: new Date(`${filingDate}T00:00:00Z`).toISOString(),
      url,
      summaryAi: null,
    });
  }
  items.sort((a, b) => b.filedAt.localeCompare(a.filedAt));
  return items.slice(0, limit);
}

export async function getEdgarDisclosures(
  client: EdgarClient,
  cik: string,
  opts?: { since?: string; limit?: number },
): Promise<DisclosureItem[]> {
  const padded = padCik(cik);
  const resp = await client.getJson<SubmissionsResponse>(`https://data.sec.gov/submissions/CIK${padded}.json`);
  return buildEdgarDisclosures(resp, cik, opts);
}
