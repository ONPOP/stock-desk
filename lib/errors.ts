// 도메인 에러 클래스 — 한국어 사용자 메시지 (PRD 16장)

export class DomainError extends Error {
  /** 사용자에게 노출 가능한 한국어 메시지 (= message) */
  readonly userMessage: string;
  readonly status: number;
  /** 로그 전용 내부 상세 — 사용자에게 노출 금지 */
  readonly internal?: string;

  constructor(userMessage: string, status = 500, internal?: string) {
    super(userMessage);
    this.name = new.target.name;
    this.userMessage = userMessage;
    this.status = status;
    this.internal = internal;
  }
}

export class ValidationError extends DomainError {
  constructor(userMessage = '입력값이 올바르지 않습니다.', internal?: string) {
    super(userMessage, 400, internal);
  }
}

export class AuthRequiredError extends DomainError {
  constructor() {
    super('로그인이 필요합니다.', 401);
  }
}

export class NotFoundError extends DomainError {
  constructor(userMessage = '요청한 데이터를 찾을 수 없습니다.') {
    super(userMessage, 404);
  }
}

export class ExternalApiError extends DomainError {
  readonly provider: string;
  constructor(provider: string, userMessage: string, internal?: string) {
    super(userMessage, 502, internal);
    this.provider = provider;
  }
}

export class KisAuthError extends ExternalApiError {
  constructor(internal?: string) {
    super('kis', 'KIS API 인증에 실패했습니다. 설정에서 앱키/시크릿을 확인해주세요.', internal);
  }
}

export class KisRateLimitError extends ExternalApiError {
  constructor(internal?: string) {
    super('kis', 'KIS API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.', internal);
  }
}

export class ConfigError extends DomainError {
  constructor(internal?: string) {
    super('서버 설정 오류가 발생했습니다. 관리자에게 문의해주세요.', 500, internal);
  }
}

/** Route Handler 공용 에러 응답 변환 */
export function toErrorResponse(e: unknown): { body: { error: string }; status: number } {
  if (e instanceof DomainError) {
    return { body: { error: e.userMessage }, status: e.status };
  }
  return { body: { error: '알 수 없는 오류가 발생했습니다.' }, status: 500 };
}
