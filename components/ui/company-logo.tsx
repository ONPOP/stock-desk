'use client';

// 회사 대표 로고 — 도메인 기반 CDN(unavatar) → Google 파비콘 → 색상 이니셜 3단계 폴백.
// [데이터 계약 영향 없음] 타입에 필드를 추가하지 않고, 티커→도메인 매핑을 컴포넌트 내부에 둡니다.
//   새 종목은 이 맵에 한 줄만 추가하면 됩니다. (또는 추후 stocks 테이블에 logo_domain 컬럼 도입)
import { useState } from 'react';
import { cn } from '@/lib/utils';

// 티커(국내=종목코드 / 해외=심볼) → 대표 도메인
const LOGO_DOMAINS: Record<string, string> = {
  '005930': 'samsung.com', '000660': 'skhynix.com', '035720': 'kakaocorp.com',
  '373220': 'lgensol.com', '207940': 'samsungbiologics.com',
  NVDA: 'nvidia.com', AAPL: 'apple.com', TSLA: 'tesla.com', MSFT: 'microsoft.com',
};

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
  const srcs = domain
    ? [`https://unavatar.io/${domain}?fallback=false`, `https://www.google.com/s2/favicons?domain=${domain}&sz=128`]
    : [];
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
