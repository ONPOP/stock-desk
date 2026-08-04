// S8 설정 — W1 범위: API 키 입력(암호화 저장) + 검증 버튼
// RSC에서 마스킹된 설정을 조회해 클라이언트 폼에 전달
import Link from 'next/link';
import { requireUser } from '@/lib/supabase/server';
import { getSettingsView } from '@/lib/supabase/queries/settings';
import { getUsageSummary } from '@/lib/supabase/queries/usage';
import { SettingsForm } from '@/components/settings/settings-form';
import { UsageCard } from '@/components/settings/usage-card';
import { Card } from '@/components/ui/card';
import { LogoutButton } from '@/components/auth/logout-button';

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  const [view, usage] = await Promise.all([getSettingsView(supabase, user.id), getUsageSummary(supabase, user.id)]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">설정</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          API 키는 서버에서 AES-256으로 암호화되어 저장됩니다.
        </p>
      </div>
      <Card className="flex-row items-center justify-between p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">로그인 계정</p>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
        <LogoutButton
          label="로그아웃"
          className="shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted"
        />
      </Card>
      <SettingsForm initial={view} />
      <UsageCard usage={usage} />
      <Card className="p-4 text-sm">
        <p className="font-medium">분석 엔진 설정</p>
        <p className="mt-1 text-muted-foreground">
          슬롯 시각·종목 선정 규칙·관찰 조건·슬라이드 저장 위치는{' '}
          <Link href="/reports" className="underline underline-offset-2">
            분석 리포트 → 설정
          </Link>{' '}
          탭에 있습니다.
        </p>
      </Card>
    </div>
  );
}
