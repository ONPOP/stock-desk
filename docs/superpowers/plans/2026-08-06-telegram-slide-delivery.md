# 텔레그램 슬라이드 전송 구현 계획

> **작업자에게:** 이 계획은 `superpowers:subagent-driven-development` 또는 `superpowers:executing-plans`로 태스크 단위 실행한다. 체크박스(`- [ ]`)로 진행을 추적한다.
>
> **이 계획서에는 본문 구현 코드를 넣지 않는다** (프로젝트 규칙). 파일 경로·공개 인터페이스·불변식·검증 방법만 적는다. 시그니처와 테스트 케이스 목록은 그대로 따르되, 함수 본문은 구현 단계에서 쓴다.

**목표:** 예약 시각에 생성된 슬롯 분석 슬라이드를 텔레그램으로 자동 전송하고, 앱에서 봇을 연결하고 슬롯별로 켜고 끌 수 있게 한다.

## 진행 상태 (2026-08-06 기준)

**Task 1~6 + 7-6~7-8 완료** — 커밋 `acd00f1`~`73d3149`. 코드·마이그레이션·API·UI·문서(D18)가 모두 반영됐고
`npx tsc --noEmit` · `npm run lint` · `npm test`(647건) 통과를 확인했다.

**남은 것은 7-1~7-5(실물 검증)뿐이고, 사용자 조작이 있어야 시작할 수 있다.** `engine_telegram` 테이블에
행이 없어 봇이 아직 연결되지 않았다(2026-08-06 확인). @BotFather로 봇을 만들어 앱 [설정] 탭에서 토큰을
등록하고 텔레그램에서 [시작]을 눌러야 7-2 이후를 진행할 수 있다.

봇 없이 확인 가능한 범위는 이미 검증했다:
- 미연결 상태에서 `notify.ts` 실행 → `ℹ 텔레그램 설정이 없어 발송을 건너뜁니다` 후 exit 0 (배치가 죽지 않는다)
- `run-slot.ts` 배선 — 알림은 적재[4] 다음 [5]단계, 실패는 각 단계의 `fail()`이 `sendSlotError`를 직접 호출한다
- `notify.ts` 분기 — `--error`는 슬롯 on/off 필터보다 먼저 처리되고, 전송 단위 하나가 실패해도 나머지를 계속 보낸다

**설계 근거:** `docs/superpowers/specs/2026-08-06-telegram-slide-delivery-design.md`

**아키텍처:** 전송 경로(`scripts/engine/notify.ts`)는 이미 슬롯의 [5]단계로 돌고 있다. 이번 작업은 (1) 봇 토큰을 신규 테이블에 암호화 저장하는 설정 계층, (2) chat id를 자동 획득하는 연결 API·UI, (3) 슬라이드 전량을 미디어그룹으로 나눠 보내는 전송 로직을 추가한다. 순수 계산(무엇을 몇 장씩 보낼지)은 네트워크·파일시스템을 모르는 모듈로 분리해 단위 테스트한다.

**기술 스택:** TypeScript strict · Next 15 App Router(RSC) · Supabase(RLS) · vitest · 텔레그램 Bot API(fetch 직접 호출, SDK 없음)

## 전역 제약

- 봇 토큰 평문은 DB·로그·API 응답·에러 메시지 어디에도 남기지 않는다. 기존 마스킹(`replace(botToken, '***')`)을 유지한다.
- 기존 테이블 스키마를 변경하지 않는다. 신규 테이블 추가만 한다.
- `lib/engine/*`에 `server-only`를 import하지 않는다 — 배치 스크립트가 tsx로 직접 불러온다.
- 암호화는 `lib/utils/crypto-core.ts`의 `encryptSecret`/`decryptSecret`만 쓴다(AES-256, 키는 `APP_ENCRYPTION_KEY`).
- 커밋 전 `npx tsc --noEmit` + `npm run lint` + `npm test` 통과 필수.
- 유료 API 추가 금지. 텔레그램 Bot API는 무료이며 이번 범위에 한해 사용한다.

## 파일 구조

| 파일 | 책임 |
|---|---|
| `supabase/migrations/0019_engine_telegram.sql` (신규) | `engine_telegram` 테이블 + RLS |
| `lib/engine/telegram-dispatch.ts` (신규) | 순수 계산 — 전송 단위 분할, 슬롯 필터. 네트워크·파일시스템 모름 |
| `lib/engine/telegram-settings.ts` (신규) | DB 접근 + 복호화. 토큰을 다루는 유일한 지점 |
| `lib/engine/telegram.ts` (수정) | Bot API 호출. `getMe`·`findChatId`·`sendMediaGroup` 추가 |
| `scripts/engine/notify.ts` (수정) | 슬롯 필터 → 전량 전송 → 실패 기록 |
| `app/api/engine/telegram/route.ts` (신규) | 상태 조회(GET) · 슬롯 토글/연결 해제(PATCH) |
| `app/api/engine/telegram/connect/route.ts` (신규) | 토큰 등록(POST) · chat id 획득 폴링(GET) |
| `components/settings/engine-telegram-settings.tsx` (신규) | 연결 카드 + 슬롯 체크박스 |
| `components/reports/reports-tabs.tsx` (수정) | 설정 탭에 위 컴포넌트 배치 |
| `components/settings/engine-storage-settings.tsx` (수정) | chat id 입력란 제거 |

**주의:** 마이그레이션 번호는 `0019`다. `0018_radar_pin.sql`이 이미 있다(설계서의 0018 표기는 오기).

## 위험도 분류

착수 전 각 태스크의 검증 강도를 정한다. 전부에 같은 강도를 쓰지 않는다.

| 태스크 | 위험도 | 검증 강도 |
|---|---|---|
| 1 설정 저장 계층 | **위험** (시크릿) | 실증 + 변이 테스트 |
| 2 전송 계획 순수 로직 | 낮음 | 단위 테스트만. 리뷰 라운드 없음 |
| 3 Bot API 확장 | 보통 | diff 읽기 + 스텁 단위 테스트 |
| 4 notify 연결 | 보통 | 단위 테스트 + 실물 1회 |
| 5 API 라우트 | **위험** (인증 게이트) | 비로그인 차단을 실제로 확인 |
| 6 설정 UI | 보통 | 실제 브라우저 1회 |
| 7 문서·실물 검증 | 보통 | launchd 실경로 확인 |

---

### Task 1: 저장 계층 (테이블 + 설정 모듈)

**파일:**
- 생성: `supabase/migrations/0019_engine_telegram.sql`
- 생성: `lib/engine/telegram-settings.ts`
- 생성: `lib/engine/telegram-settings.test.ts`

**인터페이스 (produces):**

```ts
export interface TelegramSettings {
  botToken: string | null;      // 복호화된 값. 반환 후 로깅 금지
  botUsername: string | null;
  chatId: string | null;
  enabledSlotIds: string[];
  lastError: string | null;
}
export async function loadTelegramSettings(db: SupabaseClient, userId: string): Promise<TelegramSettings>;
export async function saveToken(db: SupabaseClient, userId: string, botToken: string, botUsername: string): Promise<void>;
export async function saveChatId(db: SupabaseClient, userId: string, chatId: string): Promise<void>;
export async function setEnabledSlots(db: SupabaseClient, userId: string, slotIds: string[]): Promise<void>;
export async function recordError(db: SupabaseClient, userId: string, message: string | null): Promise<void>;
export async function disconnect(db: SupabaseClient, userId: string): Promise<void>;
```

**테이블 스키마** (컬럼·제약은 설계서 §3 그대로):
`user_id` uuid PK FK→auth.users on delete cascade / `bot_token_enc` text / `bot_username` text /
`chat_id` text / `enabled_slot_ids` text[] not null default '{}' / `connected_at` timestamptz /
`last_error` text / `updated_at` timestamptz not null default now().
RLS는 `0017_analysis_engine.sql`의 `engine_settings_own` 정책과 동일한 형태로 쓴다.

**불변식:**
- `bot_token_enc`에는 암호문만 들어간다. `loadTelegramSettings`가 복호화의 유일한 경로다.
- `chat_id`가 null인 행은 "연결 미완료"다. 발송 경로는 이 행을 미설정과 동일하게 취급한다.
- 복호화 실패(키 교체 등)는 예외를 던지지 않고 `botToken: null`로 떨어뜨린다 — 배치가 죽으면 안 된다.

**단계:**

- [x] **1-1. 마이그레이션 작성** — `0019_engine_telegram.sql`. 주석에 "슬롯 알림용 봇 자격증명(D18). 토큰은 AES-256 암호문만 저장"을 남긴다.
- [x] **1-2. 마이그레이션 적용** — `npm run db:migrate`. 적용 후 `psql`/Supabase에서 테이블과 RLS 정책 존재를 확인한다.
- [x] **1-3. 실패하는 테스트 작성** — `telegram-settings.test.ts`. Supabase 클라이언트는 최소 스텁(`from().select().eq().maybeSingle()` 체인)을 손으로 만든다. 케이스:
  - `loadTelegramSettings`: 행 없음 → 전 필드 null/빈 배열
  - 암호문이 저장돼 있으면 복호화된 평문을 반환한다
  - 복호화가 실패해도 예외 없이 `botToken: null`을 반환한다
  - `saveToken`: 전달한 평문이 아니라 **암호문**이 upsert 페이로드에 실린다 (평문 문자열이 페이로드 어디에도 없음을 단언)
  - `setEnabledSlots`: 빈 배열 저장 가능
- [x] **1-4. 테스트 실패 확인** — `npx vitest run lib/engine/telegram-settings.test.ts` → 모듈 없음으로 FAIL
- [x] **1-5. 구현** — `lib/engine/telegram-settings.ts`
- [x] **1-6. 테스트 통과 확인** — 같은 명령 → PASS
- [x] **1-7. 변이 테스트** — `saveToken`에서 암호화 호출을 일부러 제거한 사본을 만들어 1-3의 "평문이 페이로드에 없음" 테스트가 **실패하는지** 확인한다. 실패하지 않으면 그 테스트는 아무것도 지키지 못하는 것이므로 다시 쓴다. 확인 후 원복.
- [x] **1-8. 커밋** — `feat(engine): 텔레그램 봇 자격증명 저장 계층 (D18)`

---

### Task 2: 전송 계획 순수 로직

**파일:**
- 생성: `lib/engine/telegram-dispatch.ts`
- 생성: `lib/engine/telegram-dispatch.test.ts`

**인터페이스 (produces):**

```ts
export const MEDIA_GROUP_MAX = 10;
export type SendUnit = { kind: 'group'; paths: string[] } | { kind: 'photo'; paths: [string] };
export function planSends(slidePaths: string[]): SendUnit[];
export function shouldNotify(slotId: string, enabledSlotIds: string[]): boolean;
```

**불변식:**
- `sendMediaGroup`은 2~10장만 받는다. 따라서 `kind: 'group'`의 `paths.length`는 항상 2 이상 10 이하다.
- 1장짜리 잔여분은 반드시 `kind: 'photo'`로 나온다.
- 입력 순서는 보존된다(슬라이드 번호 순).

**단계:**

- [x] **2-1. 실패하는 테스트 작성** — 경계 케이스를 전부 넣는다.
  - 0장 → 빈 배열
  - 1장 → `[photo]`
  - 2장 → `[group(2)]`
  - 10장 → `[group(10)]`
  - **11장 → `[group(10), photo]`** (핵심 경계 — 순진한 청킹은 여기서 `group(1)`을 만들어 API 400을 부른다)
  - 13장 → `[group(10), group(3)]`
  - 20장 → `[group(10), group(10)]`
  - 21장 → `[group(10), group(10), photo]`
  - 모든 케이스에서 원본 순서가 보존되는지 단언
  - `shouldNotify`: 켠 슬롯 true / 끈 슬롯 false / 빈 배열 false / 목록에 없는 슬롯 false
- [x] **2-2. 테스트 실패 확인** — `npx vitest run lib/engine/telegram-dispatch.test.ts`
- [x] **2-3. 구현** — `lib/engine/telegram-dispatch.ts`
- [x] **2-4. 테스트 통과 확인**
- [x] **2-5. 커밋** — `feat(engine): 슬라이드 전송 단위 분할 로직`

---

### Task 3: Bot API 확장

**파일:**
- 수정: `lib/engine/telegram.ts` (추가만 — 기존 export 시그니처 변경 금지)
- 생성: `lib/engine/telegram.test.ts`

**소비 (consumes):** 없음 (기존 파일의 내부 `call` 헬퍼를 재사용)

**인터페이스 (produces):**

```ts
export async function getMe(botToken: string): Promise<{ username: string }>;
/** getUpdates에서 가장 최근 메시지의 chat id. 없으면 null */
export async function findChatId(botToken: string): Promise<string | null>;
export async function sendMediaGroup(
  cfg: TelegramConfig,
  photos: Array<{ bytes: Uint8Array; filename: string }>,  // 2~10장
  caption?: string,                                         // 첫 장에만 붙는다
): Promise<void>;
```

**불변식:**
- 어떤 에러 메시지에도 봇 토큰이 들어가지 않는다(기존 `call`의 마스킹 유지). `getMe`·`findChatId`는 `TelegramConfig` 없이 토큰만 받으므로 **마스킹을 별도로 적용해야 한다** — 기존 `call`은 `cfg.botToken`을 참조한다.
- 429 응답은 본문의 `retry_after`초 대기 후 **한 번만** 재시도한다. 두 번째 실패는 던진다.
- `sendMediaGroup`에 1장 이하 또는 11장 이상을 넘기면 호출 전에 `TelegramError`로 거부한다(방어).

**단계:**

- [x] **3-1. 실패하는 테스트 작성** — `global.fetch`를 vitest `vi.fn()`으로 스텁한다. 케이스:
  - `getMe`: 200 + `{ok:true,result:{username:'x_bot'}}` → `{username:'x_bot'}`
  - `getMe`: 401 → `TelegramError`, **메시지에 토큰 문자열이 없다**
  - `findChatId`: 업데이트 있음 → 마지막 메시지의 chat id 문자열 반환
  - `findChatId`: 업데이트 없음(`result: []`) → null
  - `sendMediaGroup`: 3장 → fetch 1회, FormData에 `media` JSON과 첨부 3개가 실린다
  - `sendMediaGroup`: caption 제공 시 첫 항목에만 caption이 붙는다
  - `sendMediaGroup`: 1장 → 호출 전 거부
  - 429 → `retry_after` 대기 후 재시도해 성공 (타이머는 `vi.useFakeTimers()`)
  - 429 두 번 → 던진다
- [x] **3-2. 테스트 실패 확인** — `npx vitest run lib/engine/telegram.test.ts`
- [x] **3-3. 구현** — 기존 `call`에 429 재시도를 넣고, 토큰만 받는 호출용 경로를 분리한다
- [x] **3-4. 테스트 통과 확인**
- [x] **3-5. 회귀 확인** — `npm test` 전체. 기존 `sendSlotError` 경로가 그대로 도는지 본다
- [x] **3-6. 커밋** — `feat(engine): 텔레그램 미디어그룹·연결 조회 API`

---

### Task 4: notify.ts 연결

**파일:**
- 수정: `scripts/engine/notify.ts`

**소비 (consumes):** Task 1 `loadTelegramSettings`·`recordError`, Task 2 `planSends`·`shouldNotify`, Task 3 `sendMediaGroup`

**동작 순서 (설계서 §6):**
1. `loadTelegramSettings` → `botToken`이나 `chatId`가 null이면 지금처럼 조용히 종료(오류 아님)
2. `--error` 인자가 있으면 `sendSlotError` 후 종료 — **슬롯 on/off를 검사하지 않는다**
3. `shouldNotify`가 false면 로그만 남기고 종료
4. `slide-paths.json` 전량 → `planSends` → 순서대로 `sendMediaGroup`/`sendPhoto`
5. 요약(`buildTelegramSummary`)은 **첫 전송의 caption**으로 병합. 1,024자를 넘으면 잘라 붙이고 전문은 별도 `sendMessage`
6. 전송 단위 실패는 그 단위만 건너뛰고 계속. 하나라도 실패하면 `recordError`로 사유 기록, 전부 성공하면 `recordError(null)`로 해제
7. 전송 단위 사이에 1초 간격

**불변식:** 기존 규약 유지 — 일부 이미지 실패가 알림 전체를 실패시키지 않는다. `MAX_PHOTOS` 상수는 삭제한다.

**단계:**

- [x] **4-1. 기존 동작 확인** — 텔레그램 미설정 상태에서 `npx tsx scripts/engine/notify.ts --slot us_premarket --date 2026-08-06` 실행 → "건너뜁니다" 로그가 나오는지(회귀 기준선)
- [x] **4-2. 구현** — 위 순서대로. `resolveTelegramConfig`는 env 우선 규약을 유지하되 DB 설정을 함께 본다
- [x] **4-3. 미설정 회귀 확인** — 4-1과 동일한 명령으로 여전히 조용히 종료하는지
- [x] **4-4. 슬롯 필터 확인** — 토큰을 넣고 `enabled_slot_ids`가 빈 상태에서 실행 → 아무것도 발송되지 않고 로그만 남는지
- [x] **4-5. 커밋** — `feat(engine): 슬롯별 알림 필터 + 슬라이드 전량 전송`

---

### Task 5: API 라우트

**파일:**
- 생성: `app/api/engine/telegram/route.ts`
- 생성: `app/api/engine/telegram/connect/route.ts`

**소비:** Task 1 전부, Task 3 `getMe`·`findChatId`, `lib/engine/telegram.ts`의 `sendMessage`

**계약:**

| 라우트 | 메서드 | 요청 | 응답 |
|---|---|---|---|
| `/api/engine/telegram` | GET | — | `{ connected, botUsername, chatId, enabledSlotIds, lastError }` |
| 〃 | PATCH | `{ enabledSlotIds?: string[], disconnect?: true }` | 갱신된 상태 |
| `/api/engine/telegram/connect` | POST | `{ botToken: string }` | `{ botUsername }` — 검증 후 `chat_id=null`로 저장 |
| 〃 | GET | — | `{ chatId: string \| null }` — 획득 시 저장 + 테스트 메시지 1건 발송 |

**불변식:**
- 네 라우트 모두 `requireUser()`를 거친다. 비로그인 요청은 401/리다이렉트로 막힌다.
- **어떤 응답에도 `botToken`이 없다.** POST 응답은 봇 이름만 돌려준다.
- `enabledSlotIds`는 zod로 검증한다: 문자열 배열, 각 항목이 `/^[a-z0-9_]{1,40}$/`(기존 `SLOT_ID_RE`와 동일), 최대 50개.
- 연결 대기 상태를 서버 메모리에 두지 않는다. GET은 매번 DB에서 토큰을 읽어 `getUpdates`를 1회 호출한다.

**단계:**

- [x] **5-1. 구현** — 기존 `app/api/engine/settings/route.ts`의 에러 처리 패턴(`toErrorResponse`, `ValidationError`)을 그대로 따른다
- [x] **5-2. 인증 게이트 실증** — dev 서버를 띄우고 **쿠키 없이** 네 엔드포인트를 호출해 전부 막히는지 확인한다. 통과하면 안 된다:
  ```
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/engine/telegram
  ```
- [x] **5-3. 토큰 비노출 실증** — 유효한 세션 쿠키로 POST → GET 순으로 호출하고, 두 응답 본문 어디에도 토큰 문자열이 없음을 확인한다. dev 서버 로그에도 없어야 한다
- [x] **5-4. 잘못된 입력 확인** — `enabledSlotIds`에 `../etc` 같은 값을 넣어 400으로 거부되는지
- [x] **5-5. 커밋** — `feat(api): 텔레그램 연결·슬롯 토글 라우트`

---

### Task 6: 설정 UI

**파일:**
- 생성: `components/settings/engine-telegram-settings.tsx`
- 수정: `components/reports/reports-tabs.tsx` (설정 탭에 배치)
- 수정: `components/settings/engine-storage-settings.tsx` (chat id 입력란·상태·저장 필드 제거)
- 수정: `app/reports/page.tsx` (필요 시 초기 상태 전달)

**화면 구성:**
- 미연결: 토큰 입력란 + [연결하기]
- 연결 대기: "텔레그램에서 @{botUsername} 을 열고 [시작]을 누르세요" 안내 + 2초 간격 폴링(최대 60초) + 남은 시간 표시
- 연결됨: `@봇이름 · 연결됨` + [연결 해제] + 슬롯 체크박스 목록(`schedule_slots`에서 라벨·시각을 가져온다)
- `lastError`가 있으면 경고 배지로 표시

**불변식:**
- 토큰은 입력 후 상태에 남기지 않는다(전송 직후 비운다). 화면에 다시 표시하지 않는다.
- 60초 안에 chat id를 못 얻으면 안내 문구와 [다시 시도]만 제공한다. **chat id 수동 입력란은 만들지 않는다.**

**단계:**

- [x] **6-1. 구현** — 기존 `engine-storage-settings.tsx`의 폼·토스트 패턴을 따른다
- [x] **6-2. chat id 입력란 제거** — `engine-storage-settings.tsx`에서 관련 상태와 PATCH 필드를 걷어낸다. `engine_settings.telegram_chat_id` 컬럼은 남겨 두되 UI에서 노출하지 않는다(기존 테이블 변경 금지)
- [x] **6-3. 타입·린트** — `npx tsc --noEmit`, `npm run lint`
- [x] **6-4. 실제 브라우저 확인** — dev 서버에서 `/reports` → [설정] 탭. 미연결 화면 → 잘못된 토큰 입력 시 오류 표시 → 유효 토큰 입력 → 안내 노출까지 눈으로 확인
- [x] **6-5. 커밋** — `feat(ui): 텔레그램 연결·슬롯 알림 설정`

---

### Task 7: 실물 연결 검증 + 문서

**파일:**
- 수정: `docs/PRD.md` (Decision Log에 D18 추가)
- 수정: `CLAUDE.md` (Decision Log 요약표에 D18 한 줄, 자주 쓰는 작업에 연결 방법 한 줄)

**단계:**

- [ ] **7-1. 실제 봇 연결** — @BotFather로 봇 생성 → 앱에서 토큰 입력 → 텔레그램에서 [시작] → 연결 완료 + 테스트 메시지 수신 확인
- [ ] **7-2. 실패 경로 확인** — (a) 잘못된 토큰 (b) [시작]을 누르지 않고 60초 경과 — 두 경우의 안내가 실제로 뜨는지
- [ ] **7-3. 수동 전송 실증** — `us_premarket` 슬롯을 켜고 `npx tsx scripts/engine/notify.ts --slot us_premarket --date 2026-08-06` → 텔레그램에 **캡션 붙은 10장 + 3장** 도착 확인. 캡션 내용이 요약과 일치하는지 확인
- [ ] **7-4. 실패 알림 확인** — 슬롯을 **끈 상태에서** `--error "테스트"` 실행 → 알림이 오는지(끈 슬롯도 실패는 알려야 한다)
- [ ] **7-5. 예약 경로 실증** — 몇 분 뒤 시각으로 임시 launchd 에이전트를 걸어 자동 발화 → 텔레그램 수신까지 확인 후 에이전트 제거. `kickstart`는 `StartCalendarInterval`을 건너뛰므로 시각 트리거를 따로 확인해야 한다
- [x] **7-6. 문서 갱신** — D18 기록. 문구는 설계서 §9 그대로
- [x] **7-7. 최종 검증** — `npx tsc --noEmit` · `npm run lint` · `npm test`
- [x] **7-8. 커밋** — `docs: D18 텔레그램 알림 결정 기록`

---

## 이번 범위 밖

설계서 §10과 동일하다. 텔레그램 명령 수신(`/report`), 그룹 채팅 다중 전송, 원본 화질 문서 전송, 재실행 중복 발송 방지는 하지 않는다.

## 리뷰 규칙

리뷰에서 나온 minor/nit는 수정 라운드에 올리지 않는다. 한 줄로 기록만 하고 넘어간다. Critical/Important만 수정 라운드를 돈다. 재리뷰는 Critical이 있었을 때만 돈다.
