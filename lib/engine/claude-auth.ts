// `claude -p` 헤드리스 실패가 "로그인 만료"인지 판별한다.
//
// 2026-08-14 04:30 ~ 08-19, 전 슬롯이 6일간 연속 실패했다. 원인은 OAuth 세션 만료였는데
// 텔레그램에는 "claude 분석 실패 (exit 1)"만 갔다. exit 코드만으로는 프롬프트 오류와
// 구분되지 않아 조치가 6일 늦어졌다. 그래서 원인을 문구로 분리한다.
//
// server-only를 import하지 않는다 — scripts/engine/*가 tsx로 직접 쓴다.

/** claude CLI가 인증 실패 시 내는 문구. 오탐을 막으려고 넓은 단어 대신 구절로 맞춘다. */
const AUTH_FAILURE_PATTERNS = [
  /failed to authenticate/i,
  /oauth session expired/i,
  /oauth token (has )?expired/i,
  /invalid refresh token/i,
  /please run \/login/i,
  /invalid api key/i,
];

export const CLAUDE_AUTH_HINT =
  'Claude 로그인이 만료됐습니다. 터미널에서 `claude` 를 실행해 /login 으로 다시 로그인하세요. ' +
  '재로그인 전까지 모든 슬롯의 분석 단계가 계속 실패합니다.';

/**
 * 실패한 claude 실행의 출력에서 인증 만료 여부를 판별한다.
 * 인증 문제면 사용자 조치 문구를, 아니면 null을 준다.
 */
export function detectClaudeAuthFailure(output: string): string | null {
  if (!output) return null;
  return AUTH_FAILURE_PATTERNS.some((re) => re.test(output)) ? CLAUDE_AUTH_HINT : null;
}
