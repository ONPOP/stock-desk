// 슬라이드 → 자기완결 HTML (D16).
// 배치(launchd)에서 Next 서버 없이 렌더해야 하므로 외부 CSS·폰트·스크립트 의존을 두지 않는다.
// 렌더러가 file://로 열어 1600×900으로 캡처한다.

import type { Slide } from '@/lib/engine/slide-schema';

export const SLIDE_WIDTH = 1600;
export const SLIDE_HEIGHT = 900;

/** 앱 다크 테마(트레이더 콕핏)와 같은 계열의 토큰. 슬라이드는 항상 다크 고정 */
const T = {
  bg: '#0b0f14',
  panel: '#131a22',
  border: '#22303d',
  text: '#e6edf3',
  muted: '#8b9bab',
  up: '#f2555a',
  down: '#3d8bfd',
  accent: '#f5c542',
  ok: '#34d399',
};

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SIGNAL_COLOR: Record<string, string> = {
  BUY: T.up,
  SELL: T.down,
  HOLD: T.muted,
  AVOID: '#9aa4b2',
};

/** 표시 구간 전체의 방향으로 종가 선 색을 정한다. 범례도 같은 색을 써야 하므로 별도 함수로 둔다 */
function trendColor(closes: number[]): string {
  return closes.length > 1 && closes[closes.length - 1] >= closes[0] ? T.up : T.down;
}

/**
 * 종가 + MA 라인 차트를 인라인 SVG로. 차트 라이브러리를 쓰지 않는 이유는
 * 배치 렌더가 네트워크·번들 없이 결정적으로 끝나야 하기 때문이다.
 */
function lineChartSvg(
  closes: number[],
  ma20: Array<number | null>,
  ma60: Array<number | null>,
  w = 700,
  h = 260,
): string {
  if (closes.length < 2) return '';
  const pad = { t: 12, r: 8, b: 18, l: 8 };
  const all = [...closes, ...ma20, ...ma60].filter((v): v is number => typeof v === 'number');
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;

  const x = (i: number) => pad.l + (i / (closes.length - 1)) * iw;
  const y = (v: number) => pad.t + ih - ((v - min) / span) * ih;

  const pathOf = (series: Array<number | null>) => {
    let d = '';
    let pen = false;
    series.forEach((v, i) => {
      if (v === null || Number.isNaN(v)) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const areaD = `${pathOf(closes)}L${x(closes.length - 1).toFixed(1)} ${pad.t + ih}L${x(0).toFixed(1)} ${pad.t + ih}Z`;
  const stroke = trendColor(closes);

  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${stroke}" stop-opacity="0.28"/>
    <stop offset="100%" stop-color="${stroke}" stop-opacity="0"/>
  </linearGradient></defs>
  <path d="${areaD}" fill="url(#g)"/>
  <path d="${pathOf(ma60)}" fill="none" stroke="${T.muted}" stroke-width="1.5" stroke-dasharray="4 3"/>
  <path d="${pathOf(ma20)}" fill="none" stroke="${T.accent}" stroke-width="1.75"/>
  <path d="${pathOf(closes)}" fill="none" stroke="${stroke}" stroke-width="2.25"/>
</svg>`;
}

function metricGrid(metrics: Array<{ label: string; value: string }>): string {
  return `<div class="metrics">${metrics
    .map((m) => `<div class="metric"><span class="k">${esc(m.label)}</span><span class="v">${esc(m.value)}</span></div>`)
    .join('')}</div>`;
}

function slideBody(slide: Slide): string {
  switch (slide.kind) {
    case 'cover':
      return `<div class="cover">
  <div class="eyebrow">STOCK DESK · 정기 배치 분석</div>
  <h1>${esc(slide.slotLabel)}</h1>
  <div class="headline">${esc(slide.headline)}</div>
  <div class="stats">${slide.stats
    .map((s) => `<div class="stat"><div class="sv">${esc(s.value)}</div><div class="sk">${esc(s.label)}</div></div>`)
    .join('')}</div>
  <div class="stamp">${esc(slide.runAtKst)} KST</div>
</div>`;

    case 'market':
      return `<h2>시장 개요</h2>
<p class="lead">${esc(slide.overview.summary)}</p>
<div class="split">
  <div class="panel">
    <div class="panel-title">테마 흐름</div>
    ${
      slide.overview.themeFlows.length === 0
        ? `<div class="empty">등록된 테마 없음</div>`
        : `<table>${slide.overview.themeFlows
            .map(
              (t) => `<tr>
      <td class="th">${esc(t.theme)}</td>
      <td class="num ${(t.todayBp ?? 0) >= 0 ? 'up' : 'down'}">${t.todayBp === null ? '-' : `${(t.todayBp / 100).toFixed(2)}%`}</td>
      <td class="tt">${esc(t.trend)}</td>
      <td class="tc">${esc(t.comment)}</td>
    </tr>`,
            )
            .join('')}</table>`
    }
  </div>
  <div class="panel">
    <div class="panel-title">매크로 이벤트</div>
    <ul>${slide.overview.macroEvents.map((e) => `<li>${esc(e)}</li>`).join('') || '<li class="empty">없음</li>'}</ul>
  </div>
</div>`;

    case 'stock': {
      const c = slide.card;
      const color = SIGNAL_COLOR[c.signal] ?? T.muted;
      return `<div class="stock-head">
  <div>
    <div class="ticker">${esc(c.ticker)} · ${esc(c.market)}</div>
    <h2>${esc(c.name)}</h2>
  </div>
  <div class="badges">
    <div class="signal" style="background:${color}">${esc(c.signal)}</div>
    <div class="conf">확신도 ${esc(c.confidence)}</div>
    ${c.entryZone ? `<div class="entry">진입 ${c.entryZone.low.toLocaleString()} ~ ${c.entryZone.high.toLocaleString()}</div>` : ''}
  </div>
</div>
<div class="stock-body">
  <div class="left">
    ${slide.chart ? lineChartSvg(slide.chart.closes, slide.chart.ma20, slide.chart.ma60) : '<div class="empty">차트 데이터 없음</div>'}
    <div class="legend"><span class="dot" style="background:${slide.chart ? trendColor(slide.chart.closes) : T.muted}"></span>종가 <span class="dot c2"></span>MA20 <span class="dot c3"></span>MA60</div>
    ${metricGrid(slide.metrics)}
  </div>
  <div class="right">
    <div class="row"><div class="rk">지표</div><div class="rv">${esc(c.indicatorsSummary)}</div></div>
    <div class="row"><div class="rk">국면</div><div class="rv">${esc(c.phase)}</div></div>
    <div class="row"><div class="rk">상대강도</div><div class="rv">${esc(c.relativeStrength)}</div></div>
    <div class="row"><div class="rk">뉴스</div><div class="rv">${
      c.newsSummary.map((n) => `<div class="news">· ${esc(n)}</div>`).join('') || '<span class="muted">확인된 뉴스 없음</span>'
    }</div></div>
    <div class="case bull"><div class="ck">매수 논리</div>${esc(c.bullCase)}</div>
    <div class="case bear"><div class="ck">반대 시나리오</div>${esc(c.bearCase)}</div>
    <div class="row"><div class="rk">패턴 적합</div><div class="rv">${esc(c.patternFit)}</div></div>
    ${c.eventFlags.length > 0 ? `<div class="flags">${c.eventFlags.map((f) => `<span>${esc(f)}</span>`).join('')}</div>` : ''}
  </div>
</div>`;
    }

    case 'grade':
      return `<h2>${esc(slide.title)}</h2>
<div class="grade">${slide.rows
        .map(
          (r) => `<div class="grow"><div class="gk">${esc(r.label)}</div><div class="gv ${r.tone}">${esc(r.value)}</div></div>`,
        )
        .join('')}</div>
<p class="note">${esc(slide.note)}</p>`;

    case 'radar':
      return `<h2>${esc(slide.title)}</h2>
<p class="lead">${esc(slide.criteria)}</p>
${
  slide.rows.length === 0
    ? `<div class="panel"><div class="empty">조건에 해당하는 관찰 종목이 없습니다.</div></div>`
    : `<table class="radar">
  <tr class="hd"><td>종목</td><td>상태</td><td class="num">기준선 이격</td><td class="num">RSI</td><td class="num">거래량</td><td class="num">터치</td><td>코멘트</td></tr>
  ${slide.rows
    .map(
      (r) => `<tr>
    <td class="th">${esc(r.name)}${r.pinned ? '<span class="pin">고정</span>' : ''}<div class="sub">${esc(r.ticker)}</div></td>
    <td><span class="state ${r.state}">${r.state === 'entry_ready' ? '진입임박' : '관찰중'}</span></td>
    <td class="num">${esc(r.disparity)}</td>
    <td class="num">${esc(r.rsi)}</td>
    <td class="num">${esc(r.volume)}</td>
    <td class="num">${esc(r.sinceTouch)}</td>
    <td class="tc">${r.comment ? esc(r.comment) : '<span class="muted">-</span>'}</td>
  </tr>`,
    )
    .join('')}
</table>`
}`;

    case 'text':
    default:
      return `<h2>${esc(slide.title)}</h2>
<ul class="bullets">${slide.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`;
  }
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${SLIDE_WIDTH}px;height:${SLIDE_HEIGHT}px;overflow:hidden}
body{background:${T.bg};color:${T.text};
  font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Pretendard','Noto Sans KR',sans-serif;
  font-size:19px;line-height:1.5;-webkit-font-smoothing:antialiased}
.slide{width:100%;height:100%;padding:52px 60px;display:flex;flex-direction:column;gap:22px;position:relative}
.slide::after{content:'';position:absolute;left:0;top:0;width:100%;height:5px;
  background:linear-gradient(90deg,${T.up},${T.accent},${T.down})}
h1{font-size:68px;font-weight:800;letter-spacing:-2px}
h2{font-size:38px;font-weight:750;letter-spacing:-1px}
.lead{color:${T.muted};font-size:21px;max-width:1180px}
.muted,.empty{color:${T.muted}}
.up{color:${T.up}}.down{color:${T.down}}.flat{color:${T.muted}}

.cover{height:100%;display:flex;flex-direction:column;justify-content:center;gap:20px}
.eyebrow{color:${T.accent};font-weight:700;letter-spacing:4px;font-size:17px}
.headline{font-size:28px;color:${T.muted};max-width:1100px}
.stats{display:flex;gap:20px;margin-top:26px}
.stat{background:${T.panel};border:1px solid ${T.border};border-radius:14px;padding:20px 28px;min-width:180px}
.sv{font-size:40px;font-weight:800}
.sk{color:${T.muted};font-size:16px;margin-top:4px}
.stamp{position:absolute;right:60px;bottom:44px;color:${T.muted};font-variant-numeric:tabular-nums}

.split{display:grid;grid-template-columns:1.55fr 1fr;gap:22px;flex:1;min-height:0}
.panel{background:${T.panel};border:1px solid ${T.border};border-radius:16px;padding:24px;overflow:hidden}
.panel-title{font-weight:700;margin-bottom:14px;color:${T.accent};font-size:18px}
table{width:100%;border-collapse:collapse;font-size:18px}
td{padding:9px 8px;border-bottom:1px solid ${T.border};vertical-align:top}
.th{font-weight:650;width:210px}
.num{font-variant-numeric:tabular-nums;text-align:right;width:100px;font-weight:700}
.tt{width:150px;color:${T.muted}}
.tc{color:${T.muted}}
ul{list-style:none}
ul li{padding:8px 0;border-bottom:1px solid ${T.border}}
ul li::before{content:'▸ ';color:${T.accent}}

.stock-head{display:flex;justify-content:space-between;align-items:flex-start}
.ticker{color:${T.muted};font-size:17px;letter-spacing:1px;font-variant-numeric:tabular-nums}
.badges{display:flex;gap:12px;align-items:center}
.signal{font-weight:800;font-size:22px;padding:8px 22px;border-radius:10px;color:#0b0f14}
.conf,.entry{background:${T.panel};border:1px solid ${T.border};border-radius:10px;padding:8px 16px;font-size:17px;
  font-variant-numeric:tabular-nums}
.stock-body{display:grid;grid-template-columns:720px 1fr;gap:26px;flex:1;min-height:0}
.left{display:flex;flex-direction:column;gap:12px}
.legend{color:${T.muted};font-size:15px;display:flex;align-items:center;gap:8px}
.dot{width:12px;height:3px;display:inline-block;border-radius:2px}
.c2{background:${T.accent}}.c3{background:${T.muted}}
.metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.metric{display:flex;justify-content:space-between;background:${T.panel};border:1px solid ${T.border};
  border-radius:10px;padding:10px 14px;font-size:17px}
.metric .k{color:${T.muted}}
.metric .v{font-weight:700;font-variant-numeric:tabular-nums}
.right{display:flex;flex-direction:column;gap:10px;overflow:hidden}
.row{display:grid;grid-template-columns:96px 1fr;gap:12px;font-size:18px}
.rk{color:${T.muted}}
.news{margin-bottom:3px}
.case{background:${T.panel};border:1px solid ${T.border};border-left-width:4px;border-radius:12px;padding:13px 16px;font-size:18px}
.case.bull{border-left-color:${T.up}}
.case.bear{border-left-color:${T.down}}
.ck{font-size:14px;color:${T.muted};margin-bottom:4px;letter-spacing:1px}
.flags{display:flex;gap:8px;flex-wrap:wrap}
.flags span{background:rgba(245,197,66,.13);color:${T.accent};border-radius:8px;padding:6px 12px;font-size:16px}

.grade{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.grow{background:${T.panel};border:1px solid ${T.border};border-radius:14px;padding:22px}
.gk{color:${T.muted};font-size:17px}
.gv{font-size:36px;font-weight:800;margin-top:6px;font-variant-numeric:tabular-nums}
.note{color:${T.muted};font-size:18px}
.bullets li{font-size:21px;padding:12px 0}

table.radar{font-size:17px}
table.radar .hd td{color:${T.muted};font-size:14px;letter-spacing:1px;border-bottom:1px solid ${T.border}}
table.radar .th{width:220px}
/* 상태·수치 열 폭을 고정해 코멘트 열이 남는 폭을 가져가게 한다 (상태 열이 벌어지는 것 방지) */
table.radar td:nth-child(2){width:110px}
table.radar td:nth-child(n+3):nth-child(-n+6){width:110px}
table.radar .sub{color:${T.muted};font-size:14px;font-variant-numeric:tabular-nums}
.state{display:inline-block;padding:4px 10px;border-radius:8px;font-size:14px;font-weight:700}
.state.watching{background:rgba(61,139,253,.16);color:${T.down}}
.state.entry_ready{background:rgba(245,197,66,.16);color:${T.accent}}
.pin{margin-left:6px;padding:2px 7px;border-radius:6px;background:rgba(52,211,153,.16);color:${T.ok};font-size:13px}
`;

/** 슬라이드 1장을 자기완결 HTML 문서로 */
export function renderSlideHtml(slide: Slide): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${CSS}</style></head>
<body><div class="slide">${slideBody(slide)}</div></body></html>`;
}
