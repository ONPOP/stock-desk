// 네이버 어댑터 진입점 (한국 뉴스)
export { NaverClient, NAVER_BASE_URL, type NaverCredentials } from '@/lib/providers/naver/client';
export { getNaverNews, buildNaverNews, stripHtml, parsePubDate } from '@/lib/providers/naver/news';
