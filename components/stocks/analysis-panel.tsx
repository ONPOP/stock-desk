'use client';

// F7 AI 투자 분석 — 실행 버튼 + 최신 분석(포지션 뱃지·신뢰도·마크다운) + 이력. 면책 고지.
// 현재 OpenAI 단일(비교뷰는 Anthropic 추가 시 좌우). 수동 1클릭 트리거(비용 통제).
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AiAnalysis, AnalysisPosition, Stock } from '@/types';

const POSITION: Record<AnalysisPosition, { label: string; className: string }> = {
  buy: { label: '매수', className: 'bg-red-500/15 text-red-600 border-red-500/30' },
  neutral: { label: '중립', className: 'bg-muted text-muted-foreground' },
  sell: { label: '매도', className: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
};

const MD = {
  h2: (p: React.HTMLAttributes<HTMLHeadingElement>) => <h4 className="mt-2 mb-0.5 text-xs font-semibold text-muted-foreground" {...p} />,
  ul: (p: React.HTMLAttributes<HTMLUListElement>) => <ul className="list-disc space-y-0.5 pl-5" {...p} />,
  p: (p: React.HTMLAttributes<HTMLParagraphElement>) => <p className="mb-1" {...p} />,
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
        <h3 className="font-semibold">AI 분석</h3>
        <Button onClick={run} variant="outline" size="sm" disabled={running}>
          {running ? '분석 중…' : 'AI 분석 실행'}
        </Button>
      </div>

      {!latest ? (
        <p className="text-sm text-muted-foreground">
          아직 분석이 없습니다. <span className="font-medium">AI 분석 실행</span>을 눌러 생성하세요. (OpenAI 키 필요)
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {latest.position && (
              <Badge variant="outline" className={POSITION[latest.position].className}>
                {POSITION[latest.position].label}
                {latest.confidence != null && ` ${latest.confidence}%`}
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
          <p className="text-[10px] text-muted-foreground">
            ⚠️ 본 분석은 정보 제공이며 투자 권유가 아닙니다. 투자 판단과 책임은 본인에게 있습니다.
          </p>
          {analyses.length > 1 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">이전 분석 {analyses.length - 1}건</summary>
              <ul className="mt-1 space-y-0.5">
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
