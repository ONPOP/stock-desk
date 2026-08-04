// 크론 ↔ 설정 UI 변환 (D16).
// 사용자에게 cron 문자열을 보여주지 않기 위한 얇은 어댑터. 슬롯 스케줄은 '하루 한 번, 특정 요일'이
// 사실상 전부라 그 형태만 왕복 변환을 보장하고, 그 밖의 크론은 편집 불가로 표시한다.

import { parseCron } from '@/lib/engine/launchd';

export interface SlotTimeUi {
  hour: number;
  minute: number;
  /** 0=일요일 … 6=토요일. 빈 배열이면 매일 */
  weekdays: number[];
}

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export class CronUiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CronUiError';
  }
}

/** UI 값 → cron. 분·시는 단일 값만 만든다 */
export function toCron(ui: SlotTimeUi): string {
  if (!Number.isInteger(ui.hour) || ui.hour < 0 || ui.hour > 23) {
    throw new CronUiError('시는 0~23 사이여야 합니다.');
  }
  if (!Number.isInteger(ui.minute) || ui.minute < 0 || ui.minute > 59) {
    throw new CronUiError('분은 0~59 사이여야 합니다.');
  }
  const days = [...new Set(ui.weekdays)].sort((a, b) => a - b);
  if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new CronUiError('요일 값이 올바르지 않습니다.');
  }
  const dow = days.length === 0 || days.length === 7 ? '*' : days.join(',');
  return `${ui.minute} ${ui.hour} * * ${dow}`;
}

/**
 * cron → UI 값. 분·시가 여러 개인 크론은 UI로 표현할 수 없어 null을 반환하고,
 * 호출부는 해당 슬롯을 '고급 설정(직접 편집 필요)'으로 표시한다.
 */
export function fromCron(cron: string): SlotTimeUi | null {
  let spec: ReturnType<typeof parseCron>;
  try {
    spec = parseCron(cron);
  } catch {
    return null;
  }
  if (spec.hours.length !== 1 || spec.minutes.length !== 1) return null;
  return {
    hour: spec.hours[0],
    minute: spec.minutes[0],
    weekdays: spec.weekdays ?? [],
  };
}

/** 표시용 요약 — "14:50 · 월화수목금" */
export function describeSlotTime(cron: string): string {
  const ui = fromCron(cron);
  if (!ui) return cron;
  const time = `${String(ui.hour).padStart(2, '0')}:${String(ui.minute).padStart(2, '0')}`;
  const days =
    ui.weekdays.length === 0 ? '매일' : ui.weekdays.map((d) => WEEKDAY_LABELS[d]).join('');
  return `${time} · ${days}`;
}
