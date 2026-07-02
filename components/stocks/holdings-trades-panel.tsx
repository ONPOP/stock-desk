'use client';

// 주식 잔고 및 매매일지 (V2) — 실거래 매수/매도 입력 → 보유현황·평가손익·실현손익. 매매내역 삭제.
// 현재가는 종목 상세의 useQuote 결과(prop)를 재사용(중복 폴링 회피).
import { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/utils/money';
import { computeHoldings, computeRealized, evalHolding } from '@/lib/utils/portfolio';
import type { RealTrade, Stock } from '@/types';

const NUM = /^\d+(\.\d+)?$/;
const todayLocal = () => new Date().toLocaleDateString('en-CA');

function toMinor(raw: string, currency: Stock['currency']): number | null {
  if (!NUM.test(raw.trim())) return null;
  const factor = currency === 'USD' ? 100 : 1;
  const v = new Decimal(raw.trim()).mul(factor).toDecimalPlaces(0).toNumber();
  return v > 0 ? v : null;
}
function pnlColor(n: number): string {
  return n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted-foreground';
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${className ?? ''}`}>{value}</span>
    </div>
  );
}

export interface HoldingsTradesPanelProps {
  stock: Stock;
  initialTrades: RealTrade[];
  currentPriceMinor: number | null;
}

export function HoldingsTradesPanel({ stock, initialTrades, currentPriceMinor }: HoldingsTradesPanelProps) {
  const [trades, setTrades] = useState<RealTrade[]>(initialTrades);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('');
  const [fee, setFee] = useState(''); // 매도 매매비용(세금+수수료). 표시 단위
  const [date, setDate] = useState(todayLocal);
  const [isEtf, setIsEtf] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 국내(KOSPI·KOSDAQ) 종목만 ETF 거래세 면제 구분이 의미 있음
  const isKr = stock.market === 'KOSPI' || stock.market === 'KOSDAQ';

  const holding = useMemo(
    () => computeHoldings(trades).find((h) => h.stockId === stock.id) ?? null,
    [trades, stock.id],
  );
  const realizedMap = useMemo(() => {
    const m = new Map<string, { pnl: number; rate: number }>();
    for (const r of computeRealized(trades)) m.set(r.id, { pnl: r.realizedPnl, rate: r.realizedRate });
    return m;
  }, [trades]);
  const ev = holding && currentPriceMinor != null ? evalHolding(holding, currentPriceMinor) : null;

  async function add() {
    const priceMinor = toMinor(price, stock.currency);
    const q = Number(qty);
    if (priceMinor == null) {
      toast.error('단가를 올바르게 입력하세요.');
      return;
    }
    if (!Number.isInteger(q) || q <= 0) {
      toast.error('수량을 올바르게 입력하세요.');
      return;
    }
    // 매매비용(매도 시만) — 비워두면 0. 최소 단위 정수로 변환.
    let feeMinor = 0;
    if (side === 'sell' && fee.trim() !== '') {
      if (!NUM.test(fee.trim())) {
        toast.error('매매비용을 올바르게 입력하세요.');
        return;
      }
      feeMinor = new Decimal(fee.trim()).mul(stock.currency === 'USD' ? 100 : 1).toDecimalPlaces(0).toNumber();
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockId: stock.id, side, qty: q, price: priceMinor, tradeDate: date, isEtf: isKr ? isEtf : false, fee: feeMinor }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? '저장에 실패했습니다.');
        return;
      }
      setTrades((prev) => [data.trade as RealTrade, ...prev]);
      setPrice('');
      setQty('');
      setFee('');
      toast.success(side === 'buy' ? '매수 기록을 추가했습니다.' : '매도 기록을 추가했습니다.');
    } catch {
      toast.error('네트워크 오류로 저장하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    const prev = trades;
    setTrades((p) => p.filter((t) => t.id !== id)); // 낙관적 삭제
    try {
      const res = await fetch(`/api/trades?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        setTrades(prev);
        toast.error('삭제에 실패했습니다.');
      }
    } catch {
      setTrades(prev);
      toast.error('네트워크 오류로 삭제하지 못했습니다.');
    }
  }

  const cur = stock.currency;
  const unit = cur === 'USD' ? '$' : '₩';

  return (
    <Card className="gap-4 p-[18px]">
      <h3 className="font-semibold">주식 잔고 및 매매일지</h3>

      {holding ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl border bg-secondary/40 p-4 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="매수 단가(평단)" value={formatMoney(holding.avgBuyPrice, cur)} />
          <Stat label="보유 수량" value={`${holding.qty.toLocaleString()}주`} />
          <Stat label="매입 금액" value={formatMoney(holding.buyAmount, cur)} />
          <Stat label="현재 단가" value={currentPriceMinor != null ? formatMoney(currentPriceMinor, cur) : '—'} />
          <Stat label="평가 금액" value={ev ? formatMoney(ev.currentValue, cur) : '—'} />
          <Stat
            label="수익률"
            value={ev ? `${ev.evalRate > 0 ? '+' : ''}${ev.evalRate}%` : '—'}
            className={ev ? pnlColor(ev.evalPnl) : ''}
          />
          <Stat
            label="평가 손익"
            value={ev ? `${ev.evalPnl > 0 ? '+' : ''}${formatMoney(ev.evalPnl, cur)}` : '—'}
            className={ev ? pnlColor(ev.evalPnl) : ''}
          />
          {holding.realizedPnl !== 0 && (
            <Stat
              label="실현 손익(누적)"
              value={`${holding.realizedPnl > 0 ? '+' : ''}${formatMoney(holding.realizedPnl, cur)}`}
              className={pnlColor(holding.realizedPnl)}
            />
          )}
        </div>
      ) : (
        <p className="rounded-xl border bg-secondary/40 p-4 text-sm text-muted-foreground">
          보유 중인 수량이 없습니다. 매수 기록을 추가하면 잔고가 표시됩니다.
        </p>
      )}

      <div className="space-y-3 rounded-xl border p-4">
        <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-[3px]">
          {(
            [
              ['buy', '매수'],
              ['sell', '매도'],
            ] as const
          ).map(([s, label]) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                side === s
                  ? `${s === 'buy' ? 'bg-up-soft text-up' : 'bg-down-soft text-down'} shadow-sm`
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="t-price">
              {side === 'buy' ? '매수' : '매도'} 단가 ({unit})
            </Label>
            <Input
              id="t-price"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={cur === 'USD' ? '예: 200.50' : '예: 80000'}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-qty">수량</Label>
            <Input id="t-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="예: 10" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-date">거래일</Label>
            <Input id="t-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {side === 'sell' && (
          <div className="space-y-1.5">
            <Label htmlFor="t-fee">매매비용 (세금+수수료, {unit})</Label>
            <Input
              id="t-fee"
              inputMode="decimal"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder={cur === 'USD' ? '예: 1.50 (선택)' : '예: 78000 (선택)'}
            />
            <p className="text-[11px] text-muted-foreground">입력 시 실현 손익에서 차감됩니다. 비워두면 0.</p>
          </div>
        )}
        {isKr && (
          <button
            type="button"
            role="switch"
            aria-checked={isEtf}
            onClick={() => setIsEtf((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              isEtf ? 'border-accent bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className={`size-2 rounded-full ${isEtf ? 'bg-accent-foreground' : 'bg-muted-foreground/40'}`} />
            ETF (매도 시 거래세 면제)
          </button>
        )}
        <Button onClick={add} disabled={submitting} size="sm" className="w-full sm:w-auto">
          <Plus data-icon="inline-start" />
          {submitting ? '저장 중…' : '기록 추가'}
        </Button>
      </div>

      {trades.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">매매 내역 {trades.length}건</p>
          <div className="divide-y divide-border/60">
            {trades.map((t) => {
              const realized = realizedMap.get(t.id);
              const amount = t.price * t.qty;
              return (
                <div key={t.id} className="flex items-center gap-3 py-2.5">
                  <Badge
                    variant="outline"
                    className={t.side === 'buy' ? 'border-up/30 bg-up-soft text-up' : 'border-down/30 bg-down-soft text-down'}
                  >
                    {t.side === 'buy' ? '매수' : '매도'}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm tabular-nums">
                      {formatMoney(t.price, cur)} × {t.qty.toLocaleString()}주 ={' '}
                      <span className="font-medium">{formatMoney(amount, cur)}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {t.tradeDate}
                      {t.side === 'sell' && t.fee > 0 && <span className="ml-2">비용 {formatMoney(t.fee, cur)}</span>}
                      {t.side === 'sell' && realized && (
                        <span className={`ml-2 ${pnlColor(realized.pnl)}`}>
                          실현 {realized.pnl > 0 ? '+' : ''}
                          {formatMoney(realized.pnl, cur)} ({realized.rate > 0 ? '+' : ''}
                          {realized.rate}%)
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="text-muted-foreground"
                    aria-label="기록 삭제"
                    onClick={() => remove(t.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
