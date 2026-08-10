// 일시적 네트워크 실패 재시도 (D19).
//
// 2026-08-10 이 기기에서 Supabase 호출이 간헐적으로 `TypeError: fetch failed`로 죽는다.
// 진짜 원인은 `ERR_SSL_SSL/TLS_ALERT_BAD_RECORD_MAC`(TLS 레코드 무결성 실패)이고,
// curl(macOS TLS)도 같은 비율로 실패해 Node 문제가 아니라 Wi-Fi 경로의 패킷 손상이다.
// 실패 후 **2초면 회복**하므로 백오프는 초 단위여야 한다(밀리초 재시도는 손상 구간에 갇힌다).
//
// 스키마 오류처럼 다시 해도 같은 결과인 것까지 재시도하면 실패를 늦게 알게 되므로,
// 네트워크로 보이는 것만 다시 시도한다.

export const NETWORK_RETRY = { attempts: 4, backoffMs: 2_000 } as const;

export interface NetworkRetryOptions {
  attempts?: number;
  backoffMs?: number;
}

/** 다시 시도할 가치가 있는 오류인가 — 전송 계층에서 죽은 것만 해당한다 */
function isTransient(e: unknown): boolean {
  const err = e as { message?: string; cause?: { code?: string } };
  const message = err?.message ?? '';
  if (/fetch failed|socket hang up|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network/i.test(message)) return true;
  const code = err?.cause?.code ?? '';
  return /ERR_SSL|ECONNRESET|ETIMEDOUT|EAI_AGAIN|UND_ERR/i.test(code);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `fn`을 실행하고, 일시적 네트워크 오류면 백오프를 두고 다시 시도한다.
 * 끝내 실패하면 마지막 오류를 그대로 던진다(호출부의 기존 오류 처리를 바꾸지 않는다).
 */
export async function withNetworkRetry<T>(
  fn: () => Promise<T>,
  label: string,
  options: NetworkRetryOptions = {},
): Promise<T> {
  const { attempts, backoffMs } = { ...NETWORK_RETRY, ...options };
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isTransient(e)) throw e;
      lastError = e;
      if (attempt < attempts) {
        const wait = backoffMs * 2 ** (attempt - 1);
        console.warn(`⚠ ${label} 일시 실패(${attempt}/${attempts}) — ${wait}ms 뒤 재시도`);
        await sleep(wait);
      }
    }
  }
  throw lastError;
}
