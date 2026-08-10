// 로컬 원본 정리 (D19 ⑧) — 업로드가 확인된 실행의 로컬 이미지를 지운다.
//
// 불변식 1: 로컬 삭제는 **원격에 실물이 있는 것이 확인된 뒤에만** 한다.
// 앞 단계가 "업로드 완료"라고 남긴 기록을 믿지 않고, 지우기 직전에 프리픽스를 다시 조회해
// 장별로 대조한다. 기록은 낡을 수 있고 객체는 지워질 수 있는데, 삭제는 되돌릴 수 없다.
//
// 지우지 않는 것:
//   html/  — 슬라이드를 다시 찍을 수 있는 유일한 로컬 원자료다(backfill-slides.ts가 이걸 쓴다).
//            전체 합쳐 3MB라 남겨두는 비용이 거의 없다.
//   *.json — snapshot·analysis·slides는 DB에 있지만, 재현·디버깅 비용 대비 용량이 작다.
//
// server-only를 import하지 않는다 — tsx로 직접 실행되는 scripts/engine/*가 쓴다.
import { SLIDE_EXT, THUMB_EXT } from './slide-format';

/** 렌더러가 붙이는 1-기반 2자리 이름 */
export function slideFileName(index: number, ext: string): string {
  return `${String(index + 1).padStart(2, '0')}.${ext}`;
}

export interface CleanupSelection {
  /** 실행 디렉터리 직속에서 지울 파일명 */
  files: string[];
  /** thumbs/ 에서 지울 파일명 */
  thumbs: string[];
  /** 값이 있으면 이 실행은 건드리지 않는다 */
  skipReason?: string;
}

/**
 * 무엇을 지울지 고른다. 부작용이 없으므로 이 판정만 따로 검증할 수 있다.
 *
 * `remoteNames`는 버킷 프리픽스 아래 객체 **이름**(경로 아님) 집합이다.
 * 원본이 한 장이라도 비면 그 실행은 통째로 건너뛴다 — 부분 삭제는 "일부만 없는" 상태를 만들어
 * 나중에 무엇이 유실인지 판단할 수 없게 한다.
 */
export function selectDeletableFiles(
  localFiles: string[],
  localThumbs: string[],
  remoteNames: Set<string>,
  slideCount: number,
): CleanupSelection {
  if (slideCount <= 0) return { files: [], thumbs: [], skipReason: '슬라이드 정의가 없다' };

  const missing: string[] = [];
  for (let i = 0; i < slideCount; i++) {
    const name = slideFileName(i, SLIDE_EXT);
    if (!remoteNames.has(name)) missing.push(name);
  }
  if (missing.length > 0) {
    return { files: [], thumbs: [], skipReason: `원격에 원본 ${missing.length}장 없음 (${missing.slice(0, 3).join(', ')}…)` };
  }

  const files: string[] = [];
  const thumbs: string[] = [];
  for (let i = 0; i < slideCount; i++) {
    const webp = slideFileName(i, SLIDE_EXT);
    if (localFiles.includes(webp)) files.push(webp);

    // D19 이전 실행이 남긴 PNG 원본. 같은 인덱스의 WebP가 원격에 있으므로 로컬 PNG는 중복이다.
    const png = slideFileName(i, 'png');
    if (localFiles.includes(png)) files.push(png);

    const jpg = slideFileName(i, THUMB_EXT);
    if (localThumbs.includes(jpg) && remoteNames.has(jpg)) thumbs.push(jpg);
  }

  return { files, thumbs };
}
