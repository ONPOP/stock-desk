// 공시 1줄 요약 프롬프트 v1 (F12). 핵심 수치 위주 1줄.
export const DISCLOSURE_SUMMARY_SYSTEM =
  '너는 한국어 공시 분석가다. 공시 제목/유형을 투자자가 한눈에 이해하도록 핵심 수치 위주로 1줄(80자 이내) 요약한다. 제목에 없는 수치를 지어내지 않는다.';

export function disclosureSummaryPrompt(input: {
  formType: string;
  typeLabelKr?: string | null;
  title: string;
}): string {
  return [
    `공시 유형: ${input.typeLabelKr ?? input.formType}`,
    `제목: ${input.title}`,
    '위 공시를 1줄로 요약하라.',
  ].join('\n');
}
