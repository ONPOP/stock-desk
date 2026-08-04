// 슬라이드 저장 경로 해석·검증 (D16).
// 저장 루트는 사용자가 외장 볼륨으로 바꿀 수 있다 → ① 임의 경로 쓰기를 막는 화이트리스트 검증과
// ② 슬롯 실행 시각에 볼륨이 빠져 있을 때의 폴백이 이 모듈의 존재 이유다.
//
// 루트 우선순위: engine_settings.slide_storage_root → SLIDE_STORAGE_ROOT env → <repo>/data/runs
// 지정 루트가 쓰기 불가면 기본 경로에 저장하고 storage_state='fallback'으로 표시한다(나중에 이관).

import { constants } from 'node:fs';
import { access, mkdir, realpath, rm, statfs, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

/** DB check 제약(slot_id_safe)과 동일 — 이 값이 그대로 디렉토리명이 된다 */
export const SLOT_ID_RE = /^[a-z0-9_]{1,40}$/;
export const RUN_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** macOS 외장 볼륨 마운트 지점 */
const VOLUMES_PREFIX = '/Volumes';

export class StoragePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoragePathError';
  }
}

/** 경로 세그먼트로 쓰이는 값 검증 — traversal(`..`)·구분자 주입 원천 차단 */
export function assertSafeSegments(runDate: string, slotId: string): void {
  if (!RUN_DATE_RE.test(runDate)) {
    throw new StoragePathError(`실행일 형식이 올바르지 않습니다: ${runDate}`);
  }
  if (!SLOT_ID_RE.test(slotId)) {
    throw new StoragePathError(`슬롯 ID 형식이 올바르지 않습니다: ${slotId}`);
  }
}

/** 저장 루트 기준 상대 디렉토리. DB에는 이 상대경로만 남겨 루트 변경에 영향받지 않게 한다 */
export function slotRelDir(runDate: string, slotId: string): string {
  assertSafeSegments(runDate, slotId);
  return `${runDate}/${slotId}`;
}

/** 입력 경로를 절대경로로 정규화 (`~` 확장 포함) */
export function normalizeRoot(input: string): string {
  const trimmed = input.trim();
  if (trimmed === '') throw new StoragePathError('저장 경로가 비어 있습니다.');
  const expanded =
    trimmed === '~' || trimmed.startsWith('~/') ? path.join(homedir(), trimmed.slice(1)) : trimmed;
  return path.resolve(expanded);
}

/** 홈 디렉토리 하위 또는 외장 볼륨(/Volumes/<name>/...) 하위만 허용 */
export function isAllowedRoot(absPath: string): boolean {
  const home = homedir();
  if (absPath === home || absPath.startsWith(`${home}${path.sep}`)) return true;
  // /Volumes 자체는 마운트 지점 목록이라 제외하고, 그 하위 볼륨만 허용
  return absPath.startsWith(`${VOLUMES_PREFIX}${path.sep}`) && absPath !== VOLUMES_PREFIX;
}

/**
 * 심볼릭 링크로 화이트리스트를 우회하지 못하게, 실제 경로로 해석한 뒤 검증한다.
 * 아직 생성되지 않은 경로도 받으므로 '존재하는 가장 가까운 상위'를 realpath하고 나머지를 이어붙인다.
 */
export async function resolveRealPath(absPath: string): Promise<string> {
  const segments: string[] = [];
  let cursor = absPath;

  for (;;) {
    try {
      const real = await realpath(cursor);
      return segments.length === 0 ? real : path.join(real, ...segments.reverse());
    } catch {
      const parent = path.dirname(cursor);
      // 루트까지 올라가도 존재하지 않으면 정규화 결과를 그대로 쓴다
      if (parent === cursor) return absPath;
      segments.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

export interface PreflightResult {
  ok: boolean;
  /** 검증을 통과한 실제 경로 (ok=false면 검증 대상 경로) */
  root: string;
  /** 실패 사유 — 설정 화면의 '연결 테스트' 결과에 그대로 표시 */
  reason?: string;
  freeBytes?: number;
}

/**
 * 저장 루트 사용 가능 여부 점검: 화이트리스트 → 디렉토리 생성 → 실제 쓰기 → 여유 공간.
 * 쓰기를 실제로 해 보는 이유는 NTFS(읽기 전용 마운트)·권한 문제를 통계 정보로는 못 잡기 때문이다.
 */
export async function preflightRoot(input: string): Promise<PreflightResult> {
  let real: string;
  try {
    real = await resolveRealPath(normalizeRoot(input));
  } catch (err) {
    return { ok: false, root: input, reason: err instanceof Error ? err.message : String(err) };
  }

  if (!isAllowedRoot(real)) {
    return {
      ok: false,
      root: real,
      reason: '홈 디렉토리 또는 외장 볼륨(/Volumes) 하위 경로만 사용할 수 있습니다.',
    };
  }

  try {
    await mkdir(real, { recursive: true });
  } catch {
    return { ok: false, root: real, reason: '경로를 만들 수 없습니다. 볼륨이 연결돼 있는지 확인하세요.' };
  }

  const probe = path.join(real, '.stock-desk-write-test');
  try {
    await writeFile(probe, 'ok');
    await rm(probe, { force: true });
  } catch {
    return {
      ok: false,
      root: real,
      reason: '쓰기 권한이 없습니다. 읽기 전용 볼륨(NTFS 등)이거나 권한이 부족합니다.',
    };
  }

  let freeBytes: number | undefined;
  try {
    const st = await statfs(real);
    freeBytes = Number(st.bavail) * Number(st.bsize);
  } catch {
    // 여유 공간 조회 실패는 치명적이지 않다 — 쓰기가 되면 사용 가능으로 본다
  }

  return { ok: true, root: real, freeBytes };
}

export interface StorageRootOptions {
  /** engine_settings.slide_storage_root */
  configured?: string | null;
  /** SLIDE_STORAGE_ROOT 환경변수 */
  envRoot?: string | null;
  /** 최후 폴백 — 보통 <repo>/data/runs */
  defaultRoot: string;
}

export interface ResolvedStorage {
  root: string;
  /** stored=지정 루트 사용 | fallback=지정 루트 불가로 기본 경로 사용(복구 시 이관 대상) */
  state: 'stored' | 'fallback';
  /** fallback일 때의 사유 */
  reason?: string;
  freeBytes?: number;
}

/**
 * 실제 저장에 쓸 루트를 결정한다.
 * 지정 루트가 하나라도 통과하면 stored, 전부 실패하면 기본 경로로 fallback.
 * 기본 경로마저 실패하면 예외 — 이 경우는 저장 자체가 불가능하므로 슬롯을 중단시켜야 한다.
 */
export async function resolveStorageRoot(opts: StorageRootOptions): Promise<ResolvedStorage> {
  const candidates = [opts.configured, opts.envRoot].filter(
    (v): v is string => typeof v === 'string' && v.trim() !== '',
  );

  const reasons: string[] = [];
  for (const candidate of candidates) {
    const result = await preflightRoot(candidate);
    if (result.ok) return { root: result.root, state: 'stored', freeBytes: result.freeBytes };
    reasons.push(`${candidate}: ${result.reason ?? '사용 불가'}`);
  }

  const fallback = await preflightRoot(opts.defaultRoot);
  if (!fallback.ok) {
    throw new StoragePathError(
      `저장 경로를 확보하지 못했습니다. ${[...reasons, `${opts.defaultRoot}: ${fallback.reason}`].join(' / ')}`,
    );
  }

  return {
    root: fallback.root,
    state: candidates.length > 0 ? 'fallback' : 'stored',
    reason: reasons.length > 0 ? reasons.join(' / ') : undefined,
    freeBytes: fallback.freeBytes,
  };
}

/** 슬롯 디렉토리 생성 후 절대경로 반환 */
export async function ensureSlotDir(root: string, runDate: string, slotId: string): Promise<string> {
  const dir = path.join(root, slotRelDir(runDate, slotId));
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * DB의 상대경로를 실제 파일 경로로 되돌린다.
 * 상대경로가 루트를 벗어나면(조작된 값) 예외 — 이미지 서빙 API의 traversal 방어선.
 */
export async function resolveStoredFile(root: string, relPath: string): Promise<string> {
  const abs = path.resolve(root, relPath);
  const rootAbs = path.resolve(root);
  if (abs !== rootAbs && !abs.startsWith(`${rootAbs}${path.sep}`)) {
    throw new StoragePathError('저장 루트를 벗어나는 경로입니다.');
  }
  await access(abs, constants.R_OK);
  return abs;
}
