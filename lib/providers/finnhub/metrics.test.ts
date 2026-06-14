import { describe, it, expect } from 'vitest';
import { buildFinnhubMetrics, usdToCents, usdMillionsToCents } from './metrics';

describe('usdToCents / usdMillionsToCents', () => {
  it('USD → 센트', () => {
    expect(usdToCents(94_930_000_000)).toBe(9_493_000_000_000);
    expect(usdToCents(-2_908_000_000)).toBe(-290_800_000_000);
  });
  it('null·NaN·overflow는 null', () => {
    expect(usdToCents(null)).toBeNull();
    expect(usdToCents(undefined)).toBeNull();
    expect(usdToCents(Number.NaN)).toBeNull();
    expect(usdToCents(1e15)).toBeNull(); // ×100 → 1e17 > MAX_SAFE
  });
  it('백만 USD → 센트', () => {
    expect(usdMillionsToCents(3_000_000)).toBe(300_000_000_000_000); // 3조달러
    expect(usdMillionsToCents(null)).toBeNull();
  });
});

const METRIC = {
  metric: {
    peTTM: 28.5,
    pb: 45.2,
    roeTTM: 147.2,
    epsTTM: 6.13,
    currentDividendYieldTTM: 0.5,
    'totalDebt/totalEquityQuarterly': 1.5,
  },
};
const PROFILE = { marketCapitalization: 3_000_000 };
// IS는 YTD 누적치 — Q2는 상반기 누적, Q1은 1분기(=단독)
const FINANCIALS = {
  data: [
    {
      year: 2024,
      quarter: 1,
      endDate: '2024-03-30',
      report: {
        ic: [
          { concept: 'Revenues', label: 'Total net sales', value: 90_753_000_000 },
          { concept: 'OperatingIncomeLoss', label: 'Operating income', value: 27_900_000_000 },
          { concept: 'NetIncomeLoss', label: 'Net income', value: 23_636_000_000 },
        ],
        cf: [{ concept: 'PaymentsToAcquirePropertyPlantAndEquipment', label: 'Payments for property', value: -2_000_000_000 }],
      },
    },
    {
      year: 2024,
      quarter: 2,
      endDate: '2024-06-29',
      report: {
        ic: [
          { concept: 'us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax', label: 'Total net sales', value: 176_530_000_000 },
          { concept: 'OperatingIncomeLoss', label: 'Operating income', value: 53_491_000_000 },
          { concept: 'NetIncomeLoss', label: 'Net income', value: 47_000_000_000 },
        ],
        cf: [{ concept: 'PaymentsToAcquirePropertyPlantAndEquipment', label: 'Payments for property', value: -4_908_000_000 }],
      },
    },
  ],
};

describe('buildFinnhubMetrics — 정상 (YTD 누적 → 분기 차분)', () => {
  it('Q2 단독 = Q2누적 − Q1누적, 최신 행에 밸류에이션·시총 부착', () => {
    const rows = buildFinnhubMetrics({ profile: PROFILE, metric: METRIC, financials: FINANCIALS }, '2024-07-01');
    expect(rows).toHaveLength(2);
    expect(rows[0].fiscalQuarter).toBe('2024Q2'); // endDate 내림차순
    expect(rows[0].revenueQ).toBe((176_530_000_000 - 90_753_000_000) * 100); // 85,777,000,000 → 센트
    expect(rows[0].operatingIncomeQ).toBe((53_491_000_000 - 27_900_000_000) * 100);
    expect(rows[0].netIncomeQ).toBe((47_000_000_000 - 23_636_000_000) * 100);
    expect(rows[0].capex).toBe((4_908_000_000 - 2_000_000_000) * 100); // 절대값 차분
    expect(rows[0].per).toBe(28.5);
    expect(rows[0].marketCap).toBe(300_000_000_000_000);
    expect(rows[0].debtRatio).toBe(150);
    // Q1은 회계연도 첫 분기 → 누적=단독
    expect(rows[1].fiscalQuarter).toBe('2024Q1');
    expect(rows[1].revenueQ).toBe(90_753_000_000 * 100);
    expect(rows[1].per).toBeNull();
  });
});

describe('buildFinnhubMetrics — 비정상/경계', () => {
  it('분기 재무 없이 밸류 지표만 있으면 스냅샷 1행(asOf 기준)', () => {
    const rows = buildFinnhubMetrics({ profile: PROFILE, metric: METRIC }, '2024-10-01');
    expect(rows).toHaveLength(1);
    expect(rows[0].asOfDate).toBe('2024-10-01');
    expect(rows[0].fiscalQuarter).toBeNull();
    expect(rows[0].per).toBe(28.5);
  });

  it('아무 데이터도 없으면 빈 배열', () => {
    expect(buildFinnhubMetrics({}, '2024-10-01')).toEqual([]);
  });

  it('quarter 0(연간)은 분기 시계열에서 제외', () => {
    const rows = buildFinnhubMetrics(
      { metric: METRIC, financials: { data: [{ year: 2024, quarter: 0, endDate: '2024-09-28', report: { ic: [] } }] } },
      '2024-10-01',
    );
    // 분기 없음 → 스냅샷 1행
    expect(rows).toHaveLength(1);
    expect(rows[0].fiscalQuarter).toBeNull();
  });
});
