// 스크립트용 마스킹 (lib/utils/crypto.ts는 server-only라 스크립트에서 직접 사용 불가)
export function maskSecret(secret: string): string {
  if (secret.length <= 8) return '****';
  return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
}
