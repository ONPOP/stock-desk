# 배포 가이드 — Stock Desk (Vercel)

> Next.js 15 App Router + Supabase + Vercel Cron. 데스크톱(Electron) 빌드와 별개로 웹 배포.

## 1. 환경변수 (Vercel Project → Settings → Environment Variables)

| 변수 | 용도 | 비고 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | `https://xxxx.supabase.co` (끝에 `/rest/v1/` 금지) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 | 공개 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서비스 롤(서버 전용) | RLS 우회 — 크론·수집 |
| `APP_ENCRYPTION_KEY` | 사용자 API 키 AES-256 암호화 | base64 32바이트 |
| `CRON_SECRET` | 크론 디스패처 인증 | 임의 난수. **미설정 시 `/api/cron/dispatch`는 401** |
| `SEC_EDGAR_USER_AGENT` | SEC EDGAR User-Agent | 선택, `"이름 이메일"` 권장 |
| `SUPABASE_DB_URL` | 마이그레이션 적용용 | 로컬/CI에서 `db:migrate`에만 필요(런타임 불요). Session Pooler 주소 권장 |

> 사용자별 외부 API 키(KIS·DART·Finnhub·FMP·네이버·OpenAI)는 환경변수가 아니라 **설정 화면에서 DB에 암호화 저장**된다.

## 2. DB 마이그레이션 (배포 전)

```bash
# .env.local에 SUPABASE_DB_URL 설정 후
npm run db:migrate    # 0001~0004 적용 (api_usage_log·네이버 키 컬럼 포함)
```

## 3. 배포

```bash
vercel link           # 프로젝트 연결(최초 1회)
# 위 환경변수 등록: vercel env add <NAME> production
vercel --prod         # 프로덕션 배포
```

- `vercel.json`의 `crons`가 자동 등록되어 **30분마다 `/api/cron/dispatch`** 호출(시각 매칭으로 브리핑·뉴스·지표·예약체결 수행).
- `output: 'standalone'`은 Electron 빌드용이며 Vercel 배포에 영향 없음.

## 4. 배포 후 점검

- `/login` 200 · 로그인 → 대시보드 렌더
- 설정 화면에서 외부 API 키 입력(저장됨)
- 크론: `curl -H "Authorization: Bearer $CRON_SECRET" https://<도메인>/api/cron/dispatch` → `{ ok: true }`

## 5. 자동화 미완료(후속)

- F7 자동분석: `analysis_schedules`(사용자별 run_time) 매칭 로직을 `dispatch.ts`에 연결
- 예약주문 체결(`settle`): 개장 시 시초가 체결 완성(현재 pending 집계 골격)
- Anthropic 키 발급 시 F7 듀얼 비교뷰 활성화
