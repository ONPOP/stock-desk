// 배치 전용 HTTP 디스패처 (D19) — 죽은 연결을 재시도 가능하게 만든다.
//
// 2026-08-10 실측. 이 기기의 Wi-Fi 경로는 대용량 요청에서 TLS 레코드를 손상시킨다
// (`sslv3 alert bad record mac`). 250KB POST 기준 curl 17/20 · Node 22/25로 **원인은 환경이고
// 회복 가능한 일시 실패**다. 문제는 그 다음이다:
//
//   Node 내장 전역 fetch는 손상으로 죽은 HTTP/2 세션을 캐시에 그대로 들고 있다.
//   최초 1회만 ERR_SSL_SSL/TLS_ALERT_BAD_RECORD_MAC이고, 그 뒤로는 같은 프로세스의 모든 요청이
//   ERR_HTTP2_INVALID_SESSION("The session has been destroyed")로 죽는다.
//   2·5·10·30·60초를 기다려도 회복하지 않는다(총 107초 실측). 백오프로는 해결되지 않는다.
//
// 그래서 "실패 후 2초면 회복한다"는 관찰은 **curl 기준**이고(curl은 매번 새 프로세스·새 연결),
// 같은 프로세스 안에서는 성립하지 않는다. 재시도가 의미를 가지려면 디스패처를 바꿔야 한다.
//
// undici Agent를 명시적으로 주면 손상된 소켓만 버리고 다음 요청이 새 연결을 잡는다
// (같은 회선에서 h1 23/25 · h2 22/25, 실패 직후 바로 회복 — `oxooooo…`).
//
// lib/이 아니라 scripts/에 두는 이유: lib/engine/telegram.ts처럼 Next 라우트가 import하는 모듈에
// undici를 끌어들이지 않기 위해서다. 이 디스패처는 tsx로 도는 배치 경로 전용이다.
import { Agent, fetch as undiciFetch } from 'undici';

/**
 * HTTP/1.1로 고정한다. h2로도 회복은 되지만, 세션 하나가 모든 요청을 대표하는 구조라
 * 한 번의 손상이 여러 요청을 함께 끌고 갈 수 있다. 연결당 요청 하나인 h1이 실패를 좁게 가둔다.
 */
export const engineAgent = new Agent({
  allowH2: false,
  connect: { timeout: 20_000 },
});

/** supabase-js의 `global.fetch`에 넣는 용도. 시그니처만 표준 fetch에 맞춘다. */
export const engineFetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  undiciFetch(input as Parameters<typeof undiciFetch>[0], {
    ...(init as Parameters<typeof undiciFetch>[1]),
    dispatcher: engineAgent,
  })) as unknown as typeof fetch;
