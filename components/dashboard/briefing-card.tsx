'use client';

// F1 데일리 브리핑 카드 — 마크다운 렌더 + "지금 생성" 버튼.
// [재설계] 근접-블랙 hero 카드 비주얼. [보존] generate() fetch·toast·ReactMarkdown·Briefing.
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Briefing } from '@/types';

const MD_COMPONENTS = {
  h2: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="mt-4 mb-1.5 text-[11.5px] font-semibold tracking-wide text-ink-muted uppercase" {...p} />
  ),
  ul: (p: React.HTMLAttributes<HTMLUListElement>) => <ul className="flex flex-col gap-1.5" {...p} />,
  ol: (p: React.HTMLAttributes<HTMLOListElement>) => <ol className="flex list-decimal flex-col gap-1.5 pl-5" {...p} />,
  li: (p: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="relative pl-4 before:absolute before:top-2 before:left-0.5 before:size-1.5 before:rounded-full before:bg-primary" {...p} />
  ),
  p: (p: React.HTMLAttributes<HTMLParagraphElement>) => <p className="mb-2 leading-relaxed" {...p} />,
  strong: (p: React.HTMLAttributes<HTMLElement>) => <strong className="font-semibold text-white" {...p} />,
};

export function BriefingCard({ initial }: { initial: Briefing | null }) {
  const [briefing, setBriefing] = useState<Briefing | null>(initial);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch('/api/briefing', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? '브리핑 생성에 실패했습니다.');
        return;
      }
      setBriefing(data.briefing);
      if (data.result?.status === 'failed') toast.error(data.result.reason ?? '브리핑 생성에 실패했습니다.');
      else toast.success('브리핑을 생성했습니다.');
    } catch {
      toast.error('네트워크 오류로 생성하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-ink p-6 text-ink-foreground shadow-xl">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-primary/25 blur-3xl"
      />
      <div className="relative flex items-center gap-3">
        <span className="flex size-8 items-center justify-center rounded-[10px] bg-white/10">
          <Sparkles className="size-4" />
        </span>
        <div className="flex flex-col">
          <span className="text-[11.5px] font-semibold tracking-wide text-ink-muted uppercase">데일리 브리핑 · AI</span>
          <h2 className="text-[17px] font-semibold tracking-tight">오늘의 시장 브리핑</h2>
        </div>
        <Button
          onClick={generate}
          size="sm"
          disabled={loading}
          className="ml-auto border-0 bg-white/12 text-white hover:bg-white/20"
        >
          <RefreshCw data-icon="inline-start" className={loading ? 'animate-spin' : ''} />
          {loading ? '생성 중…' : '다시 생성'}
        </Button>
      </div>

      <div className="relative mt-4 text-[13.5px] text-white/85">
        <p className="mb-3 text-[11.5px] text-ink-muted">
          {briefing ? `${briefing.date} 생성${briefing.status === 'failed' ? ' · 실패' : ''}` : '아직 브리핑이 없습니다'}
        </p>
        {briefing?.contentMd ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
            {briefing.contentMd}
          </ReactMarkdown>
        ) : (
          <p className="text-white/70">
            매 영업일 06:30 자동 생성 예정. &quot;다시 생성&quot;으로 즉시 만들 수 있습니다. (OpenAI 키 필요)
          </p>
        )}
      </div>
    </div>
  );
}
