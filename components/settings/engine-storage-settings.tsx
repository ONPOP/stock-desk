'use client';

// 분석 엔진 저장 설정 (D16) — 슬라이드 원본 저장 위치(외장 볼륨 지정 가능) · 보관기간 · 사용량 예산.
// 저장 전에 [연결 테스트]로 실제 쓰기 가능 여부를 확인할 수 있다(슬롯이 새벽에 조용히 실패하는 걸 막는다).
import { useEffect, useState } from 'react';
import { CheckCircle2, HardDrive, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EngineSettings } from '@/lib/engine/repository';

interface TestResult {
  ok: boolean;
  root: string;
  reason: string | null;
  freeBytes: number | null;
}

function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)}GB` : `${(bytes / 1024 ** 2).toFixed(0)}MB`;
}

export function EngineStorageSettings({ initial }: { initial: EngineSettings }) {
  const [root, setRoot] = useState(initial.slideStorageRoot ?? '');
  const [retention, setRetention] = useState(String(initial.retentionDays));
  const [maxStocks, setMaxStocks] = useState(String(initial.maxStocksPerSlot));
  const [maxSearches, setMaxSearches] = useState(String(initial.maxSearchesPerStock));
  const [volumes, setVolumes] = useState<string[]>([]);
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/engine/storage-test')
      .then((r) => (r.ok ? r.json() : { volumes: [] }))
      .then((j) => setVolumes(j.volumes ?? []))
      .catch(() => setVolumes([]));
  }, []);

  const runTest = async () => {
    if (!root.trim()) {
      setTest(null);
      setMessage({ tone: 'error', text: '테스트할 경로를 입력하세요.' });
      return;
    }
    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/engine/storage-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: root }),
      });
      setTest((await res.json()) as TestResult);
    } catch {
      setTest({ ok: false, root, reason: '테스트 요청에 실패했습니다.', freeBytes: null });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/engine/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slideStorageRoot: root.trim() === '' ? null : root.trim(),
          retentionDays: Number(retention),
          maxStocksPerSlot: Number(maxStocks),
          maxSearchesPerStock: Number(maxSearches),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? '저장에 실패했습니다.');
      setRoot(json.settings.slideStorageRoot ?? '');
      setMessage({ tone: 'ok', text: '저장했습니다.' });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : '저장에 실패했습니다.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-5 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <HardDrive className="size-4" /> 분석 리포트 저장
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          슬라이드 원본 PNG의 저장 위치입니다. 외장 하드를 연결해 두면 그 경로를 지정할 수 있습니다.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="slide-root">저장 경로</Label>
        <div className="flex gap-2">
          <Input
            id="slide-root"
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            placeholder="비워두면 기본 경로(data/runs)를 사용합니다"
            spellCheck={false}
          />
          <Button variant="outline" onClick={runTest} disabled={testing} className="shrink-0">
            {testing ? <Loader2 className="size-4 animate-spin" /> : '연결 테스트'}
          </Button>
        </div>

        {volumes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs text-muted-foreground">연결된 볼륨:</span>
            {volumes.map((v) => (
              <Button
                key={v}
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs"
                onClick={() => setRoot(`${v}/stock-desk-slides`)}
              >
                {v.replace('/Volumes/', '')}
              </Button>
            ))}
          </div>
        )}

        {test && (
          <div
            className={`flex items-start gap-2 rounded-md border p-2.5 text-sm ${
              test.ok ? 'border-emerald-500/40 text-emerald-600' : 'border-destructive/40 text-destructive'
            }`}
          >
            {test.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
            <div className="min-w-0">
              {test.ok ? (
                <>
                  <div>쓰기 가능 · {test.freeBytes !== null ? `여유 ${formatBytes(test.freeBytes)}` : '여유 공간 확인 불가'}</div>
                  <div className="truncate font-mono text-xs opacity-80">{test.root}</div>
                </>
              ) : (
                <div>{test.reason}</div>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          보안을 위해 홈 디렉토리 또는 <code>/Volumes</code> 하위 경로만 사용할 수 있습니다. 슬롯 실행 시 지정
          경로에 접근할 수 없으면 기본 경로에 저장되고 리포트에 &quot;임시 저장&quot;으로 표시됩니다.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="retention">보관 기간(일)</Label>
          <Input id="retention" type="number" min={0} max={3650} value={retention} onChange={(e) => setRetention(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">0 = 무제한</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="max-stocks">슬롯당 종목</Label>
          <Input id="max-stocks" type="number" min={1} max={20} value={maxStocks} onChange={(e) => setMaxStocks(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">사용량 예산</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="max-searches">종목당 검색</Label>
          <Input id="max-searches" type="number" min={1} max={10} value={maxSearches} onChange={(e) => setMaxSearches(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">사용량 예산</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : '저장'}
        </Button>
        {message && (
          <span className={`text-sm ${message.tone === 'ok' ? 'text-emerald-600' : 'text-destructive'}`}>
            {message.text}
          </span>
        )}
      </div>
    </Card>
  );
}
