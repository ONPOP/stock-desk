'use client';

// 로그아웃 — 브라우저 Supabase 클라이언트로 signOut 후 /login 이동(쿠키·세션 무효화).
// 사이드바(아이콘)·설정 페이지(라벨) 양쪽에서 재사용. 멀티유저 계정 전환·공용기기 보안용.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

export function LogoutButton({ className, label }: { className?: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await createClient().auth.signOut();
      router.replace('/login');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      aria-label="로그아웃"
      title="로그아웃"
      className={cn('inline-flex items-center gap-2 transition-colors disabled:opacity-50', className)}
    >
      <LogOut className="size-4 shrink-0" aria-hidden />
      {label}
    </button>
  );
}
