import { describe, it, expect } from 'vitest';
import { titleTokens, jaccard, assignClusters, dedupeByCluster } from './cluster';

describe('titleTokens / jaccard', () => {
  it('2글자 이상 토큰만, 특수문자 제거', () => {
    const t = titleTokens('삼성전자 3분기 "실적" 발표!');
    expect(t.has('삼성전자')).toBe(true);
    expect(t.has('3분기')).toBe(true);
    expect(t.has('실적')).toBe(true);
  });
  it('자카드 유사도', () => {
    expect(jaccard(titleTokens('삼성전자 실적 발표'), titleTokens('삼성전자 실적 공시'))).toBeCloseTo(0.5, 2);
    expect(jaccard(titleTokens('애플 신제품'), titleTokens('삼성 반도체'))).toBe(0);
  });
});

describe('assignClusters', () => {
  it('유사 제목은 같은 클러스터, 다른 주제는 분리', () => {
    const clusters = assignClusters([
      '삼성전자 3분기 실적 발표',
      '삼성전자 3분기 실적 공시',
      '애플 신제품 출시 행사',
    ]);
    expect(clusters[0]).toBe(clusters[1]); // 유사 → 동일 클러스터
    expect(clusters[2]).not.toBe(clusters[0]); // 분리
  });
  it('전부 다르면 각자 클러스터', () => {
    expect(assignClusters(['A 뉴스 하나', 'B 소식 둘', 'C 발표 셋'])).toEqual([0, 1, 2]);
  });
});

describe('dedupeByCluster', () => {
  it('유사 기사 중 최신 1건만 남긴다', () => {
    const items = [
      { title: '삼성전자 실적 발표', publishedAt: '2026-05-01T00:00:00Z' },
      { title: '삼성전자 실적 공시', publishedAt: '2026-05-02T00:00:00Z' }, // 더 최신
      { title: '애플 신제품 출시', publishedAt: '2026-05-01T00:00:00Z' },
    ];
    const result = dedupeByCluster(items);
    expect(result).toHaveLength(2);
    const samsung = result.find((r) => r.title.includes('삼성'));
    expect(samsung?.publishedAt).toBe('2026-05-02T00:00:00Z'); // 최신 대표
  });
});
