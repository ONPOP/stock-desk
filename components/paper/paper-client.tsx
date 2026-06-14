'use client';

// F9 모의투자 — 계좌 요약 + 포지션 카드 + 주문 폼 + 거래 타임라인 + 시즌 리셋.
// 장중=시장가 즉시 체결, 장외=예약주문(다음 개장 시초가). 금액은 서버에서 최소 단위 정수로 계산.
// [재설계] 계좌 타일·주문 폼(매수/매도 세그)·포지션·거래 타임라인 비주얼 + 실제 로고.
// [보존] submit()/reset() fetch·setState·side/qty 상태·MARKETS·formatMoney·매수 빨강/매도 파랑.
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CompanyLogo } from '@/components/ui/company-logo';
import { formatMoney } from '@/lib/utils/money';
import type { Market, PaperState } from '@/types';

const MARKETS: Market[] = ['KOSPI', 'KOSDAQ', 'NYSE', 'NASDAQ', 'AMEX'];

export function PaperClient({ initialState }: { initialState: PaperState }) {
  const [state, setState] = useState<PaperState>(initialState);
  const [ticker, setTicker] = useState('');
  const [market, setMarket] = useState<Market>('KOSPI');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const q = Number(qty);
    if (!ticker.trim() || !Number.isInteger(q) || q <= 0) {
      toast.error('종목과 수량을 올바르게 입력해주세요.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/paper', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ticker: ticker.trim().toUpperCase(), market, side, qty: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? '주문에 실패했습니다.');
        return;
      }
      setState(data.state);
      const r = data.result;
      if (r?.status === 'error') toast.error(r.reason ?? '주문 실패');
      else if (r?.status === 'reserved') toast.success('장외 — 예약주문 접수(다음 개장 시초가 체결).');
      else toast.success('체결되었습니다.');
      setQty('');
    } catch {
      toast.error('네트워크 오류로 주문하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!confirm('현재 시즌을 종료하고 시드머니를 초기화할까요? (이전 시즌은 아카이브됩니다)')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/paper?reset=true', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? '리셋 실패');
        return;
      }
      setState(data.state);
      toast.success('새 시즌을 시작했습니다.');
    } catch {
      toast.error('네트워크 오류');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* 계좌 요약 타일 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge variant="outline" className="border-0 bg-accent text-accent-foreground">시즌 {state.seasonNo}</Badge>
        <Button variant="outline" size="sm" onClick={reset} disabled={busy}>
          시즌 리셋
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {state.accounts.map((a) => (
          <Card key={a.currency} className="gap-1.5 p-4">
            <span className="text-xs text-muted-foreground">{a.currency} 현금</span>
            <span className="text-[22px] font-bold tabular-nums">{formatMoney(a.cashBalance, a.currency)}</span>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        {/* 주문 폼 */}
        <Card className="gap-4 p-[18px]">
          <h2 className="font-semibold">주문</h2>
          <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-[3px]">
            <button
              type="button"
              onClick={() => setSide('buy')}
              className={`rounded-full py-1.5 text-sm font-medium transition-all ${
                side === 'buy' ? 'bg-background text-up shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              매수
            </button>
            <button
              type="button"
              onClick={() => setSide('sell')}
              className={`rounded-full py-1.5 text-sm font-medium transition-all ${
                side === 'sell' ? 'bg-background text-down shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              매도
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="티커 (예: 005930, AAPL)" value={ticker} onChange={(e) => setTicker(e.target.value)} />
            <select
              value={market}
              onChange={(e) => setMarket(e.target.value as Market)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {MARKETS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <Input type="number" placeholder="수량" value={qty} onChange={(e) => setQty(e.target.value)} min={1} />
          <Button
            onClick={submit}
            disabled={busy}
            className={`h-10 border-0 text-white ${side === 'buy' ? 'bg-up hover:bg-up/90' : 'bg-down hover:bg-down/90'}`}
          >
            {side === 'buy' ? '매수' : '매도'} 주문
          </Button>
          <p className="text-[11px] text-muted-foreground">장중이면 시장가 즉시 체결, 장외면 예약주문으로 접수되어 다음 개장 시초가에 체결됩니다.</p>
        </Card>

        {/* 포지션 */}
        <Card className="gap-3 p-[18px]">
          <h2 className="font-semibold">보유 종목</h2>
          {state.positions.length === 0 ? (
            <p className="text-sm text-muted-foreground">보유 종목이 없습니다.</p>
          ) : (
            <ul className="divide-y">
              {state.positions.map((p) => (
                <li key={p.stockId} className="flex items-center gap-2.5 py-2.5 text-sm">
                  <CompanyLogo ticker={p.ticker} name={p.name} size={30} />
                  <div className="min-w-0">
                    <div className="font-medium">{p.name}</div>
                    <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {p.qty.toLocaleString()}주 · 평단 {p.avgPrice != null ? formatMoney(p.avgPrice, p.currency) : '—'}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* 거래 타임라인 */}
      <Card className="gap-3 p-[18px]">
        <h2 className="font-semibold">거래 내역</h2>
        {state.trades.length === 0 ? (
          <p className="text-sm text-muted-foreground">거래 내역이 없습니다.</p>
        ) : (
          <ul className="divide-y">
            {state.trades.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  <Badge variant="outline" className={`border-0 ${t.side === 'buy' ? 'bg-up-soft text-up' : 'bg-down-soft text-down'}`}>
                    {t.side === 'buy' ? '매수' : '매도'}
                  </Badge>
                  <span className="font-medium">{t.name || t.ticker}</span>
                  {t.status === 'pending' && <Badge variant="outline" className="border-0 bg-amber-500/15 text-[11px] text-amber-600">예약</Badge>}
                  {t.status === 'canceled' && <span className="text-[11px] text-muted-foreground">취소</span>}
                </span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {t.qty.toLocaleString()}주 {t.price != null ? `@ ${formatMoney(t.price, t.currency)}` : ''} ·{' '}
                  {new Date(t.createdAt).toLocaleDateString('ko-KR')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
