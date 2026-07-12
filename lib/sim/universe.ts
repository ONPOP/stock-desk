// 모의투자 테스트 종목 유니버스 — 14개 테마 × 주요 미국 기업(총 200종목, 요구 1).
// 실제 미국 티커를 사용하며 10년 일봉(KIS/Yahoo)을 동결 저장한다(요구 6). 상장이 늦은 종목은
// 그 시점부터 series 에 나타난다(실제 시장 흐름 반영, 요구 4).
// market 은 표시 뱃지·수집 거래소 힌트로 쓰인다(수집 시 거래소 자동 탐지로 보정).
import type { SimMarket, SimStock, SimTheme } from '@/types/sim';

export const SIM_THEMES: SimTheme[] = [
  { slug: 'semiconductors', name: '반도체', description: 'AI·메모리·파운드리 칩 설계/장비' },
  { slug: 'big-tech', name: '빅테크·플랫폼', description: '대형 소프트웨어·플랫폼' },
  { slug: 'ev-mobility', name: '전기차·모빌리티', description: '완성차·부품·자율주행' },
  { slug: 'internet-ecommerce', name: '인터넷·이커머스', description: '온라인 소비·공유경제' },
  { slug: 'cyber-cloud', name: '사이버보안·데이터', description: '보안·관측·데이터 인프라' },
  { slug: 'finance-banks', name: '금융·은행', description: '은행·증권·자산운용' },
  { slug: 'fintech-payments', name: '핀테크·결제', description: '카드망·결제·디지털금융' },
  { slug: 'healthcare-pharma', name: '헬스케어·제약', description: '대형 제약·의료기기' },
  { slug: 'biotech', name: '바이오테크', description: '신약·유전자·진단' },
  { slug: 'energy', name: '에너지', description: '석유·가스·서비스' },
  { slug: 'consumer-retail', name: '소비재·유통', description: '필수소비재·리테일' },
  { slug: 'media-entertainment', name: '미디어·엔터', description: '콘텐츠·게임·스트리밍' },
  { slug: 'industrials-aero', name: '산업재·항공우주', description: '방산·기계·물류' },
  { slug: 'newgrowth-space', name: '신성장·우주·클린에너지', description: '태양광·우주·차세대' },
];

// [ticker, nameEn, nameKr?, market?] — market 생략 시 블록 기본 거래소. 예외만 4번째로 지정.
type Row = [string, string, string?, SimMarket?];

const BLOCKS: Record<string, { market: SimMarket; rows: Row[] }> = {
  semiconductors: {
    market: 'NASDAQ',
    rows: [
      ['NVDA', 'NVIDIA', '엔비디아'], ['AMD', 'Advanced Micro Devices', 'AMD'],
      ['AVGO', 'Broadcom', '브로드컴'], ['QCOM', 'Qualcomm', '퀄컴'],
      ['TXN', 'Texas Instruments', '텍사스 인스트루먼트'], ['MU', 'Micron Technology', '마이크론'],
      ['AMAT', 'Applied Materials', '어플라이드 머티어리얼즈'], ['LRCX', 'Lam Research', '램리서치'],
      ['KLAC', 'KLA Corp', 'KLA'], ['ADI', 'Analog Devices', '아나로그디바이스'],
      ['MRVL', 'Marvell Technology', '마벨'], ['NXPI', 'NXP Semiconductors', 'NXP'],
      ['MCHP', 'Microchip Technology', '마이크로칩'], ['ON', 'ON Semiconductor', '온세미'],
      ['INTC', 'Intel', '인텔'],
    ],
  },
  'big-tech': {
    market: 'NASDAQ',
    rows: [
      ['AAPL', 'Apple', '애플'], ['MSFT', 'Microsoft', '마이크로소프트'],
      ['GOOGL', 'Alphabet A', '알파벳 A'], ['AMZN', 'Amazon', '아마존'],
      ['META', 'Meta Platforms', '메타'], ['NFLX', 'Netflix', '넷플릭스'],
      ['ORCL', 'Oracle', '오라클', 'NYSE'], ['IBM', 'IBM', 'IBM', 'NYSE'],
      ['CSCO', 'Cisco Systems', '시스코'], ['ACN', 'Accenture', '액센추어', 'NYSE'],
      ['NOW', 'ServiceNow', '서비스나우', 'NYSE'], ['INTU', 'Intuit', '인튜이트'],
      ['ADBE', 'Adobe', '어도비'], ['CRM', 'Salesforce', '세일즈포스', 'NYSE'],
      ['SAP', 'SAP', 'SAP', 'NYSE'],
    ],
  },
  'ev-mobility': {
    market: 'NASDAQ',
    rows: [
      ['TSLA', 'Tesla', '테슬라'], ['GM', 'General Motors', 'GM', 'NYSE'],
      ['F', 'Ford Motor', '포드', 'NYSE'], ['RIVN', 'Rivian Automotive', '리비안'],
      ['NIO', 'NIO', '니오', 'NYSE'], ['LCID', 'Lucid Group', '루시드'],
      ['TM', 'Toyota Motor', '토요타', 'NYSE'], ['HMC', 'Honda Motor', '혼다', 'NYSE'],
      ['STLA', 'Stellantis', '스텔란티스', 'NYSE'], ['RACE', 'Ferrari', '페라리', 'NYSE'],
      ['APTV', 'Aptiv', '앱티브', 'NYSE'], ['BWA', 'BorgWarner', '보그워너', 'NYSE'],
      ['LEA', 'Lear', '리어', 'NYSE'], ['ALV', 'Autoliv', '오토리브', 'NYSE'],
      ['XPEV', 'XPeng', '샤오펑', 'NYSE'],
    ],
  },
  'internet-ecommerce': {
    market: 'NASDAQ',
    rows: [
      ['UBER', 'Uber Technologies', '우버', 'NYSE'], ['ABNB', 'Airbnb', '에어비앤비'],
      ['DASH', 'DoorDash', '도어대시'], ['SHOP', 'Shopify', '쇼피파이', 'NYSE'],
      ['SPOT', 'Spotify', '스포티파이', 'NYSE'], ['PINS', 'Pinterest', '핀터레스트', 'NYSE'],
      ['SNAP', 'Snap', '스냅', 'NYSE'], ['RBLX', 'Roblox', '로블록스', 'NYSE'],
      ['BMBL', 'Bumble'], ['MTCH', 'Match Group', '매치그룹'],
      ['EBAY', 'eBay', '이베이'], ['ETSY', 'Etsy', '엣시'],
      ['MELI', 'MercadoLibre', '메르카도리브레'], ['SE', 'Sea Ltd', '씨', 'NYSE'],
      ['CPNG', 'Coupang', '쿠팡', 'NYSE'],
    ],
  },
  'cyber-cloud': {
    market: 'NASDAQ',
    rows: [
      ['CRWD', 'CrowdStrike', '크라우드스트라이크'], ['ZS', 'Zscaler', '지스케일러'],
      ['NET', 'Cloudflare', '클라우드플레어', 'NYSE'], ['PANW', 'Palo Alto Networks', '팔로알토'],
      ['FTNT', 'Fortinet', '포티넷'], ['S', 'SentinelOne', '센티넬원', 'NYSE'],
      ['OKTA', 'Okta', '옥타'], ['DDOG', 'Datadog', '데이터독'],
      ['SNOW', 'Snowflake', '스노우플레이크', 'NYSE'], ['MDB', 'MongoDB', '몽고DB'],
      ['DOCN', 'DigitalOcean', undefined, 'NYSE'], ['ESTC', 'Elastic', undefined, 'NYSE'],
      ['CYBR', 'CyberArk', '사이버아크'], ['QLYS', 'Qualys'], ['TENB', 'Tenable'],
    ],
  },
  'finance-banks': {
    market: 'NYSE',
    rows: [
      ['JPM', 'JPMorgan Chase', 'JP모건'], ['BAC', 'Bank of America', '뱅크오브아메리카'],
      ['WFC', 'Wells Fargo', '웰스파고'], ['C', 'Citigroup', '씨티그룹'],
      ['GS', 'Goldman Sachs', '골드만삭스'], ['MS', 'Morgan Stanley', '모건스탠리'],
      ['USB', 'U.S. Bancorp'], ['PNC', 'PNC Financial'],
      ['TFC', 'Truist Financial'], ['SCHW', 'Charles Schwab', '찰스슈왑'],
      ['AXP', 'American Express', '아멕스'], ['BLK', 'BlackRock', '블랙록'],
      ['BX', 'Blackstone', '블랙스톤'], ['COF', 'Capital One', '캐피털원'],
      ['CME', 'CME Group', 'CME', 'NASDAQ'],
    ],
  },
  'fintech-payments': {
    market: 'NYSE',
    rows: [
      ['V', 'Visa', '비자'], ['MA', 'Mastercard', '마스터카드'],
      ['PYPL', 'PayPal', '페이팔', 'NASDAQ'], ['COIN', 'Coinbase', '코인베이스', 'NASDAQ'],
      ['HOOD', 'Robinhood', '로빈후드', 'NASDAQ'], ['SOFI', 'SoFi Technologies', '소파이', 'NASDAQ'],
      ['AFRM', 'Affirm', '어펌', 'NASDAQ'], ['FIS', 'Fidelity National Info'],
      ['FI', 'Fiserv', '파이서브'], ['GPN', 'Global Payments'],
      ['NU', 'Nu Holdings', '누홀딩스'], ['BILL', 'BILL Holdings'],
      ['TOST', 'Toast', '토스트'], ['DFS', 'Discover Financial'],
      ['SYF', 'Synchrony Financial'],
    ],
  },
  'healthcare-pharma': {
    market: 'NYSE',
    rows: [
      ['JNJ', 'Johnson & Johnson', '존슨앤드존슨'], ['PFE', 'Pfizer', '화이자'],
      ['MRK', 'Merck', '머크'], ['ABBV', 'AbbVie', '애브비'],
      ['LLY', 'Eli Lilly', '일라이릴리'], ['BMY', 'Bristol Myers Squibb', 'BMS'],
      ['AMGN', 'Amgen', '암젠', 'NASDAQ'], ['GILD', 'Gilead Sciences', '길리어드', 'NASDAQ'],
      ['TMO', 'Thermo Fisher', '써모피셔'], ['ABT', 'Abbott', '애보트'],
      ['DHR', 'Danaher', '다나허'], ['UNH', 'UnitedHealth', '유나이티드헬스'],
      ['CVS', 'CVS Health', 'CVS'], ['MDT', 'Medtronic', '메드트로닉'],
      ['ISRG', 'Intuitive Surgical', '인튜이티브', 'NASDAQ'],
    ],
  },
  biotech: {
    market: 'NASDAQ',
    rows: [
      ['VRTX', 'Vertex Pharma', '버텍스'], ['REGN', 'Regeneron', '리제네론'],
      ['MRNA', 'Moderna', '모더나'], ['BNTX', 'BioNTech', '바이오엔테크'],
      ['BIIB', 'Biogen', '바이오젠'], ['ILMN', 'Illumina', '일루미나'],
      ['ALNY', 'Alnylam', '알닐람'], ['BMRN', 'BioMarin'],
      ['INCY', 'Incyte'], ['NBIX', 'Neurocrine Biosciences'],
      ['SRPT', 'Sarepta Therapeutics'], ['IONS', 'Ionis Pharma'],
      ['HALO', 'Halozyme'], ['CRSP', 'CRISPR Therapeutics', '크리스퍼'],
      ['EXAS', 'Exact Sciences'],
    ],
  },
  energy: {
    market: 'NYSE',
    rows: [
      ['XOM', 'Exxon Mobil', '엑슨모빌'], ['CVX', 'Chevron', '셰브론'],
      ['COP', 'ConocoPhillips', '코노코필립스'], ['SLB', 'Schlumberger', '슐럼버거'],
      ['EOG', 'EOG Resources'], ['MPC', 'Marathon Petroleum'],
      ['PSX', 'Phillips 66'], ['VLO', 'Valero Energy'],
      ['OXY', 'Occidental Petroleum', '옥시덴탈'], ['HES', 'Hess'],
      ['WMB', 'Williams Companies'], ['KMI', 'Kinder Morgan'],
      ['OKE', 'ONEOK'], ['HAL', 'Halliburton', '핼리버튼'],
      ['DVN', 'Devon Energy'],
    ],
  },
  'consumer-retail': {
    market: 'NYSE',
    rows: [
      ['WMT', 'Walmart', '월마트'], ['COST', 'Costco', '코스트코', 'NASDAQ'],
      ['HD', 'Home Depot', '홈디포'], ['LOW', "Lowe's", '로우스'],
      ['TGT', 'Target', '타깃'], ['NKE', 'Nike', '나이키'],
      ['SBUX', 'Starbucks', '스타벅스', 'NASDAQ'], ['MCD', "McDonald's", '맥도날드'],
      ['PG', 'Procter & Gamble', 'P&G'], ['KO', 'Coca-Cola', '코카콜라'],
      ['PEP', 'PepsiCo', '펩시코', 'NASDAQ'], ['PM', 'Philip Morris', '필립모리스'],
      ['MO', 'Altria', '알트리아'], ['EL', 'Estée Lauder', '에스티로더'],
      ['CL', 'Colgate-Palmolive', '콜게이트'],
    ],
  },
  'media-entertainment': {
    market: 'NASDAQ',
    rows: [
      ['DIS', 'Walt Disney', '디즈니', 'NYSE'], ['CMCSA', 'Comcast', '컴캐스트'],
      ['WBD', 'Warner Bros Discovery', '워너브라더스'], ['PARA', 'Paramount Global', '파라마운트'],
      ['FOXA', 'Fox Corp', '폭스'], ['LYV', 'Live Nation', '라이브네이션', 'NYSE'],
      ['EA', 'Electronic Arts', 'EA'], ['TTWO', 'Take-Two Interactive', '테이크투'],
      ['SONY', 'Sony Group', '소니', 'NYSE'], ['NTES', 'NetEase', '넷이즈'],
      ['ROKU', 'Roku', '로쿠'], ['WMG', 'Warner Music', '워너뮤직'],
      ['AMC', 'AMC Entertainment', 'AMC', 'NYSE'], ['CNK', 'Cinemark', undefined, 'NYSE'],
      ['IMAX', 'IMAX', '아이맥스', 'NYSE'],
    ],
  },
  'industrials-aero': {
    market: 'NYSE',
    rows: [
      ['BA', 'Boeing', '보잉'], ['CAT', 'Caterpillar', '캐터필러'],
      ['DE', 'Deere', '디어'], ['GE', 'GE Aerospace', 'GE'],
      ['HON', 'Honeywell', '하니웰', 'NASDAQ'], ['LMT', 'Lockheed Martin', '록히드마틴'],
      ['RTX', 'RTX (Raytheon)', '레이시온'], ['NOC', 'Northrop Grumman', '노스럽그러먼'],
      ['GD', 'General Dynamics', '제너럴다이내믹스'], ['MMM', '3M', '3M'],
      ['UPS', 'United Parcel Service', 'UPS'], ['FDX', 'FedEx', '페덱스'],
      ['UNP', 'Union Pacific', '유니온퍼시픽'], ['EMR', 'Emerson Electric'],
      ['ETN', 'Eaton', '이튼'],
    ],
  },
  'newgrowth-space': {
    market: 'NASDAQ',
    rows: [
      ['ENPH', 'Enphase Energy', '엔페이즈'], ['FSLR', 'First Solar', '퍼스트솔라'],
      ['PLUG', 'Plug Power', '플러그파워'], ['NEE', 'NextEra Energy', '넥스트에라', 'NYSE'],
      ['RKLB', 'Rocket Lab', '로켓랩'],
    ],
  },
};

export const SIM_STOCKS: SimStock[] = Object.entries(BLOCKS).flatMap(([theme, { market, rows }]) =>
  rows.map(([ticker, nameEn, nameKr, mkt]) => ({ ticker, nameEn, nameKr, market: mkt ?? market, theme })),
);

const BY_TICKER = new Map(SIM_STOCKS.map((s) => [s.ticker, s]));

export function stocksByTheme(slug: string): SimStock[] {
  return SIM_STOCKS.filter((s) => s.theme === slug);
}

export function findSimStock(ticker: string): SimStock | undefined {
  return BY_TICKER.get(ticker.toUpperCase());
}

export function allSimTickers(): string[] {
  return SIM_STOCKS.map((s) => s.ticker);
}

export function themeBySlug(slug: string): SimTheme | undefined {
  return SIM_THEMES.find((t) => t.slug === slug);
}
