// user_settings 조회·갱신 — 키는 암호화 저장, 클라이언트에는 마스킹만 노출
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { decryptSecret, encryptSecret, maskSecret } from '@/lib/utils/crypto';
import type { SettingsPatch } from '@/lib/validation/settings';
import type { UserSettingsView } from '@/types';

interface SettingsRow {
  kis_app_key_enc: string | null;
  kis_app_secret_enc: string | null;
  openai_key_enc: string | null;
  anthropic_key_enc: string | null;
  dart_key_enc: string | null;
  finnhub_key_enc: string | null;
  fmp_key_enc: string | null;
  naver_client_id_enc: string | null;
  naver_client_secret_enc: string | null;
  seed_krw: number;
  seed_usd_cents: number;
}

function safeMask(enc: string | null): string | null {
  if (!enc) return null;
  try {
    return maskSecret(decryptSecret(enc));
  } catch {
    // 암호화 키 교체 등으로 복호화 불가 — 재입력 필요 상태로 표시
    return '(재입력 필요)';
  }
}

export async function getSettingsView(db: SupabaseClient, userId: string): Promise<UserSettingsView> {
  const { data, error } = await db
    .from('user_settings')
    .select(
      'kis_app_key_enc, kis_app_secret_enc, openai_key_enc, anthropic_key_enc, dart_key_enc, finnhub_key_enc, fmp_key_enc, naver_client_id_enc, naver_client_secret_enc, seed_krw, seed_usd_cents',
    )
    .eq('user_id', userId)
    .maybeSingle<SettingsRow>();
  if (error) throw new ValidationError('설정을 불러오지 못했습니다.', error.message);
  if (!data) throw new NotFoundError('설정 정보가 없습니다.');
  return {
    kis_app_key_masked: safeMask(data.kis_app_key_enc),
    kis_app_secret_set: data.kis_app_secret_enc !== null,
    openai_key_masked: safeMask(data.openai_key_enc),
    anthropic_key_masked: safeMask(data.anthropic_key_enc),
    dart_key_masked: safeMask(data.dart_key_enc),
    finnhub_key_masked: safeMask(data.finnhub_key_enc),
    fmp_key_masked: safeMask(data.fmp_key_enc),
    naver_client_id_masked: safeMask(data.naver_client_id_enc),
    naver_client_secret_set: data.naver_client_secret_enc !== null,
    seed_krw: data.seed_krw,
    seed_usd_cents: data.seed_usd_cents,
  };
}

export async function patchSettings(db: SupabaseClient, userId: string, patch: SettingsPatch): Promise<void> {
  const update: Record<string, unknown> = {};
  const encField = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : encryptSecret(v));

  const kisKey = encField(patch.kis_app_key);
  if (kisKey !== undefined) update.kis_app_key_enc = kisKey;
  const kisSecret = encField(patch.kis_app_secret);
  if (kisSecret !== undefined) update.kis_app_secret_enc = kisSecret;
  const openaiKey = encField(patch.openai_key);
  if (openaiKey !== undefined) update.openai_key_enc = openaiKey;
  const anthropicKey = encField(patch.anthropic_key);
  if (anthropicKey !== undefined) update.anthropic_key_enc = anthropicKey;
  const dartKey = encField(patch.dart_key);
  if (dartKey !== undefined) update.dart_key_enc = dartKey;
  const finnhubKey = encField(patch.finnhub_key);
  if (finnhubKey !== undefined) update.finnhub_key_enc = finnhubKey;
  const fmpKey = encField(patch.fmp_key);
  if (fmpKey !== undefined) update.fmp_key_enc = fmpKey;
  const naverId = encField(patch.naver_client_id);
  if (naverId !== undefined) update.naver_client_id_enc = naverId;
  const naverSecret = encField(patch.naver_client_secret);
  if (naverSecret !== undefined) update.naver_client_secret_enc = naverSecret;
  if (patch.seed_krw !== undefined) update.seed_krw = patch.seed_krw;
  if (patch.seed_usd_cents !== undefined) update.seed_usd_cents = patch.seed_usd_cents;

  const { error } = await db.from('user_settings').update(update).eq('user_id', userId);
  if (error) throw new ValidationError('설정 저장에 실패했습니다.', error.message);
}

/** 저장된 KIS 자격증명 복호화 — 서버 내부 전용 */
export async function getKisCredentials(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from('user_settings')
    .select('kis_app_key_enc, kis_app_secret_enc')
    .eq('user_id', userId)
    .maybeSingle<Pick<SettingsRow, 'kis_app_key_enc' | 'kis_app_secret_enc'>>();
  if (error || !data) throw new NotFoundError('설정 정보가 없습니다.');
  if (!data.kis_app_key_enc || !data.kis_app_secret_enc) {
    throw new ValidationError('KIS 앱키/시크릿이 설정되지 않았습니다. 설정 화면에서 입력해주세요.');
  }
  return {
    appKey: decryptSecret(data.kis_app_key_enc),
    appSecret: decryptSecret(data.kis_app_secret_enc),
  };
}

/**
 * 단일 데이터 소스 키 복호화 — 서버 내부 전용. 미설정/복호화 실패 시 null (graceful).
 * 키가 없는 소스는 해당 펀더멘털 섹션을 "데이터 없음"으로 처리하기 위함.
 */
async function getSourceKey(
  db: SupabaseClient,
  userId: string,
  column:
    | 'dart_key_enc'
    | 'finnhub_key_enc'
    | 'fmp_key_enc'
    | 'openai_key_enc'
    | 'anthropic_key_enc'
    | 'naver_client_id_enc'
    | 'naver_client_secret_enc',
): Promise<string | null> {
  const { data, error } = await db
    .from('user_settings')
    .select(column)
    .eq('user_id', userId)
    .maybeSingle<Record<string, string | null>>();
  if (error || !data) return null;
  const enc = data[column];
  if (!enc) return null;
  try {
    return decryptSecret(enc);
  } catch {
    return null;
  }
}

export const getDartKey = (db: SupabaseClient, userId: string) => getSourceKey(db, userId, 'dart_key_enc');
export const getFinnhubKey = (db: SupabaseClient, userId: string) => getSourceKey(db, userId, 'finnhub_key_enc');
export const getFmpKey = (db: SupabaseClient, userId: string) => getSourceKey(db, userId, 'fmp_key_enc');
export const getOpenaiKey = (db: SupabaseClient, userId: string) => getSourceKey(db, userId, 'openai_key_enc');
export const getAnthropicKey = (db: SupabaseClient, userId: string) => getSourceKey(db, userId, 'anthropic_key_enc');

/** 네이버 뉴스 검색 API 자격증명 — 둘 다 있어야 유효, 아니면 null (graceful) */
export async function getNaverCredentials(
  db: SupabaseClient,
  userId: string,
): Promise<{ clientId: string; clientSecret: string } | null> {
  const { data, error } = await db
    .from('user_settings')
    .select('naver_client_id_enc, naver_client_secret_enc')
    .eq('user_id', userId)
    .maybeSingle<Pick<SettingsRow, 'naver_client_id_enc' | 'naver_client_secret_enc'>>();
  if (error || !data?.naver_client_id_enc || !data.naver_client_secret_enc) return null;
  let clientId: string;
  let clientSecret: string;
  try {
    clientId = decryptSecret(data.naver_client_id_enc);
    clientSecret = decryptSecret(data.naver_client_secret_enc);
  } catch {
    return null;
  }
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}
