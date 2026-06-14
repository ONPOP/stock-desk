'use client';

// 라우트 에러 바운더리 (PRD 13장) — 한국어 메시지 + 재시도. 내부 상세는 노출하지 않음.
import { Button } from '@/components/ui/button';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-lg font-semibold">문제가 발생했습니다</h2>
      <p className="text-sm text-muted-foreground">잠시 후 다시 시도해주세요. 문제가 계속되면 설정에서 API 키 상태를 확인하세요.</p>
      <Button onClick={reset} variant="outline">
        다시 시도
      </Button>
    </div>
  );
}
