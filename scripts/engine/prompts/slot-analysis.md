# 슬롯 분석 지시 (헤드리스)

`stock-analysis` 스킬을 사용해 아래 슬롯을 분석하라.

- 슬롯 디렉토리: `{{DIR}}`
- 슬롯 ID: `{{SLOT_ID}}` / 유형: `{{SLOT_TYPE}}` / 실행일(KST): `{{RUN_DATE}}`

## 절차

1. `{{DIR}}/snapshot.json`을 읽는다. `selected` 배열이 분석 대상이다.
2. **지표를 다시 계산하지 마라.** 스냅샷 값을 신뢰하고 해석만 하라.
3. `selected` 종목만 분석한다. 목록 외 종목은 사용량 예산 위반이다.
4. 종목당 웹 검색은 `budget.maxSearchesPerStock`회까지. 공시/실적 > 산업 뉴스 > 수급 해석 기사 순, 커뮤니티·루머성 출처 금지.
5. 결과를 `{{DIR}}/analysis.json`에 **아래 스키마 그대로** 쓴다. 다른 파일을 만들거나 마크다운을 출력하지 마라.

## 출력 스키마 (엄격)

```json
{
  "marketOverview": {
    "summary": "지수·테마 흐름 3~5줄 (800자 이내)",
    "themeFlows": [{ "theme": "테마명 28자", "todayBp": 0, "trend": "짧은 상태 라벨 44자", "comment": "110자" }],
    "macroEvents": ["오늘/내일 주요 이벤트 — 항목당 110자"]
  },
  "stockCards": [
    {
      "ticker": "005930",
      "name": "삼성전자",
      "market": "KOSPI",
      "signal": "BUY|SELL|HOLD|AVOID",
      "confidence": "HIGH|MID|LOW",
      "entryZone": { "low": 71000, "high": 71800 },
      "indicatorsSummary": "RSI 58(상승 3일차) · 20MA 이격 +1.2% · 거래량 20일比 1.4배",
      "relativeStrength": "종목 +2.1% vs 테마 +0.8% vs KOSPI +0.3%",
      "phase": "눌림목 반등 초입 (3M 상승추세 유지)",
      "newsSummary": ["핵심 이슈 최대 3줄, 각 출처 포함"],
      "bullCase": "매수 논리 2줄",
      "bearCase": "이 판단이 틀릴 수 있는 이유 2줄 — 필수",
      "eventFlags": ["D+2 실적발표"],
      "patternFit": "종가매수→시초매도 관점의 오버나잇 갭 요인 평가"
    }
  ],
  "radarNotes": [
    { "ticker": "000660", "comment": "1~2줄 코멘트" }
  ],
  "ruleProposals": ["weekly 슬롯에서만 채운다 — 그 외에는 []"],
  "usageNote": "검색 총 N회 사용"
}
```

## 분량 상한 (슬라이드가 1600×900 한 장이다)

`marketOverview`는 슬라이드 한 장에 그대로 들어간다. 위 괄호의 글자 수를 넘기면 렌더러가 잘라내므로
**넘긴 만큼은 독자에게 도달하지 않는다.** `themeFlows`·`macroEvents`는 각각 최대 10개다.
`trend`는 문장이 아니라 상태 라벨이다("4거래일 연속 상승, 외국인 순매수 주도" 같은 서술은 `comment`로 보낸다).
분량이 부족하면 종목 카드가 아니라 **덜 중요한 항목을 버려서** 맞춘다.

## 눌림목 관찰 코멘트 (radarNotes)

`snapshot.json`의 `radarCommentTickers`에 있는 종목에만 코멘트를 단다. **최대 3종목, 웹 검색 금지** —
스냅샷의 지표(이격률·RSI·터치 시점·거래량)만 해석해 1~2줄로 쓴다. 목록이 비어 있으면 `radarNotes`는 `[]`.
코멘트는 "지금 사라"가 아니라 **"무엇을 확인하면 진입인가"** 관점으로 쓴다.

## 하드 규칙

- `todayBp`·`entryZone`은 **정수**다. `todayBp`는 베이시스포인트(+1.00% = 100), `entryZone`은 최소 통화 단위(KRW=원, USD=센트).
- `entryZone`은 BUY가 아니면 `null`로 둔다.
- `bearCase` 생략 금지. 매수 논리만 있는 카드는 불량이다.
- `indicatorsSummary`에는 원값을 병기한다 ("RSI 양호" 금지, "RSI 58" 형식).
- 당일 밤 실적발표가 있는 종목에 `BUY`를 주지 마라 (`AVOID` + 사유).
- 확인되지 않은 정보를 사실처럼 쓰지 마라. 불확실하면 "미확인"으로 표기.
- 매매 주문 실행·주문 API 호출을 시도하지 마라.
- 슬라이드·이미지·pptx를 만들지 마라. 렌더는 별도 단계가 한다.
- `radarNotes`는 `radarCommentTickers` 목록 밖 종목에 달지 마라. 관찰 종목 조사를 위한 웹 검색도 금지다(예산).

{{EXTRA}}
