// 데일리 브리핑 프롬프트 v1 (F1). 시장요약 + 주요이슈 + 일정 + 내 종목 이슈.
export interface BriefingContext {
  dateLabel: string; // YYYY-MM-DD (KST)
  indices: Array<{ label: string; value: number; changeRate: string; unit: string }>;
  watchlistNews: Array<{ ticker: string; name: string; headlines: string[] }>;
  events: Array<{ title: string; date: string }>;
}

export const BRIEFING_SYSTEM =
  '너는 한국어 투자 브리핑 작성자다. 주어진 데이터만 근거로 간결한 마크다운 브리핑을 작성한다. 데이터에 없는 수치·사실을 지어내지 않는다. 과장·투자 권유 표현을 피한다.';

export function briefingPrompt(ctx: BriefingContext): string {
  const indices = ctx.indices.length
    ? ctx.indices.map((i) => `- ${i.label}: ${i.value}${i.unit} (${i.changeRate}%)`).join('\n')
    : '- (지수 데이터 없음)';
  const news = ctx.watchlistNews.length
    ? ctx.watchlistNews.map((s) => `- ${s.name}(${s.ticker}): ${s.headlines.slice(0, 3).join(' / ') || '관련 뉴스 없음'}`).join('\n')
    : '- (등록 종목 없음)';
  const events = ctx.events.length ? ctx.events.map((e) => `- ${e.date} ${e.title}`).join('\n') : '- (일정 없음)';

  return `오늘 날짜: ${ctx.dateLabel}

[시장 지수]
${indices}

[내 종목 관련 헤드라인]
${news}

[오늘의 일정]
${events}

위 데이터로 다음 구조의 마크다운 브리핑을 작성하라:
## 시장 요약
(지수 등락 기반 2~3문장)
## 주요 이슈
(헤드라인 기반 핵심 3~5개 불릿)
## 오늘의 일정
(일정 정리, 없으면 생략)
## 내 종목 하이라이트
(등록 종목 이슈 요약)`;
}
