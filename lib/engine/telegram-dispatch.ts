export const MEDIA_GROUP_MAX = 10;

export type SendUnit = { kind: 'group'; paths: string[] } | { kind: 'photo'; paths: [string] };

export function planSends(slidePaths: string[]): SendUnit[] {
  if (slidePaths.length === 0) return [];
  if (slidePaths.length === 1) return [{ kind: 'photo', paths: [slidePaths[0]] }];

  const result: SendUnit[] = [];
  let remaining = slidePaths.length;
  let offset = 0;

  while (remaining > 0) {
    if (remaining === 1) {
      // 1장 남았으면 photo로
      result.push({ kind: 'photo', paths: [slidePaths[offset]] });
      remaining = 0;
    } else if (remaining <= MEDIA_GROUP_MAX) {
      // 2~10장 남았으면 group으로
      result.push({ kind: 'group', paths: slidePaths.slice(offset, offset + remaining) });
      remaining = 0;
    } else {
      // 11장 이상 남았으면 10장씩 group으로
      result.push({ kind: 'group', paths: slidePaths.slice(offset, offset + MEDIA_GROUP_MAX) });
      remaining -= MEDIA_GROUP_MAX;
      offset += MEDIA_GROUP_MAX;
    }
  }

  return result;
}

export function shouldNotify(slotId: string, enabledSlotIds: string[]): boolean {
  return enabledSlotIds.includes(slotId);
}
