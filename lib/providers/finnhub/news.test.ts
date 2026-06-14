import { describe, it, expect } from 'vitest';
import { buildFinnhubNews } from './news';

describe('buildFinnhubNews', () => {
  it('정상 항목 매핑, datetime(초) → ISO', () => {
    const rows = buildFinnhubNews([
      { headline: 'Apple hits record', url: 'https://r.example/1', source: 'Reuters', summary: 'AAPL up', datetime: 1_700_000_000 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: 'Apple hits record',
      url: 'https://r.example/1',
      source: 'Reuters',
      body: 'AAPL up',
    });
    expect(rows[0].publishedAt).toBe(new Date(1_700_000_000 * 1000).toISOString());
  });

  it('headline/url 누락 항목 제외, datetime 0이면 publishedAt null', () => {
    const rows = buildFinnhubNews([
      { headline: 'no url' },
      { url: 'https://x' },
      { headline: 'ok', url: 'https://y', datetime: 0 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].publishedAt).toBeNull();
    expect(rows[0].source).toBe('Finnhub'); // 기본값
  });

  it('빈 배열', () => {
    expect(buildFinnhubNews([])).toEqual([]);
  });
});
