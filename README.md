# Stock Desk

한미 주식 관심종목, 시세, 뉴스, 공시, AI 브리핑, 모의투자 기록을 관리하는 Next.js 기반 데스크톱/웹 앱입니다.

## 기술 스택

- Next.js 15 App Router
- React 19
- TypeScript
- Supabase Auth/Postgres/RLS
- Electron + electron-builder
- Vitest

## 시작하기

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## 필수 환경변수

`.env.local`에 아래 값을 설정합니다.

| 변수 | 용도 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 내부 작업용 service role key |
| `APP_ENCRYPTION_KEY` | 사용자 API 키 암호화 키, base64 32바이트 |
| `CRON_SECRET` | `/api/cron/dispatch` 인증 토큰 |
| `SUPABASE_DB_URL` | DB 마이그레이션 실행 시 사용 |

사용자별 KIS, DART, Finnhub, FMP, Naver, OpenAI 키는 앱의 설정 화면에서 저장합니다. CLI 검증 스크립트에서만 `.env.local`의 선택 변수들을 사용합니다.

`APP_ENCRYPTION_KEY` 생성 예:

```bash
openssl rand -base64 32
```

## 주요 스크립트

```bash
npm run dev            # 개발 서버
npm run build          # Next.js production build
npm run lint           # ESLint
npm run typecheck      # TypeScript 검사
npm run test           # Vitest
npm run db:migrate     # Supabase 마이그레이션
npm run app:build      # Electron standalone 준비
npm run app:start      # Electron 실행
npm run app:dist       # macOS DMG 빌드
```

## 배포

웹 배포는 [docs/DEPLOY.md](./docs/DEPLOY.md)를 기준으로 진행합니다.

현재 Electron 패키징은 macOS DMG 중심입니다. `package.json`의 `extraResources`가 `.env.local`을 앱 리소스에 포함하므로, 공개 배포용 설치 파일을 만들 때는 서버 비밀키를 앱에 넣지 않는 구조로 분리해야 합니다.

Windows 일반 사용자 배포는 별도 Windows 전용 프로젝트 폴더에서 진행합니다. 목표 산출물은 GitHub Releases에 업로드할 `Stock Desk Setup.exe`입니다.
