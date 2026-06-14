-- W4 뉴스·AI — F5 뉴스 피드·AI 요약/감성·F1 브리핑 (PRD 19장 W4)
-- 네이버 뉴스 검색 API 키만 신규. news_items/briefings/disclosures.summary_ai는 기존 재사용.

-- ───────────────────────── user_settings: 네이버 뉴스 키 ─────────────────────────
-- 한국 뉴스 소스(네이버 뉴스 검색 API). client_id/secret을 KIS 앱키처럼 AES-256 암호화 저장.
-- (미국 뉴스 Finnhub·AI OpenAI 키는 기존 컬럼 재사용)
alter table public.user_settings
  add column if not exists naver_client_id_enc     text,
  add column if not exists naver_client_secret_enc text;
