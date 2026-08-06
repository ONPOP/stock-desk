# 텔레그램 슬라이드 전송 설계 (D18 후보)

- 작성일: 2026-08-06
- 대상: 분석 엔진(D16) 슬롯 알림
- 상태: 설계 확정, 구현 전

## 1. 배경

슬롯 알림 경로는 이미 존재한다. `scripts/engine/notify.ts`가 모든 슬롯의 [5]단계로 실행되며
`lib/engine/telegram.ts`의 `sendMessage`·`sendPhoto`·`sendSlotError`를 쓴다. 지금은 봇 토큰과
chat id가 없어 매 실행마다 건너뛴다("텔레그램 설정이 없어 발송을 건너뜁니다").

따라서 이 작업은 신규 기능 개발이 아니라 **연결 수단과 제어 수단을 만드는 일**이다. 빈 곳은 셋이다.

1. 봇 토큰 입력 경로가 없다 — `.env.local`을 직접 편집해야 한다
2. chat id를 알아낼 방법이 없다 — 사용자가 텔레그램에서 직접 찾아와야 한다
3. 슬롯별 제어가 없다 — 슬롯 10개 × (텍스트 1 + 사진 4장) = 하루 50건이 무조건 나간다

## 2. 확정된 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| 토큰 보관 | 신규 테이블에 AES-256 암호화 | 기존 사용자 키 정책(D1)과 동일. `engine_settings` 등 기존 테이블 스키마는 변경 금지(CLAUDE.md) |
| 슬롯 제어 | 슬롯별 on/off **만** | 설정 항목을 최소화. 분량 조절은 하지 않는다 |
| 전송 분량 | 해당 슬롯의 **슬라이드 전량** | 요약만으로는 판단 근거가 부족하다는 사용자 요구 |
| 전송 형식 | 사진 미디어그룹(`sendMediaGroup`) | 채팅에서 바로 넘겨 보며 확인. 알림 횟수도 10장당 1회로 줄어든다 |
| 실패 알림 | 슬롯 on/off와 무관하게 항상 발송 | 무인 실행에서 침묵이 가장 위험하다 |

## 3. 데이터 모델

`supabase/migrations/0018_engine_telegram.sql` — **신규 테이블 하나만 추가**한다.

`public.engine_telegram`

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `user_id` | uuid, PK, FK→auth.users | RLS: `user_id = auth.uid()` |
| `bot_token_enc` | text | AES-256 암호문. 평문은 어디에도 남기지 않는다 |
| `bot_username` | text | 표시용(`@stockdesk_bot`). 시크릿 아님 |
| `chat_id` | text | 연결 시 자동 획득 |
| `enabled_slot_ids` | text[] not null default '{}' | 알림 켠 슬롯. **빈 배열 = 아무것도 보내지 않음** |
| `connected_at` | timestamptz | 마지막 연결 성공 시각 |
| `last_error` | text | 마지막 발송 실패 사유(사용자 표시용) |

기존 테이블은 건드리지 않는다. 슬롯이 삭제돼도 `enabled_slot_ids`의 잔여 id는 무시되므로
정합성 문제가 없다(교집합으로만 판정).

### 불변식

- 봇 토큰 평문은 DB·로그·API 응답·에러 메시지 어디에도 나타나지 않는다.
  기존 `telegram.ts`의 응답 마스킹(`replace(botToken, '***')`)을 유지·확장한다.
- 앱으로 내려가는 상태는 `{ connected: boolean, botUsername: string | null, chatId: string | null,
  enabledSlotIds: string[], lastError: string | null }` 뿐이다.

## 4. 모듈 경계와 공개 인터페이스

### 4.1 `lib/engine/telegram.ts` (기존 파일에 추가)

```ts
export async function sendMediaGroup(
  cfg: TelegramConfig,
  photos: Array<{ bytes: Uint8Array; filename: string }>,  // 1~10장
  caption?: string,                                         // 첫 장에만 붙는다
): Promise<void>;

export async function getMe(botToken: string): Promise<{ username: string }>;

/** 마지막 update_id 이후의 메시지에서 chat id를 찾는다. 없으면 null */
export async function findChatId(botToken: string, sinceUpdateId?: number): Promise<string | null>;
```

기존 `sendMessage`·`sendPhoto`·`sendSlotError`·`resolveTelegramConfig`는 시그니처를 바꾸지 않는다.

### 4.2 `lib/engine/telegram-settings.ts` (신규)

DB 접근과 복호화를 한 곳에 모은다. `server-only`를 붙이지 않는다(배치가 직접 import).

```ts
export interface TelegramSettings {
  botToken: string | null;     // 복호화된 값 — 반환 후 로깅 금지
  botUsername: string | null;
  chatId: string | null;
  enabledSlotIds: string[];
}
export async function loadTelegramSettings(db: SupabaseClient, userId: string): Promise<TelegramSettings>;
export async function saveConnection(db, userId, input: { botToken: string; botUsername: string; chatId: string }): Promise<void>;
export async function setEnabledSlots(db, userId, slotIds: string[]): Promise<void>;
export async function recordError(db, userId, message: string | null): Promise<void>;
```

### 4.3 `lib/engine/telegram-dispatch.ts` (신규 — 순수 로직)

전송 계획만 계산한다. 네트워크·파일시스템을 모른다 → 단위 테스트가 쉽다.

```ts
export const MEDIA_GROUP_MAX = 10;
/**
 * 슬라이드 상대경로를 전송 단위로 나눈다.
 * sendMediaGroup은 2~10장만 받는다 → 1장짜리 묶음이 생기면 그 건은 'photo'로 표시한다.
 * (13장 = [10, 3], 11장 = [10, 1] → 마지막은 sendPhoto로 보내야 한다)
 */
export function planSends(slidePaths: string[]): Array<{ kind: 'group' | 'photo'; paths: string[] }>;
/** 이 슬롯에 보낼지 판정 — 교집합 판정을 한 곳에 둔다 */
export function shouldNotify(slotId: string, enabledSlotIds: string[]): boolean;
```

### 4.4 API 라우트

| 라우트 | 메서드 | 역할 |
|---|---|---|
| `app/api/engine/telegram/route.ts` | GET | 연결 상태 + 슬롯 토글 상태 조회 |
| 〃 | PATCH | `enabledSlotIds` 갱신, 연결 해제(토큰 삭제) |
| `app/api/engine/telegram/connect/route.ts` | POST | 토큰 검증(`getMe`) 후 `chat_id = null` 상태로 즉시 암호화 저장 |
| 〃 | GET | 저장된 토큰으로 `getUpdates` 1회 조회. chat id를 찾으면 저장 + 테스트 메시지 발송 |

토큰은 POST 본문으로 **한 번만** 받고 즉시 암호화 저장한다. 이후 어떤 응답에도 실리지 않는다.

연결 대기 상태를 서버 메모리에 두지 않는다. POST가 토큰을 저장하고 GET이 매번 DB에서 읽어
`getUpdates`를 한 번 호출하는 구조라, 폴링은 전적으로 클라이언트가 주도한다.
서버 재시작·다중 인스턴스에도 상태가 깨지지 않고, 토큰을 재전송할 필요도 없다.
`chat_id`가 null인 행은 "연결 미완료"로 취급한다(발송 경로에서 걸러진다).

### 4.5 UI

`components/settings/engine-telegram-settings.tsx` (신규) — `/reports` 설정 탭에 섹션 추가.
기존 `engine-storage-settings.tsx`의 chat id 입력란은 제거한다(연결 흐름으로 대체).

## 5. 연결 흐름

```
[봇 토큰 붙여넣기] → [연결하기]
  1. getMe 로 토큰 검증 → 봇 이름 표시. 실패하면 여기서 끝
  2. "텔레그램에서 @봇이름 에게 아무 메시지나 보내세요" 안내
  3. getUpdates 폴링(2초 간격, 최대 60초) → chat id 획득
  4. 테스트 메시지 1건 발송 → 성공 시 engine_telegram 저장
  5. 슬롯 체크박스 노출 (기본 전부 꺼짐)
```

3번이 60초 안에 안 잡히면 "봇에게 메시지를 보냈는지 확인하세요"로 안내하고 재시도만 제공한다.
chat id 수동 입력은 제공하지 않는다 — 오타로 남의 채팅방에 보내는 사고를 원천 차단한다.

## 6. 전송 동작 (`scripts/engine/notify.ts` 수정)

현재 `MAX_PHOTOS = 4` 상수를 제거한다.

1. `loadTelegramSettings` → 토큰/chat id 없으면 지금처럼 조용히 종료(오류 아님)
2. `--error` 인자가 있으면 `sendSlotError` 후 종료 — **`enabled_slot_ids` 검사 없이 항상 발송**
3. `shouldNotify(slotId, enabledSlotIds)`가 false면 로그만 남기고 종료
4. `slide-paths.json` 전량을 `planSends`로 나눠 순서대로 전송한다
   - `kind: 'group'` → `sendMediaGroup`(2~10장), `kind: 'photo'` → 기존 `sendPhoto`
   - 요약 텍스트(`buildTelegramSummary`)는 **첫 전송의 caption**으로 병합해 알림 횟수를 줄인다
   - caption 1,024자 한도를 넘으면 잘라내고 별도 `sendMessage`로 전문을 보낸다
5. 그룹 단위 실패는 그 그룹만 건너뛰고 계속한다. 마지막에 성공/실패 장수를 로그로 남기고,
   실패가 있으면 `recordError`로 DB에 사유를 남긴다(앱 설정 화면에 표시)

### 레이트리밋

같은 챗 기준 초당 1건·분당 20건 제한이 있다. 그룹 전송 사이에 1초 간격을 두고,
429 응답이면 본문의 `retry_after`만큼 대기 후 **한 번만** 재시도한다. 두 번째 실패는 포기하고 다음 그룹으로 넘어간다.
같은 시각에 끝나는 슬롯이 있다(예: `kr_open_check`·`kr_grade` 둘 다 09:40).

## 7. 위험도 분류와 검증

| 항목 | 위험도 | 검증 방법 |
|---|---|---|
| 토큰 암호화 저장·복호화, 응답 비노출 | **위험** | 저장 후 DB 원본에 평문이 없음을 확인. API 응답 스냅샷에 토큰 문자열이 없음을 단언. 로그 캡처에도 없음을 확인 |
| chat id 자동 획득 | **위험** | 실제 봇으로 연결 1회 실증. 잘못된 토큰·메시지 미발송 두 실패 경로도 실제로 확인 |
| `planSends` 경계 | 보통 | 0·1·2·10·11·13·20장. 특히 11장(=10+1)에서 마지막이 `photo`로 나오는지 — 미디어그룹은 2장 미만을 거부한다 |
| `shouldNotify` 필터 | 보통 | 켠 슬롯/끈 슬롯/삭제된 슬롯 id 잔존 케이스 |
| 429 재시도 | 보통 | fetch 스텁으로 429→성공, 429→429 두 경로 |
| 실패 알림이 on/off와 무관 | 보통 | 슬롯을 끈 상태에서 `--error` 실행 시 발송되는지 |
| 전송 전체 경로 | **위험** | 실제 토큰으로 `notify.ts --slot us_premarket` 수동 실행 → 13장 도착 확인. 이어서 launchd 시각 트리거로 한 슬롯을 태워 예약 경로까지 확인 |

## 8. 영향 범위

- 변경: `scripts/engine/notify.ts`, `lib/engine/telegram.ts`(추가만), `components/settings/engine-storage-settings.tsx`(chat id 입력란 제거)
- 신규: 마이그레이션 1개, `lib/engine/telegram-settings.ts`, `lib/engine/telegram-dispatch.ts`, API 라우트 2개, 설정 UI 컴포넌트 1개
- 무변경: 슬롯 실행 흐름(`run-slot.ts`), 스케줄(`install-schedule.ts`), 슬라이드 렌더·적재

## 9. 스펙 변경 기록

CLAUDE.md 규칙에 따라 `docs/PRD.md` Decision Log에 **D18**로 기록한다.

> D18: 슬롯 알림은 텔레그램 단일 채널. 봇 토큰은 신규 테이블 `engine_telegram`에 AES-256 암호화 저장하고
> 앱 설정에서 연결한다(chat id는 getUpdates로 자동 획득, 수동 입력 없음). 알림은 슬롯별 on/off이며
> 켜진 슬롯은 슬라이드 전량을 사진 미디어그룹으로 보낸다. 실패 알림은 on/off와 무관하게 항상 발송한다.

## 10. 범위 밖 (이번에 하지 않는다)

- 텔레그램 명령 수신(`/report`, `/run`) — 상시 수신 프로세스와 원격 실행 권한 설계가 별도로 필요하다
- 여러 챗·그룹 채팅 동시 전송
- 원본 화질 문서 전송(`sendDocument`) 병행
- 재실행 시 중복 발송 방지 — 수동 재실행은 의도된 재발송으로 본다
