'use client';

// S8 설정 폼 — KIS/OpenAI/Anthropic 키 저장(마스킹 표시) + KIS 검증 버튼
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import type { UserSettingsView } from '@/types';

interface ValidateResult {
  ok: boolean;
  error?: string;
  message?: string;
  domestic?: { ok: boolean; detail: string };
  overseas?: { ok: boolean; detail: string };
}

export function SettingsForm({ initial }: { initial: UserSettingsView }) {
  const [view, setView] = useState(initial);
  const [kisAppKey, setKisAppKey] = useState('');
  const [kisAppSecret, setKisAppSecret] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [dartKey, setDartKey] = useState('');
  const [finnhubKey, setFinnhubKey] = useState('');
  const [fmpKey, setFmpKey] = useState('');
  const [naverClientId, setNaverClientId] = useState('');
  const [naverClientSecret, setNaverClientSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validateResult, setValidateResult] = useState<ValidateResult | null>(null);

  async function save() {
    const patch: Record<string, string> = {};
    if (kisAppKey.trim()) patch.kis_app_key = kisAppKey.trim();
    if (kisAppSecret.trim()) patch.kis_app_secret = kisAppSecret.trim();
    if (openaiKey.trim()) patch.openai_key = openaiKey.trim();
    if (anthropicKey.trim()) patch.anthropic_key = anthropicKey.trim();
    if (dartKey.trim()) patch.dart_key = dartKey.trim();
    if (finnhubKey.trim()) patch.finnhub_key = finnhubKey.trim();
    if (fmpKey.trim()) patch.fmp_key = fmpKey.trim();
    if (naverClientId.trim()) patch.naver_client_id = naverClientId.trim();
    if (naverClientSecret.trim()) patch.naver_client_secret = naverClientSecret.trim();
    if (Object.keys(patch).length === 0) {
      toast.error('변경할 키를 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? '저장에 실패했습니다.');
        return;
      }
      setView(data);
      setKisAppKey('');
      setKisAppSecret('');
      setOpenaiKey('');
      setAnthropicKey('');
      setDartKey('');
      setFinnhubKey('');
      setFmpKey('');
      setNaverClientId('');
      setNaverClientSecret('');
      toast.success('저장되었습니다. 키는 암호화되어 보관됩니다.');
    } catch {
      toast.error('네트워크 오류로 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function validateKis() {
    setValidating(true);
    setValidateResult(null);
    try {
      // 입력 중인 키가 있으면 저장 전 사전 검증, 없으면 저장된 키 검증
      const body =
        kisAppKey.trim() && kisAppSecret.trim()
          ? JSON.stringify({ app_key: kisAppKey.trim(), app_secret: kisAppSecret.trim() })
          : undefined;
      const res = await fetch('/api/settings/validate-kis', {
        method: 'POST',
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body,
      });
      const data: ValidateResult = await res.json();
      setValidateResult(data);
      if (data.ok) toast.success('KIS 키 검증 성공');
      else toast.error(data.error ?? 'KIS 키 검증 실패');
    } catch {
      setValidateResult({ ok: false, error: '네트워크 오류로 검증하지 못했습니다.' });
    } finally {
      setValidating(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>한국투자증권 KIS OpenAPI</CardTitle>
          <CardDescription>
            시세·차트·종목검색에 사용됩니다.{' '}
            {view.kis_app_key_masked ? `저장된 앱키: ${view.kis_app_key_masked}` : '아직 저장된 키가 없습니다.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="kis-app-key">앱키 (App Key)</Label>
            <Input
              id="kis-app-key"
              type="password"
              autoComplete="off"
              placeholder={view.kis_app_key_masked ?? '앱키 입력'}
              value={kisAppKey}
              onChange={(e) => setKisAppKey(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kis-app-secret">앱시크릿 (App Secret)</Label>
            <Input
              id="kis-app-secret"
              type="password"
              autoComplete="off"
              placeholder={view.kis_app_secret_set ? '저장됨 — 변경 시에만 입력' : '앱시크릿 입력'}
              value={kisAppSecret}
              onChange={(e) => setKisAppSecret(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={validateKis} variant="outline" disabled={validating}>
              {validating ? '검증 중…' : 'KIS 키 검증'}
            </Button>
          </div>
          {validateResult && (
            <div
              className="rounded-md border p-3 text-sm"
              role="status"
            >
              {validateResult.ok ? (
                <div className="space-y-1">
                  <p className="font-medium text-green-600">{validateResult.message}</p>
                  <p>국내: {validateResult.domestic?.detail}</p>
                  <p>
                    해외: {validateResult.overseas?.ok ? validateResult.overseas.detail : `실패 — ${validateResult.overseas?.detail}`}
                  </p>
                </div>
              ) : (
                <p className="text-red-500">{validateResult.error}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI API 키</CardTitle>
          <CardDescription>AI 분석(F7)·브리핑(F1)에 사용됩니다. V1에서 활성화됩니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="openai-key">OpenAI API Key</Label>
            <Input
              id="openai-key"
              type="password"
              autoComplete="off"
              placeholder={view.openai_key_masked ?? 'sk-…'}
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="anthropic-key">Anthropic API Key</Label>
            <Input
              id="anthropic-key"
              type="password"
              autoComplete="off"
              placeholder={view.anthropic_key_masked ?? 'sk-ant-…'}
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>펀더멘털·공시 데이터 소스</CardTitle>
          <CardDescription>
            핵심지표(F4)·배당(F15)·공시(F12)에 사용됩니다. 한국=DART, 미국 재무=Finnhub, 미국 배당=FMP.
            미국 공시(SEC EDGAR)는 키가 필요 없습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dart-key">DART OpenAPI 인증키</Label>
            <Input
              id="dart-key"
              type="password"
              autoComplete="off"
              placeholder={view.dart_key_masked ?? '한국 재무·배당·공시'}
              value={dartKey}
              onChange={(e) => setDartKey(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="finnhub-key">Finnhub API Key</Label>
            <Input
              id="finnhub-key"
              type="password"
              autoComplete="off"
              placeholder={view.finnhub_key_masked ?? '미국 재무·실적'}
              value={finnhubKey}
              onChange={(e) => setFinnhubKey(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fmp-key">FMP API Key</Label>
            <Input
              id="fmp-key"
              type="password"
              autoComplete="off"
              placeholder={view.fmp_key_masked ?? '미국 배당'}
              value={fmpKey}
              onChange={(e) => setFmpKey(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>뉴스 데이터 소스</CardTitle>
          <CardDescription>
            한국 뉴스(F5)는 네이버 뉴스 검색 API를 사용합니다. 미국 뉴스는 위 Finnhub 키를 공용합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="naver-client-id">네이버 Client ID</Label>
            <Input
              id="naver-client-id"
              type="password"
              autoComplete="off"
              placeholder={view.naver_client_id_masked ?? '네이버 개발자센터 client_id'}
              value={naverClientId}
              onChange={(e) => setNaverClientId(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="naver-client-secret">네이버 Client Secret</Label>
            <Input
              id="naver-client-secret"
              type="password"
              autoComplete="off"
              placeholder={view.naver_client_secret_set ? '저장됨 — 변경 시에만 입력' : '네이버 client_secret'}
              value={naverClientSecret}
              onChange={(e) => setNaverClientSecret(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Separator />
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? '저장 중…' : '저장'}
        </Button>
      </div>
    </div>
  );
}
