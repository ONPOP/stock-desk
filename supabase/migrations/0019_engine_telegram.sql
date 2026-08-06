-- 슬롯 알림용 봇 자격증명(D18). 토큰은 AES-256 암호문만 저장.
-- chat_id가 null인 행은 "연결 미완료"로 취급 — 발송 경로는 이 행을 미설정과 동일하게 본다.
create table public.engine_telegram (
  user_id uuid primary key references auth.users (id) on delete cascade,
  bot_token_enc text,
  bot_username text,
  chat_id text,
  enabled_slot_ids text[] not null default '{}',
  connected_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.engine_telegram enable row level security;
create policy engine_telegram_own on public.engine_telegram
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
