-- W3 펀더멘털 — F4 핵심지표·F15 배당·F12 공시 (PRD 19장 W3)
-- 사용자별 데이터 소스 키 + 외부 소스 식별자 매핑 컬럼 추가.
-- stock_metrics/dividends/disclosures 테이블은 0001에서 이미 생성됨 → 변경 없이 재사용.

-- ───────────────────────── user_settings: 데이터 소스 키 ─────────────────────────
-- DART(한국 재무·배당·공시) / Finnhub(미국 재무) / FMP(미국 배당) — KIS·AI 키와 동일하게 AES-256 암호화 저장
alter table public.user_settings
  add column if not exists dart_key_enc    text,
  add column if not exists finnhub_key_enc text,
  add column if not exists fmp_key_enc     text;

-- ───────────────────────── stocks: 외부 소스 식별자 매핑 ─────────────────────────
-- DART는 6자리 종목코드가 아닌 8자리 고유번호(corp_code)로 조회, SEC EDGAR는 CIK로 조회.
-- sync:corp-codes / sync:cik 스크립트가 적재한다. 미매핑 종목은 해당 소스 "데이터 없음" 처리.
alter table public.stocks
  add column if not exists corp_code text,   -- DART 8자리 고유번호 (한국 종목)
  add column if not exists cik       text;   -- SEC 10자리 CIK (미국 종목)

create index if not exists idx_stocks_corp_code on public.stocks (corp_code) where corp_code is not null;
create index if not exists idx_stocks_cik on public.stocks (cik) where cik is not null;
