// AES-256-GCM 암호화 구현부. 'server-only' 없이 두는 이유:
// 배치 스크립트(scripts/engine/*)가 tsx로 직접 실행되는데 server-only는 CJS 로더에서 즉시 throw한다.
// 웹(RSC) 경로는 lib/utils/crypto.ts를 통해 import하며 거기에 server-only 가드가 그대로 살아 있다.
// 이 파일을 클라이언트 컴포넌트에서 직접 import하지 말 것.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ConfigError } from '@/lib/errors';

const VERSION = 'v1';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new ConfigError('APP_ENCRYPTION_KEY 환경변수가 설정되지 않았습니다.');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new ConfigError(
      `APP_ENCRYPTION_KEY는 base64 인코딩된 32바이트여야 합니다 (현재 ${key.length}바이트). openssl rand -base64 32로 생성하세요.`,
    );
  }
  return key;
}

/** 평문 → "v1.<base64(iv)>.<base64(tag)>.<base64(ciphertext)>" */
export function encryptSecret(plaintext: string): string {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new ConfigError('암호화할 값이 비어 있습니다.');
  }
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
}

/** encryptSecret 출력 → 평문. 형식·무결성 위반 시 ConfigError */
export function decryptSecret(encoded: string): string {
  const parts = encoded.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new ConfigError('암호화 데이터 형식이 올바르지 않습니다.');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new ConfigError('암호화 데이터가 손상되었습니다.');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    // GCM 인증 실패 = 변조 또는 키 불일치
    throw new ConfigError('암호화 데이터 복호화에 실패했습니다 (키 불일치 또는 변조).');
  }
}
