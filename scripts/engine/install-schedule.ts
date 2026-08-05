// 스케줄 동기화 (D16 Phase 3) — schedule_slots → launchd plist 생성·등록·정리.
// 슬롯을 바꾼 뒤 이 스크립트만 다시 실행하면 반영된다. DST 전환 시에도 재실행하면 US 슬롯이 보정된다.
//
//   npx tsx scripts/engine/install-schedule.ts            # 동기화
//   npx tsx scripts/engine/install-schedule.ts --dry      # 미리보기
//   npx tsx scripts/engine/install-schedule.ts --status   # 등록 상태 확인
//   npx tsx scripts/engine/install-schedule.ts --remove   # 전부 해제
import '../_bootstrap';

import { execFile } from 'node:child_process';
import { chmod, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  isUsDst,
  LABEL_PREFIX,
  labelOf,
  launcherPath,
  parseCron,
  renderLauncher,
  renderPlist,
  shiftForStandardTime,
} from '../../lib/engine/launchd';
import { dataDir } from '../../lib/engine/data-dir';
import { adminClient, resolveUserId } from './run-context';

const exec = promisify(execFile);
const AGENTS_DIR = path.join(homedir(), 'Library', 'LaunchAgents');
const REPO_ROOT = process.cwd();
// launchd가 chdir·로그 생성에 쓰는 경로 — 이동식 볼륨이면 잡이 EX_CONFIG로 죽으므로 산출물 루트를 쓴다
const DATA_DIR = dataDir();
const PATH_ENV = `/opt/homebrew/bin:/usr/local/bin:${homedir()}/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin`;

interface SlotRow {
  slot_id: string;
  cron_kst: string;
  market: 'KR' | 'US' | 'BOTH';
  slot_type: string;
  label: string;
  enabled: boolean;
}

function plistPath(slotId: string): string {
  return path.join(AGENTS_DIR, `${labelOf(slotId)}.plist`);
}

/** launchctl 실패는 흔히 "이미 없음/이미 있음"이라 치명적이지 않다 — 사유만 반환 */
async function launchctl(args: string[]): Promise<string | null> {
  try {
    await exec('launchctl', args);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message.split('\n')[0] : String(err);
  }
}

async function listInstalled(): Promise<string[]> {
  try {
    return (await readdir(AGENTS_DIR))
      .filter((f) => f.startsWith(`${LABEL_PREFIX}.`) && f.endsWith('.plist'))
      .map((f) => f.slice(`${LABEL_PREFIX}.`.length, -'.plist'.length));
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dry = argv.includes('--dry');
  const status = argv.includes('--status');
  const removeAll = argv.includes('--remove');
  const uid = process.getuid?.() ?? 501;
  const domain = `gui/${uid}`;

  if (status) {
    const installed = await listInstalled();
    if (installed.length === 0) {
      console.log('등록된 슬롯이 없습니다.');
      return;
    }
    for (const slotId of installed) {
      const err = await launchctl(['print', `${domain}/${labelOf(slotId)}`]);
      console.log(`${err ? '✗ 미로드' : '✓ 로드됨'}  ${slotId}`);
    }
    return;
  }

  await mkdir(AGENTS_DIR, { recursive: true });

  if (removeAll) {
    for (const slotId of await listInstalled()) {
      await launchctl(['bootout', `${domain}/${labelOf(slotId)}`]);
      await rm(plistPath(slotId), { force: true });
      console.log(`− 해제 ${slotId}`);
    }
    console.log('✅ 전체 해제 완료');
    return;
  }

  const db = adminClient();
  const userId = await resolveUserId(db);
  const { data, error } = await db
    .from('schedule_slots')
    .select('slot_id, cron_kst, market, slot_type, label, enabled')
    .eq('user_id', userId);
  if (error) throw new Error(`슬롯 조회 실패: ${error.message}`);

  const slots = (data ?? []) as SlotRow[];
  if (slots.length === 0) {
    console.log('schedule_slots가 비어 있습니다. npx tsx scripts/engine/seed-engine.ts 로 기본 슬롯을 넣으세요.');
    return;
  }

  const usDst = isUsDst(new Date());
  console.log(`미국 서머타임: ${usDst ? '적용 중(설계 기준 그대로)' : '미적용(US 슬롯 +1시간 보정)'}`);

  const enabled = slots.filter((s) => s.enabled);
  const wanted = new Set(enabled.map((s) => s.slot_id));

  // launchd가 실행할 런처는 홈에 둔다 — bash는 이동식 볼륨의 스크립트를 읽지 못한다(exit 126)
  const launcher = launcherPath(DATA_DIR);
  if (!dry) {
    await mkdir(path.dirname(launcher), { recursive: true });
    await writeFile(launcher, renderLauncher({ repoRoot: REPO_ROOT, dataDir: DATA_DIR, pathEnv: PATH_ENV }), {
      mode: 0o755,
    });
    await chmod(launcher, 0o755);
    console.log(`런처: ${launcher}`);
  }

  for (const slot of enabled) {
    let spec = parseCron(slot.cron_kst);
    // 설계서 §7의 US cron_kst는 서머타임 기준 — 표준시 기간에는 KST 시각이 1시간 늦어진다
    if (slot.market === 'US' && !usDst) spec = shiftForStandardTime(spec);

    const xml = renderPlist({
      slotId: slot.slot_id,
      spec,
      repoRoot: REPO_ROOT,
      logPath: path.join(DATA_DIR, 'logs', `${slot.slot_id}.launchd.log`),
      pathEnv: PATH_ENV,
      dataDir: DATA_DIR,
    });

    const times = spec.hours
      .flatMap((h) => spec.minutes.map((m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`))
      .join(',');
    const days = spec.weekdays ? `요일 ${spec.weekdays.join('')}` : '매일';
    console.log(`${dry ? '· (dry)' : '+'} ${slot.slot_id} [${slot.slot_type}/${slot.market}] ${times} ${days} — ${slot.label}`);
    if (dry) continue;

    await mkdir(path.join(DATA_DIR, 'logs'), { recursive: true });
    await writeFile(plistPath(slot.slot_id), xml);
    // 재등록: 기존 로드를 내리고 다시 올려야 변경된 스케줄이 반영된다
    await launchctl(['bootout', `${domain}/${labelOf(slot.slot_id)}`]);
    const err = await launchctl(['bootstrap', domain, plistPath(slot.slot_id)]);
    if (err) console.warn(`  ⚠ 등록 실패: ${err}`);
  }

  // DB에서 사라졌거나 비활성화된 슬롯의 잔여 등록 정리
  for (const slotId of await listInstalled()) {
    if (wanted.has(slotId)) continue;
    console.log(`${dry ? '· (dry)' : '−'} 정리 ${slotId}`);
    if (dry) continue;
    await launchctl(['bootout', `${domain}/${labelOf(slotId)}`]);
    await rm(plistPath(slotId), { force: true });
  }

  console.log(dry ? '\n(dry run — 변경 없음)' : `\n✅ 스케줄 동기화 완료 · 활성 ${enabled.length}개`);
}

main();
