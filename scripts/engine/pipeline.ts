// 슬롯 파이프라인 (D16 Phase 1) — 수집 → 지표 → 스코어링 → 스냅샷 적재.
// run_slot.sh의 [1]단계. Claude는 여기 결과(snapshot.json)를 '해석만' 하고 지표를 재계산하지 않는다.
//
//   npx tsx scripts/engine/pipeline.ts --slot kr_close_buy
//   npx tsx scripts/engine/pipeline.ts --test          # 삼성전자·NVDA 스모크(DB 미사용)
//
// 시세는 기존 provider를 재사용한다(KIS 우선, 키 없으면 Yahoo 폴백) — 엔진 전용 수집기를 만들지 않는다.
import '../_bootstrap';

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Candle, Market } from '../../types';
import { dateInTz, KST_TZ } from '../../lib/utils/date';
import { getCandles as getYahooCandles } from '../../lib/providers/yahoo/quote';
import { buildSnapshot, chartSeries, PREFERRED_CANDLE_COUNT } from '../../lib/engine/snapshot';
import { scoreStock, selectForSlot, type ScoredStock } from '../../lib/engine/scorer';
import { radarCommentTargets, selectRadar, type RadarEntry } from '../../lib/engine/radar';
import { DEFAULT_SIGNAL_RULES } from '../../lib/engine/rules';
import {
  DEFAULT_ENGINE_SETTINGS,
  buildSnapshotRows,
  loadActiveRules,
  loadEarningsToday,
  loadEngineSettings,
  loadEngineStocks,
  upsertSnapshotRows,
} from '../../lib/engine/repository';
import { flushSnapshots, queueSnapshots } from '../../lib/engine/fallback-queue';
import { ensureSlotDir, resolveStorageRoot } from '../../lib/engine/storage-path';
import { ScriptKisTokenStore } from '../../lib/engine/kis-token-store';
import { resolveEngineQuoteSource } from '../../lib/engine/quote-source';
import { adminClient, DEFAULT_STORAGE_DIR, resolveUserId } from './run-context';
import type { EngineStock, SlotMarket } from '../../lib/engine/types';

/** 동시 시세 요청 수 — KIS 레이트리밋(초당 20건)과 Yahoo 429 회피를 함께 고려한 보수값 */
const FETCH_CONCURRENCY = 4;

interface Args {
  slot: string | null;
  test: boolean;
  bench: boolean;
  market: SlotMarket;
  dry: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { slot: null, test: false, bench: false, market: 'BOTH', dry: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--slot') args.slot = argv[++i] ?? null;
    else if (argv[i] === '--market') args.market = (argv[++i] as SlotMarket) ?? 'BOTH';
    else if (argv[i] === '--test') args.test = true;
    else if (argv[i] === '--bench') args.bench = true;
    else if (argv[i] === '--dry') args.dry = true;
  }
  return args;
}

/** 완료 기준(30종목 60초) 실측용 고정 유니버스 — DB 미사용 */
const BENCH_TICKERS: Array<[string, Market]> = [
  ['005930', 'KOSPI'], ['000660', 'KOSPI'], ['373220', 'KOSPI'], ['207940', 'KOSPI'],
  ['005380', 'KOSPI'], ['000270', 'KOSPI'], ['068270', 'KOSPI'], ['035420', 'KOSPI'],
  ['035720', 'KOSPI'], ['005490', 'KOSPI'], ['105560', 'KOSPI'], ['055550', 'KOSPI'],
  ['006400', 'KOSPI'], ['051910', 'KOSPI'], ['012330', 'KOSPI'],
  ['NVDA', 'NASDAQ'], ['AAPL', 'NASDAQ'], ['MSFT', 'NASDAQ'], ['GOOGL', 'NASDAQ'],
  ['AMZN', 'NASDAQ'], ['META', 'NASDAQ'], ['TSLA', 'NASDAQ'], ['AVGO', 'NASDAQ'],
  ['AMD', 'NASDAQ'], ['NFLX', 'NASDAQ'], ['COST', 'NASDAQ'], ['ADBE', 'NASDAQ'],
  ['MU', 'NASDAQ'], ['QCOM', 'NASDAQ'], ['INTC', 'NASDAQ'],
];

/** 실패한 종목은 전체를 죽이지 않고 스킵한다 (설계서 §4 — 부분 실패 허용) */
interface FetchOutcome {
  stock: EngineStock;
  candles: Candle[] | null;
  error?: string;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

type CandleFetcher = (ticker: string, market: Market, count: number) => Promise<Candle[]>;

/**
 * 재시도 대상 — KIS 초당 호출 한도, Yahoo 429/5xx 같은 일시적 실패.
 * 종목 없음·형식 오류처럼 재시도해도 동일한 실패는 즉시 포기한다.
 */
function isTransientFetchError(message: string): boolean {
  return /한도|일시적|연결할 수 없습니다|timeout/.test(message);
}

/** 설계서 §4 "재시도 3회" — 지수 백오프. 클라이언트 레이트리미터만으로는 서버측 순간 한도를 못 피한다 */
const RETRY_BACKOFF_MS = [1_500, 3_500, 7_000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchAll(stocks: EngineStock[], fetcher: CandleFetcher): Promise<FetchOutcome[]> {
  return mapWithConcurrency(stocks, FETCH_CONCURRENCY, async (stock) => {
    let lastError = '알 수 없음';
    for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
      try {
        const candles = await fetcher(stock.ticker, stock.market, PREFERRED_CANDLE_COUNT);
        return { stock, candles };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (!isTransientFetchError(lastError) || attempt === RETRY_BACKOFF_MS.length) break;
        await sleep(RETRY_BACKOFF_MS[attempt]);
      }
    }
    return { stock, candles: null, error: lastError };
  });
}

interface SnapshotFile {
  slotId: string;
  runDate: string;
  capturedAt: string;
  ruleVersion: number;
  budget: { maxStocks: number; maxSearchesPerStock: number };
  /** Claude가 분석할 종목 — 이 목록 외 종목 분석은 사용량 예산 위반 */
  selected: Array<{
    stockId: string;
    ticker: string;
    name: string;
    market: Market;
    alwaysBrief: boolean;
    score: number;
    grade: string;
    priceData: unknown;
    indicators: unknown;
    scoreDetail: unknown;
    /** 슬라이드 차트용 최근 120봉 시계열 */
    chart: ReturnType<typeof chartSeries>;
  }>;
  /** 예산에 밀려 제외된 종목 (조용한 절삭 금지) */
  dropped: Array<{ ticker: string; score: number; excluded: string[] }>;
  /** 시세 수집 실패 종목 — 리포트에 '데이터 미수집'으로 표기 */
  failed: Array<{ ticker: string; reason: string }>;
  /** 눌림목 관찰 레이더 — 선정 8종목과 별개 트랙 */
  radar: Array<{
    ticker: string;
    name: string;
    state: 'watching' | 'entry_ready';
    pinned: boolean;
    disparityBp: number | null;
    barsSinceTouch: number | null;
    rsi14: number | null;
    volumeRatioBp: number | null;
  }>;
  /** Claude가 코멘트를 달 관찰 종목 (사용량 예산 보호 — 상위 3개) */
  radarCommentTickers: string[];
  /** 적용된 관찰 규칙 — 슬라이드에 조건을 명시하기 위해 함께 남긴다 */
  watchZone: unknown;
}

function toSnapshotFile(
  slotId: string,
  runDate: string,
  capturedAt: string,
  ruleVersion: number,
  budget: SnapshotFile['budget'],
  selected: ScoredStock[],
  dropped: ScoredStock[],
  failed: FetchOutcome[],
  candlesByStock: Map<string, Candle[]>,
  radar: RadarEntry[],
  radarCommentTickers: string[],
  watchZone: unknown,
): SnapshotFile {
  return {
    slotId,
    runDate,
    capturedAt,
    ruleVersion,
    budget,
    selected: selected.map((s) => ({
      stockId: s.snapshot.stock.stockId,
      ticker: s.snapshot.stock.ticker,
      name: s.snapshot.stock.name,
      market: s.snapshot.stock.market,
      alwaysBrief: s.snapshot.stock.alwaysBrief,
      score: s.score,
      grade: s.grade,
      priceData: s.snapshot.priceData,
      indicators: s.snapshot.indicators,
      scoreDetail: s.detail,
      chart: chartSeries(candlesByStock.get(s.snapshot.stock.stockId) ?? []),
    })),
    dropped: dropped.map((s) => ({
      ticker: s.snapshot.stock.ticker,
      score: s.score,
      excluded: s.detail.excluded,
    })),
    failed: failed.map((f) => ({ ticker: f.stock.ticker, reason: f.error ?? '알 수 없음' })),
    radar: radar.map((r) => ({
      ticker: r.snapshot.stock.ticker,
      name: r.snapshot.stock.name,
      state: r.state,
      pinned: r.pinned,
      disparityBp: r.disparityBp,
      barsSinceTouch: r.barsSinceTouch,
      rsi14: r.snapshot.indicators.rsi14,
      volumeRatioBp: r.snapshot.indicators.volumeRatioBp,
    })),
    radarCommentTickers,
    watchZone,
  };
}

function supabaseEnvPresent(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * 스모크 테스트용 시세 소스 — 운영과 같은 우선순위(KIS → Yahoo)를 DB 없이 재현한다.
 * KIS 키는 환경변수에서만 읽고 값은 출력하지 않는다.
 */
async function smokeFetcher(): Promise<{ name: string; fetch: CandleFetcher }> {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (appKey && appSecret) {
    const { KisClient } = await import('../../lib/providers/kis/client');
    const { getCandles } = await import('../../lib/providers/kis/candle');
    // 토큰은 DB 캐시를 공유한다 — 프로세스마다 재발급하면 KIS 분당 1회 발급 한도에 걸린다
    const tokenStore = supabaseEnvPresent() ? new ScriptKisTokenStore(adminClient()) : undefined;
    const client = new KisClient({ appKey, appSecret }, tokenStore ? { tokenStore } : undefined);
    // KIS 일봉 조회 상한 2000
    return { name: 'kis', fetch: (t, m, c) => getCandles(client, t, m, '1d', Math.min(c, 2_000)) };
  }
  return { name: 'yahoo', fetch: (t, m, c) => getYahooCandles(t, m, '1d', c) };
}

/** 스모크 테스트 — DB 없이 2종목만 돌려 파이프라인 무결성을 확인 */
async function runSmokeTest(): Promise<void> {
  const stocks: EngineStock[] = [
    { stockId: 'smoke-005930', ticker: '005930', name: '삼성전자', market: 'KOSPI', alwaysBrief: true, radarPin: false },
    { stockId: 'smoke-NVDA', ticker: 'NVDA', name: 'NVIDIA', market: 'NASDAQ', alwaysBrief: false, radarPin: false },
  ];

  const source = await smokeFetcher();
  console.log(`시세 소스: ${source.name}`);
  const started = Date.now();
  const fetched = await fetchAll(stocks, source.fetch);
  const scored: ScoredStock[] = [];
  const failed: FetchOutcome[] = [];

  for (const f of fetched) {
    if (!f.candles) {
      failed.push(f);
      continue;
    }
    try {
      const snap = buildSnapshot(f.stock, f.candles);
      scored.push(scoreStock(snap, DEFAULT_SIGNAL_RULES, { earningsTonight: false, netBuyKr: null }));
    } catch (err) {
      failed.push({ ...f, error: err instanceof Error ? err.message : String(err) });
    }
  }

  console.log(`\n⏱  ${((Date.now() - started) / 1000).toFixed(1)}초 · 성공 ${scored.length} / 실패 ${failed.length}\n`);
  for (const s of scored) {
    const { stock, priceData, indicators } = s.snapshot;
    const unit = priceData.currency === 'KRW' ? '원' : '센트';
    console.log(`■ ${stock.name} (${stock.ticker} · ${stock.market})`);
    console.log(`   종가 ${priceData.close.toLocaleString()}${unit} · 전일대비 ${((priceData.changeBp ?? 0) / 100).toFixed(2)}% · ${priceData.asOf}`);
    console.log(`   MA20 ${indicators.ma.ma20?.toLocaleString() ?? 'n/a'} · MA60 ${indicators.ma.ma60?.toLocaleString() ?? 'n/a'} · MA200 ${indicators.ma.ma200?.toLocaleString() ?? 'n/a'} · 배열 ${indicators.alignment}`);
    console.log(`   RSI14 ${indicators.rsi14 ?? 'n/a'}(${indicators.rsiTrend ?? '-'}) · 거래량 20일比 ${indicators.volumeRatioBp === null ? 'n/a' : `${(indicators.volumeRatioBp / 10_000).toFixed(2)}배`}`);
    console.log(`   수익률 1M ${(indicators.returnsBp.m1 ?? 0) / 100}% · 3M ${(indicators.returnsBp.m3 ?? 0) / 100}% · 12M ${(indicators.returnsBp.m12 ?? 0) / 100}% · 3Y ${indicators.returnsBp.y3 === null ? 'n/a' : `${indicators.returnsBp.y3 / 100}%`}`);
    console.log(`   국면 ${JSON.stringify(indicators.phase)}`);
    console.log(`   점수 ${s.score} (${s.grade})${s.detail.excluded.length ? ` · 제외: ${s.detail.excluded.join(', ')}` : ''}`);
    console.log(`   ${s.detail.items.map((i) => `${i.matched ? '✓' : '·'}${i.key}`).join(' ')}\n`);
  }
  for (const f of failed) console.log(`✗ ${f.stock.ticker}: ${f.error}`);
  if (scored.length === 0) throw new Error('스모크 테스트에서 수집된 종목이 없습니다.');
}

async function runSlot(args: Args): Promise<void> {
  if (!args.slot) throw new Error('--slot <slot_id> 가 필요합니다.');

  const db = adminClient();
  const userId = await resolveUserId(db);
  const runDate = dateInTz(new Date(), KST_TZ);
  const capturedAt = new Date().toISOString();
  const started = Date.now();

  // 지난 실행에서 DB 장애로 적재하지 못한 스냅샷을 먼저 밀어 넣는다 (실패해도 이번 실행은 계속한다)
  const recovered = await flushSnapshots((rows) => upsertSnapshotRows(db, rows).then(() => undefined));
  if (recovered.flushed > 0) console.log(`↻ 대기분 재적재 ${recovered.flushed}건 (${recovered.rows}행)`);
  if (recovered.failed > 0) console.warn(`⚠ 대기분 ${recovered.failed}건은 여전히 적재하지 못했습니다.`);

  const [settings, activeRules, stocks] = await Promise.all([
    loadEngineSettings(db, userId).catch(() => DEFAULT_ENGINE_SETTINGS),
    loadActiveRules(db, userId),
    loadEngineStocks(db, userId, args.market),
  ]);
  if (stocks.length === 0) throw new Error('워치리스트에 종목이 없습니다.');

  const earnings = await loadEarningsToday(db, userId, runDate);

  // 시세 소스는 사용자 KIS 키 유무에 따라 결정 (기존 quote-source와 동일한 폴백 규약)
  const source = await resolveEngineQuoteSource(db, userId);
  console.log(`시세 소스: ${source.name} · 대상 ${stocks.length}종목 · 슬롯 ${args.slot} · ${runDate}`);

  const fetched = await fetchAll(stocks, (t, m, c) => source.getCandles(t, m, '1d', c));
  const scored: ScoredStock[] = [];
  const failed: FetchOutcome[] = [];
  const candlesByStock = new Map<string, Candle[]>();
  for (const f of fetched) {
    if (!f.candles) {
      failed.push(f);
      continue;
    }
    try {
      const snap = buildSnapshot(f.stock, f.candles);
      candlesByStock.set(f.stock.stockId, f.candles);
      scored.push(
        scoreStock(snap, activeRules.rules, {
          earningsTonight: earnings.has(f.stock.stockId),
          netBuyKr: null, // 수급(KIS 투자자별 매매동향)은 Phase 2에서 연결
        }),
      );
    } catch (err) {
      failed.push({ ...f, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const { selected, dropped } = selectForSlot(scored, settings.maxStocksPerSlot);

  const selectedIds = new Set(selected.map((s) => s.snapshot.stock.stockId));
  const radar = selectRadar({
    scored,
    zone: activeRules.rules.watchZone,
    pinnedStockIds: new Set(stocks.filter((s) => s.radarPin).map((s) => s.stockId)),
    selectedStockIds: selectedIds,
  });
  const radarComments = radarCommentTargets(radar).map((r) => r.snapshot.stock.ticker);

  const storage = await resolveStorageRoot({
    configured: settings.slideStorageRoot,
    envRoot: process.env.SLIDE_STORAGE_ROOT ?? null,
    defaultRoot: DEFAULT_STORAGE_DIR,
  });
  if (storage.state === 'fallback') {
    console.warn(`⚠ 지정 저장 경로를 쓸 수 없어 기본 경로로 저장합니다 — ${storage.reason}`);
  }

  const dir = await ensureSlotDir(storage.root, runDate, args.slot);
  const file = toSnapshotFile(
    args.slot,
    runDate,
    capturedAt,
    activeRules.version,
    { maxStocks: settings.maxStocksPerSlot, maxSearchesPerStock: settings.maxSearchesPerStock },
    selected,
    dropped,
    failed,
    candlesByStock,
    radar,
    radarComments,
    activeRules.rules.watchZone,
  );
  await writeFile(path.join(dir, 'snapshot.json'), JSON.stringify(file, null, 2));
  // 후속 단계(렌더·알림·적재)가 저장 상태를 알 수 있게 런 메타를 함께 남긴다
  await writeFile(
    path.join(dir, 'run.json'),
    JSON.stringify({ userId, slotId: args.slot, runDate, capturedAt, storageRoot: storage.root, storageState: storage.state }, null, 2),
  );

  // 스냅샷은 선정 종목만이 아니라 전 종목을 적재한다 — 성적표·룰 튜닝의 모수가 되기 때문
  let stored = 0;
  let queuedFile: string | null = null;
  if (!args.dry) {
    const rows = buildSnapshotRows({ userId, slotId: args.slot, runDate, capturedAt }, scored);
    try {
      stored = await upsertSnapshotRows(db, rows);
    } catch (err) {
      // DB 일시 장애로 슬롯 전체(분석·렌더·알림)를 죽이지 않는다 — 산출물은 이미 디스크에 있다
      const reason = err instanceof Error ? err.message : String(err);
      queuedFile = await queueSnapshots({
        kind: 'snapshots',
        userId,
        slotId: args.slot,
        runDate,
        capturedAt,
        rows,
        reason,
      });
      console.warn(`⚠ 스냅샷 적재 실패 — 다음 실행에서 재시도합니다: ${reason}`);
    }
  }

  const elapsed = (Date.now() - started) / 1000;
  console.log(`\n✅ ${elapsed.toFixed(1)}초 · 수집 ${scored.length}/${stocks.length} · 선정 ${selected.length} · 적재 ${stored}행`);
  if (queuedFile) console.log(`   ⏳ 적재 대기 ${scored.length}행 → ${queuedFile}`);
  console.log(`   snapshot.json → ${path.join(dir, 'snapshot.json')}`);
  if (failed.length > 0) console.log(`   ⚠ 미수집 ${failed.length}종목: ${failed.map((f) => f.stock.ticker).join(', ')}`);
  if (radar.length > 0) {
    const ready = radar.filter((r) => r.state === 'entry_ready').length;
    console.log(`   🔭 관찰 ${radar.length}종목 (진입임박 ${ready})`);
  }
  if (dropped.length > 0) console.log(`   ℹ 예산 제외 ${dropped.length}종목: ${dropped.map((d) => d.snapshot.stock.ticker).join(', ')}`);
}

/** 완료 기준 실측 — 30종목 fetch → indicators → scorer 파이프라인 소요 시간. DB 적재는 제외 */
async function runBench(): Promise<void> {
  const stocks: EngineStock[] = BENCH_TICKERS.map(([ticker, market]) => ({
    stockId: `bench-${ticker}`,
    ticker,
    name: ticker,
    market,
    alwaysBrief: false,
    radarPin: false,
  }));

  const source = await smokeFetcher();
  const started = Date.now();
  const fetched = await fetchAll(stocks, source.fetch);
  const fetchedAt = Date.now();

  const scored: ScoredStock[] = [];
  const failed: FetchOutcome[] = [];
  for (const f of fetched) {
    if (!f.candles) {
      failed.push(f);
      continue;
    }
    try {
      scored.push(
        scoreStock(buildSnapshot(f.stock, f.candles), DEFAULT_SIGNAL_RULES, {
          earningsTonight: false,
          netBuyKr: null,
        }),
      );
    } catch (err) {
      failed.push({ ...f, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const { selected } = selectForSlot(scored, 8);
  const total = (Date.now() - started) / 1000;

  console.log(`\n소스 ${source.name} · 동시 요청 ${FETCH_CONCURRENCY}`);
  console.log(`수집 ${((fetchedAt - started) / 1000).toFixed(1)}초 · 지표+스코어링 ${((Date.now() - fetchedAt) / 1000).toFixed(2)}초`);
  console.log(`총 ${total.toFixed(1)}초 · 성공 ${scored.length}/${stocks.length} · 선정 ${selected.length}`);
  console.log(`완료 기준(30종목 60초): ${total <= 60 && scored.length >= 30 ? '통과' : '미달'}`);
  if (failed.length > 0) console.log(`실패: ${failed.map((f) => `${f.stock.ticker}(${f.error})`).join(', ')}`);
  console.log(`상위: ${selected.map((s) => `${s.snapshot.stock.ticker} ${s.score}`).join(' · ')}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.test) await runSmokeTest();
  else if (args.bench) await runBench();
  else await runSlot(args);
}

main();
