'use client';

// 텔레그램 봇 연결 + 슬롯별 알림 설정 (D18).
// 연결 자체(토큰 등록 → chat id 획득 폴링 → 슬롯 알림)는 3개의 API가 나눠 맡는다:
//   POST /api/engine/telegram/connect  — 토큰 검증 + 저장 (1단계)
//   GET  /api/engine/telegram/connect  — chat id 폴링 (2단계, 클라이언트가 주도)
//   GET/PATCH /api/engine/telegram     — 연결 상태 조회 · 슬롯 알림 저장 · 연결 해제
//
// "발송 가능 여부"는 GET /api/engine/telegram의 lastError로만 판단한다. connect GET의
// testMessageError는 이미 연결된 상태에서 재호출되면 항상 null로 고정되므로(중복 발송 방지 가드),
// 연결 직후 1회성 안내에만 쓰고 이후 상태 표시 근거로 삼지 않는다.
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Send, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { describeSlotTime } from '@/lib/engine/cron-ui';
import type { SlotRow } from '@/lib/supabase/queries/engine-config';

interface TelegramStatus {
  connected: boolean;
  botUsername: string | null;
  chatId: string | null;
  enabledSlotIds: string[];
  lastError: string | null;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 30; // 30 * 2s = 60s

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

// 서버 오류 응답 형태 — lib/errors.ts의 toErrorResponse가 { error: string }으로 내려준다.
// 이 컴포넌트 안에서만 이 필드명을 쓴다(코드베이스 전역 관례는 건드리지 않는다).
interface ApiErrorBody {
  error?: string;
}

interface ConnectPostBody extends ApiErrorBody {
  botUsername?: string;
}

interface ConnectGetBody extends ApiErrorBody {
  chatId?: string | null;
  testMessageError?: string | null;
}

export function EngineTelegramSettings({ slots }: { slots: SlotRow[] }) {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  /** 상태 조회 자체(GET /api/engine/telegram)의 HTTP·네트워크 오류 — status와 별개로 재시도 가능하게 둔다 */
  const [statusError, setStatusError] = useState<string | null>(null);
  /** 연결·해제·슬롯 저장 결과 안내 — 인접 패널(engine-storage-settings 등)과 동일하게 인라인 컬러 텍스트로 표시한다 */
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  // 연결 폼
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // chat id 폴링
  const [awaitingChat, setAwaitingChat] = useState(false);
  const [pendingBotUsername, setPendingBotUsername] = useState<string | null>(null);
  const [pollRemaining, setPollRemaining] = useState(0);
  const [pollTimedOut, setPollTimedOut] = useState(false);

  // 연결 해제
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // 슬롯 알림
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(new Set());
  const [slotsDirty, setSlotsDirty] = useState(false);
  const [savingSlots, setSavingSlots] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshStatus = async () => {
    if (mountedRef.current) setStatusError(null);
    try {
      const res = await fetch('/api/engine/telegram');
      const json = (await readJson(res)) as TelegramStatus & ApiErrorBody;
      if (!mountedRef.current) return;
      if (!res.ok) {
        // HTTP 오류(세션 만료·DB 오류 등)도 네트워크 예외와 동일하게 재시도 가능한 상태로 남긴다 —
        // status는 null로 유지해 "확인 중" 스피너 대신 오류 배너 + [다시 시도]가 뜨게 한다
        setStatusError(json.error ?? '연결 상태를 불러오지 못했습니다.');
        return;
      }
      setStatus(json);
      setSelectedSlotIds(new Set(json.enabledSlotIds ?? []));
      setSlotsDirty(false);
    } catch {
      if (mountedRef.current) setStatusError('연결 상태를 불러오지 못했습니다. 네트워크 상태를 확인해주세요.');
    }
  };

  useEffect(() => {
    void refreshStatus();
  }, []);

  // chat id 폴링 — 2초 간격, 최대 60초. 컴포넌트가 언마운트되면 반드시 정리한다.
  useEffect(() => {
    if (!awaitingChat) return;
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;
    setPollRemaining((MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000);

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch('/api/engine/telegram/connect');
        const json = (await readJson(res)) as ConnectGetBody;
        if (cancelled) return;
        if (res.ok && json.chatId) {
          if (json.testMessageError) {
            setMessage({ tone: 'error', text: `연결은 됐지만 테스트 메시지 발송에 실패했습니다: ${json.testMessageError}` });
          } else {
            setMessage({ tone: 'ok', text: '텔레그램 연결이 완료됐습니다.' });
          }
          setAwaitingChat(false);
          setPendingBotUsername(null);
          await refreshStatus();
          return;
        }
      } catch {
        // 네트워크 오류는 "아직 못 찾음"과 동일하게 취급한다 — 다음 시도에서 회복될 수 있다
      }

      attempt += 1;
      if (cancelled) return;
      if (attempt >= MAX_POLL_ATTEMPTS) {
        setAwaitingChat(false);
        setPollTimedOut(true);
        return;
      }
      setPollRemaining(((MAX_POLL_ATTEMPTS - attempt) * POLL_INTERVAL_MS) / 1000);
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [awaitingChat]);

  const connect = async () => {
    const botToken = token.trim();
    if (!botToken) return;
    // 전송 직후 상태에서 비운다 — 성공하든 실패하든 화면에 다시 표시하지 않는다
    setToken('');
    setConnecting(true);
    setConnectError(null);
    try {
      const res = await fetch('/api/engine/telegram/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken }),
      });
      const json = (await readJson(res)) as ConnectPostBody;
      if (!res.ok) throw new Error(json.error ?? '텔레그램 봇 토큰이 올바르지 않습니다. 토큰을 다시 확인해주세요.');
      setPendingBotUsername(json.botUsername ?? null);
      setPollTimedOut(false);
      setAwaitingChat(true);
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : '연결에 실패했습니다.');
    } finally {
      setConnecting(false);
    }
  };

  const retryPolling = () => {
    setPollTimedOut(false);
    setAwaitingChat(true);
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/engine/telegram', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disconnect: true }),
      });
      const json = (await readJson(res)) as TelegramStatus & ApiErrorBody;
      if (!res.ok) throw new Error(json.error ?? '연결 해제에 실패했습니다.');
      setStatus(json);
      setSelectedSlotIds(new Set());
      setSlotsDirty(false);
      setConfirmingDisconnect(false);
      setMessage({ tone: 'ok', text: '텔레그램 연결을 해제했습니다.' });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : '연결 해제에 실패했습니다.' });
    } finally {
      setDisconnecting(false);
    }
  };

  const toggleSlot = (slotId: string) => {
    setSelectedSlotIds((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
    setSlotsDirty(true);
  };

  const saveSlots = async () => {
    setSavingSlots(true);
    try {
      const res = await fetch('/api/engine/telegram', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabledSlotIds: [...selectedSlotIds] }),
      });
      const json = (await readJson(res)) as TelegramStatus & ApiErrorBody;
      if (!res.ok) throw new Error(json.error ?? '저장에 실패했습니다.');
      setStatus(json);
      setSelectedSlotIds(new Set(json.enabledSlotIds ?? []));
      setSlotsDirty(false);
      setMessage({ tone: 'ok', text: '슬롯 알림 설정을 저장했습니다.' });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : '저장에 실패했습니다.' });
    } finally {
      setSavingSlots(false);
    }
  };

  return (
    <Card className="space-y-5 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Send className="size-4" /> 텔레그램 알림
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          슬롯 분석이 끝나면 선택한 슬롯의 결과를 텔레그램으로 받습니다.
        </p>
      </div>

      {message && (
        <p className={`text-sm ${message.tone === 'ok' ? 'text-emerald-600' : 'text-destructive'}`}>
          {message.text}
        </p>
      )}

      {statusError && (
        <div className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          <p>{statusError}</p>
          <Button size="sm" variant="outline" onClick={() => void refreshStatus()}>
            다시 시도
          </Button>
        </div>
      )}

      {status === null && !statusError && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 연결 상태 확인 중…
        </div>
      )}

      {status !== null && !status.connected && !awaitingChat && (
        <div className="space-y-2">
          <Label htmlFor="telegram-token">봇 토큰</Label>
          <div className="flex gap-2">
            <Input
              id="telegram-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="123456789:AAExampleTokenFromBotFather"
              spellCheck={false}
              type="password"
              autoComplete="off"
            />
            <Button onClick={connect} disabled={connecting || !token.trim()} className="shrink-0">
              {connecting ? <Loader2 className="size-4 animate-spin" /> : '연결하기'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            @BotFather 에서 발급받은 봇 토큰을 입력하세요. 토큰은 저장 후 화면에 다시 표시되지 않습니다.
          </p>
          {connectError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 p-2.5 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{connectError}</span>
            </div>
          )}
        </div>
      )}

      {awaitingChat && (
        <div className="space-y-2 rounded-md border p-3 text-sm">
          <p>
            텔레그램에서 <strong>{pendingBotUsername ?? '봇'}</strong> 을 열고 <strong>[시작]</strong>을 누르세요.
          </p>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> 연결 대기 중… (남은 시간 {pollRemaining}초)
          </div>
        </div>
      )}

      {pollTimedOut && (
        <div className="space-y-2 rounded-md border border-amber-500/40 p-3 text-sm text-amber-600">
          <p>60초 안에 연결을 확인하지 못했습니다. 텔레그램에서 [시작]을 눌렀는지 확인한 뒤 다시 시도하세요.</p>
          <Button size="sm" variant="outline" onClick={retryPolling}>
            다시 시도
          </Button>
        </div>
      )}

      {status !== null && status.connected && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium">{status.botUsername ?? '@봇'} · 연결됨</span>
            <Button size="sm" variant="outline" onClick={() => setConfirmingDisconnect(true)}>
              <Unlink className="size-4" /> 연결 해제
            </Button>
          </div>

          {status.lastError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 p-2.5 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>마지막 발송 실패: {status.lastError}</span>
            </div>
          )}

          {confirmingDisconnect && (
            <div className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm">
              <p>
                연결을 해제하면 슬롯 알림 설정도 함께 삭제됩니다. 다시 연결하면 알림 받을 슬롯을 처음부터 다시
                선택해야 합니다.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={disconnect} disabled={disconnecting}>
                  {disconnecting ? <Loader2 className="size-4 animate-spin" /> : '해제 확인'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmingDisconnect(false)}>
                  취소
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>슬롯별 알림</Label>
            {slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">등록된 슬롯이 없습니다. 위 [슬롯 스케줄]에서 먼저 추가하세요.</p>
            ) : (
              <div className="space-y-1.5">
                {slots.map((slot) => (
                  <label
                    key={slot.slotId}
                    className="flex items-center gap-2 rounded-md border p-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSlotIds.has(slot.slotId)}
                      onChange={() => toggleSlot(slot.slotId)}
                    />
                    <span className="font-medium">{slot.label}</span>
                    <span className="text-xs text-muted-foreground">{describeSlotTime(slot.cronKst)}</span>
                  </label>
                ))}
              </div>
            )}
            <Button onClick={saveSlots} disabled={!slotsDirty || savingSlots}>
              {savingSlots ? <Loader2 className="size-4 animate-spin" /> : '저장'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
