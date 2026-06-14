// 네이버 뉴스 검색 (F5, 한국) — /v1/search/news.json. 종목명으로 검색.
import type { NewsItemRaw } from '@/types';
import type { NaverClient } from '@/lib/providers/naver/client';

interface NaverNewsItem {
  title?: string;
  originallink?: string;
  link?: string;
  description?: string;
  pubDate?: string; // RFC822 "Mon, 11 May 2026 14:30:00 +0900"
}
interface NaverNewsResponse {
  items?: NaverNewsItem[];
}

const ENTITIES: Record<string, string> = {
  '&quot;': '"',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&apos;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
};

/** 네이버가 반환하는 <b> 태그·HTML 엔티티 제거 */
export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;|&amp;|&lt;|&gt;|&apos;|&#39;|&nbsp;/g, (m) => ENTITIES[m] ?? m)
    .trim();
}

/** RFC822 pubDate → UTC ISO. 파싱 실패 시 null. */
export function parsePubDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = new Date(raw);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

/** 순수 변환: 네이버 응답 → NewsItemRaw[] */
export function buildNaverNews(resp: NaverNewsResponse): NewsItemRaw[] {
  return (resp.items ?? [])
    .filter((it) => it.title && (it.originallink || it.link))
    .map((it) => ({
      title: stripHtml(it.title as string),
      url: (it.originallink || it.link) as string,
      source: '네이버뉴스',
      publishedAt: parsePubDate(it.pubDate),
      body: it.description ? stripHtml(it.description) : null,
    }));
}

export async function getNaverNews(client: NaverClient, query: string, display = 20): Promise<NewsItemRaw[]> {
  const resp = await client.getJson<NaverNewsResponse>('news.json', {
    query,
    display: String(display),
    sort: 'date',
  });
  return buildNaverNews(resp);
}
