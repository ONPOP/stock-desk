// 예수금 입출금 CRUD (V2 · D11) — cash_ledger. 본인 행만(RLS). 금액은 최소 단위 정수.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ValidationError } from '@/lib/errors';
import type { CashTransaction, CashTxType, Currency } from '@/types';

interface CashRow {
  id: string;
  currency: string;
  type: string;
  amount: number | string;
  tx_date: string;
  memo: string | null;
  created_at: string;
}

function rowToTx(r: CashRow): CashTransaction {
  return {
    id: r.id,
    currency: r.currency as Currency,
    type: r.type as CashTxType,
    amount: Number(r.amount),
    txDate: r.tx_date,
    memo: r.memo,
    createdAt: r.created_at,
  };
}

const COLS = 'id, currency, type, amount, tx_date, memo, created_at';

/** 사용자 전체 입출금 내역(최신순) */
export async function listCashTx(db: SupabaseClient, userId: string): Promise<CashTransaction[]> {
  const { data, error } = await db
    .from('cash_ledger')
    .select(COLS)
    .eq('user_id', userId)
    .order('tx_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    // 마이그레이션 0009 미적용(테이블 없음)이면 예수금 0으로 graceful degrade — 기존 기능 보존.
    // 42P01=postgres 직결, PGRST205=PostgREST 스키마 캐시에 테이블 없음.
    if (error.code === '42P01' || error.code === 'PGRST205' || /(does not exist|schema cache|find the table)/i.test(error.message)) {
      return [];
    }
    throw new Error(`예수금 내역 조회 실패: ${error.message}`);
  }
  return (data as CashRow[]).map(rowToTx);
}

export interface InsertCashTxInput {
  currency: Currency;
  type: CashTxType;
  amount: number;
  txDate: string;
  memo?: string | null;
}

export async function insertCashTx(
  db: SupabaseClient,
  userId: string,
  input: InsertCashTxInput,
): Promise<CashTransaction> {
  if (input.amount <= 0) throw new ValidationError('금액은 0보다 커야 합니다.');
  const { data, error } = await db
    .from('cash_ledger')
    .insert({
      user_id: userId,
      currency: input.currency,
      type: input.type,
      amount: input.amount,
      tx_date: input.txDate,
      memo: input.memo ?? null,
    })
    .select(COLS)
    .single();
  if (error) throw new Error(`예수금 내역 저장 실패: ${error.message}`);
  return rowToTx(data as CashRow);
}

export async function deleteCashTx(db: SupabaseClient, userId: string, id: string): Promise<void> {
  const { error } = await db.from('cash_ledger').delete().eq('user_id', userId).eq('id', id);
  if (error) throw new Error(`예수금 내역 삭제 실패: ${error.message}`);
}
