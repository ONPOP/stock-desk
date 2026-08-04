// AES-256-GCM 암호화 — 사용자 API 키 저장 전용 (PRD 12장: 서버측 암호화, 클라이언트 노출 금지)
// 서버 전용 모듈. 클라이언트 번들에 포함되면 안 된다.
// 구현은 lib/utils/crypto-core.ts에 있다 (배치 스크립트가 server-only 없이 재사용해야 하므로 분리).
import 'server-only';

export { encryptSecret, decryptSecret } from '@/lib/utils/crypto-core';

/** 키 마스킹 표시용 — 앞 4자 + **** + 뒤 4자 (8자 이하면 전체 마스킹) */
export function maskSecret(secret: string): string {
  if (secret.length <= 8) return '****';
  return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
}
