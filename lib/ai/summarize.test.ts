import { describe, it, expect, vi, beforeEach } from 'vitest';

// AI SDK 모킹 — 실제 OpenAI 호출 없이 래퍼 로직만 검증
vi.mock('ai', () => ({
  generateObject: vi.fn(async () => ({ object: { summary: '요약문', sentiment: 'positive' }, usage: { inputTokens: 100, outputTokens: 20 } })),
  generateText: vi.fn(async () => ({ text: '  공시 1줄 요약  ', usage: { inputTokens: 50, outputTokens: 10 } })),
}));

import { generateObject, generateText } from 'ai';
import { mapWithConcurrency, summarizeNewsItem, summarizeDisclosure, generateBriefingMd } from './summarize';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('mapWithConcurrency', () => {
  it('순서를 보존하며 매핑', async () => {
    const out = await mapWithConcurrency([1, 2, 3], 2, async (x) => x * 10);
    expect(out).toEqual([10, 20, 30]);
  });
  it('실패 항목은 null (부분 실패 허용)', async () => {
    const out = await mapWithConcurrency([1, 2, 3], 2, async (x) => {
      if (x === 2) throw new Error('boom');
      return x;
    });
    expect(out).toEqual([1, null, 3]);
  });
  it('동시 실행이 concurrency를 넘지 않음', async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5], 2, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return 0;
    });
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe('summarize 래퍼', () => {
  it('summarizeNewsItem → 요약·감성 + usage', async () => {
    const r = await summarizeNewsItem('key', { title: 'T' });
    expect(r.result).toEqual({ summary: '요약문', sentiment: 'positive' });
    expect(r.usage).toEqual({ inputTokens: 100, outputTokens: 20 });
    expect(generateObject).toHaveBeenCalledOnce();
  });
  it('summarizeDisclosure → trim된 텍스트 + usage', async () => {
    const r = await summarizeDisclosure('key', { formType: '8-K', title: 'X' });
    expect(r.text).toBe('공시 1줄 요약');
    expect(r.usage).toEqual({ inputTokens: 50, outputTokens: 10 });
    expect(generateText).toHaveBeenCalledOnce();
  });
  it('generateBriefingMd → 텍스트 + usage', async () => {
    const r = await generateBriefingMd('key', { dateLabel: '2026-06-14', indices: [], watchlistNews: [], events: [] });
    expect(r.text).toBe('공시 1줄 요약');
    expect(r.usage.inputTokens).toBe(50);
  });
});
