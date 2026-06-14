import { describe, it, expect } from 'vitest';
import { collectSecrets, redactSecrets } from './redact';

const MASK = '••••';

describe('redactSecrets — 구조 기반(연결 문자열)', () => {
  it('비밀번호를 마스킹하고 호스트는 보존한다', () => {
    const out = redactSecrets('postgresql://postgres:p4ssw0rd@db.abc.supabase.co:5432/postgres', {});
    expect(out).toContain('postgres:' + MASK + '@db.abc.supabase.co:5432');
    expect(out).not.toContain('p4ssw0rd');
  });

  it('특수문자(@ # !)가 섞인 비밀번호도 첫 @까지만 잘려도 호스트 구간을 가린다', () => {
    const out = redactSecrets('postgresql://postgres:snrkqk123!@#x@db.host.co:5432/postgres', {});
    expect(out).not.toContain('snrkqk123');
    expect(out).toContain(MASK);
  });

  it('redis/mongodb 등 다른 스킴도 차단한다', () => {
    expect(redactSecrets('redis://user:topsecret@cache:6379', {})).not.toContain('topsecret');
  });
});

describe('redactSecrets — 값 기반(환경변수)', () => {
  const env = {
    SUPABASE_DB_URL: 'postgresql://postgres:Pw%40123@db.abc.supabase.co:5432/postgres',
    SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiThisIsAServiceRoleKey',
    KIS_APP_SECRET: 'kis-super-secret-value-1234',
  };

  it('service_role 키가 메시지 어디에 박혀도 가린다', () => {
    const out = redactSecrets('auth failed for eyJhbGciOiJIUzI1NiThisIsAServiceRoleKey end', env);
    expect(out).not.toContain('ServiceRoleKey');
    expect(out).toContain(MASK);
  });

  it('인코딩된 비밀번호와 디코딩된 형태(%40 ↔ @)를 모두 등록한다', () => {
    const secrets = collectSecrets(env);
    expect(secrets).toContain('Pw%40123'); // 인코딩형
    expect(secrets).toContain('Pw@123'); // 디코딩형
  });

  it('디코딩된 비밀번호가 평문으로 새도 잡는다', () => {
    expect(redactSecrets('connection used Pw@123 here', env)).not.toContain('Pw@123');
  });

  it('KIS 시크릿 값을 가린다', () => {
    expect(redactSecrets('secret=kis-super-secret-value-1234', env)).not.toContain('kis-super-secret');
  });
});

describe('redactSecrets — Error 객체(실제 노출 사고 재현)', () => {
  it('postgres 파싱 에러의 input 속성에 담긴 비밀번호까지 가린다', () => {
    // 실제 발생: TypeError: Invalid URL { input: 'postgresql://postgres:secretpw@' }
    const err = new TypeError('Invalid URL') as TypeError & { input?: string };
    err.input = 'postgresql://postgres:secretpw@';
    const out = redactSecrets(err, {});
    expect(out).not.toContain('secretpw');
    expect(out).toContain('Invalid URL');
  });

  it('stack에 시크릿이 있어도 가린다', () => {
    const env = { KIS_APP_SECRET: 'leaked-in-stack-secret-xyz' };
    const err = new Error('boom: leaked-in-stack-secret-xyz');
    expect(redactSecrets(err, env)).not.toContain('leaked-in-stack-secret-xyz');
  });
});

describe('redactSecrets — 오탐 방지', () => {
  it('시크릿 없는 일반 메시지는 그대로 둔다', () => {
    const msg = '✅ 0001_init.sql 적용 완료';
    expect(redactSecrets(msg, {})).toBe(msg);
  });

  it('너무 짧은 env 값(<4자)은 마스킹 대상에서 제외한다', () => {
    const env = { KIS_APP_KEY: 'abc' }; // 3자
    expect(collectSecrets(env)).not.toContain('abc');
  });

  it('잘못된 퍼센트 인코딩이 있어도 throw하지 않는다', () => {
    const env = { SUPABASE_DB_URL: 'postgresql://u:%ZZ@host:5432/db' };
    expect(() => collectSecrets(env)).not.toThrow();
    expect(collectSecrets(env)).toContain('%ZZ');
  });
});

describe('collectSecrets — 치환 우선순위', () => {
  it('긴 시크릿을 먼저 치환하도록 길이 내림차순 정렬한다', () => {
    const env = {
      KIS_APP_KEY: 'shortkey',
      KIS_APP_SECRET: 'shortkey-with-longer-suffix',
    };
    const secrets = collectSecrets(env);
    expect(secrets[0].length).toBeGreaterThanOrEqual(secrets[1].length);
  });
});
