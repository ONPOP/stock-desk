'use client';

// 회사 대표 로고 — 미국=FMP 이미지 CDN(티커 자동) → 도메인 CDN(unavatar) → 파비콘 → 색상 이니셜.
// 모두 무료 소스(키 불필요). 티커 형식으로 시장을 판별하므로 사용처는 ticker만 넘기면 됩니다.
// [데이터 계약 영향 없음] 타입에 필드를 추가하지 않고, 한국 종목코드→도메인 매핑만 내부에 둡니다.
//   미국은 FMP가 티커 단위로 자동 커버하므로 매핑 불필요. 한국 신규 종목은 이 맵에 한 줄만 추가.
import { useState } from 'react';
import { cn } from '@/lib/utils';

// 한국 종목코드 → 대표 도메인 (미국은 FMP CDN이 티커로 자동 처리하므로 불필요)
const LOGO_DOMAINS: Record<string, string> = {
  '005930': 'samsung.com', '000660': 'skhynix.com', '035720': 'kakaocorp.com',
  '035420': 'navercorp.com', '373220': 'lgensol.com', '207940': 'samsungbiologics.com',
  '068270': 'celltrion.com', '005380': 'hyundai.com', '000270': 'kia.com',
  '051910': 'lgchem.com', '006400': 'samsungsdi.com', '005490': 'posco.com',
  '105560': 'kbfg.com', '055550': 'shinhangroup.com', '012450': 'hanwha.com',
};

// 미국 심볼 = 알파벳 시작(점 포함 BRK.B 등), 한국 = 6자리 숫자코드
const isUsSymbol = (ticker: string) => /^[A-Za-z]/.test(ticker);

interface CompanyLogoProps {
  ticker: string;
  name?: string | null;
  /** 폴백 배지 배경색 (브랜드 컬러) — 선택 */
  color?: string;
  size?: number;
  className?: string;
}

export function CompanyLogo({ ticker, name, color, size = 34, className }: CompanyLogoProps) {
  const [stage, setStage] = useState(0);
  const domain = LOGO_DOMAINS[ticker];
  const srcs: string[] = [];
  // 미국: FMP 이미지 CDN을 티커로 우선 시도(거의 전 종목 커버)
  if (isUsSymbol(ticker)) srcs.push(`https://financialmodelingprep.com/image-stock/${ticker.toUpperCase()}.png`);
  // 한국 주요 종목 또는 폴백: 도메인 기반 CDN → 파비콘
  if (domain) srcs.push(`https://unavatar.io/${domain}?fallback=false`, `https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
  const showImg = stage < srcs.length;
  const initial = (name ?? ticker).replace(/[^가-힣A-Za-z]/g, '').slice(0, 1) || '·';

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden font-bold text-white',
        showImg && 'border bg-white shadow-sm',
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        fontSize: size * 0.42,
        background: showImg ? undefined : (color ?? 'var(--muted-foreground)'),
      }}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={srcs[stage]}
          alt={name ?? ticker}
          onError={() => setStage((s) => s + 1)}
          style={{ width: '70%', height: '70%', objectFit: 'contain' }}
        />
      ) : (
        initial
      )}
    </span>
  );
}
