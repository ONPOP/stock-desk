// 시간 처리 — UTC 저장, KST/EST 표시 변환 (PRD 16장)

export const KST_TZ = 'Asia/Seoul';
export const EST_TZ = 'America/New_York';

/** UTC ISO 문자열 → 지정 타임존의 부분 값 추출 */
function getParts(utcIso: string | Date, timeZone: string) {
  const date = typeof utcIso === 'string' ? new Date(utcIso) : utcIso;
  if (Number.isNaN(date.getTime())) {
    throw new Error(`잘못된 날짜 값: ${utcIso}`);
  }
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    // Intl은 24시를 "24"로 줄 수 있음 → "00" 정규화
    hour: parts.hour === '24' ? '00' : parts.hour,
    minute: parts.minute,
    second: parts.second,
    weekday: parts.weekday as 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun',
  };
}

/** UTC → "YYYY-MM-DD HH:mm" (해당 타임존 기준) */
export function formatInTz(utcIso: string | Date, timeZone: string): string {
  const p = getParts(utcIso, timeZone);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

export function formatKst(utcIso: string | Date): string {
  return formatInTz(utcIso, KST_TZ);
}

export function formatEst(utcIso: string | Date): string {
  return formatInTz(utcIso, EST_TZ);
}

/** 해당 타임존의 날짜(YYYY-MM-DD) */
export function dateInTz(utcIso: string | Date, timeZone: string): string {
  const p = getParts(utcIso, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** 해당 타임존의 분 단위 시각 (0~1439) + 요일 */
export function minutesAndWeekdayInTz(utcIso: string | Date, timeZone: string) {
  const p = getParts(utcIso, timeZone);
  return {
    minutes: Number(p.hour) * 60 + Number(p.minute),
    weekday: p.weekday,
    isoDate: `${p.year}-${p.month}-${p.day}`,
  };
}

/**
 * KIS 응답의 현지 일자+시각 → UTC ISO.
 * 예: kisLocalToUtc("20260612", "153000", KST_TZ)
 */
export function kisLocalToUtc(yyyymmdd: string, hhmmss: string, timeZone: string): string {
  if (!/^\d{8}$/.test(yyyymmdd) || !/^\d{6}$/.test(hhmmss)) {
    throw new Error(`잘못된 KIS 일시 형식: ${yyyymmdd} ${hhmmss}`);
  }
  const y = Number(yyyymmdd.slice(0, 4));
  const mo = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  const h = Number(hhmmss.slice(0, 2));
  const mi = Number(hhmmss.slice(2, 4));
  const s = Number(hhmmss.slice(4, 6));
  // 타임존 오프셋을 모르는 상태에서 현지시각 → UTC 변환:
  // UTC로 가정한 값에서 시작해 해당 TZ로 다시 읽었을 때의 차이를 보정 (DST 안전)
  let guess = Date.UTC(y, mo - 1, d, h, mi, s);
  for (let i = 0; i < 2; i++) {
    const p = getParts(new Date(guess), timeZone);
    const seen = Date.UTC(
      Number(p.year), Number(p.month) - 1, Number(p.day),
      Number(p.hour), Number(p.minute), Number(p.second),
    );
    const want = Date.UTC(y, mo - 1, d, h, mi, s);
    guess += want - seen;
  }
  return new Date(guess).toISOString();
}
