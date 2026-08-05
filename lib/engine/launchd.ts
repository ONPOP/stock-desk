// launchd plist 생성 (D16 Phase 3) — schedule_slots(cron_kst) → StartCalendarInterval.
// 순수 함수만 둔다(파일 쓰기·launchctl 호출은 스크립트). 크론 파싱과 DST 보정이 핵심.

export const LABEL_PREFIX = 'com.stockdesk.slot';

export interface CronSpec {
  minutes: number[];
  hours: number[];
  /** launchd Weekday (0=일요일). 매일이면 null */
  weekdays: number[] | null;
}

function expandField(field: string, min: number, max: number): number[] {
  if (field === '*') return [];
  const out = new Set<number>();
  for (const part of field.split(',')) {
    const [range, stepRaw] = part.split('/');
    const step = stepRaw ? Number(stepRaw) : 1;
    if (!Number.isInteger(step) || step < 1) throw new Error(`크론 step이 올바르지 않습니다: ${part}`);

    let from: number;
    let to: number;
    if (range === '*') {
      from = min;
      to = max;
    } else if (range.includes('-')) {
      const [a, b] = range.split('-').map(Number);
      from = a;
      to = b;
    } else {
      from = Number(range);
      to = from;
    }
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < min || to > max || from > to) {
      throw new Error(`크론 필드 범위가 올바르지 않습니다: ${part}`);
    }
    for (let v = from; v <= to; v += step) out.add(v);
  }
  return [...out].sort((a, b) => a - b);
}

/** 5필드 크론(분 시 일 월 요일) 파싱. 일·월은 슬롯 스케줄에서 쓰지 않으므로 '*'만 허용한다 */
export function parseCron(cron: string): CronSpec {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`크론은 5필드여야 합니다: "${cron}"`);
  const [min, hour, dom, month, dow] = parts;
  if (dom !== '*' || month !== '*') {
    throw new Error(`일·월 필드는 지원하지 않습니다(슬롯은 요일 기반): "${cron}"`);
  }

  const minutes = expandField(min, 0, 59);
  const hours = expandField(hour, 0, 23);
  if (minutes.length === 0 || hours.length === 0) {
    throw new Error(`분·시는 구체적인 값이어야 합니다(매분/매시 실행 금지): "${cron}"`);
  }
  // 크론 요일 0~6(0=일)은 launchd Weekday와 동일 규약. 7은 일요일로 정규화
  const dowList = expandField(dow, 0, 7).map((d) => (d === 7 ? 0 : d));
  return { minutes, hours, weekdays: dowList.length === 0 ? null : [...new Set(dowList)].sort() };
}

/**
 * 미국 서머타임 여부. 뉴욕의 1월 기준 오프셋과 비교해 판정한다.
 * 설계서 §7의 US 슬롯 cron_kst는 서머타임 기준이라, 표준시 기간에는 KST 시각을 1시간 늦춰야 한다.
 */
export function isUsDst(at: Date): boolean {
  const offsetAt = tzOffsetMinutes(at, 'America/New_York');
  const january = new Date(Date.UTC(at.getUTCFullYear(), 0, 15));
  return offsetAt !== tzOffsetMinutes(january, 'America/New_York');
}

function tzOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  );
  return (asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000;
}

/**
 * US 슬롯의 표준시 보정 — 시각을 +1시간 이동한다.
 * 자정을 넘기면 요일도 하루 밀린다(예: 04:30 토 → 05:30 토는 그대로, 23:30 금 → 00:30 토).
 */
export function shiftForStandardTime(spec: CronSpec): CronSpec {
  const rollsOver = spec.hours.some((h) => h === 23);
  const hours = spec.hours.map((h) => (h + 1) % 24);
  const weekdays =
    spec.weekdays && rollsOver ? [...new Set(spec.weekdays.map((d) => (d + 1) % 7))].sort() : spec.weekdays;
  return { minutes: spec.minutes, hours, weekdays };
}

export interface PlistOptions {
  slotId: string;
  spec: CronSpec;
  repoRoot: string;
  logPath: string;
  /** launchd는 로그인 셸 PATH를 물려받지 않는다 */
  pathEnv: string;
  /**
   * 산출물 루트. launchd의 WorkingDirectory·StandardOutPath로도 쓴다.
   * repoRoot를 쓰면 안 된다: 코드가 이동식 볼륨에 있으면 launchd가 잡 기동 단계에서
   * 그 경로로 chdir·로그 파일 생성을 시도하다 TCC에 막혀 EX_CONFIG(78)로 죽는다.
   * (스크립트가 스스로 repoRoot로 cd 하는 것은 허용된다 — 읽기·실행은 막히지 않는다)
   */
  dataDir: string;
}

export function labelOf(slotId: string): string {
  return `${LABEL_PREFIX}.${slotId}`;
}

function xmlEscape(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** launchd가 실행할 런처의 경로 — 반드시 산출물 루트(홈) 아래에 둔다 */
export function launcherPath(dataDir: string): string {
  return `${dataDir}/bin/run-slot-launchd.sh`;
}

/**
 * launchd 전용 런처 스크립트. 이 파일이 리포지토리가 아니라 홈에 있어야 하는 이유:
 * macOS는 이동식 볼륨의 파일 '내용 읽기'를 bash에 허용하지 않는다(EPERM → exit 126).
 * 반면 node/npx는 같은 파일을 읽고 실행할 수 있으므로, bash는 홈에서 시작해 cd 후 npx에 넘긴다.
 */
export function renderLauncher(opts: { repoRoot: string; dataDir: string; pathEnv: string }): string {
  return `#!/bin/bash
# 자동 생성 (scripts/engine/install-schedule.ts) — 직접 수정하지 마라. launchd 전용 런처.
# bash는 이동식 볼륨의 스크립트를 읽지 못하므로 이 파일은 홈에 둔다(node/npx는 읽을 수 있다).
set -uo pipefail

SLOT_ID="\${1:-}"
if [ -z "$SLOT_ID" ]; then echo "usage: run-slot-launchd.sh <slot_id>" >&2; exit 2; fi

REPO_ROOT="${opts.repoRoot}"
export STOCK_DESK_DATA_DIR="${opts.dataDir}"
export PATH="${opts.pathEnv}"

RUN_DATE="$(TZ=Asia/Seoul date +%F)"
LOG_DIR="$STOCK_DESK_DATA_DIR/logs/$RUN_DATE"
mkdir -p "$LOG_DIR"

{
  echo "===== $(TZ=Asia/Seoul date '+%F %T') KST · slot=$SLOT_ID (launchd) ====="
  cd "$REPO_ROOT" || { echo "리포지토리로 이동 실패: $REPO_ROOT"; exit 1; }
  npx tsx scripts/engine/run-slot.ts "$SLOT_ID"
  echo "===== exit=$? ====="
} 2>&1 | tee -a "$LOG_DIR/$SLOT_ID.log"

exit "\${PIPESTATUS[0]}"
`;
}

export function renderPlist(opts: PlistOptions): string {
  const intervals: string[] = [];
  for (const hour of opts.spec.hours) {
    for (const minute of opts.spec.minutes) {
      const days = opts.spec.weekdays ?? [null];
      for (const wd of days) {
        intervals.push(
          `    <dict>\n      <key>Hour</key><integer>${hour}</integer>\n      <key>Minute</key><integer>${minute}</integer>${
            wd === null ? '' : `\n      <key>Weekday</key><integer>${wd}</integer>`
          }\n    </dict>`,
        );
      }
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xmlEscape(labelOf(opts.slotId))}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${xmlEscape(launcherPath(opts.dataDir))}</string>
    <string>${xmlEscape(opts.slotId)}</string>
  </array>
  <key>WorkingDirectory</key><string>${xmlEscape(opts.dataDir)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${xmlEscape(opts.pathEnv)}</string>
    <key>STOCK_DESK_DATA_DIR</key><string>${xmlEscape(opts.dataDir)}</string>
  </dict>
  <key>StartCalendarInterval</key>
  <array>
${intervals.join('\n')}
  </array>
  <key>StandardOutPath</key><string>${xmlEscape(opts.logPath)}</string>
  <key>StandardErrorPath</key><string>${xmlEscape(opts.logPath)}</string>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
`;
}
