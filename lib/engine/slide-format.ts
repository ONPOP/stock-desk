// 슬라이드 이미지 포맷 단일 출처 (D19).
//
// 렌더(Playwright 캡처)·업로드(contentType)·서빙(302)·텔레그램(파일명)이 확장자와 MIME을 각자
// 하드코딩하면 어긋난다. 여기서만 정의한다.
//
// WebP q82를 쓰는 근거는 2026-08-10 실측이다(슬라이드 13장 합계):
//   PNG 3238KB / WebP quality 미지정 2982KB(8%만 절감) / WebP q82 1208KB(63% 절감)
// **quality를 생략하면 무손실에 가깝게 나와 용량 계산이 무너진다.** 캡처 시 반드시 넘긴다.
// sharp로 변환해도 1202KB로 0.5% 차이라 변환 라이브러리는 두지 않는다.

export const SLIDE_EXT = 'webp';
export const SLIDE_CONTENT_TYPE = 'image/webp';
export const SLIDE_QUALITY = 82;

/** 썸네일은 JPG를 유지한다 — 원본이 만료된 과거 리포트를 볼 수 있게 하는 폴백이다 */
export const THUMB_EXT = 'jpg';
export const THUMB_CONTENT_TYPE = 'image/jpeg';
