'use client';

// 신호 규칙 편집 (D16) — 선정 규칙 + 눌림목 관찰 규칙.
// 저장은 항상 '새 버전 추가'다: 버전별 성적을 비교하려면 이력이 보존돼야 하기 때문에 덮어쓰기를 제공하지 않는다.
// bp 단위(내부 표현)는 화면에서 %·배수로 바꿔 보여준다.
import { useState } from 'react';
import { History, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { SignalRules } from '@/lib/engine/rules';
import type { RuleVersion } from '@/lib/supabase/queries/engine-config';

interface PreviewResult {
  available: boolean;
  message?: string;
  basedOn?: { runDate: string; slotId: string; stockCount: number };
  note?: string;
  selected?: Array<{ ticker: string; name: string; score: number; grade: string; alwaysBrief: boolean }>;
  droppedCount?: number;
  radar?: Array<{ ticker: string; name: string; state: string; pinned: boolean; disparityBp: number | null }>;
}

function NumField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  hint?: string;
}) {
  const id = `f-${label.replace(/\s/g, '')}`;
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <div className="flex items-center gap-1.5">
        <Input
          id={id}
          type="number"
          step={step}
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-8 tabular-nums"
        />
        {suffix && <span className="shrink-0 text-xs text-muted-foreground">{suffix}</span>}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function RulesPanel({ initial }: { initial: RuleVersion[] }) {
  const active = initial.find((v) => v.active) ?? initial[0];
  const [versions, setVersions] = useState(initial);
  const [rules, setRules] = useState<SignalRules>(active.rules);
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const cb = rules.closeBuy;
  const wz = rules.watchZone;
  const totalWeight =
    cb.trend.weight + cb.pullback.weight + cb.rsi.weight + cb.volume.weight + cb.flowKr.weight + cb.closeStrength.weight;

  const setCb = (patch: Partial<SignalRules['closeBuy']>) =>
    setRules((r) => ({ ...r, closeBuy: { ...r.closeBuy, ...patch } }));
  const setWz = (patch: Partial<SignalRules['watchZone']>) =>
    setRules((r) => ({ ...r, watchZone: { ...r.watchZone, ...patch } }));

  const runPreview = async () => {
    setPreviewing(true);
    setMessage(null);
    try {
      const res = await fetch('/api/engine/rules/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? '미리보기에 실패했습니다.');
      setPreview(json as PreviewResult);
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : '미리보기에 실패했습니다.' });
    } finally {
      setPreviewing(false);
    }
  };

  const saveVersion = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/engine/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules, memo: memo || undefined, activate: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? '저장에 실패했습니다.');
      setVersions(json.versions as RuleVersion[]);
      setMemo('');
      setMessage({ tone: 'ok', text: `v${json.version}으로 저장하고 활성화했습니다.` });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : '저장에 실패했습니다.' });
    } finally {
      setSaving(false);
    }
  };

  const activateVersion = async (version: number) => {
    try {
      const res = await fetch('/api/engine/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? '전환에 실패했습니다.');
      const next = json.versions as RuleVersion[];
      setVersions(next);
      const nowActive = next.find((v) => v.active);
      if (nowActive) setRules(nowActive.rules);
      setMessage({ tone: 'ok', text: `v${version}을 활성화했습니다.` });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : '전환에 실패했습니다.' });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-5 p-5">
        <div>
          <h3 className="text-base font-semibold">선정 규칙</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            종가 매수 후보를 뽑는 점수 기준입니다. 점수는 (획득 가중치 ÷ 적용 가능 가중치) × 100으로 정규화됩니다.
          </p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label className="text-sm">조건별 가중치</Label>
            <span className={cn('text-xs', totalWeight === 100 ? 'text-muted-foreground' : 'text-amber-600')}>
              합계 {totalWeight}
              {totalWeight !== 100 && ' (정규화되므로 100이 아니어도 동작합니다)'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <NumField label="추세" value={cb.trend.weight} min={0} max={100} onChange={(v) => setCb({ trend: { weight: v } })} />
            <NumField label="눌림목" value={cb.pullback.weight} min={0} max={100} onChange={(v) => setCb({ pullback: { weight: v } })} />
            <NumField label="RSI" value={cb.rsi.weight} min={0} max={100} onChange={(v) => setCb({ rsi: { ...cb.rsi, weight: v } })} />
            <NumField label="거래량" value={cb.volume.weight} min={0} max={100} onChange={(v) => setCb({ volume: { ...cb.volume, weight: v } })} />
            <NumField
              label="수급(KR)"
              value={cb.flowKr.weight}
              min={0}
              max={100}
              onChange={(v) => setCb({ flowKr: { weight: v } })}
              hint="데이터 연동 전"
            />
            <NumField
              label="종가강도"
              value={cb.closeStrength.weight}
              min={0}
              max={100}
              onChange={(v) => setCb({ closeStrength: { ...cb.closeStrength, weight: v } })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumField label="RSI 하한" value={cb.rsi.minRsi} min={0} max={100} onChange={(v) => setCb({ rsi: { ...cb.rsi, minRsi: v } })} />
          <NumField label="RSI 상한" value={cb.rsi.maxRsi} min={0} max={100} onChange={(v) => setCb({ rsi: { ...cb.rsi, maxRsi: v } })} />
          <NumField
            label="거래량 배수"
            value={cb.volume.minRatioBp / 10_000}
            step={0.1}
            min={0}
            suffix="배"
            onChange={(v) => setCb({ volume: { ...cb.volume, minRatioBp: Math.round(v * 10_000) } })}
          />
          <NumField
            label="종가 위치 상위"
            value={(10_000 - cb.closeStrength.minPositionBp) / 100}
            step={5}
            min={0}
            max={100}
            suffix="%"
            onChange={(v) => setCb({ closeStrength: { ...cb.closeStrength, minPositionBp: 10_000 - Math.round(v * 100) } })}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm">하드 제외 (해당 시 점수 0)</Label>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={cb.excludeHard.earningsTonight}
                onChange={(e) => setCb({ excludeHard: { ...cb.excludeHard, earningsTonight: e.target.checked } })}
              />
              당일 밤 실적발표
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={cb.excludeHard.belowMa200AndBear}
                onChange={(e) => setCb({ excludeHard: { ...cb.excludeHard, belowMa200AndBear: e.target.checked } })}
              />
              MA200 하회 + 역배열
            </label>
            <div className="w-40">
              <NumField
                label="당일 급락 임계"
                value={cb.excludeHard.dailyCrashBp / 100}
                step={0.5}
                max={0}
                suffix="%"
                onChange={(v) => setCb({ excludeHard: { ...cb.excludeHard, dailyCrashBp: Math.min(0, Math.round(v * 100)) } })}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:w-1/2">
          <NumField
            label="강력매수 임계"
            value={rules.scoreThreshold.strongBuy}
            min={0}
            max={100}
            suffix="점"
            onChange={(v) => setRules((r) => ({ ...r, scoreThreshold: { ...r.scoreThreshold, strongBuy: v } }))}
          />
          <NumField
            label="관심 임계"
            value={rules.scoreThreshold.watch}
            min={0}
            max={100}
            suffix="점"
            onChange={(v) => setRules((r) => ({ ...r, scoreThreshold: { ...r.scoreThreshold, watch: v } }))}
          />
        </div>
      </Card>

      <Card className="space-y-5 p-5">
        <div>
          <h3 className="text-base font-semibold">눌림목 관찰 규칙</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            점수 상위 후보와 별개로, 상승 흐름 중 눌린 종목을 관찰 표에 모읍니다.
            <span className="ml-1 text-foreground">관찰중</span> = 반등 전 ·
            <span className="ml-1 text-foreground">진입임박</span> = MA10 회복.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={wz.enabled} onChange={(e) => setWz({ enabled: e.target.checked })} />
            관찰 기능 사용
          </label>

          <div className="space-y-1">
            <Label className="text-xs">추세 판정</Label>
            <select
              value={wz.trendMode}
              onChange={(e) => setWz({ trendMode: e.target.value as typeof wz.trendMode })}
              className="h-8 rounded-md border bg-transparent px-2 text-sm"
            >
              <option value="strict">엄격 (MA20·MA60 우상향)</option>
              <option value="loose">완화 (종가 &gt; MA20)</option>
              <option value="off">추세 무관</option>
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">기준선</Label>
            <select
              value={wz.baseMa}
              onChange={(e) => setWz({ baseMa: e.target.value as typeof wz.baseMa })}
              className="h-8 rounded-md border bg-transparent px-2 text-sm"
            >
              <option value="ma10">MA10</option>
              <option value="ma20">MA20</option>
              <option value="ma60">MA60</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <NumField
            label="이격 하한"
            value={wz.minDisparityBp / 100}
            step={0.5}
            suffix="%"
            onChange={(v) => setWz({ minDisparityBp: Math.round(v * 100) })}
          />
          <NumField
            label="이격 상한"
            value={wz.maxDisparityBp / 100}
            step={0.5}
            suffix="%"
            onChange={(v) => setWz({ maxDisparityBp: Math.round(v * 100) })}
          />
          <NumField label="RSI 하한" value={wz.rsi.min} min={0} max={100} onChange={(v) => setWz({ rsi: { ...wz.rsi, min: v } })} />
          <NumField label="RSI 상한" value={wz.rsi.max} min={0} max={100} onChange={(v) => setWz({ rsi: { ...wz.rsi, max: v } })} />
          <NumField label="되돌아보기" value={wz.lookbackBars} min={1} max={20} suffix="봉" onChange={(v) => setWz({ lookbackBars: v })} />
          <NumField label="최대 표시" value={wz.maxCount} min={1} max={30} suffix="개" onChange={(v) => setWz({ maxCount: v })} />
        </div>

        {wz.trendMode === 'loose' && wz.baseMa === 'ma20' && wz.minDisparityBp < 0 && (
          <p className="text-xs text-amber-600">
            추세 판정을 &apos;완화&apos;로 두면 종가가 MA20 위인 종목만 남으므로, 기준선이 MA20일 때 이격 하한의
            음수 구간은 사실상 적용되지 않습니다. MA20 아래로 눌린 종목까지 보려면 추세 판정을 &apos;추세 무관&apos;으로
            바꾸거나 기준선을 MA60으로 두세요.
          </p>
        )}
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1 space-y-1">
            <Label htmlFor="rule-memo" className="text-xs">
              변경 메모
            </Label>
            <Input
              id="rule-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예: 눌림목 비중 상향"
              className="h-8"
            />
          </div>
          <Button variant="outline" onClick={runPreview} disabled={previewing}>
            {previewing ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} 미리보기
          </Button>
          <Button onClick={saveVersion} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : '새 버전으로 저장'}
          </Button>
          {message && (
            <span className={cn('text-sm', message.tone === 'ok' ? 'text-emerald-600' : 'text-destructive')}>
              {message.text}
            </span>
          )}
        </div>

        {preview && (
          <div className="rounded-lg border p-3 text-sm">
            {!preview.available ? (
              <p className="text-muted-foreground">{preview.message}</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {preview.basedOn?.runDate} · {preview.basedOn?.slotId} 스냅샷 {preview.basedOn?.stockCount}종목 기준 ·{' '}
                  {preview.note}
                </p>
                <div className="mt-2">
                  <span className="font-medium">선정 {preview.selected?.length ?? 0}종목</span>
                  <span className="ml-2 text-muted-foreground">
                    {preview.selected?.map((s) => `${s.name} ${s.score}`).join(' · ') || '없음'}
                  </span>
                </div>
                <div className="mt-1">
                  <span className="font-medium">관찰 {preview.radar?.length ?? 0}종목</span>
                  <span className="ml-2 text-muted-foreground">
                    {preview.radar
                      ?.map((r) => `${r.name}(${r.state === 'entry_ready' ? '진입임박' : '관찰중'})`)
                      .join(' · ') || '없음'}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      <Card className="space-y-3 p-5">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <History className="size-4" /> 버전 이력
        </h3>
        <div className="space-y-1.5">
          {versions.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-md border p-2.5 text-sm">
              <span className="font-mono font-semibold">v{v.version}</span>
              {v.active && (
                <span className="rounded bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">활성</span>
              )}
              <span className="text-muted-foreground">
                {v.graded > 0 ? `적중률 ${((v.wins / v.graded) * 100).toFixed(1)}% (${v.graded}건)` : '채점 데이터 없음'}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{v.memo ?? '-'}</span>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setRules(v.rules)}>
                  불러오기
                </Button>
                {!v.active && v.id !== 'default' && (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => activateVersion(v.version)}>
                    활성화
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
