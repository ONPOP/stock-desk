// 슬라이드 원격 저장 (D19) — 키 규칙 · 업로드 · 서명 · 삭제.
//
// 버킷 프리픽스는 썸네일이 이미 쓰던 `${userId}/${runDate}/${slotId}`를 그대로 재사용한다.
// 원본과 썸네일이 같은 프리픽스 아래 확장자로만 갈리므로 `analysis_reports.thumb_bucket_path`
// 하나로 둘 다 찾을 수 있고, 기존 테이블에 새 컬럼을 만들지 않아도 된다.
//
// server-only를 import하지 않는다 — scripts/engine/*가 tsx로 직접 실행하며 쓴다.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SLIDE_CONTENT_TYPE, SLIDE_EXT, THUMB_CONTENT_TYPE, THUMB_EXT } from './slide-format';

export const SLIDE_BUCKET = 'analysis-slides';

export function slidePrefix(userId: string, runDate: string, slotId: string): string {
  return `${userId}/${runDate}/${slotId}`;
}

/** 렌더러가 `01.webp`부터 붙이므로 0-기반 인덱스를 1-기반 2자리로 옮긴다 */
function fileName(index: number, ext: string): string {
  return `${String(index + 1).padStart(2, '0')}.${ext}`;
}

export function slideObjectKey(prefix: string, index: number): string {
  return `${prefix}/${fileName(index, SLIDE_EXT)}`;
}

export function thumbObjectKey(prefix: string, index: number): string {
  return `${prefix}/${fileName(index, THUMB_EXT)}`;
}

export interface UploadResult {
  prefix: string;
  /** 전량 성공했을 때만 실제 개수 — 부분 성공은 0이다(로컬 삭제 판단의 근거라 엄격히 본다) */
  slides: number;
  thumbs: number;
}

/**
 * macOS가 xattr를 지원하지 않는 볼륨(exFAT 외장 등)에 남기는 AppleDouble 부산물(`._01.jpg`)은
 * 확장자가 같아서 그냥 세면 슬라이드로 잡힌다. 2026-08-10 실측: 썸네일 9장짜리 디렉터리가 18장으로
 * 계상돼 쓰레기 객체가 Storage에 올라가 있었다.
 *
 * 개수가 틀리면 조용히 넘어가지 않고 판정이 뒤집힌다 — `uploadRunAssets`는 전량 성공을 개수로
 * 판단하고, 호출부는 그 값으로 로컬 원본 삭제 여부를 정한다(불변식 1).
 */
function isAppleDouble(name: string): boolean {
  return name.startsWith('._');
}

async function listByExt(dir: string, ext: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith(`.${ext}`) && !isAppleDouble(f)).sort();
  } catch {
    return [];
  }
}

/**
 * 업로드는 간헐적으로 `fetch failed`로 죽는다. 2026-08-10 원인 규명:
 * 실제 예외는 `ERR_SSL_SSL/TLS_ALERT_BAD_RECORD_MAC`(TLS 레코드 무결성 실패)이고,
 * 같은 조건에서 **curl(macOS TLS)도 40회 중 3회 실패**했다 — Node 문제가 아니라 이 기기의
 * Wi-Fi 경로가 대용량 업로드에서 패킷을 손상시키는 환경 문제다.
 *
 * 중요한 건 회복 시간이다: 실패 후 **2초면 회복**한다. 처음엔 200ms·400ms로 재시도했다가
 * 3회 전부 같은 손상 구간에 갇혀 슬롯이 통째로 실패했다. 백오프는 초 단위여야 한다.
 */
export const UPLOAD_RETRY = { attempts: 4, backoffMs: 2_000 } as const;

export interface RetryOptions {
  attempts?: number;
  backoffMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 한 파일을 올린다. 실패하면 백오프를 두고 다시 시도하고, 끝내 실패하면 이유를 돌려준다. */
async function uploadOne(
  db: SupabaseClient,
  key: string,
  body: Buffer,
  contentType: string,
  retry: Required<RetryOptions>,
): Promise<string | null> {
  let lastReason = '알 수 없음';
  for (let attempt = 1; attempt <= retry.attempts; attempt++) {
    try {
      const { error } = await db.storage.from(SLIDE_BUCKET).upload(key, body, { contentType, upsert: true });
      if (!error) return null;
      lastReason = error.message;
    } catch (e) {
      lastReason = e instanceof Error ? e.message : String(e);
    }
    if (attempt < retry.attempts) await sleep(retry.backoffMs * 2 ** (attempt - 1));
  }
  return lastReason;
}

/** 한 디렉터리의 파일 전부를 올린다. 하나라도 끝내 실패하면 그 시점에서 멈추고 성공 개수를 돌려준다. */
async function uploadAll(
  db: SupabaseClient,
  dir: string,
  files: string[],
  prefix: string,
  contentType: string,
  retry: Required<RetryOptions>,
): Promise<number> {
  let uploaded = 0;
  for (const f of files) {
    const body = await readFile(path.join(dir, f));
    const reason = await uploadOne(db, `${prefix}/${f}`, body, contentType, retry);
    if (reason !== null) {
      console.warn(`⚠ 업로드 실패(${f}, ${retry.attempts}회 시도): ${reason}`);
      break;
    }
    uploaded++;
  }
  return uploaded;
}

/**
 * 슬롯 산출물(원본 + 썸네일)을 Storage에 올린다.
 * 원본이 한 장이라도 실패하면 `slides`를 0으로 돌려준다 — 호출부가 로컬을 지우지 않게 하기 위해서다.
 */
export async function uploadRunAssets(
  db: SupabaseClient,
  dir: string,
  prefix: string,
  retryOptions: RetryOptions = {},
): Promise<UploadResult> {
  const retry = { ...UPLOAD_RETRY, ...retryOptions };
  const slideFiles = await listByExt(dir, SLIDE_EXT);
  const thumbDir = path.join(dir, 'thumbs');
  const thumbFiles = await listByExt(thumbDir, THUMB_EXT);
  if (slideFiles.length === 0 && thumbFiles.length === 0) return { prefix, slides: 0, thumbs: 0 };

  // 버킷은 최초 1회만 만들어지고, 이미 있으면 에러를 무시한다
  await db.storage.createBucket(SLIDE_BUCKET, { public: false }).catch(() => undefined);

  const slides = await uploadAll(db, dir, slideFiles, prefix, SLIDE_CONTENT_TYPE, retry);
  const thumbs = await uploadAll(db, thumbDir, thumbFiles, prefix, THUMB_CONTENT_TYPE, retry);

  return { prefix, slides: slides === slideFiles.length ? slides : 0, thumbs };
}

/**
 * 서명 URL 1건. 객체가 없으면 null이다(만료인지 미업로드인지 구분하지 않는다 — 호출부가 폴백한다).
 * 두 키를 함께 판정할 때는 `signedObjectUrls`를 써서 왕복을 1회로 줄인다.
 */
export async function signedObjectUrl(db: SupabaseClient, key: string, expiresIn: number): Promise<string | null> {
  const [url] = await signedObjectUrls(db, [key], expiresIn);
  return url ?? null;
}

/**
 * 여러 키를 한 번에 서명한다. 입력 순서 그대로 돌려주고, 없는 키 자리에는 null이 온다.
 * 일괄 API는 부재 키가 있어도 전체를 실패시키지 않고 항목별 error를 준다(2026-08-10 실측).
 */
export async function signedObjectUrls(
  db: SupabaseClient,
  keys: string[],
  expiresIn: number,
): Promise<Array<string | null>> {
  if (keys.length === 0) return [];
  const { data, error } = await db.storage.from(SLIDE_BUCKET).createSignedUrls(keys, expiresIn);
  if (error || !data) return keys.map(() => null);
  const byPath = new Map(data.map((d) => [d.path ?? '', d.error ? null : (d.signedUrl ?? null)]));
  return keys.map((k) => byPath.get(k) ?? null);
}

/** 프리픽스 아래에서 해당 확장자만 지운다. 지운 개수를 돌려준다. */
export async function deletePrefix(db: SupabaseClient, prefix: string, ext: string): Promise<number> {
  const { data, error } = await db.storage.from(SLIDE_BUCKET).list(prefix, { limit: 1000 });
  if (error || !data) return 0;
  const keys = data.filter((o) => o.name.endsWith(`.${ext}`)).map((o) => `${prefix}/${o.name}`);
  if (keys.length === 0) return 0;
  const { error: removeError } = await db.storage.from(SLIDE_BUCKET).remove(keys);
  if (removeError) throw new Error(`슬라이드 삭제 실패(${prefix}): ${removeError.message}`);
  return keys.length;
}
