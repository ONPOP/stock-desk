'use client';

// 자동 로그인 설정 — 로그인 후에도 켜고 끌 수 있는 지점.
// 상태는 httpOnly 쿠키에 있어 클라이언트가 읽을 수 없으므로 서버에서 받아온다.
import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function AutoLoginSetting() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/auth/auto-login')
      .then((r) => r.json())
      .then((j) => setEnabled(Boolean(j.enabled)))
      .catch(() => setEnabled(false));
  }, []);

  async function toggle() {
    if (enabled === null) return;
    const next = !enabled;
    setBusy(true);
    try {
      const res = await fetch('/api/auth/auto-login', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error();
      setEnabled(next);
      toast.success(
        next
          ? '자동 로그인을 켰습니다. 직접 로그아웃할 때까지 유지됩니다.'
          : '자동 로그인을 껐습니다. 앱을 다시 실행하면 로그인 화면이 나옵니다.',
      );
    } catch {
      toast.error('자동 로그인 설정 변경에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ShieldCheck className="size-4" /> 자동 로그인
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            켜면 프로그램을 실행할 때 로그인 화면을 건너뜁니다. 직접 로그아웃하기 전까지 유지됩니다.
          </p>
        </div>
        <Button
          variant={enabled ? 'default' : 'outline'}
          onClick={toggle}
          disabled={busy || enabled === null}
          aria-pressed={enabled ?? false}
        >
          {busy || enabled === null ? (
            <Loader2 className="size-4 animate-spin" />
          ) : enabled ? (
            '켜짐'
          ) : (
            '꺼짐'
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        비밀번호는 저장하지 않습니다. 저장되는 값은 로그아웃 시 폐기되는 인증 토큰입니다. 다만 이 기기를 쓰는
        사람은 누구나 앱을 열어 계좌 정보를 볼 수 있으니, 공용 환경에서는 꺼 두세요.
      </p>
    </Card>
  );
}
