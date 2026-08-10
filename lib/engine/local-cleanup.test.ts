// 로컬 삭제 판정 검증 (D19 불변식 1). 삭제는 되돌릴 수 없으므로 "안 지우는 쪽"을 집중적으로 본다.
import { describe, expect, it } from 'vitest';
import { selectDeletableFiles, slideFileName } from './local-cleanup';

const webps = ['01.webp', '02.webp', '03.webp'];
const thumbs = ['01.jpg', '02.jpg', '03.jpg'];
const allRemote = new Set([...webps, ...thumbs]);

describe('slideFileName', () => {
  it('0-기반 인덱스를 1-기반 2자리로 옮긴다', () => {
    expect(slideFileName(0, 'webp')).toBe('01.webp');
    expect(slideFileName(12, 'jpg')).toBe('13.jpg');
  });
});

describe('selectDeletableFiles', () => {
  it('원격에 전량 있으면 원본과 썸네일을 고른다', () => {
    const r = selectDeletableFiles(webps, thumbs, allRemote, 3);

    expect(r.skipReason).toBeUndefined();
    expect(r.files).toEqual(webps);
    expect(r.thumbs).toEqual(thumbs);
  });

  it('원본이 한 장이라도 없으면 아무것도 지우지 않는다', () => {
    const remote = new Set([...allRemote]);
    remote.delete('02.webp');

    const r = selectDeletableFiles(webps, thumbs, remote, 3);

    expect(r.files).toEqual([]);
    expect(r.thumbs).toEqual([]);
    expect(r.skipReason).toContain('02.webp');
  });

  it('정의 장수보다 원격이 모자라면 건너뛴다 — 개수가 아니라 인덱스로 본다', () => {
    // 객체는 3개지만 04가 없다. 개수만 세는 구현이면 통과해버린다.
    const r = selectDeletableFiles([...webps, '04.webp'], thumbs, allRemote, 4);

    expect(r.files).toEqual([]);
    expect(r.skipReason).toContain('04.webp');
  });

  it('슬라이드 정의가 없으면 건너뛴다', () => {
    const r = selectDeletableFiles(webps, thumbs, allRemote, 0);

    expect(r.files).toEqual([]);
    expect(r.skipReason).toBe('슬라이드 정의가 없다');
  });

  it('D19 이전 PNG 원본도 함께 지운다 (같은 인덱스가 원격에 있을 때만)', () => {
    const local = ['01.png', '02.png', '03.png'];

    const r = selectDeletableFiles(local, thumbs, allRemote, 3);

    expect(r.files).toEqual(['01.png', '02.png', '03.png']);
  });

  it('정의 범위 밖의 여분 파일은 남긴다', () => {
    const local = [...webps, '09.webp', '09.png'];

    const r = selectDeletableFiles(local, thumbs, allRemote, 3);

    expect(r.files).not.toContain('09.webp');
    expect(r.files).not.toContain('09.png');
  });

  it('원격에 없는 썸네일은 남긴다 — 썸네일은 만료 대상이 아니라 유일한 폴백이다', () => {
    const remote = new Set(webps); // 썸네일이 원격에 없다

    const r = selectDeletableFiles(webps, thumbs, remote, 3);

    expect(r.files).toEqual(webps);
    expect(r.thumbs).toEqual([]);
  });

  it('html·json은 애초에 후보가 아니다', () => {
    const local = [...webps, 'slides.json', 'snapshot.json', 'run.json'];

    const r = selectDeletableFiles(local, thumbs, allRemote, 3);

    expect(r.files).toEqual(webps);
  });
});
