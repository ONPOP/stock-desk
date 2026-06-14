'use client';

// F9 모의투자 — 계좌 요약 + 포지션 카드 + 주문 폼 + 거래 타임라인 + 시즌 리셋.
// 장중=시장가 즉시 체결, 장외=예약주문(다음 개장 시초가). 금액은 서버에서 최소 단위 정수로 계산.
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
    <div className="space-y-6">
      {/* 계좌 요약 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4">
          <Badge variant="secondary">시즌 {state.seasonNo}</Badge>
          {state.accounts.map((a) => (
            <div key={a.currency} className="text-sm">
              <span className="text-muted-foreground">{a.currency} 현금 </span>
              <span className="font-semibold tabular-nums">{formatMoney(a.cashBalance, a.currency)}</span>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={reset} disabled={busy}>
          시즌 리셋
        </Button>
      </div>

      {/* 주문 폼 */}
      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">주문</h2>
        <div className="flex flex-wrap gap-2">
          <Input placeholder="티커 (예: 005930, AAPL)" value={ticker} onChange={(e) => setTicker(e.target.value)} className="w-44" />
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value as Market)}
            className="rounded-md border bg-transparent px-2 text-sm"
          >
            {MARKETS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={side}
            onChange={(e) => setSide(e.target.value as 'buy' | 'sell')}
            className="rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="buy">매수</option>
            <option value="sell">매도</option>
          </select>
          <Input type="number" placeholder="수량" value={qty} onChange={(e) => setQty(e.target.value)} className="w-28" min={1} />
          <Button onClick={submit} disabled={busy}>
            주문
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">장중이면 시장가 즉시 체결, 장외면 예약주문으로 접수되어 다음 개장 시초가에 체결됩니다.</p>
      </Card>

      {/* 포지션 */}
      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">보유 종목</h2>
        {state.positions.length === 0 ? (
          <p className="text-sm text-muted-foreground">보유 종목이 없습니다.</p>
        ) : (
          <ul className="divide-y">
            {state.positions.map((p) => (
              <li key={p.stockId} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium">
                  {p.name} <span className="text-xs text-muted-foreground">{p.ticker}</span>
                </span>
                <span className="tabular-nums">
                  {p.qty.toLocaleString()}주 · 평단 {p.avgPrice != null ? formatMoney(p.avgPrice, p.currency) : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 거래 타임라인 */}
      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">거래 내역</h2>
        {state.trades.length === 0 ? (
          <p className="text-sm text-muted-foreground">거래 내역이 없습니다.</p>
        ) : (
          <ul className="divide-y">
            {state.trades.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                <span className="flex items-center gap-2">
                  <Badge variant="outline" className={t.side === 'buy' ? 'text-red-600' : 'text-blue-600'}>
                    {t.side === 'buy' ? '매수' : '매도'}
                  </Badge>
                  <span className="font-medium">{t.name || t.ticker}</span>
                  {t.status === 'pending' && <span className="text-[11px] text-amber-600">예약</span>}
                  {t.status === 'canceled' && <span className="text-[11px] text-muted-foreground">취소</span>}
                </span>
                <span className="tabular-nums text-muted-foreground">
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
