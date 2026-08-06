// 슬라이드 렌더 (D16 Phase 2) — 슬라이드 정의 → PNG + 썸네일.
// pptx 파일은 만들지 않는다. 앱(/reports)이 이 PNG를 날짜·시간별로 모아 보여준다.
//
//   npx tsx scripts/engine/render-slides.ts --slot kr_close_buy [--date 2026-08-04]
//
// Next 서버에 의존하지 않는다: 자기완결 HTML을 file://로 열어 캡처하므로 launchd 배치에서 단독 실행된다.
import '../_bootstrap';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser } from 'playwright';
import {
  buildSlides,
  type BuildSlidesInput,
  type GradeSummary,
  type SnapshotRadar,
  type SnapshotSelected,
} from '../../lib/engine/slide-builder';
import { DEFAULT_WATCH_ZONE, watchZoneSchema } from '../../lib/engine/rules';
import { parseAnalysisOutput, type Slide } from '../../lib/engine/slide-schema';
import { renderSlideHtml, SLIDE_HEIGHT, SLIDE_WIDTH } from '../../lib/engine/slide-html';
import { resolveRunDir, type RunMeta } from './run-context';

const THUMB_SCALE = 0.25;

interface RenderArgs {
  slot: string;
  date: string | null;
}

function parseArgs(argv: string[]): RenderArgs {
  let slot: string | null = null;
  let date: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--slot') slot = argv[++i] ?? null;
    else if (argv[i] === '--date') date = argv[++i] ?? null;
  }
  if (!slot) throw new Error('--slot <slot_id> 가 필요합니다.');
  return { slot, date };
}

/** 내용이 넘쳐도 이 배율 아래로는 줄이지 않는다 — 더 줄이면 읽을 수 없다 */
const MIN_FIT_SCALE = 0.5;
/** 이분 탐색 횟수. 6회면 배율 오차가 1% 아래로 떨어진다 */
const FIT_STEPS = 6;

interface Fit {
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
 * 축소는 논리 캔버스를 1/scale로 키우는 방식이다(렌더 단계에서 deviceScaleFactor로 되돌린다).
 * 캔버스를 키우면 줄바꿈이 달라져 필요한 배율이 한 번에 안 나오므로 이분 탐색으로 최대값을 찾는다.
 * 넘침 비율로 한 번에 계산하면 항상 하한까지 과하게 줄어 글자만 작아지고 여백이 남는다.
 */
async function measureFit(browser: Browser, htmlPath: string): Promise<Fit> {
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
async function capture(
  browser: Browser,
  htmlPath: string,
  outPath: string,
  opts: { fit: number; outScale: number; type: 'png' | 'jpeg' },
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
    await page.screenshot({
      path: outPath,
      type: opts.type,
      ...(opts.type === 'jpeg' ? { quality: 72 } : {}),
    });
  } finally {
    await page.close();
  }
}

/** 전일 신호 채점 결과 요약 — 없으면 성적표 슬라이드를 생략한다 */
async function readGradeSummary(dir: string): Promise<GradeSummary | null> {
  try {
    return JSON.parse(await readFile(path.join(dir, 'grade.json'), 'utf8')) as GradeSummary;
  } catch {
    return null;
  }
}

export async function renderSlotSlides(meta: RunMeta, dir: string): Promise<string[]> {
  const snapshot = JSON.parse(await readFile(path.join(dir, 'snapshot.json'), 'utf8')) as {
    selected: SnapshotSelected[];
    failed: Array<{ ticker: string }>;
    radar?: SnapshotRadar[];
    watchZone?: unknown;
  };
  const analysis = parseAnalysisOutput(JSON.parse(await readFile(path.join(dir, 'analysis.json'), 'utf8')));

  const input: BuildSlidesInput = {
    slotLabel: meta.label ?? meta.slotId,
    runAtKst: meta.runAtKst ?? meta.runDate,
    analysis,
    selected: snapshot.selected,
    failedTickers: snapshot.failed.map((f) => f.ticker),
    grade: await readGradeSummary(dir),
    radar: snapshot.radar ?? [],
    // 구버전 스냅샷에는 규칙이 없다 — 기본값으로 표기만 하고 렌더는 계속한다
    watchZone: watchZoneSchema.safeParse(snapshot.watchZone).data ?? DEFAULT_WATCH_ZONE,
  };

  const slides: Slide[] = buildSlides(input);
  await writeFile(path.join(dir, 'slides.json'), JSON.stringify(slides, null, 2));

  const htmlDir = path.join(dir, 'html');
  const thumbDir = path.join(dir, 'thumbs');
  await mkdir(htmlDir, { recursive: true });
  await mkdir(thumbDir, { recursive: true });

  const browser = await chromium.launch();
  const relPaths: string[] = [];
  const shrunk: string[] = [];
  const clipped: string[] = [];
  try {
    for (let i = 0; i < slides.length; i++) {
      const n = String(i + 1).padStart(2, '0');
      const htmlPath = path.join(htmlDir, `${n}.html`);
      await writeFile(htmlPath, renderSlideHtml(slides[i]));

      const fit = await measureFit(browser, htmlPath);
      await capture(browser, htmlPath, path.join(dir, `${n}.png`), { fit: fit.scale, outScale: 1, type: 'png' });
      await capture(browser, htmlPath, path.join(thumbDir, `${n}.jpg`), {
        fit: fit.scale,
        outScale: THUMB_SCALE,
        type: 'jpeg',
      });
      relPaths.push(`${meta.runDate}/${meta.slotId}/${n}.png`);
      // 축소가 걸렸다는 건 내용이 캔버스보다 많다는 뜻 — 반복되면 슬라이드 분할을 검토해야 한다
      if (fit.scale < 1) shrunk.push(`${n}(${Math.round(fit.scale * 100)}%)`);
      if (fit.clipped) clipped.push(n);
    }
  } finally {
    await browser.close();
  }
  if (shrunk.length > 0) console.log(`   ℹ 내용이 많아 축소한 슬라이드: ${shrunk.join(', ')}`);
  if (clipped.length > 0) {
    console.warn(`   ⚠ 하한(${MIN_FIT_SCALE})까지 줄여도 넘쳐 잘린 슬라이드: ${clipped.join(', ')}`);
  }
  return relPaths;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { meta, dir } = await resolveRunDir(args.slot, args.date);
  const paths = await renderSlotSlides(meta, dir);
  await writeFile(path.join(dir, 'slide-paths.json'), JSON.stringify(paths, null, 2));
  console.log(`✅ 슬라이드 ${paths.length}장 렌더 · ${dir}`);
}

main();
