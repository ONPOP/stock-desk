# Claude Code 전달 프롬프트

> 아래 전체를 복사해서 기존 주식 프로그램 레포 루트에서 Claude Code에 붙여넣으세요.
> 함께 전달할 파일: `01_DESIGN.md`(설계서), `02_SKILL_stock-analysis.md`(스킬 원문), `03_CLAUDE_MD_ADDITION.md`(CLAUDE.md 추가분)
> 세 파일을 레포 루트의 `docs/handoff/` 폴더에 미리 넣어두고 시작하는 것을 권장합니다.

---

## 프롬프트 본문 (여기부터 복사)

기존 주식 프로그램에 "정기 배치 분석 엔진"을 추가하는 작업을 진행한다.
전체 설계는 `docs/handoff/01_DESIGN.md`를 기준으로 하되, **설계서보다 기존 코드베이스의 실제 구조가 우선**이다. 충돌 시 기존 구조에 맞게 설계를 조정하고, 조정 내역을 반드시 보고하라.

### Phase 0 — 코드베이스 탐색 및 설계 매핑 (구현 금지, 보고만)

1. 레포 전체 구조를 파악하라: 프레임워크, DB(스키마 포함), 기존 KIS OpenAPI 연동 여부와 위치, 인증 방식, 배포 형태, 기존 스케줄링/크론 유무.
2. `01_DESIGN.md`의 각 구성요소(신규 테이블, Python 모듈, 스킬, cron 진입점)를 기존 코드베이스의 어디에 어떻게 통합할지 매핑 표를 작성하라.
   - 기존에 동일/유사 기능이 이미 있으면 **재사용**하고 신규 생성하지 마라 (예: KIS 토큰 발급 로직, 텔레그램 발송, Supabase 클라이언트).
   - 기존 테이블과 신규 테이블의 관계(FK, 네이밍 컨벤션 통일)를 정의하라.
3. 다음을 확인 질문으로 정리해서 나에게 물어라 (모르면 추측하지 말 것):
   - Supabase 프로젝트 접근 방식 (마이그레이션 도구 유무)
   - KIS API 키/토큰 저장 위치와 미국 주식 시세 조회 가능 여부 (불가 시 yfinance 사용)
   - 텔레그램 봇 토큰/챗ID 재사용 가능 여부
   - PPTX 산출물 저장 위치 (로컬 폴더 / Supabase Storage / R2)
4. 매핑 표 + 질문 + 조정된 Phase 계획을 보고하고 **내 승인을 받은 뒤** Phase 1을 시작하라.

### Phase 1 — 데이터 계층 (분석 엔진 뼈대)

`01_DESIGN.md`의 §3(DB 스키마), §4(Python 모듈) 기준.

1. Supabase에 신규 테이블 생성 (마이그레이션 파일로 작성): `analysis_themes`, `theme_stocks`, `watchlist`, `signal_rules`, `schedule_slots`, `market_snapshots`, `analysis_reports`, `signal_log`, `event_calendar`
2. `engine/` 디렉토리에 Python 모듈 구현: `fetch_kr.py`, `fetch_us.py`, `indicators.py`, `scorer.py`, `deck_builder.py`, `notify.py`, `archive.py`
3. 각 모듈은 단독 실행 테스트가 가능해야 한다 (`python -m engine.fetch_kr --test` 형태). 실제 시세로 삼성전자·NVDA 2종목 스모크 테스트를 수행하고 결과를 보여라.
4. 완료 기준: 30종목 워치리스트 기준 `fetch → indicators → scorer` 파이프라인이 60초 이내에 JSON 스냅샷을 생성하고 `market_snapshots`에 적재됨.

### Phase 2 — 스킬 및 슬롯 실행 파이프라인

1. `02_SKILL_stock-analysis.md`의 내용으로 `.claude/skills/stock-analysis/SKILL.md`를 생성하라. 내용은 원문 유지하되, Phase 0에서 확정된 실제 경로/테이블명으로 치환하라.
2. `03_CLAUDE_MD_ADDITION.md`의 내용을 프로젝트 CLAUDE.md에 병합하라 (기존 내용 보존).
3. `engine/run_slot.sh` 작성: 슬롯ID를 인자로 받아 `Python 수집·계산 → claude -p 헤드리스 분석 → deck_builder 렌더 → notify 발송 → archive 적재` 순서로 실행. 각 단계 실패 시 텔레그램으로 에러 알림 + 다음 단계 중단.
4. `claude -p` 호출 시 `--dangerously-skip-permissions`는 사용하지 말고, 필요한 도구만 `--allowedTools`로 허용하라.
5. 14:50 한국 종가 슬롯 하나로 end-to-end 테스트: 간이 덱 pptx 생성 + 텔레그램 수신까지 확인.

### Phase 3 — 스케줄링, 상세 리포트, 성적표

1. `schedule_slots` 테이블 기반으로 launchd(macOS) plist를 자동 생성/등록하는 `engine/install_schedule.py` 작성. 슬롯 변경 시 재실행하면 동기화되도록.
2. 마감 상세 리포트 슬롯(16:30 KST, 07:00 KST): pptx 스킬 활용, `01_DESIGN.md` §6의 상세 리포트 구성 준수.
3. `signal_log` 성적표: 매 영업일 장 시작 후 전일 신호의 실제 결과(시초가, 갭률, 당일 고저)를 자동 기록하는 `engine/grade_signals.py` 작성 + 스케줄 등록.
4. 주간 성적 리포트 슬롯(토 10:00): 지난주 신호 적중률 분석 + `signal_rules` 개선 제안.

### 작업 규칙

- 각 Phase 완료 시 변경 파일 목록, 테스트 결과, 다음 Phase 계획을 보고하고 승인을 받아라.
- 기존 프로그램의 기능을 깨뜨리지 마라. 기존 테이블 스키마 변경 금지 (신규 테이블 추가만 허용).
- 시크릿(API 키, 토큰)은 절대 코드에 하드코딩하지 말고 기존 프로젝트의 시크릿 관리 방식을 따르라.
- 모든 커밋 메시지는 `feat(engine):`, `fix(engine):` prefix 사용.
- 사용량 예산 준수: 슬롯당 Claude 분석 대상 최대 8종목, 종목당 웹 검색 최대 4회 (SKILL.md에 명시됨).

시작하라. Phase 0부터.
