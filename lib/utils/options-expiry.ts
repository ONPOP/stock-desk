// 미국 주식 옵션 만기일 계산 — 규칙 기반(무료, API 불필요).
// 월간 옵션은 매월 셋째 금요일에 만기. 장기옵션(LEAPS)은 매년 1월 셋째 금요일 만기.

/** 해당 연·월(0-based)의 셋째 금요일을 'YYYY-MM-DD'로 반환. */
export function thirdFriday(year: number, month0: number): string {
  // 1일의 요일에서 첫 금요일까지의 오프셋 + 14일
  const firstDow = new Date(Date.UTC(year, month0, 1)).getUTCDay(); // 0=일
  const firstFriday = ((5 - firstDow + 7) % 7) + 1; // 그 달 첫 금요일의 '일'
  const day = firstFriday + 14;
  const m = String(month0 + 1).padStart(2, '0');
  return `${year}-${m}-${String(day).padStart(2, '0')}`;
}

/**
 * 기준일(today) 이후 도래하는 LEAPS 만기일(매년 1월 셋째 금) 최대 count개.
 * @param today 'YYYY-MM-DD'
 */
export function upcomingLeapsExpiries(today: string, count = 3): string[] {
  const baseYear = Number(today.slice(0, 4));
  const out: string[] = [];
  for (let y = baseYear; out.length < count && y <= baseYear + count + 1; y++) {
    const d = thirdFriday(y, 0); // 1월
    if (d >= today) out.push(d);
  }
  return out;
}
