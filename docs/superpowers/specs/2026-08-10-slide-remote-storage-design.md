# 슬라이드 원격 저장 · 보존기간 설계

> **이 설계서에는 본문 구현 코드를 넣지 않는다**(프로젝트 규칙). 파일 경로·공개 인터페이스·불변식·검증 방법만 적는다.

**목표:** 분석 리포트 슬라이드를 로컬 디스크가 아니라 Supabase Storage에 저장하고, 원본은 30일 뒤
자동 삭제한다. 함께 DB 증가분도 정리해 Supabase 무료 한도(DB 500MB · Storage 1GB · egress 5GB/월)
안에서 무기한 유지되게 한다.

## 측정 (2026-08-10)

`~/StockDesk/runs` 4일치(2026-08-05 ~ 08-08)와 운영 중인 Supabase를 직접 조회한 값이다.

| 항목 | 실측 |
|---|---|
| 슬라이드 | 1600×900 PNG · 장당 평균 237KB · 하루 평균 64장(최다 96장) |
| 하루 산출 | ~18MB · 월 ~390MB · 연 ~4.7GB |
| WebP q82 재인코딩(샘플 20장) | 장당 274KB → **104KB (62% 절감)** |
| 썸네일(이미 Storage에 적재 중) | JPG 장당 10.5KB |
| DB 현재 | **84MB / 500MB** |
| `market_snapshots` | 3.5MB / 1,546행 · 완전가동일(8/7, 7슬롯) 726행 = **1.65MB/거래일** |
| `analysis_reports` | 1.5MB / 18행 · 건당 83KB(`slides` jsonb 압축 후 46.7KB) = **0.58MB/거래일** |
| `news_items` | 17MB / 35,850행 (2개월) = **8.5MB/월** |

DB는 엔진만으로 월 48MB, 뉴스까지 월 ~57MB씩 늘어난다. 잔여 416MB ÷ 57 ≈ **7개월 뒤 한도 도달**.
이미지를 Storage로 옮기고 30일 보존을 걸어도 이 증가는 그대로다 — 그래서 DB 정리를 같이 넣는다.

### 적용 후 정상상태 추정

| 자원 | 무료 한도 | 정상상태 | 여유 |
|---|---|---|---|
| File Storage | 1GB | 162MB (원본 WebP 147MB + 썸네일 15MB) | 84% |
| Database | 500MB | ~250MB (수렴) | 50% |
| Egress | 5GB/월 | ~150MB | 97% |

피크(매일 96장)가 지속돼도 Storage 245MB(25%)다.

## 결정 (승인 필요 — PRD Decision Log **D19**)

> D16은 "산출물 저장 루트는 외장 볼륨 지정 가능"으로 정했다. 이를 다음으로 변경한다.
> 슬라이드 원본은 Supabase Storage(`analysis-slides` 버킷)에 WebP q82로 저장하고,
> 로컬 렌더 산출물은 업로드·발송 완료 후 삭제하는 임시물로 격하한다.
> 원본 보존기간은 `engine_settings.retention_days`(30일)를 따르고, 썸네일은 만료 대상에서 제외한다.
> DB 보존은 `market_snapshots` 90일 · `analysis_reports.slides` jsonb는 원본과 동시 만료 ·
> `news_items` 90일로 한다.

**스키마 변경은 없다.** 기존 테이블 스키마 변경 금지 규칙(CLAUDE.md)을 지키기 위해
새 컬럼·새 `check` 값·새 `slot_type`을 만들지 않는 설계를 골랐다. 대가는 아래 두 가지다.

- 만료 여부는 컬럼이 아니라 **`run_date` + 보존기간 계산**과 **객체 부재 시 썸네일 폴백**으로 표현한다.
- DB 보존기간은 앱 설정이 아니라 **코드 상수**다(`lib/engine/retention.ts`). 변경하려면 코드 수정이 필요하다.

**마이그레이션 파일도 없다.** 버킷은 `archive.ts`가 이미 최초 1회 생성하고(non-public),
읽기는 서버가 admin 클라이언트로 서명 URL을 만들어 내보내므로 `storage.objects` RLS 정책이 필요 없다.

## 오프라인 열람은 이미 불가능하다 (로컬 삭제 근거)

리포트 목록·본문은 `analysis_reports`에서 온다(`app/api/reports/route.ts`). 데스크톱 앱도 Supabase에
붙지 못하면 리포트 화면 자체가 비어 있다. 즉 로컬 원본을 남겨도 오프라인 열람은 성립하지 않는다.
따라서 업로드가 확인된 원본은 삭제해도 잃는 기능이 없고, 외장 볼륨 연 4.7GB를 절약한다.

## 구조

### ① `lib/engine/slide-format.ts` (신규) — 포맷 단일 출처

렌더·업로드·서빙·텔레그램이 확장자와 MIME을 각자 하드코딩하면 어긋난다. 한 곳에서만 정의한다.

```ts
export const SLIDE_EXT: 'webp'
export const SLIDE_CONTENT_TYPE: 'image/webp'
export const SLIDE_QUALITY: 82
export const THUMB_EXT: 'jpg'
export const THUMB_CONTENT_TYPE: 'image/jpeg'
```

### ② `scripts/engine/render-slides.ts` (수정) — WebP 캡처

- `capture(...)`의 `type`을 `'png'` → `'webp'`로, `quality`에 `SLIDE_QUALITY`를 넘긴다.
  **Playwright가 `type: 'webp'`를 직접 지원하고 `quality`도 반영한다(S2·S2b 실측).**
  변환 라이브러리는 필요 없다 — sharp 경로와 결과 크기가 0.5% 차이(1208KB vs 1202KB)라 이득이 없다.
- **`quality`를 반드시 명시한다.** 생략하면 무손실에 가깝게 나와 13장 2982KB로, PNG(3238KB) 대비
  8%밖에 줄지 않는다. 이 설계의 용량 계산이 통째로 무너지는 지점이다.
- `relPaths`에 쌓는 상대 경로 확장자가 `.webp`가 된다 → `slide-paths.json` → `analysis_reports.slide_paths`.
- 썸네일 JPG 생성은 그대로 둔다(만료 후 폴백 원본이 된다).

### ③ `lib/engine/slide-storage.ts` (신규) — 키 규칙 · 업로드 · 서명

버킷 프리픽스는 지금 썸네일이 쓰는 `${userId}/${runDate}/${slotId}`를 그대로 쓴다.
원본과 썸네일이 같은 프리픽스 아래 확장자로만 갈린다 → `thumb_bucket_path` 하나로 둘 다 찾을 수 있고
새 컬럼이 필요 없다.

```ts
export const SLIDE_BUCKET: 'analysis-slides'

export function slidePrefix(userId: string, runDate: string, slotId: string): string
export function slideObjectKey(prefix: string, index: number): string   // `${prefix}/01.webp`
export function thumbObjectKey(prefix: string, index: number): string   // `${prefix}/01.jpg`

export interface UploadResult { prefix: string; slides: number; thumbs: number }
export function uploadRunAssets(db: SupabaseClient, dir: string, prefix: string): Promise<UploadResult>

/** 객체가 없으면 null (만료·미업로드를 구분하지 않는다 — 호출부가 폴백한다) */
export function signedObjectUrl(db: SupabaseClient, key: string, expiresIn: number): Promise<string | null>

export function deletePrefix(db: SupabaseClient, prefix: string, ext: string): Promise<number>
```

`uploadRunAssets`는 전량 성공했을 때만 `slides`에 실제 개수를 채운다. 부분 성공은 실패로 본다
(로컬 삭제 판단의 근거가 되기 때문이다 — 아래 불변식 1).

### ④ `scripts/engine/archive.ts` (수정) — 원본까지 업로드

- 기존 `uploadThumbs`를 `uploadRunAssets` 호출로 대체한다. 주석의 "원본은 로컬 — 무료 티어 용량 보호"는
  이 설계서의 측정으로 뒤집혔으므로 갱신한다.
- `analysis_reports` upsert의 `thumb_bucket_path`에 프리픽스를 넣는 동작은 그대로.
- 업로드 실패는 기존 `queueFallback` 경로로 보내 다음 실행에서 재시도한다. **DB 적재는 계속 진행한다**
  (리포트 본문은 이미지 없이도 가치가 있다 — 현행 `storage_state='pending'` 의미를 그대로 쓴다).

### ⑤ `lib/supabase/queries/reports.ts` (수정) — 프리픽스를 조회에 포함

현재 `SUMMARY_COLUMNS`에 `thumb_bucket_path`가 **없다**. 라우트가 프리픽스를 못 받으므로 추가한다.

```ts
const SUMMARY_COLUMNS: '… , thumb_bucket_path'   // 기존 목록에 추가
interface ReportRow { …; thumb_bucket_path: string | null }
export interface ReportDetail extends ReportSummary {
  slidePaths: string[];
  bucketPrefix: string | null;   // 신규 — thumb_bucket_path
}
```

`ReportSummary`(목록용)에는 넣지 않는다. 프리픽스가 필요한 곳은 슬라이드 서빙 하나뿐이다.

### ⑥ `app/api/reports/slide/route.ts` (수정) — 서명 URL 302 + 썸네일 폴백

현행: 로컬 파일을 읽어 바이트를 직접 흘려보낸다. 변경 후:

1. `requireUser()` → `getReport(supabase, user.id, reportId)` — **소유권 확인은 지금과 동일하게 DB로** 한다.
2. 프리픽스는 `report.bucketPrefix`, 인덱스는 쿼리스트링 `n`. **클라이언트는 키를 지정할 수 없다.**
3. admin 클라이언트로 **`createSignedUrls([원본키, 썸네일키], 3600)` 한 번**을 호출한다.
   S3 실측: 이 일괄 API는 부재 키에 대해 전체를 실패시키지 않고 항목별 `error`
   ("Either the object does not exist or you do not have access to it")와 `signedUrl: null`을 준다.
   왕복 1회로 원본·폴백을 동시에 판정할 수 있다.
   (단건 `createSignedUrl`은 부재 시 `StorageApiError "Object not found" status 400`을 던진다 —
   두 번 호출하는 설계였다면 만료 슬라이드마다 왕복이 2회가 된다.)
4. 원본 URL이 있으면 그것으로, 없고 썸네일만 있으면 썸네일로 302 리다이렉트하고
   응답 헤더에 `X-Slide-Variant: thumb`를 실어 UI가 축소본임을 표시할 수 있게 한다.
5. 둘 다 없으면 404 + 한국어 메시지. 볼륨 미연결 메시지("저장 볼륨 연결을 확인하세요")는 삭제한다 —
   원격 저장에서는 오진이다.

서명 URL 만료는 `Cache-Control: private, max-age`와 어긋나면 안 된다. **서명 만료 = 캐시 max-age = 3600초**로
맞춘다(현행 86400은 서명보다 길어지면 깨진 URL을 캐시하게 된다).

리다이렉트 방식이라 이미지 바이트가 Vercel 함수를 통과하지 않는다(대역폭 0, Supabase egress로 계상).

### ⑦ `lib/engine/retention.ts` + `scripts/engine/purge.ts` (신규) — 만료 정리

```ts
export const SNAPSHOT_RETENTION_DAYS: 90
export const NEWS_RETENTION_DAYS: 90

export interface PurgePlan {
  slideReports: Array<{ reportId: string; prefix: string; runDate: string }>;
  snapshotCutoff: string;   // 이 날짜 미만 삭제
  newsCutoff: string;
  latestProtected: { runDate: string; slotId: string } | null;  // 미리보기가 참조하는 최신 run
}
export interface PurgeCounts { objects: number; slidesCleared: number; snapshots: number; news: number }

export function planPurge(db: SupabaseClient, userId: string, today: string, retentionDays: number): Promise<PurgePlan>
export function executePurge(db: SupabaseClient, userId: string, plan: PurgePlan): Promise<PurgeCounts>
```

CLI `scripts/engine/purge.ts`는 `--dry`(계획만 출력)와 실행 두 모드를 갖는다.
`--dry`의 출력이 곧 실행 대상 목록이어야 한다(같은 `planPurge` 결과를 쓴다).

### ⑧ `scripts/engine/run-slot.ts` (수정) — notify 이후 정리 단계

현재 순서: `pipeline → claude → render-slides → archive → notify`.
**`notify` 다음에 `purge`를 붙인다.** 텔레그램이 로컬 파일을 읽어 발송하므로 그 전에 지우면 안 된다.

`purge` 실패는 `fail()`을 호출하지 않는다 — 알림까지 끝난 뒤의 정리 작업이라 슬롯 전체를 실패로
만들 이유가 없다. 경고 로그만 남기고 다음 실행에서 다시 시도된다(정리는 멱등이다).

별도 launchd 잡을 만들지 않는 이유: `schedule_slots.slot_type`의 `check` 제약에 새 값이 필요해지고,
그건 기존 테이블 스키마 변경이다. 슬롯마다 도는 정리는 대부분 0건 삭제라 비용이 없다.

## 불변식

1. **로컬 원본 삭제는 업로드 전량 성공이 DB에 기록된 뒤에만** 한다. 부분 업로드·업로드 실패 시
   로컬을 남기고 fallback 큐에 넣는다. (삭제가 앞서면 복구 불가능한 유실이다.)
2. **썸네일은 만료 대상이 아니다.** 연 30MB이고, 원본이 사라진 과거 리포트를 볼 수 있게 하는 유일한 수단이다.
3. **슬라이드 객체 키는 항상 DB(`thumb_bucket_path`)에서 온다.** 클라이언트가 경로·프리픽스를 지정할 수
   있는 경로를 만들지 않는다(현행 경로 traversal 방어의 대체물).
4. **버킷은 non-public을 유지한다.** 공개 URL을 쓰지 않는다.
5. **삭제 쿼리는 예외 없이 `user_id` 스코프**를 건다.
6. **`market_snapshots`의 최신 run은 절대 지우지 않는다.** 규칙 미리보기(`latestSnapshotSet`)가
   시세 재조회 없이 동작하는 전제다. 90일 컷오프가 최신 run을 포함하는 상황(장기 미실행)에서도
   `latestProtected`가 이를 막는다.
7. **`slides` jsonb 비우기는 해당 리포트의 원본 객체를 실제로 지운 뒤에만** 한다. 순서가 뒤집히면
   이미지를 다시 만들 정의가 사라진다.
8. `retention_days = 0`은 현행 의미대로 **무제한**이다. 이 경우 이미지·`slides` 정리를 건너뛴다
   (`market_snapshots`·`news_items` 정리는 코드 상수라 계속 돈다).
9. 텔레그램 발송은 **로컬 파일**에서 한다. Storage URL로 보내면 Telegram이 다운로드하며 egress를 먹는다.

## 스파이크 결과 (2026-08-10 · 완료)

세 가정을 모두 실측했다. 전부 통과했고, 두 개는 설계를 단순화시켰다.

**S1 — 텔레그램은 WebP를 받는다.** 실제 봇으로 `01.webp`(15KB)를 `sendPhoto` 단건,
`01~03.webp` 3장을 `sendMediaGroup`으로 보내 **둘 다 성공**했다. 발송용 JPEG를 따로 뽑는 분기는
필요 없다. `lib/engine/telegram.ts`는 손대지 않고 파일명 확장자만 `.webp`로 바뀐다.

**S2 · S2b — Playwright가 WebP를 직접 찍고 `quality`도 반영한다.** 변환 라이브러리가 불필요해졌다.

| 방식 | 13장 합계 | 판정 |
|---|---|---|
| PNG(현행) | 3238KB | 기준 |
| `type:'webp'` quality 미지정 | 2982KB | **함정** — 8%밖에 안 줄어든다 |
| `type:'webp', quality:82` | **1208KB** | 채택 (63% 절감) |
| PNG 캡처 → sharp q82 | 1202KB | 0.5% 차이 — 이득 없음 |

렌더 시간은 webp 직접 캡처 788ms/13장으로 PNG 캡처(548ms) 대비 슬롯당 +0.24초다. 무시 가능하다.

**S3 — 부재 객체는 에러로 구분된다.** 단건 `createSignedUrl`은 `StorageApiError "Object not found"
status 400`을 던지고 URL은 null이다. **일괄 `createSignedUrls`는 부재 항목만 항목별 error로 표시하고
나머지는 정상 발급**한다. 그래서 ⑥은 원본·썸네일을 한 번에 서명해 왕복 1회로 폴백을 판정한다.
운영 버킷의 기존 썸네일(`{userId}/{runDate}/{slotId}/01.jpg`)로 발급한 서명 URL은 `200 image/jpeg`로
실제 다운로드까지 확인했다 — 프리픽스 규칙 재사용이 실물로 검증됐다.

## 검증 (위험도별)

**위험 — 실제로 돌려서 막히는지 실증 + 변이 테스트**

- `purge` 파일·행 삭제: `--dry`로 대상 목록을 뽑고 → 실행 → 재조회로 대상만 사라졌는지 확인한다.
  변이 테스트: 컷오프 계산을 고의로 하루 어긋나게 한 사본에서 테스트가 실패하는지,
  `user_id` 필터를 제거한 사본에서 테스트가 실패하는지 확인한다.
- 불변식 6(최신 run 보호): 최신 run이 컷오프보다 오래된 상황을 만들어 삭제되지 않음을 실증한다.
- 불변식 7(순서): 객체 삭제가 실패한 리포트의 `slides`가 비워지지 않음을 실증한다.
- 서명 URL 권한: **다른 사용자의 `reportId`로 호출해 404가 나는지 실제 요청으로 확인**한다.
  `n` 파라미터로 다른 리포트의 슬라이드를 끌어올 수 없는지도 함께 본다.
- 불변식 1(로컬 삭제): 업로드를 강제 실패시킨 실행에서 로컬 파일이 남고 fallback 큐에 들어가는지 확인한다.

**보통 — diff 읽기 + 단위 테스트**

- `slideObjectKey`/`slidePrefix` 규칙, `planPurge`의 컷오프 계산(경계일 포함/제외), WebP 렌더 산출물의
  확장자·MIME 일관성, 라우트의 썸네일 폴백 분기.
- 기존 `lib/engine/telegram.test.ts`의 `.png` 파일명 픽스처를 새 확장자에 맞춰 갱신한다.

**낮음 — 테스트만**

- `slide-format.ts` 상수, `SNAPSHOT_RETENTION_DAYS` 등.

**공통**

```bash
npx tsc --noEmit && npm run lint && npm test
```

실환경 검증은 `./scripts/engine/run-slot.sh kr_close_buy` 1회 실행 후 네 가지를 확인한다.
(a) Storage에 `.webp`가 올라갔는가 (b) `/reports`에서 이미지가 보이는가
(c) 로컬 run 디렉터리에서 원본이 사라졌는가 (d) 텔레그램에 슬라이드가 도착했는가.

## 실패 모드와 롤백

| 상황 | 동작 |
|---|---|
| 업로드 실패 | DB 적재는 진행 · 로컬 보존 · fallback 큐 · 다음 실행에서 재시도 |
| 원본 만료 후 열람 | 썸네일로 폴백(`X-Slide-Variant: thumb`) |
| Supabase 장애 | 슬롯은 기존 fallback 경로로 로컬에 남는다(현행과 동일) |
| Storage 한도 근접 | `retention_days`를 앱에서 낮추면 다음 정리부터 반영 |
| 롤백 | ⑥의 라우트를 로컬 읽기로 되돌리면 되지만, 로컬 원본이 이미 삭제된 기간은 복구되지 않는다. **⑧(로컬 삭제)을 마지막 작업으로 배치**해 앞 단계가 안정된 뒤 켠다. |

## 범위 밖

- `sim_candles`(41MB) 정리 — 엔진과 무관하고 증가 여부를 확인하지 않았다. 별건으로 다룬다.
- Vercel 배포·크론 변경. 정리는 로컬 launchd 경로 안에서 끝난다.
- 슬라이드 정의(`slides` jsonb)로 이미지를 다시 만드는 재렌더 기능. 지금은 필요 없다.

## 구현 중 발견 — 설계서와 달라진 것 (2026-08-10)

세 가지는 코드를 쓰면서 사실이 달랐다. 앞의 본문은 설계 당시 판단이고, 실제 구현은 아래를 따랐다.

1. **`news_items`에는 `user_id`가 없다**(`0001_init.sql` — "공용" 테이블). 불변식 5(모든 삭제에 user
   스코프)를 지킬 수 없으므로 **기본값에서는 뉴스를 지우지 않는다.** `executePurge`의
   `includeSharedNews` 옵션(CLI `--include-news`)을 켤 때만 전역 삭제한다.
   **2026-08-10 사용자 승인으로 켰다** — `run-slot.ts`가 `--include-news`로 부른다. 근거: 뉴스는 URL
   기준 공개 뉴스 캐시라 재수집 가능하고, 승인 시점 DB의 다른 계정(`hmw1991@naver.com`)은
   관심종목·리포트·스냅샷이 모두 0이었다. 멀티유저로 가면 이 결정을 다시 봐야 한다.
2. **보호 대상은 슬롯별 최신 run 전부**다. 설계서는 `latestProtected`를 단일 `{runDate, slotId}`로
   뒀지만, `latestSnapshotSet(db, userId, slotId)`는 슬롯을 지정해 부를 수 있어(`/api/engine/rules/preview`)
   전역 최신 하나만 지키면 다른 슬롯의 미리보기가 깨진다. 더 넓게 보호하는 쪽이라 안전 방향이다.
3. **`lib/engine/telegram.ts`는 손대야 했다.** 첨부 Blob의 MIME이 `image/png`로 하드코딩돼 있어
   WebP 바이트와 어긋난다. 파일명 확장자에서 MIME을 유도하도록 고쳤다(`photoMime`).

**아직 켜지 않은 것:** 로컬 원본 삭제. 설계서 롤백 항목의 "⑧을 마지막 작업으로 배치해 앞 단계가
안정된 뒤 켠다"를 따라, 실제 슬롯이 한 번 성공적으로 돌아 Storage 적재·앱 열람·텔레그램 수신이
확인된 뒤에 붙인다. 지금은 업로드만 하고 로컬을 남긴다(되돌릴 수 있는 상태).

## 미결 (착수 전 확인)

1. **D19 승인** — PRD Decision Log 기록이 선행돼야 한다.
2. `retention_days`는 현재 기본 0(무제한)이다. 앱 [설정]에서 **30**으로 바꾸는 것이 이 설계의 전제다.
3. S1의 두 메시지가 텔레그램 앱에서 **깨짐 없이 보이는지 눈으로 확인**한다. API 성공은 수신을
   보장하지 않는다(서버가 조용히 변환·거절하는 경우가 있다).
