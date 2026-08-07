'use client';

// 뷰포트 가시성 훅 — 화면 밖 행의 폴링을 끄기 위한 게이팅용(예: 대형 워치리스트 카드/행).
// IntersectionObserver는 rootMargin 값별로 모듈에서 공유한다: 행마다 새 옵저버를 만들면
// 행 수만큼 옵저버가 생겨 오히려 비용이 는다. 같은 rootMargin을 쓰는 모든 훅은 옵저버 1개를
// 같이 쓰고, 대상별 콜백만 따로 관리한다.
import { useEffect, useRef, useState, type RefObject } from 'react';

export interface InViewportOptions {
  /** 화면에 들어오기 전에 미리 켜는 여유. 기본 '200px' */
  rootMargin?: string;
}

const DEFAULT_ROOT_MARGIN = '200px';

type VisibilityCallback = (isIntersecting: boolean) => void;

interface SharedObserver {
  observer: IntersectionObserver;
  callbacks: Map<Element, VisibilityCallback>;
}

/** rootMargin 문자열 → 그 값으로 만든 공유 IntersectionObserver */
const sharedObservers = new Map<string, SharedObserver>();

function getOrCreateObserver(rootMargin: string): SharedObserver {
  const existing = sharedObservers.get(rootMargin);
  if (existing) return existing;

  const callbacks = new Map<Element, VisibilityCallback>();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      callbacks.get(entry.target)?.(entry.isIntersecting);
    }
  }, { rootMargin });

  const shared: SharedObserver = { observer, callbacks };
  sharedObservers.set(rootMargin, shared);
  return shared;
}

/**
 * 대상 엘리먼트를 공유 옵저버에 등록한다. 반환된 함수를 호출하면 구독을 해제하고,
 * 그 옵저버의 마지막 대상이었다면 옵저버 자체를 disconnect해 맵에서 지운다(다음 마운트에서
 * 새 옵저버를 만든다).
 */
function subscribeInViewport(el: Element, rootMargin: string, onChange: VisibilityCallback): () => void {
  const shared = getOrCreateObserver(rootMargin);
  shared.callbacks.set(el, onChange);
  shared.observer.observe(el);

  return () => {
    shared.callbacks.delete(el);
    shared.observer.unobserve(el);
    if (shared.callbacks.size === 0) {
      shared.observer.disconnect();
      sharedObservers.delete(rootMargin);
    }
  };
}

export function useInViewport<T extends Element>(
  opts?: InViewportOptions,
): [ref: RefObject<T | null>, visible: boolean] {
  const rootMargin = opts?.rootMargin ?? DEFAULT_ROOT_MARGIN;
  const ref = useRef<T | null>(null);
  // IntersectionObserver가 없는 환경(구형·테스트)에서는 폴링이 영영 안 켜지는 것보다 나으므로
  // true로 떨어진다. 있으면 관측 콜백이 오기 전까지는 false를 유지한다.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const el = ref.current;
    if (!el) return;

    return subscribeInViewport(el, rootMargin, setVisible);
  }, [rootMargin]);

  return [ref, visible];
}
