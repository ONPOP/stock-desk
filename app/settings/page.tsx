// S8 설정 — W1 범위: API 키 입력(암호화 저장) + 검증 버튼
// RSC에서 마스킹된 설정을 조회해 클라이언트 폼에 전달
import { requireUser } from '@/lib/supabase/server';
import { getSettingsView } from '@/lib/supabase/queries/settings';
import { getUsageSummary } from '@/lib/supabase/queries/usage';
import { SettingsForm } from '@/components/settings/settings-form';
import { UsageCard } from '@/components/settings/usage-card';

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
      <SettingsForm initial={view} />
      <UsageCard usage={usage} />
    </div>
  );
}
