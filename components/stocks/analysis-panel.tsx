'use client';

// F7 AI 투자 분석 — 실행 버튼 + 최신 분석(포지션 뱃지·신뢰도·마크다운) + 이력. 면책 고지.
// [재설계] 비주얼만. [보존] run() fetch·POSITION 색(매수=빨강/매도=파랑)·면책 문구·이력·props.
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { Sparkles, Zap, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AiAnalysis, AnalysisPosition, Stock } from '@/types';

const POSITION: Record<AnalysisPosition, { label: string; className: string }> = {
  buy: { label: '매수', className: 'bg-up-soft text-up' },
  neutral: { label: '중립', className: 'bg-muted text-muted-foreground' },
  sell: { label: '매도', className: 'bg-down-soft text-down' },
};

const MD = {
  h2: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h4 className="mt-3 mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase" {...p} />
  ),
  ul: (p: React.HTMLAttributes<HTMLUListElement>) => <ul className="list-disc space-y-1 pl-5" {...p} />,
  p: (p: React.HTMLAttributes<HTMLParagraphElement>) => <p className="mb-1 leading-relaxed" {...p} />,
};

export interface AnalysisPanelProps {
  stock: Stock;
  initialAnalyses: AiAnalysis[];
}

export function AnalysisPanel({ stock, initialAnalyses }: AnalysisPanelProps) {
  const [analyses, setAnalyses] = useState<AiAnalysis[]>(initialAnalyses);
  const [running, setRunning] = useState(false);
  const latest = analyses[0];

  async function run() {
    setRunning(true);
    try {
      const res = await fetch(`/api/stocks/${encodeURIComponent(stock.ticker)}/analysis?market=${stock.market}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? '분석에 실패했습니다.');
        return;
      }
      setAnalyses(data.analyses ?? []);
      const r = data.result;
      if (r?.status === 'skipped') toast.warning(r.reason ?? 'OpenAI 키가 필요합니다.');
      else if (r?.status === 'error') toast.error(r.reason ?? '분석 실패');
      else toast.success('AI 분석을 완료했습니다.');
    } catch {
      toast.error('네트워크 오류로 분석하지 못했습니다.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-[9px] bg-accent text-accent-foreground">
            <Sparkles className="size-4" />
          </span>
          AI 분석
        </h3>
        <Button onClick={run} size="sm" disabled={running}>
          <Zap data-icon="inline-start" />
          {running ? '분석 중…' : 'AI 분석 실행'}
        </Button>
      </div>

      {!latest ? (
        <p className="text-sm text-muted-foreground">
          아직 분석이 없습니다. <span className="font-medium">AI 분석 실행</span>을 눌러 생성하세요. (OpenAI 키 필요)
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {latest.position && (
              <Badge variant="outline" className={`h-6 border-0 px-3 text-[13px] ${POSITION[latest.position].className}`}>
                {POSITION[latest.position].label}
                {latest.confidence != null && ` · 신뢰도 ${latest.confidence}%`}
              </Badge>
            )}
            <span className="text-[11px] text-muted-foreground">
              {new Date(latest.createdAt).toLocaleString('ko-KR')} · {latest.model.toUpperCase()}
            </span>
          </div>
          {latest.resultMd && (
            <div className="text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
                {latest.resultMd}
              </ReactMarkdown>
            </div>
          )}
          <div className="flex items-start gap-2 rounded-lg border bg-muted/60 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
            <TriangleAlert className="mt-px size-3.5 shrink-0 text-amber-500" />
            <span>본 분석은 정보 제공이며 투자 권유가 아닙니다. 투자 판단과 책임은 본인에게 있습니다.</span>
          </div>
          {analyses.length > 1 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">이전 분석 {analyses.length - 1}건</summary>
              <ul className="mt-1.5 space-y-1">
                {analyses.slice(1).map((a) => (
                  <li key={a.id}>
                    {new Date(a.createdAt).toLocaleDateString('ko-KR')} — {a.position ? POSITION[a.position].label : '—'}
                    {a.confidence != null && ` (${a.confidence}%)`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
