import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  assertSafeSegments,
  defaultStorageDir,
  ensureSlotDir,
  isAllowedRoot,
  normalizeRoot,
  preflightRoot,
  resolveStorageRoot,
  resolveStoredFile,
  slotRelDir,
  StoragePathError,
} from './storage-path';

// 화이트리스트가 홈/외장볼륨 하위만 허용하므로 임시 디렉토리도 홈 아래에 만든다
const tmpRoots: string[] = [];
async function tmpUnderHome(): Promise<string> {
  const dir = await mkdtemp(path.join(homedir(), '.stock-desk-test-'));
  tmpRoots.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(tmpRoots.map((d) => rm(d, { recursive: true, force: true })));
});

describe('assertSafeSegments', () => {
  it('정상 값은 통과', () => {
    expect(() => assertSafeSegments('2026-08-04', 'kr_close_buy')).not.toThrow();
  });

  it('경로 조작 문자를 거부한다', () => {
    expect(() => assertSafeSegments('2026-08-04', '../etc')).toThrow(StoragePathError);
    expect(() => assertSafeSegments('2026-08-04', 'kr/close')).toThrow(StoragePathError);
    expect(() => assertSafeSegments('2026-8-4', 'kr_close_buy')).toThrow(StoragePathError);
    expect(() => assertSafeSegments('../../2026-08-04', 'slot')).toThrow(StoragePathError);
  });
});

describe('slotRelDir', () => {
  it('날짜/슬롯 상대경로를 만든다', () => {
    expect(slotRelDir('2026-08-04', 'kr_close_buy')).toBe('2026-08-04/kr_close_buy');
  });
});

describe('normalizeRoot', () => {
  it('~ 를 홈 디렉토리로 확장한다', () => {
    expect(normalizeRoot('~/slides')).toBe(path.join(homedir(), 'slides'));
  });

  it('상대경로를 절대경로로 만든다', () => {
    expect(path.isAbsolute(normalizeRoot('./data/runs'))).toBe(true);
  });

  it('빈 문자열은 예외', () => {
    expect(() => normalizeRoot('   ')).toThrow(StoragePathError);
  });
});

describe('defaultStorageDir', () => {
  it('화이트리스트를 통과하는 작업 디렉토리는 <cwd>/data/runs 를 쓴다', () => {
    const repo = path.join(homedir(), 'dev', 'stock-desk');
    expect(defaultStorageDir(repo)).toBe(path.join(repo, 'data', 'runs'));
  });

  it('외장 볼륨의 저장소도 그대로 쓴다', () => {
    expect(defaultStorageDir('/Volumes/EXT-HDD/stock-desk')).toBe('/Volumes/EXT-HDD/stock-desk/data/runs');
  });

  // 데스크톱 앱은 읽기 전용 앱 번들 안에서 서버를 띄운다 — 여기로 폴백하면 슬라이드를 영영 못 읽는다
  it('앱 번들 내부에서는 번들 밖 사용자 경로로 대피한다', () => {
    const bundle = '/Applications/Stock Desk.app/Contents/Resources/standalone';
    const resolved = defaultStorageDir(bundle);
    expect(resolved.startsWith(bundle)).toBe(false);
    expect(isAllowedRoot(resolved)).toBe(true);
  });

  it('대피 경로는 홈 디렉토리 하위다', () => {
    expect(defaultStorageDir('/opt/stock-desk').startsWith(`${homedir()}${path.sep}`)).toBe(true);
  });
});

describe('isAllowedRoot', () => {
  it('홈 디렉토리 하위를 허용한다', () => {
    expect(isAllowedRoot(path.join(homedir(), 'slides'))).toBe(true);
  });

  it('외장 볼륨 하위를 허용한다', () => {
    expect(isAllowedRoot('/Volumes/EXT-HDD/stock-slides')).toBe(true);
  });

  it('/Volumes 자체와 시스템 경로는 거부한다', () => {
    expect(isAllowedRoot('/Volumes')).toBe(false);
    expect(isAllowedRoot('/etc')).toBe(false);
    expect(isAllowedRoot('/')).toBe(false);
  });
});

describe('preflightRoot', () => {
  it('쓰기 가능한 홈 하위 경로는 통과하고 여유 공간을 보고한다', async () => {
    const dir = await tmpUnderHome();
    const result = await preflightRoot(path.join(dir, 'slides'));
    expect(result.ok).toBe(true);
    expect(result.freeBytes).toBeGreaterThan(0);
  });

  it('허용되지 않은 경로는 사유와 함께 실패한다', async () => {
    const result = await preflightRoot('/etc/stock-desk');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('/Volumes');
  });
});

describe('resolveStorageRoot', () => {
  it('지정 루트가 살아 있으면 stored', async () => {
    const configured = await tmpUnderHome();
    const fallback = await tmpUnderHome();
    const r = await resolveStorageRoot({ configured, defaultRoot: fallback });
    expect(r.state).toBe('stored');
    expect(r.root).toContain(path.basename(configured));
  });

  it('지정 루트가 연결돼 있지 않으면 기본 경로로 폴백하고 사유를 남긴다', async () => {
    const fallback = await tmpUnderHome();
    const r = await resolveStorageRoot({
      configured: '/Volumes/NOT-MOUNTED-XYZ/slides',
      defaultRoot: fallback,
    });
    expect(r.state).toBe('fallback');
    expect(r.reason).toContain('NOT-MOUNTED-XYZ');
  });

  it('지정 루트가 없으면 기본 경로를 정상 사용으로 본다', async () => {
    const fallback = await tmpUnderHome();
    const r = await resolveStorageRoot({ configured: null, envRoot: null, defaultRoot: fallback });
    expect(r.state).toBe('stored');
  });

  it('기본 경로마저 불가하면 예외', async () => {
    await expect(resolveStorageRoot({ defaultRoot: '/etc/stock-desk' })).rejects.toThrow(
      StoragePathError,
    );
  });
});

describe('ensureSlotDir / resolveStoredFile', () => {
  it('슬롯 디렉토리를 만들고 저장 파일을 되돌린다', async () => {
    const root = await tmpUnderHome();
    const dir = await ensureSlotDir(root, '2026-08-04', 'kr_close_buy');
    await writeFile(path.join(dir, '01.png'), 'x');

    const abs = await resolveStoredFile(root, '2026-08-04/kr_close_buy/01.png');
    expect(abs).toBe(path.join(dir, '01.png'));
  });

  it('루트를 벗어나는 상대경로는 거부한다', async () => {
    const root = await tmpUnderHome();
    await expect(resolveStoredFile(root, '../../../etc/passwd')).rejects.toThrow(StoragePathError);
  });

  it('없는 파일은 예외', async () => {
    const root = await tmpUnderHome();
    await expect(resolveStoredFile(root, '2026-08-04/kr_close_buy/99.png')).rejects.toThrow();
  });
});
