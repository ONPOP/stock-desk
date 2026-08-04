import { describe, expect, it } from 'vitest';
import {
  AUTO_LOGIN_COOKIE_OPTIONS,
  SESSION_COOKIE_OPTIONS,
  decideSession,
  isSupabaseAuthCookie,
  type SessionState,
} from './auto-login';

const state = (o: Partial<SessionState> = {}): SessionState => ({
  hasUser: true,
  autoLogin: false,
  sessionActive: false,
  ...o,
});

describe('decideSession', () => {
  it('로그인되어 있지 않으면 unauthenticated', () => {
    expect(decideSession(state({ hasUser: false }))).toBe('unauthenticated');
    expect(decideSession(state({ hasUser: false, autoLogin: true }))).toBe('unauthenticated');
  });

  it('자동 로그인이 켜져 있으면 유지한다', () => {
    expect(decideSession(state({ autoLogin: true }))).toBe('allow');
  });

  it('자동 로그인이 꺼져 있어도 이번 실행 중에는 유지한다', () => {
    expect(decideSession(state({ sessionActive: true }))).toBe('allow');
  });

  it('앱을 껐다 켜 세션 쿠키가 사라지면 끊는다', () => {
    expect(decideSession(state())).toBe('sign-out');
  });

  it('자동 로그인이 켜져 있으면 세션 쿠키 유무와 무관하다', () => {
    expect(decideSession(state({ autoLogin: true, sessionActive: false }))).toBe('allow');
    expect(decideSession(state({ autoLogin: true, sessionActive: true }))).toBe('allow');
  });
});

describe('쿠키 옵션', () => {
  it('자동 로그인 쿠키는 영속이어야 한다', () => {
    expect(AUTO_LOGIN_COOKIE_OPTIONS.maxAge).toBeGreaterThan(0);
    expect(AUTO_LOGIN_COOKIE_OPTIONS.httpOnly).toBe(true);
  });

  it('세션 쿠키는 수명을 갖지 않아야 종료 시 폐기된다', () => {
    expect(SESSION_COOKIE_OPTIONS).not.toHaveProperty('maxAge');
    expect(SESSION_COOKIE_OPTIONS).not.toHaveProperty('expires');
    expect(SESSION_COOKIE_OPTIONS.httpOnly).toBe(true);
  });
});

describe('isSupabaseAuthCookie', () => {
  it('인증 쿠키와 청크를 인식한다', () => {
    expect(isSupabaseAuthCookie('sb-abcdefg-auth-token')).toBe(true);
    expect(isSupabaseAuthCookie('sb-abcdefg-auth-token.0')).toBe(true);
    expect(isSupabaseAuthCookie('sb-abcdefg-auth-token.12')).toBe(true);
  });

  it('무관한 쿠키는 건드리지 않는다', () => {
    expect(isSupabaseAuthCookie('sd_auto_login')).toBe(false);
    expect(isSupabaseAuthCookie('sb-abcdefg-auth-token-code-verifier')).toBe(false);
    expect(isSupabaseAuthCookie('theme')).toBe(false);
    expect(isSupabaseAuthCookie('')).toBe(false);
  });
});
