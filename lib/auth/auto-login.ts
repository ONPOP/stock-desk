// 자동 로그인 정책 — 비밀번호는 저장하지 않는다.
//
// Supabase 인증 쿠키(refresh token)는 이미 400일 수명으로 디스크에 남고, `@supabase/ssr`는
// 그 maxAge를 강제해 cookieOptions로 낮출 수 없다(cookies.js의 setCookieOptions).
// 그래서 "유지할지 말지"는 인증 쿠키를 건드리는 대신 우리가 통제하는 쿠키 2개로 판정한다.
//
//   sd_auto_login    영속 쿠키 — 사용자가 자동 로그인을 켰다는 표시
//   sd_session_active 세션 쿠키 — 앱/브라우저를 닫으면 사라진다 (이번 실행 중에만 유효)
//
// 자동 로그인이 꺼진 상태에서 앱을 껐다 켜면 세션 쿠키가 사라지므로 로그인 화면으로 돌아간다.
// Electron 기본 세션이 세션 쿠키를 종료 시 폐기하는 동작에 그대로 올라탄다.

export const AUTO_LOGIN_COOKIE = 'sd_auto_login';
export const SESSION_ACTIVE_COOKIE = 'sd_session_active';

/** 브라우저 쿠키 수명 상한(400일)에 맞춘다 — 인증 쿠키와 같은 주기로 만료시키기 위함 */
export const AUTO_LOGIN_MAX_AGE = 400 * 24 * 60 * 60;

export type SessionDecision =
  /** 인증 세션이 유효하고 정책상 유지 */
  | 'allow'
  /** 인증 세션은 있으나 유지 근거가 없다 — 끊고 로그인 화면으로 */
  | 'sign-out'
  /** 애초에 로그인되어 있지 않다 */
  | 'unauthenticated';

export interface SessionState {
  hasUser: boolean;
  autoLogin: boolean;
  sessionActive: boolean;
}

/**
 * 세션 유지 여부 판정.
 *
 * 자동 로그인이 켜져 있으면 무기한 유지한다(사용자가 직접 로그아웃할 때까지).
 * 꺼져 있으면 이번 실행 동안만 유지하고, 앱을 닫으면 세션 쿠키가 사라져 다음 실행에서 끊긴다.
 */
export function decideSession(state: SessionState): SessionDecision {
  if (!state.hasUser) return 'unauthenticated';
  if (state.autoLogin) return 'allow';
  if (state.sessionActive) return 'allow';
  return 'sign-out';
}

/**
 * Supabase 인증 쿠키인지. 청크 분할 시 `.0`·`.1` 접미사가 붙는다.
 *
 * 미들웨어가 세션을 끊을 때 `auth.signOut()`을 쓰지 않고 이 판정으로 쿠키를 직접 지운다.
 * signOut은 scope가 'local'이어도 인증 서버로 폐기 요청을 보내기 때문에(GoTrueClient._signOut),
 * 콜드 스타트마다 네트워크 왕복이 생기고 오프라인에서는 정리에 실패한다.
 * 여기서 필요한 건 "이 기기에서 다음 실행 시 다시 로그인"일 뿐이라 로컬 삭제로 충분하다.
 */
export function isSupabaseAuthCookie(name: string): boolean {
  return /^sb-.+-auth-token(\.\d+)?$/.test(name);
}

/** 영속 쿠키 옵션 — httpOnly로 두어 스크립트가 정책을 조작하지 못하게 한다 */
export const AUTO_LOGIN_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: AUTO_LOGIN_MAX_AGE,
} as const;

/** 세션 쿠키 옵션 — maxAge·expires를 주지 않아야 브라우저·Electron이 종료 시 폐기한다 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
} as const;
