import { describe, it, expect } from 'vitest';
import { stripHtml, parsePubDate, buildNaverNews } from './news';

describe('stripHtml', () => {
  it('HTML 태그·엔티티 제거', () => {
    expect(stripHtml('<b>삼성</b>전자 &quot;호재&quot; &amp; 상승')).toBe('삼성전자 "호재" & 상승');
    expect(stripHtml('&lt;속보&gt; 실적')).toBe('<속보> 실적');
  });
});

describe('parsePubDate', () => {
  it('RFC822 → UTC ISO', () => {
    expect(parsePubDate('Mon, 11 May 2026 14:30:00 +0900')).toBe('2026-05-11T05:30:00.000Z');
  });
  it('잘못된/빈 값은 null', () => {
    expect(parsePubDate('garbage')).toBeNull();
    expect(parsePubDate(undefined)).toBeNull();
  });
});

describe('buildNaverNews', () => {
  it('정상 항목 매핑(originallink 우선), 태그 제거', () => {
    const rows = buildNaverNews({
      items: [
        {
          title: '<b>삼성전자</b> 신고가',
          originallink: 'https://news.example/1',
          link: 'https://n.news.naver.com/1',
          description: '<b>삼성전자</b>가 신고가를 경신했다.',
          pubDate: 'Mon, 11 May 2026 14:30:00 +0900',
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: '삼성전자 신고가',
      url: 'https://news.example/1',
      source: '네이버뉴스',
      publishedAt: '2026-05-11T05:30:00.000Z',
    });
    expect(rows[0].body).toBe('삼성전자가 신고가를 경신했다.');
  });

  it('빈 items / 제목·링크 누락 항목 제외', () => {
    expect(buildNaverNews({})).toEqual([]);
    expect(buildNaverNews({ items: [{ title: '제목만' }, { originallink: 'http://x' }] })).toEqual([]);
  });
});
