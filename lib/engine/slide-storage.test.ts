import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SLIDE_BUCKET,
  deletePrefix,
  signedObjectUrl,
  slideObjectKey,
  slidePrefix,
  thumbObjectKey,
  uploadRunAssets,
} from './slide-storage';

/**
 * Supabase Storage 대역 — 실측한 동작만 흉내낸다.
 * 핵심은 `createSignedUrls`가 부재 키에 대해 전체를 실패시키지 않고 항목별 error를 준다는 점이다(S3 실측).
 */
function fakeDb(opts: { failUploadAt?: string; transientFailures?: number } = {}) {
  const objects = new Set<string>();
  const attempts = new Map<string, number>();
  let transientLeft = opts.transientFailures ?? 0;
  const db = {
    storage: {
      createBucket: async () => ({ error: null }),
      from: (bucket: string) => {
        expect(bucket).toBe(SLIDE_BUCKET);
        return {
          upload: async (key: string) => {
            attempts.set(key, (attempts.get(key) ?? 0) + 1);
            if (opts.failUploadAt && key.endsWith(opts.failUploadAt)) {
              return { error: { message: '용량 초과' } };
            }
            // 실측된 실패 모드 — 간헐적으로 fetch가 죽는다(원인 없이 'fetch failed')
            if (transientLeft > 0) {
              transientLeft--;
              return { error: { message: 'fetch failed' } };
            }
            objects.add(key);
            return { error: null };
          },
          createSignedUrls: async (keys: string[]) => ({
            data: keys.map((p) => ({
              path: p,
              signedUrl: objects.has(p) ? `https://signed.test/${p}` : null,
              error: objects.has(p) ? null : 'Either the object does not exist or you do not have access to it',
            })),
            error: null,
          }),
          list: async (prefix: string) => ({
            data: [...objects]
              .filter((k) => k.startsWith(`${prefix}/`))
              .map((k) => ({ name: k.slice(prefix.length + 1) })),
            error: null,
          }),
          remove: async (keys: string[]) => {
            for (const k of keys) objects.delete(k);
            return { data: keys.map((k) => ({ name: k })), error: null };
          },
        };
      },
    },
  };
  return { db: db as unknown as SupabaseClient, objects, attempts };
}

describe('키 규칙', () => {
  it('프리픽스는 썸네일이 이미 쓰는 규칙을 그대로 쓴다', () => {
    expect(slidePrefix('u1', '2026-08-08', 'kr_close_buy')).toBe('u1/2026-08-08/kr_close_buy');
  });

  it('슬라이드 키는 0-기반 인덱스를 1-기반 2자리 파일명으로 만든다', () => {
    expect(slideObjectKey('p', 0)).toBe('p/01.webp');
    expect(slideObjectKey('p', 11)).toBe('p/12.webp');
  });

  it('썸네일 키는 같은 자리에 확장자만 다르다', () => {
    expect(thumbObjectKey('p', 0)).toBe('p/01.jpg');
  });
});

describe('uploadRunAssets', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'slide-storage-'));
    await mkdir(path.join(dir, 'thumbs'), { recursive: true });
    for (const n of ['01', '02', '03']) {
      await writeFile(path.join(dir, `${n}.webp`), `slide-${n}`);
      await writeFile(path.join(dir, 'thumbs', `${n}.jpg`), `thumb-${n}`);
    }
    // 렌더 부산물은 올리지 않는다
    await mkdir(path.join(dir, 'html'), { recursive: true });
    await writeFile(path.join(dir, 'html', '01.html'), '<html></html>');
    await writeFile(path.join(dir, 'snapshot.json'), '{}');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('원본과 썸네일을 모두 올린다', async () => {
    const { db, objects } = fakeDb();
    const result = await uploadRunAssets(db, dir, 'u1/2026-08-08/slot', { backoffMs: 1 });

    expect(result).toEqual({ prefix: 'u1/2026-08-08/slot', slides: 3, thumbs: 3 });
    expect([...objects].sort()).toEqual([
      'u1/2026-08-08/slot/01.jpg',
      'u1/2026-08-08/slot/01.webp',
      'u1/2026-08-08/slot/02.jpg',
      'u1/2026-08-08/slot/02.webp',
      'u1/2026-08-08/slot/03.jpg',
      'u1/2026-08-08/slot/03.webp',
    ]);
  });

  it('원본이 한 장이라도 실패하면 slides는 0이다 (부분 성공은 실패로 본다)', async () => {
    const { db } = fakeDb({ failUploadAt: '02.webp' });
    const result = await uploadRunAssets(db, dir, 'u1/2026-08-08/slot', { backoffMs: 1 });

    expect(result.slides).toBe(0);
  });

  it('간헐적 fetch 실패는 재시도해서 전량 성공시킨다', async () => {
    const { db, objects, attempts } = fakeDb({ transientFailures: 2 });
    const result = await uploadRunAssets(db, dir, 'u1/2026-08-08/slot', { backoffMs: 1 });

    expect(result.slides).toBe(3);
    expect(objects.size).toBe(6);
    // 첫 파일이 두 번 실패하고 세 번째에 올라갔다
    expect(attempts.get('u1/2026-08-08/slot/01.webp')).toBe(3);
  });

  it('재시도해도 계속 실패하면 slides는 0이다', async () => {
    const { db } = fakeDb({ failUploadAt: '02.webp' });
    const result = await uploadRunAssets(db, dir, 'u1/2026-08-08/slot', { backoffMs: 1 });

    expect(result.slides).toBe(0);
  });

  it('macOS AppleDouble 부산물(._NN)은 세지도 올리지도 않는다', async () => {
    // 개수가 틀리면 전량 성공 판정이 뒤집혀 로컬 삭제 게이트가 영원히 안 열린다(불변식 1)
    await writeFile(path.join(dir, '._01.webp'), 'junk');
    await writeFile(path.join(dir, 'thumbs', '._01.jpg'), 'junk');
    const { db, objects } = fakeDb();

    const result = await uploadRunAssets(db, dir, 'u1/2026-08-08/slot', { backoffMs: 1 });

    expect(result).toEqual({ prefix: 'u1/2026-08-08/slot', slides: 3, thumbs: 3 });
    expect([...objects].filter((k) => k.includes('._'))).toEqual([]);
  });

  it('올릴 원본이 없으면 slides 0으로 조용히 끝낸다', async () => {
    const empty = await mkdtemp(path.join(tmpdir(), 'slide-empty-'));
    const { db } = fakeDb();
    try {
      expect(await uploadRunAssets(db, empty, 'p', { backoffMs: 1 })).toEqual({ prefix: 'p', slides: 0, thumbs: 0 });
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});

describe('signedObjectUrl', () => {
  it('객체가 있으면 서명 URL을 준다', async () => {
    const { db, objects } = fakeDb();
    objects.add('p/01.webp');
    expect(await signedObjectUrl(db, 'p/01.webp', 3600)).toBe('https://signed.test/p/01.webp');
  });

  it('객체가 없으면 null을 준다 (만료와 미업로드를 구분하지 않는다)', async () => {
    const { db } = fakeDb();
    expect(await signedObjectUrl(db, 'p/01.webp', 3600)).toBeNull();
  });
});

describe('deletePrefix', () => {
  it('지정한 확장자만 지우고 개수를 돌려준다', async () => {
    const { db, objects } = fakeDb();
    for (const k of ['p/01.webp', 'p/02.webp', 'p/01.jpg', 'p/02.jpg']) objects.add(k);

    expect(await deletePrefix(db, 'p', 'webp')).toBe(2);
    expect([...objects].sort()).toEqual(['p/01.jpg', 'p/02.jpg']);
  });

  it('지울 게 없으면 0이다', async () => {
    const { db } = fakeDb();
    expect(await deletePrefix(db, 'p', 'webp')).toBe(0);
  });
});
