// 슬라이드 렌더 (D16 Phase 2 · D19) — 슬라이드 정의 → WebP + 썸네일.
// pptx 파일은 만들지 않는다. 앱(/reports)이 이 이미지를 날짜·시간별로 모아 보여준다.
// 배율 측정·캡처는 slide-capture.ts 하나만 쓴다(backfill과 공유).
//
//   npx tsx scripts/engine/render-slides.ts --slot kr_close_buy [--date 2026-08-04]
//
// Next 서버에 의존하지 않는다: 자기완결 HTML을 file://로 열어 캡처하므로 launchd 배치에서 단독 실행된다.
import '../_bootstrap';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  buildSlides,
  type BuildSlidesInput,
  type GradeSummary,
  type SnapshotRadar,
  type SnapshotSelected,
} from '../../lib/engine/slide-builder';
import { DEFAULT_WATCH_ZONE, watchZoneSchema } from '../../lib/engine/rules';
import { parseAnalysisOutput, type Slide } from '../../lib/engine/slide-schema';
import { renderSlideHtml } from '../../lib/engine/slide-html';
import { SLIDE_EXT, SLIDE_QUALITY, THUMB_EXT } from '../../lib/engine/slide-format';
import { resolveRunDir, type RunMeta } from './run-context';
import { captureSlide, measureFit, MIN_FIT_SCALE } from './slide-capture';

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
      await captureSlide(browser, htmlPath, path.join(dir, `${n}.${SLIDE_EXT}`), {
        fit: fit.scale,
        outScale: 1,
        type: SLIDE_EXT,
        quality: SLIDE_QUALITY,
      });
      await captureSlide(browser, htmlPath, path.join(thumbDir, `${n}.${THUMB_EXT}`), {
        fit: fit.scale,
        outScale: THUMB_SCALE,
        type: 'jpeg',
        quality: 72,
      });
      relPaths.push(`${meta.runDate}/${meta.slotId}/${n}.${SLIDE_EXT}`);
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
