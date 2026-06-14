'use client';

// F1 데일리 브리핑 카드 — 마크다운 렌더 + "지금 생성" 버튼.
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { Briefing } from '@/types';

const MD_COMPONENTS = {
  h2: (p: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className="mt-3 mb-1 text-sm font-semibold" {...p} />,
  ul: (p: React.HTMLAttributes<HTMLUListElement>) => <ul className="list-disc space-y-0.5 pl-5" {...p} />,
  ol: (p: React.HTMLAttributes<HTMLOListElement>) => <ol className="list-decimal space-y-0.5 pl-5" {...p} />,
  p: (p: React.HTMLAttributes<HTMLParagraphElement>) => <p className="mb-2 leading-relaxed" {...p} />,
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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {briefing ? `${briefing.date} 생성${briefing.status === 'failed' ? ' · 실패' : ''}` : '아직 브리핑이 없습니다'}
        </p>
        <Button onClick={generate} size="sm" variant="outline" disabled={loading}>
          {loading ? '생성 중…' : '지금 생성'}
        </Button>
      </div>
      {briefing?.contentMd ? (
        <div className="text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
            {briefing.contentMd}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          매 영업일 06:30 자동 생성 예정. &quot;지금 생성&quot;으로 즉시 만들 수 있습니다. (OpenAI 키 필요)
        </p>
      )}
    </div>
  );
}
