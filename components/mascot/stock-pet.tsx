'use client';

// Stock Desk 전용 마스코트 펫 — 전역 플로팅. 내 포트폴리오 평가수익률에 따라 표정(애니메이션)·말풍선이 바뀐다.
// 외형 이미지는 public/pet/cat.png. 없으면 lucide Cat 아이콘으로 폴백.
import { useState, useEffect } from 'react';
import { Cat, Heart, Droplet, X } from 'lucide-react';
import { usePortfolioSummary, type PortfolioPulse } from '@/lib/hooks/use-portfolio-summary';

type Mood = 'happy' | 'neutral' | 'sad' | 'idle';

const MESSAGE: Record<Mood, string> = {
  happy: '오늘 수익 좋네요!',
  neutral: '차분한 하루네요',
  sad: '장기전이에요, 힘내요!',
  idle: '매매를 시작해봐요!',
};

const PET_ANIM: Record<Mood, string> = {
  happy: 'pet-happy',
  neutral: 'pet-idle',
  sad: 'pet-sad',
  idle: 'pet-idle',
};

function moodOf(d: PortfolioPulse | null): Mood {
  if (!d || d.holdingsCount === 0) return 'idle';
  if (d.evalRate >= 0.3) return 'happy';
  if (d.evalRate <= -0.3) return 'sad';
  return 'neutral';
}

function pnlColor(n: number): string {
  return n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted-foreground';
}

function signedKrw(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}₩${Math.abs(Math.round(n)).toLocaleString('ko-KR')}`;
}

export function StockPet() {
  const { data, loading } = usePortfolioSummary();
  const [open, setOpen] = useState(false);
  // 폴백 우선: cat.png가 실제 존재할 때만 이미지로 교체(깨진 img·hydration 타이밍 문제 회피)
  const [imgOk, setImgOk] = useState(false);

  useEffect(() => {
    const probe = new Image();
    probe.onload = () => setImgOk(true);
    probe.onerror = () => setImgOk(false);
    probe.src = '/pet/cat.png';
  }, []);

  const mood = moodOf(data);
  const anim = PET_ANIM[mood];
  const message = loading && !data ? '시세 확인 중...' : MESSAGE[mood];

  return (
    <div className="fixed right-4 bottom-[160px] z-40 lg:right-6 lg:bottom-[84px]">
      {open && (
        <div className="absolute right-0 bottom-full mb-3 w-60 rounded-xl border bg-card p-3 text-card-foreground shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium">{message}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="닫기"
              className="-mr-1 -mt-1 rounded p-1 text-muted-foreground transition hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </div>
          {data && data.holdingsCount > 0 ? (
            <div className="mt-2 space-y-1 text-xs">
              <Row label="평가손익" value={signedKrw(data.evalPnl)} cls={pnlColor(data.evalPnl)} />
              <Row
                label="평가수익률"
                value={`${data.evalRate > 0 ? '+' : ''}${data.evalRate.toFixed(2)}%`}
                cls={pnlColor(data.evalRate)}
              />
              <Row label="실현손익" value={signedKrw(data.realizedPnl)} cls={pnlColor(data.realizedPnl)} />
              {data.pricedCount < data.holdingsCount && (
                <p className="pt-1 text-[11px] text-muted-foreground">일부 종목 시세 대기 중</p>
              )}
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">보유 종목이 없어요</p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Stock Desk 펫 — 내 수익률 보기"
        className="relative block transition active:scale-95"
      >
        {imgOk ? (
          /* eslint-disable-next-line @next/next/no-img-element -- 작은 정적 마스코트, next/image 최적화 불필요 + 프리로드 검증 후 렌더 */
          <img
            src="/pet/cat.png"
            alt="Stock Desk 펫"
            draggable={false}
            className={`size-16 object-contain drop-shadow-md select-none lg:size-20 ${anim}`}
          />
        ) : (
          <span
            className={`flex size-16 items-center justify-center rounded-full border bg-card shadow-md lg:size-20 ${anim}`}
          >
            <Cat className="size-9 text-muted-foreground" />
          </span>
        )}

        {mood === 'happy' && (
          <span className="absolute -top-1 -right-1 text-up" aria-hidden="true">
            <Heart className="size-5 fill-current" />
          </span>
        )}
        {mood === 'sad' && (
          <span className="absolute -top-1 -right-1 text-down" aria-hidden="true">
            <Droplet className="size-5 fill-current" />
          </span>
        )}
      </button>
    </div>
  );
}

function Row({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${cls}`}>{value}</span>
    </div>
  );
}
