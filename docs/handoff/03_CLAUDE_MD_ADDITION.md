# CLAUDE.md 추가분

> Phase 2에서 프로젝트 루트 CLAUDE.md에 아래 섹션을 병합한다 (기존 내용 보존).

---

```markdown
## 분석 엔진 (engine/)

이 프로젝트에는 정기 배치 주식 분석 엔진이 포함되어 있다. 상세 설계: `docs/handoff/01_DESIGN.md`

### 핵심 규칙
- **역할 분리 절대 원칙**: 지표 계산·필터링·간이 덱 렌더링은 Python(engine/), 뉴스 해석·판단·서술은 stock-analysis 스킬. LLM에게 계산을 시키거나 Python에 판단 로직을 넣지 마라.
- **비용 제약**: Anthropic API 직접 호출 금지. LLM 작업은 반드시 `claude -p` 헤드리스만. 유료 데이터 API 추가 금지 (KIS OpenAPI, yfinance만).
- **사용량 예산**: 슬롯당 분석 종목 최대 8개, 종목당 웹 검색 최대 4회. 이 예산을 늘리는 변경은 사용자 승인 필요.
- **기존 코드 보호**: 기존 테이블 스키마 변경 금지 (신규 테이블 추가만). 기존 웹 앱 기능에 영향 주는 변경 시 사전 보고.
- **시크릿**: 하드코딩 금지. 기존 프로젝트 시크릿 관리 방식(.env 등)을 따른다.

### 사용자 매매 컨텍스트
- 매매 패턴: 종가 매수 → 익일 시초 매도 (오버나잇 갭 전략). 모든 신호 설계·튜닝은 이 패턴 기준.
- 매매는 사용자가 직접 실행. 엔진은 분석 자료만 생성한다. 주문 관련 기능을 추가 제안하지 마라.

### 자주 쓰는 작업
- 슬롯 수동 실행 테스트: `./engine/run_slot.sh kr_close_buy`
- 스케줄 동기화: `python -m engine.install_schedule`
- 워치리스트/테마 수정: Supabase `watchlist`, `analysis_themes`, `theme_stocks` 테이블 — 사용자가 채팅으로 "OO 종목 추가해줘"라고 하면 해당 테이블을 수정하면 된다.
- 슬롯 추가/변경: `schedule_slots` 수정 후 install_schedule 재실행.
- 신호 룰 변경: `signal_rules`에 **새 버전 행 추가** 후 active 전환 (기존 행 수정 금지 — 성적 비교를 위해 이력 보존).

### 장애 대응
- 슬롯 실패 시 텔레그램 에러 알림이 발송된다. 로그: `data/logs/{date}/{slot}.log`
- Supabase 적재 실패분은 `data/fallback/`에 보존되며 다음 실행 시 재시도된다.
- yfinance 부분 실패는 정상 동작이다 (해당 종목만 "데이터 미수집" 처리).
```
