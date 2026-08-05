import { describe, expect, it } from 'vitest';
import {
  isUsDst,
  labelOf,
  launcherPath,
  parseCron,
  renderLauncher,
  renderPlist,
  shiftForStandardTime,
} from './launchd';

describe('parseCron', () => {
  it('분·시·요일 범위를 전개한다', () => {
    expect(parseCron('50 14 * * 1-5')).toEqual({ minutes: [50], hours: [14], weekdays: [1, 2, 3, 4, 5] });
  });

  it('요일 * 는 매일(null)', () => {
    expect(parseCron('0 7 * * *').weekdays).toBeNull();
  });

  it('요일 7을 0(일요일)으로 정규화한다', () => {
    expect(parseCron('0 10 * * 6,7').weekdays).toEqual([0, 6]);
  });

  it('목록·스텝 표기를 지원한다', () => {
    expect(parseCron('0,30 9 * * 1').minutes).toEqual([0, 30]);
    expect(parseCron('0 9-17/4 * * 1').hours).toEqual([9, 13, 17]);
  });

  it('5필드가 아니면 예외', () => {
    expect(() => parseCron('50 14 * *')).toThrow();
  });

  it('일·월 필드는 지원하지 않는다', () => {
    expect(() => parseCron('50 14 1 * 1-5')).toThrow();
  });

  it('매분/매시 실행은 거부한다 (배치 폭주 방지)', () => {
    expect(() => parseCron('* 14 * * 1-5')).toThrow();
    expect(() => parseCron('50 * * * 1-5')).toThrow();
  });

  it('범위를 벗어난 값은 예외', () => {
    expect(() => parseCron('60 14 * * 1')).toThrow();
    expect(() => parseCron('0 24 * * 1')).toThrow();
  });
});

describe('isUsDst', () => {
  it('7월은 서머타임, 1월은 표준시', () => {
    expect(isUsDst(new Date('2026-07-15T12:00:00Z'))).toBe(true);
    expect(isUsDst(new Date('2026-01-15T12:00:00Z'))).toBe(false);
  });
});

describe('shiftForStandardTime', () => {
  it('시각을 1시간 늦춘다', () => {
    const shifted = shiftForStandardTime({ minutes: [30], hours: [21], weekdays: [1, 2] });
    expect(shifted.hours).toEqual([22]);
    expect(shifted.weekdays).toEqual([1, 2]);
  });

  it('자정을 넘기면 요일도 하루 민다', () => {
    const shifted = shiftForStandardTime({ minutes: [30], hours: [23], weekdays: [5] });
    expect(shifted.hours).toEqual([0]);
    expect(shifted.weekdays).toEqual([6]);
  });

  it('토요일이 넘어가면 일요일로 순환한다', () => {
    expect(shiftForStandardTime({ minutes: [0], hours: [23], weekdays: [6] }).weekdays).toEqual([0]);
  });
});

describe('renderLauncher', () => {
  const opts = { repoRoot: '/Volumes/EXT/stock-desk', dataDir: '/Users/x/StockDesk', pathEnv: '/usr/bin:/bin' };

  it('리포지토리로 이동한 뒤 npx로 슬롯을 실행한다', () => {
    const sh = renderLauncher(opts);
    expect(sh).toContain('cd "$REPO_ROOT"');
    expect(sh).toContain('npx tsx scripts/engine/run-slot.ts "$SLOT_ID"');
    expect(sh).toContain('REPO_ROOT="/Volumes/EXT/stock-desk"');
  });

  it('산출물 루트를 환경변수로 내려 하위 단계가 볼륨에 쓰지 않게 한다', () => {
    expect(renderLauncher(opts)).toContain('export STOCK_DESK_DATA_DIR="/Users/x/StockDesk"');
  });

  it('슬롯 로그도 산출물 루트에 남긴다', () => {
    expect(renderLauncher(opts)).toContain('LOG_DIR="$STOCK_DESK_DATA_DIR/logs/$RUN_DATE"');
  });

  it('슬롯 인자가 없으면 사용법을 내고 실패한다', () => {
    expect(renderLauncher(opts)).toContain('usage: run-slot-launchd.sh <slot_id>');
  });
});

describe('renderPlist', () => {
  const base = {
    slotId: 'kr_close_buy',
    repoRoot: '/Users/x/stock-desk',
    logPath: '/Users/x/StockDesk/logs/kr_close_buy.launchd.log',
    pathEnv: '/usr/bin:/bin',
    dataDir: '/Users/x/StockDesk',
  };

  it('라벨과 실행 인자를 담는다', () => {
    const xml = renderPlist({ ...base, spec: parseCron('50 14 * * 1-5') });
    expect(xml).toContain(`<string>${labelOf('kr_close_buy')}</string>`);
    expect(xml).toContain('<string>/Users/x/StockDesk/bin/run-slot-launchd.sh</string>');
    expect(xml).toContain('<string>kr_close_buy</string>');
  });

  // bash는 이동식 볼륨의 스크립트를 읽지 못한다(EPERM → exit 126). 실제로 이 이유로 전 슬롯이 실패했다.
  it('bash가 실행하는 런처는 볼륨이 아니라 산출물 루트에 있다', () => {
    const xml = renderPlist({ ...base, repoRoot: '/Volumes/EXT/stock-desk', spec: parseCron('0 7 * * *') });
    expect(xml).not.toContain('/Volumes/EXT/stock-desk/scripts/engine/run-slot.sh');
    expect(xml).toContain('/Users/x/StockDesk/bin/run-slot-launchd.sh');
  });

  it('요일 수만큼 StartCalendarInterval 항목을 만든다', () => {
    const xml = renderPlist({ ...base, spec: parseCron('50 14 * * 1-5') });
    expect((xml.match(/<key>Weekday<\/key>/g) ?? []).length).toBe(5);
    expect(xml).toContain('<key>Hour</key><integer>14</integer>');
    expect(xml).toContain('<key>Minute</key><integer>50</integer>');
  });

  it('매일 실행이면 Weekday를 넣지 않는다', () => {
    const xml = renderPlist({ ...base, spec: parseCron('0 7 * * *') });
    expect(xml).not.toContain('<key>Weekday</key>');
  });

  // 코드가 이동식 볼륨에 있을 때 launchd가 그 경로로 chdir·로그 생성을 시도하면 EX_CONFIG(78)로 죽는다.
  // 실제로 이 이유로 예약 실행이 전부 실패했다 — 스크립트는 스스로 repoRoot로 cd 한다.
  it('launchd가 직접 여는 경로(WorkingDirectory·로그)는 repoRoot가 아니라 산출물 루트다', () => {
    const xml = renderPlist({
      ...base,
      repoRoot: '/Volumes/EXT/stock-desk',
      spec: parseCron('0 7 * * *'),
    });
    expect(xml).toContain('<key>WorkingDirectory</key><string>/Users/x/StockDesk</string>');
    expect(xml).toContain('<key>StandardOutPath</key><string>/Users/x/StockDesk/logs/kr_close_buy.launchd.log</string>');
  });

  it('산출물 루트를 환경변수로 넘겨 하위 단계가 같은 곳에 쓰게 한다', () => {
    const xml = renderPlist({ ...base, spec: parseCron('0 7 * * *') });
    expect(xml).toContain('<key>STOCK_DESK_DATA_DIR</key><string>/Users/x/StockDesk</string>');
  });

  it('런처 경로는 산출물 루트 하위 bin/ 이다', () => {
    expect(launcherPath('/Users/x/StockDesk')).toBe('/Users/x/StockDesk/bin/run-slot-launchd.sh');
  });

  it('경로의 XML 특수문자를 이스케이프한다', () => {
    const xml = renderPlist({ ...base, dataDir: '/Users/a&b/StockDesk', spec: parseCron('0 7 * * *') });
    expect(xml).toContain('/Users/a&amp;b/StockDesk');
    expect(xml).not.toContain('/Users/a&b/StockDesk');
  });
});
