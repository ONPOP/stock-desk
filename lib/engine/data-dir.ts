// 엔진이 '쓰는' 산출물의 루트 (D16). 슬라이드·로그·적재 대기 큐가 모두 여기 아래에 놓인다.
//
// 별도 개념으로 분리한 이유: 코드는 외장 볼륨에 두고 실행해도 되지만(읽기·실행은 허용),
// macOS는 백그라운드 launchd 잡의 이동식 볼륨 '쓰기'를 TCC로 막는다. 쓰기 루트만 홈으로 옮기면
// 예약 실행이 되살아난다. 기본값은 종전과 같은 <cwd>/data 라서 수동 실행 동작은 바뀌지 않는다.
import { homedir } from 'node:os';
import path from 'node:path';

export const DATA_DIR_ENV = 'STOCK_DESK_DATA_DIR';

/** 이동식 볼륨 쓰기가 막혔을 때 쓰는 홈 하위 기본 루트 */
export function homeDataDir(): string {
  return path.join(homedir(), 'StockDesk');
}

/** `~` 확장 + 절대경로화 */
function expand(input: string): string {
  const trimmed = input.trim();
  const expanded =
    trimmed === '~' || trimmed.startsWith('~/') ? path.join(homedir(), trimmed.slice(1)) : trimmed;
  return path.resolve(expanded);
}

/**
 * 산출물 루트. `STOCK_DESK_DATA_DIR`이 있으면 그것, 없으면 `<cwd>/data`.
 * 배치·웹 API·launchd 잡이 모두 이 함수를 거쳐야 서로 다른 곳을 보지 않는다.
 */
export function dataDir(cwd: string = process.cwd()): string {
  const fromEnv = process.env[DATA_DIR_ENV];
  if (fromEnv && fromEnv.trim() !== '') return expand(fromEnv);
  return path.resolve(cwd, 'data');
}
