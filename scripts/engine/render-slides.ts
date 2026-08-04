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

async function capture(
  browser: Browser,
  htmlPath: string,
  outPath: string,
  opts: { zoom: number; type: 'png' | 'jpeg' },
): Promise<void> {
  const width = Math.round(SLIDE_WIDTH * opts.zoom);
  const height = Math.round(SLIDE_HEIGHT * opts.zoom);
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    if (opts.zoom !== 1) {
      // HTML이 1600×900 고정이므로 zoom으로 축소해 썸네일을 만든다 (별도 이미지 라이브러리 불필요)
      await page.addStyleTag({
        content: `html{zoom:${opts.zoom}}html,body{width:${width}px!important;height:${height}px!important}`,
      });
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
  try {
    for (let i = 0; i < slides.length; i++) {
      const n = String(i + 1).padStart(2, '0');
      const htmlPath = path.join(htmlDir, `${n}.html`);
      await writeFile(htmlPath, renderSlideHtml(slides[i]));

      await capture(browser, htmlPath, path.join(dir, `${n}.png`), { zoom: 1, type: 'png' });
      await capture(browser, htmlPath, path.join(thumbDir, `${n}.jpg`), { zoom: THUMB_SCALE, type: 'jpeg' });
      relPaths.push(`${meta.runDate}/${meta.slotId}/${n}.png`);
    }
  } finally {
    await browser.close();
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
