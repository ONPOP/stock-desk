// 로그·에러 출력에서 시크릿(비밀번호·키)이 평문으로 새는 것을 막는다.
// 두 경로로 마스킹한다: ① 환경변수의 실제 시크릿 값과 일치하는 부분 치환(값 기반),
// ② 연결 문자열 구조에서 user:password@host 패턴 치환(구조 기반).
// 순수 함수라 Node 스크립트·서버 양쪽에서 쓰며 server-only를 붙이지 않는다.

const MASK = '••••';

// 값 자체가 시크릿인 환경변수. 짧은 값은 오탐을 유발하므로 길이 하한을 둔다.
const SENSITIVE_ENV_KEYS = [
  'SUPABASE_DB_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'KIS_APP_KEY',
  'KIS_APP_SECRET',
  'APP_ENCRYPTION_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
] as const;

const MIN_SECRET_LEN = 4;

// 환경에서 마스킹 대상 문자열을 수집한다. 연결 문자열은 비밀번호 부분만 따로 추출해
// 인코딩/디코딩 양형(예: %40 ↔ @)을 모두 등록한다.
export function collectSecrets(env: Record<string, string | undefined> = process.env): string[] {
  const secrets = new Set<string>();
  for (const key of SENSITIVE_ENV_KEYS) {
    const v = env[key];
    if (v && v.length >= MIN_SECRET_LEN) secrets.add(v);
  }
  for (const key of ['SUPABASE_DB_URL', 'DATABASE_URL', 'REDIS_URL']) {
    const url = env[key];
    if (!url) continue;
    const m = url.match(/\/\/[^:/?#\s]+:([^@\s]+)@/);
    if (!m) continue;
    const pw = m[1];
    if (pw) {
      secrets.add(pw);
      try {
        const decoded = decodeURIComponent(pw);
        if (decoded !== pw) secrets.add(decoded);
      } catch {
        // 잘못된 퍼센트 인코딩은 무시 — 원형만 등록
      }
    }
  }
  // 긴 시크릿을 먼저 치환해야 부분 문자열이 가려지지 않는다.
  return [...secrets].sort((a, b) => b.length - a.length);
}

// 에러/임의 값을 시크릿이 제거된 문자열로 변환한다.
export function redactSecrets(input: unknown, env: Record<string, string | undefined> = process.env): string {
  let text = stringify(input);
  for (const secret of collectSecrets(env)) {
    if (secret) text = text.split(secret).join(MASK);
  }
  // env에 없는 연결 문자열이 끼어든 경우까지 구조적으로 차단
  text = text.replace(/(\/\/[^:/?#\s]+:)[^@\s]+(@)/g, `$1${MASK}$2`);
  return text;
}

// Error는 message뿐 아니라 stack과 커스텀 속성(예: postgres 에러의 input)에도
// 시크릿이 담길 수 있어 모두 펼쳐 문자열화한다.
function stringify(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof Error) {
    const parts = [input.stack ?? `${input.name}: ${input.message}`];
    for (const key of Object.getOwnPropertyNames(input)) {
      if (key === 'stack' || key === 'message') continue;
      try {
        parts.push(`${key}: ${String((input as unknown as Record<string, unknown>)[key])}`);
      } catch {
        // 접근 불가 속성은 건너뜀
      }
    }
    return parts.join('\n');
  }
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}
