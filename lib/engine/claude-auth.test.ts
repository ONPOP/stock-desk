import { describe, expect, it } from 'vitest';
import { detectClaudeAuthFailure } from './claude-auth';

describe('detectClaudeAuthFailure', () => {
  it('2026-08-14 슬롯 전량 실패를 일으킨 실제 출력을 잡는다', () => {
    const hint = detectClaudeAuthFailure(
      'Failed to authenticate: OAuth session expired and could not be refreshed',
    );
    expect(hint).toContain('/login');
  });

  it('다른 인증 실패 문구도 잡는다', () => {
    for (const out of [
      'Invalid API key · Please run /login',
      'OAuth token has expired',
      'Error: invalid refresh token',
      'FAILED TO AUTHENTICATE: something',
    ]) {
      expect(detectClaudeAuthFailure(out), out).not.toBeNull();
    }
  });

  it('인증과 무관한 실패에는 null을 준다', () => {
    for (const out of [
      '',
      'Error: analysis.json을 쓰지 못했습니다',
      'KIS 로그인 세션으로 시세를 받았습니다',
      'Claude AI usage limit reached',
    ]) {
      expect(detectClaudeAuthFailure(out), out).toBeNull();
    }
  });
});
