// 슬라이드 캡처 — 맞춤 배율 측정과 실제 캡처. 렌더(render-slides)와 backfill이 **같은 코드**를 쓴다.
//
// 여기 있는 이유: 이 로직을 다른 곳에서 다시 구현했다가, 축소를 건너뛴 이미지를 실제 산출물로
// 착각해 "잘렸다"고 잘못 판단한 일이 있었다(2026-08-10). 캡처 경로는 하나만 존재해야 한다.
//
// lib/이 아니라 scripts/에 두는 이유: playwright를 Next 앱 번들 경로에 끌어들이지 않기 위해서다.
import { pathToFileURL } from 'node:url';
import type { Browser } from 'playwright';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../../lib/engine/slide-html';

/** 내용이 넘쳐도 이 배율 아래로는 줄이지 않는다 — 더 줄이면 읽을 수 없다 */
export const MIN_FIT_SCALE = 0.5;
/** 이분 탐색 횟수. 6회면 배율 오차가 1% 아래로 떨어진다 */
export const FIT_STEPS = 6;

export interface Fit {
  /** 적용할 배율(1이면 축소 없음) */
  scale: number;
  /** 배율 하한까지 줄여도 여전히 넘치는가 — 이 경우 잘림이 남는다 */
  clipped: boolean;
}

/**
 * 슬라이드가 캔버스 안에 다 들어오는 가장 큰 배율을 찾는다.
 *
 * `.panel`·`.right`처럼 overflow:hidden인 요소는 넘쳐도 스크롤바가 없어 조용히 잘리므로
 * 문서 전체가 아니라 '잘라내는 요소' 각각을 본다.
 *
 * 축소는 논리 캔버스를 1/scale로 키우는 방식이다(캡처 단계에서 deviceScaleFactor로 되돌린다).
 * 캔버스를 키우면 줄바꿈이 달라져 필요한 배율이 한 번에 안 나오므로 이분 탐색으로 최대값을 찾는다.
 * 넘침 비율로 한 번에 계산하면 항상 하한까지 과하게 줄어 글자만 작아지고 여백이 남는다.
 */
export async function measureFit(browser: Browser, htmlPath: string): Promise<Fit> {
  const page = await browser.newPage({ viewport: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT } });
  try {
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    // 브라우저에서 도는 코드에는 헬퍼 함수를 두지 않는다 —
    // tsx(esbuild)가 이름 있는 함수에 `__name` 래퍼를 붙이는데 그 헬퍼는 페이지에 없다(ReferenceError).
    return await page.evaluate(
      ({ w, h, min, steps }) => {
        let scale = 1;
        let lo = min;
        let hi = 1;
        let best = min;
        // 0=원본 확인, 1=하한 확인, 2=이분 탐색
        let phase = 0;

        for (let step = 0; step < steps + 2; step++) {
          for (const el of [document.documentElement, document.body]) {
            el.style.width = `${w / scale}px`;
            el.style.height = `${h / scale}px`;
          }

          let over = false;
          for (const el of Array.from(document.querySelectorAll<HTMLElement>('body, body *'))) {
            const style = getComputedStyle(el);
            if (!/hidden|clip|auto|scroll/.test(`${style.overflowX}${style.overflowY}`)) continue;
            // 1px은 서브픽셀 반올림 여유
            if (
              (el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 1) ||
              (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
            ) {
              over = true;
              break;
            }
          }

          if (phase === 0) {
            if (!over) return { scale: 1, clipped: false };
            phase = 1;
            scale = min;
            continue;
          }
          if (phase === 1) {
            if (over) return { scale: min, clipped: true };
            phase = 2;
          } else if (over) {
            hi = scale;
          } else {
            best = scale;
            lo = scale;
          }
          scale = (lo + hi) / 2;
        }
        return { scale: best, clipped: false };
      },
      { w: SLIDE_WIDTH, h: SLIDE_HEIGHT, min: MIN_FIT_SCALE, steps: FIT_STEPS },
    );
  } finally {
    await page.close();
  }
}

/**
 * 논리 캔버스 1600/fit × 900/fit 를 deviceScaleFactor로 되돌려 정확히 1600×900(썸네일은 ×outScale)을 얻는다.
 * CSS zoom은 인라인 스타일과 충돌해 썸네일이 좌상단만 잘려 나왔다 — 배율은 캡처 단계에서만 건드린다.
 */
export async function captureSlide(
  browser: Browser,
  htmlPath: string,
  outPath: string,
  opts: { fit: number; outScale: number; type: 'png' | 'jpeg' | 'webp'; quality?: number },
): Promise<void> {
  const viewW = Math.round(SLIDE_WIDTH / opts.fit);
  const viewH = Math.round((viewW * SLIDE_HEIGHT) / SLIDE_WIDTH);
  const page = await browser.newPage({
    viewport: { width: viewW, height: viewH },
    deviceScaleFactor: (SLIDE_WIDTH * opts.outScale) / viewW,
  });
  try {
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    if (opts.fit !== 1) {
      await page.addStyleTag({ content: `html,body{width:${viewW}px!important;height:${viewH}px!important}` });
    }
    // png은 quality를 받지 않는다. webp는 반드시 넘겨야 한다 — 생략하면 무손실에 가깝게 나와 8%밖에 안 줄어든다.
    await page.screenshot({
      path: outPath,
      type: opts.type,
      ...(opts.quality === undefined ? {} : { quality: opts.quality }),
    });
  } finally {
    await page.close();
  }
}
