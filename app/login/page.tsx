'use client';

// 로그인 — MVP는 가입 비활성(D1), 계정은 scripts/create-user.ts로 생성
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // 기본 꺼짐 — 자동 로그인은 사용자가 명시적으로 켜는 기능이다
  const [autoLogin, setAutoLogin] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        // 네트워크 장애와 자격증명 오류를 구분해 안내
        setError(
          authError.name === 'AuthRetryableFetchError'
            ? '서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.'
            : '이메일 또는 비밀번호가 올바르지 않습니다.',
        );
        return;
      }
      // 정책 쿠키는 httpOnly라 서버에서만 심을 수 있다.
      // 체크를 안 했더라도 반드시 호출해야 한다 — 이번 실행분(세션 쿠키)이 없으면
      // 미들웨어가 바로 다음 요청에서 세션을 끊는다.
      await fetch('/api/auth/auto-login', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: autoLogin }),
      });

      router.replace('/');
      router.refresh();
    } catch {
      setError('로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Stock Desk</CardTitle>
          <CardDescription>나만의 주식 데스크에 로그인하세요</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoLogin}
                onChange={(e) => setAutoLogin(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                자동 로그인 유지
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  다음 실행부터 로그인 화면을 건너뜁니다. 직접 로그아웃할 때까지 유지됩니다.
                </span>
              </span>
            </label>
            {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '로그인 중…' : '로그인'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
