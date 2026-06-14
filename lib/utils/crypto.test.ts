import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConfigError } from '@/lib/errors';
import { decryptSecret, encryptSecret, maskSecret } from '@/lib/utils/crypto';

const VALID_KEY = randomBytes(32).toString('base64');

/** ConfigError는 사용자 메시지를 일반화하므로 내부 상세(internal)로 원인을 검증 */
function expectConfigError(fn: () => unknown, internalPattern: RegExp) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError);
    expect((e as ConfigError).internal).toMatch(internalPattern);
    return;
  }
  expect.fail('오류가 발생해야 합니다.');
}

beforeEach(() => {
  process.env.APP_ENCRYPTION_KEY = VALID_KEY;
});

describe('encryptSecret / decryptSecret — 정상 케이스', () => {
  it('암호화 → 복호화 왕복이 원문을 보존한다', () => {
    const secret = 'PSA1b2C3d4E5-example-app-key';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('유니코드·특수문자 원문도 보존한다', () => {
    const secret = '한글키🔑 with spaces & symbols !@#$%^';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('같은 평문도 매번 다른 암호문을 생성한다 (IV 무작위)', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });
});

describe('encryptSecret / decryptSecret — 비정상 케이스', () => {
  it('빈 문자열 암호화를 거부한다', () => {
    expect(() => encryptSecret('')).toThrow();
  });

  it('환경변수 누락 시 명확한 오류를 던진다', () => {
    delete process.env.APP_ENCRYPTION_KEY;
    expectConfigError(() => encryptSecret('x'.repeat(10)), /APP_ENCRYPTION_KEY/);
  });

  it('32바이트가 아닌 키를 거부한다', () => {
    process.env.APP_ENCRYPTION_KEY = randomBytes(16).toString('base64');
    expectConfigError(() => encryptSecret('x'.repeat(10)), /32바이트/);
  });

  it('암호문 변조(ciphertext) 시 복호화를 거부한다', () => {
    const enc = encryptSecret('sensitive-value');
    const parts = enc.split('.');
    const data = Buffer.from(parts[3], 'base64');
    data[0] ^= 0xff;
    parts[3] = data.toString('base64');
    expectConfigError(() => decryptSecret(parts.join('.')), /복호화/);
  });

  it('인증 태그 변조 시 복호화를 거부한다', () => {
    const enc = encryptSecret('sensitive-value');
    const parts = enc.split('.');
    const tag = Buffer.from(parts[2], 'base64');
    tag[0] ^= 0xff;
    parts[2] = tag.toString('base64');
    expectConfigError(() => decryptSecret(parts.join('.')), /복호화/);
  });

  it('다른 키로 암호화된 데이터의 복호화를 거부한다', () => {
    const enc = encryptSecret('sensitive-value');
    process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    expectConfigError(() => decryptSecret(enc), /복호화/);
  });

  it.each(['', 'v1', 'v2.a.b.c', 'not-encrypted', 'v1..', 'v1.!!.@@.##'])(
    '형식이 깨진 입력을 거부한다: "%s"',
    (bad) => {
      expect(() => decryptSecret(bad)).toThrow();
    },
  );
});

describe('maskSecret', () => {
  it('앞 4자 + 뒤 4자만 노출한다', () => {
    expect(maskSecret('PSA1b2C3d4E5f6G7')).toBe('PSA1****f6G7');
  });

  it('짧은 값은 전체 마스킹한다 (길이 정보 노출 방지)', () => {
    expect(maskSecret('short')).toBe('****');
    expect(maskSecret('12345678')).toBe('****');
  });
});
