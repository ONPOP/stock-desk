// 성적 집계 (D16 Phase 3) — 최근 N일 채점 결과를 grade.json으로 슬롯 디렉토리에 남긴다.
// 슬라이드 성적표 섹션과 weekly 슬롯의 Claude 입력이 이 파일을 읽는다.
//
//   npx tsx scripts/engine/grade-report.ts --slot weekly_review [--date 2026-08-08] [--days 7]
import '../_bootstrap';

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { summarize, type GradedRow } from '../../lib/engine/grading';
import { ensureSlotDir } from '../../lib/engine/storage-path';
import { resolveRunDir } from './run-context';

interface Row {
  outcome: 'WIN' | 'LOSE' | 'NEUTRAL' | null;
  gap_bp: number | null;
  signal: string;
  confidence: string | null;
  signal_date: string;
  stocks: { ticker: string; name_kr: string | null } | null;
}

function daysAgo(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const slot = argv[argv.indexOf('--slot') + 1];
  const dateIdx = argv.indexOf('--date');
  const date = dateIdx >= 0 ? argv[dateIdx + 1] : null;
  const daysIdx = argv.indexOf('--days');
  const days = daysIdx >= 0 ? Number(argv[daysIdx + 1]) : 7;
  if (!slot || slot.startsWith('--')) throw new Error('--slot <slot_id> 가 필요합니다.');
  if (!Number.isInteger(days) || days < 1) throw new Error('--days는 1 이상의 정수여야 합니다.');

  const { db, meta } = await resolveRunDir(slot, date);
  const since = daysAgo(meta.runDate, days);

  const { data, error } = await db
    .from('slot_signals')
    .select('outcome, gap_bp, signal, confidence, signal_date, stocks!inner(ticker, name_kr)')
    .eq('user_id', meta.userId)
    .gte('signal_date', since)
    .not('graded_at', 'is', null)
    .order('signal_date', { ascending: false })
    .limit(1_000);
  if (error) throw new Error(`성적 조회 실패: ${error.message}`);

  const rows = (data ?? []) as unknown as Row[];
  const stats = summarize(rows.map((r): GradedRow => ({ outcome: r.outcome, gapBp: r.gap_bp })));

  // 신호 종류·확신도별 분해 — 어떤 룰 조건이 성적을 깎는지 Claude가 지목할 수 있게 한다
  const bySignal: Record<string, { n: number; wins: number }> = {};
  const byConfidence: Record<string, { n: number; wins: number }> = {};
  for (const r of rows) {
    if (r.outcome === null) continue;
    const sig = (bySignal[r.signal] ??= { n: 0, wins: 0 });
    sig.n++;
    if (r.outcome === 'WIN') sig.wins++;
    const key = r.confidence ?? 'UNKNOWN';
    const conf = (byConfidence[key] ??= { n: 0, wins: 0 });
    conf.n++;
    if (r.outcome === 'WIN') conf.wins++;
  }

  const worst = rows
    .filter((r) => r.outcome === 'LOSE')
    .slice(0, 10)
    .map((r) => ({
      ticker: r.stocks?.ticker ?? '?',
      name: r.stocks?.name_kr ?? r.stocks?.ticker ?? '?',
      signalDate: r.signal_date,
      signal: r.signal,
      gapBp: r.gap_bp,
    }));

  const hitRate = stats.totalGraded > 0 ? ((stats.wins / stats.totalGraded) * 100).toFixed(1) : '-';
  const payload = {
    ...stats,
    periodDays: days,
    since,
    until: meta.runDate,
    bySignal,
    byConfidence,
    worst,
    note: `최근 ${days}일 · 채점 ${stats.totalGraded}건 · 적중률 ${hitRate}%`,
  };

  const dir = await ensureSlotDir(meta.storageRoot, meta.runDate, slot);
  await writeFile(path.join(dir, 'grade.json'), JSON.stringify(payload, null, 2));
  console.log(`✅ 성적 집계 · ${payload.note}`);
}

main();
