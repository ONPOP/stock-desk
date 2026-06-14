// 뉴스 중복 클러스터링 (F5) — 제목 토큰 자카드 유사도 기반 룰베이스.
// AI 없이 중복 기사를 묶어 대표 1건만 노출(중복 노출률 <10% 목표, PRD F5).

/** 제목 → 2글자 이상 토큰 집합 (한글·영숫자) */
export function titleTokens(title: string): Set<string> {
  const cleaned = title.toLowerCase().replace(/[^가-힣a-z0-9\s]/g, ' ');
  return new Set(cleaned.split(/\s+/).filter((w) => w.length >= 2));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/**
 * 제목 배열 → 클러스터 인덱스 배열. 기존 클러스터 대표와 유사도 ≥ threshold면 합류.
 * 같은 인덱스 = 같은 클러스터.
 */
export function assignClusters(titles: string[], threshold = 0.5): number[] {
  const reps: Array<{ cluster: number; tokens: Set<string> }> = [];
  const out: number[] = [];
  let next = 0;
  for (const title of titles) {
    const toks = titleTokens(title);
    let matched = -1;
    for (const rep of reps) {
      if (jaccard(toks, rep.tokens) >= threshold) {
        matched = rep.cluster;
        break;
      }
    }
    if (matched >= 0) {
      out.push(matched);
    } else {
      reps.push({ cluster: next, tokens: toks });
      out.push(next);
      next += 1;
    }
  }
  return out;
}

/** 클러스터별 대표 1건(가장 최신 publishedAt) 선택 — 중복 제거 */
export function dedupeByCluster<T extends { title: string; publishedAt: string | null }>(items: T[]): T[] {
  const clusters = assignClusters(items.map((i) => i.title));
  const best = new Map<number, T>();
  items.forEach((item, i) => {
    const c = clusters[i];
    const cur = best.get(c);
    if (!cur || (item.publishedAt ?? '') > (cur.publishedAt ?? '')) best.set(c, item);
  });
  return [...best.values()];
}
