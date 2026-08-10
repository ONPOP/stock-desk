---
name: stock-analysis
description: "정기 슬롯 주식 분석 스킬. scripts/engine/run-slot.ts가 헤드리스로 호출하거나 사용자가 '슬롯 분석', '종목 분석 실행', '시장 브리핑'을 요청하면 사용한다. TS 파이프라인이 생성한 지표 스냅샷을 읽고, 선정 종목의 뉴스·이슈를 조사해 매수·매도 진입 판단 JSON을 생성한다. 사용자의 매매 패턴은 종가 매수 → 익일 시초 매도 오버나잇 갭 전략이다."
---

# 정기 슬롯 주식 분석

## 사용자 프로필 (판단의 전제)

- 매매 패턴: **종가(마감 30분 전~마감) 매수 → 익일 시초(개장~1시간) 매도**. 초단타 아님. 오버나잇 갭 수익이 목표.
- BUY 판단의 핵심 질문은 항상: "오늘 종가에 사면 내일 시초에 갭업으로 팔 수 있는가?"
  - 당일 수급 마감 강도, 마감 후 예정 이벤트, 시간외 동향, 관련 미국장 영향을 중심으로 평가한다.
- SELL 판단의 핵심 질문: "보유 종목을 시초에 어떻게 처리하는가?" — 갭 시나리오별 대응을 제시한다.
- 매매는 사용자가 직접 실행한다. 이 분석은 판단 보조 자료다.

## 입력

1. `<슬롯 디렉토리>/snapshot.json` — TS 파이프라인(`scripts/engine/pipeline.ts`)이 계산한 지표·점수.
   **지표를 다시 계산하지 마라.** 스냅샷 값을 신뢰하고 해석만 한다.
   - 비율 값은 전부 **베이시스포인트 정수**다 (+1.00% = 100). 금액은 최소 통화 단위 정수(KRW=원, USD=센트).
2. `snapshot.json`의 `selected` 배열 — 분석 대상 (scorer 선정, `budget.maxStocks` 이하). **이 목록 외 종목은 분석하지 마라.**
3. `snapshot.json`의 `budget` — 종목당 웹 검색 상한(`maxSearchesPerStock`).
   `radar` — 눌림목 관찰 종목(진입 후보와 별개 트랙), `radarCommentTickers` — 코멘트를 달 대상(최대 3).
4. 슬롯 메타: slot_id, slot_type(quick/detail/weekly), 실행일.

## 분석 절차 (종목당)

1. 스냅샷의 지표·국면 플래그(`indicators.phase`)·점수 근거(`scoreDetail.items`)를 읽는다.
2. 웹 검색으로 당일 뉴스·공시·이슈를 조사한다. 우선순위: 공시/실적 > 산업 뉴스 > 수급 해석 기사. 커뮤니티·루머성 출처는 쓰지 않는다.
3. 차트 국면을 판단한다: `returnsBp`(1M/3M/6M/12M/3Y)와 MA 배열(`alignment`)로 상승장/하락장/눌림목/횡보를 서술.
   룰 기반 플래그와 다르게 판단하면 **그 이유를 명시**한다.
4. 뉴스와 차트가 상충하는지 확인한다(호재인데 하락 → 이미 반영? 매도 압력?). 상충 시 `confidence`를 낮춘다.
5. 판단 JSON을 작성한다.

## 출력 (엄격 준수)

`<슬롯 디렉토리>/analysis.json`에 아래 구조로만 출력한다. 다른 텍스트·마크다운·이미지·슬라이드 생성 금지
(**슬라이드는 `scripts/engine/render-slides.ts`가 렌더한다 — pptx 파일은 만들지 않는다**).

```json
{
  "marketOverview": {
    "summary": "지수·테마 흐름 3~5줄 (800자 이내)",
    "themeFlows": [{ "theme": "28자", "todayBp": 0, "trend": "상태 라벨 44자", "comment": "110자" }],
    "macroEvents": ["오늘/내일 주요 이벤트 — 항목당 110자"]
  },
  "stockCards": [ /* 아래 종목 카드 스키마 */ ],
  "radarNotes": [{ "ticker": "000660", "comment": "1~2줄" }],
  "ruleProposals": ["weekly 슬롯에서만 채운다 — 그 외에는 []"],
  "usageNote": "검색 총 N회 사용"
}
```

`marketOverview`는 1600×900 슬라이드 **한 장**에 통째로 들어간다. 위 글자 수를 넘기면 렌더러가 잘라내고,
`themeFlows`·`macroEvents`는 각각 10개까지만 실린다. `trend`는 문장이 아니라 상태 라벨이다 —
서술은 `comment`로 보낸다.

### 종목 카드 스키마

| 필드 | 타입 | 비고 |
|---|---|---|
| `ticker` `name` `market` | string | snapshot의 값을 그대로 |
| `signal` | `BUY`\|`SELL`\|`HOLD`\|`AVOID` | |
| `confidence` | `HIGH`\|`MID`\|`LOW` | |
| `entryZone` | `{low,high}` 정수 \| `null` | BUY가 아니면 null |
| `indicatorsSummary` | string | **원값 병기 필수** |
| `relativeStrength` `phase` `patternFit` | string | |
| `newsSummary` | string[] (≤3) | 각 출처 포함 |
| `bullCase` `bearCase` | string | `bearCase` 생략 금지 |
| `eventFlags` | string[] | |

### 필수 규칙

- `bearCase` 생략 금지. 매수 논리만 있는 카드는 불량이다. "이 판단이 틀린다면 왜인가"를 반드시 2줄 서술.
- `confidence` 기준: HIGH = 지표·수급·뉴스 3요소 정합 / MID = 2요소 정합 / LOW = 상충 존재. **상충이 있는데 HIGH를 주지 마라.**
- `indicatorsSummary`에는 원값 병기 ("RSI 양호" 금지, "RSI 58" 형식).
- `eventFlags`: `calendar_events` 또는 검색으로 확인된 실적발표·이벤트. **당일 밤 실적발표 종목은 `BUY` 금지** (`AVOID` + 사유).
- 확인되지 않은 정보를 사실처럼 쓰지 마라. 불확실하면 "미확인"으로 표기.

## 눌림목 관찰 코멘트

`radar`는 "상승 추세인데 지금 밀리는 중"이라 지켜볼 종목이다. 상태는 두 가지다.

- `watching` — 기준선을 터치했고 아직 MA10 아래 (반등 전)
- `entry_ready` — MA10을 회복 (진입 임박)

`radarCommentTickers`에 있는 **최대 3종목에만** `radarNotes` 코멘트를 단다.
**웹 검색을 하지 마라** — 스냅샷 지표(기준선 이격·RSI·터치 시점·거래량)만 해석한다(사용량 예산).
코멘트는 "지금 사라"가 아니라 **"무엇을 확인하면 진입인가"**를 1~2줄로 쓴다.

## detail 슬롯 추가 절차

quick 절차 완료 후, `marketOverview.summary`를 더 길게(섹션별 서술) 쓰고 다음을 보강한다.
슬라이드 구성·렌더는 여전히 코드가 담당하며, 스킬은 내용만 채운다.

1. 시장 종합: 지수 흐름, 수급, 매크로 이벤트
2. 테마별 흐름: 등록된 테마 전체의 당일·최근 상대 성과 (`themeFlows`에 전부 채운다)
3. 선정 종목 상세: 다중 타임프레임(1M/3M/6M/12M/3Y) 해석 + 시나리오를 `phase`·`patternFit`에 서술
4. 익일 전략: 종가매수 후보 최종안 / 보유 시 시초매도 시나리오를 `patternFit`에 포함
5. 리스크 캘린더: 향후 5영업일 이벤트를 `macroEvents`에 포함

## weekly 슬롯 절차

1. `<슬롯 디렉토리>/grade.json`(지난 7일 채점 요약)을 읽어 신호별 적중률·갭 분포·패인을 분석한다.
2. 성적이 나쁜 룰 조건을 특정하고 `signal_rules` 개선안을 **제안만** 한다 — 자동 변경 금지, 사용자 승인 필요.
3. 제안은 `ruleProposals` 배열에 **항목별로 한 줄씩** 담는다(별도 슬라이드로 렌더된다). DB를 직접 수정하지 마라.
   `marketOverview.summary`에 섞지 마라 — 시장 개요는 한 장짜리 슬라이드라 넘치면 잘린다.

## 금지 사항

- 매매 주문 실행, 주문 API 호출 시도.
- `selected` 외 종목 분석, `radarCommentTickers` 외 종목 코멘트 (사용량 예산 위반).
- 관찰 종목 조사를 위한 웹 검색 (지표 해석만 허용).
- 지표 재계산, 차트·이미지·pptx 직접 생성.
- snapshot 없는 상태에서 기억으로 시세 서술 (반드시 데이터 기반).
- 확정적 수익 보장 표현 ("반드시 오른다" 등). 모든 판단은 근거 + 시나리오 형식.
