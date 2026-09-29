// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { createElement, useState } from 'react';
import { useInViewport } from './use-in-viewport';

/**
 * jsdom에는 IntersectionObserver 구현이 없다. 실제 브라우저 동작(옵저버 인스턴스가
 * 대상별 콜백을 들고 있다가 entries로 일괄 통지)을 흉내내는 최소 스텁을 직접 만들어
 * 관측 콜백을 수동으로 발화시킨다.
 */
type ObserverCallback = (entries: Array<{ target: Element; isIntersecting: boolean }>) => void;

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: ObserverCallback;
  options: { rootMargin?: string } | undefined;
  observed = new Set<Element>();
  disconnected = false;

  constructor(callback: ObserverCallback, options?: { rootMargin?: string }) {
    this.callback = callback;
    this.options = options;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(target: Element) {
    this.observed.add(target);
  }

  unobserve(target: Element) {
    this.observed.delete(target);
  }

  disconnect() {
    this.disconnected = true;
    this.observed.clear();
  }

  /** 특정 대상에 대해 관측 콜백을 수동으로 발화 */
  fire(target: Element, isIntersecting: boolean) {
    this.callback([{ target, isIntersecting }]);
  }
}

let originalIO: unknown;

beforeEach(() => {
  originalIO = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  FakeIntersectionObserver.instances = [];
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIntersectionObserver;
});

afterEach(() => {
  cleanup();
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = originalIO;
});

/** 훅의 반환값을 렌더링된 DOM 요소에 바인딩해 관찰할 수 있는 테스트용 컴포넌트 */
function Probe({
  rootMargin,
  onRender,
}: {
  rootMargin?: string;
  onRender: (visible: boolean, el: HTMLDivElement | null) => void;
}) {
  const [ref, visible] = useInViewport<HTMLDivElement>(rootMargin !== undefined ? { rootMargin } : undefined);
  onRender(visible, ref.current);
  return createElement('div', { ref, 'data-testid': 'probe' });
}

describe('useInViewport', () => {
  it('초기 visible은 false다', () => {
    const seen: boolean[] = [];
    render(createElement(Probe, { onRender: (v) => seen.push(v) }));
    expect(seen[0]).toBe(false);
  });

  it('관측 콜백이 isIntersecting: true를 주면 visible이 true가 된다', () => {
    const seen: boolean[] = [];
    const { container } = render(createElement(Probe, { onRender: (v) => seen.push(v) }));
    const el = container.querySelector('[data-testid="probe"]') as HTMLDivElement;

    const observer = FakeIntersectionObserver.instances[0];
    act(() => {
      observer.fire(el, true);
    });

    expect(seen.at(-1)).toBe(true);
  });

  it('false로 돌아오면 visible도 false가 된다', () => {
    const seen: boolean[] = [];
    const { container } = render(createElement(Probe, { onRender: (v) => seen.push(v) }));
    const el = container.querySelector('[data-testid="probe"]') as HTMLDivElement;
    const observer = FakeIntersectionObserver.instances[0];

    act(() => {
      observer.fire(el, true);
    });
    expect(seen.at(-1)).toBe(true);

    act(() => {
      observer.fire(el, false);
    });
    expect(seen.at(-1)).toBe(false);
  });

  it('같은 rootMargin으로 훅 3개 → IntersectionObserver 생성자는 1번만 호출된다', () => {
    render(createElement('div', null, [
      createElement(Probe, { key: 1, rootMargin: '100px', onRender: () => {} }),
      createElement(Probe, { key: 2, rootMargin: '100px', onRender: () => {} }),
      createElement(Probe, { key: 3, rootMargin: '100px', onRender: () => {} }),
    ]));

    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    expect(FakeIntersectionObserver.instances[0].observed.size).toBe(3);
  });

  it('다른 rootMargin이면 별도 옵저버가 만들어진다', () => {
    render(createElement('div', null, [
      createElement(Probe, { key: 1, rootMargin: '100px', onRender: () => {} }),
      createElement(Probe, { key: 2, rootMargin: '200px', onRender: () => {} }),
    ]));

    expect(FakeIntersectionObserver.instances).toHaveLength(2);
  });

  it('언마운트 시 unobserve가 불리고, 마지막 대상이면 disconnect한다', () => {
    const { container, unmount } = render(createElement(Probe, { onRender: () => {} }));
    const el = container.querySelector('[data-testid="probe"]') as HTMLDivElement;
    const observer = FakeIntersectionObserver.instances[0];
    expect(observer.observed.has(el)).toBe(true);

    unmount();

    expect(observer.observed.has(el)).toBe(false);
    expect(observer.disconnected).toBe(true);
  });

  it('마지막 대상이 아니면 unobserve만 하고 disconnect하지 않는다', () => {
    let unmountOne: () => void = () => {};
    function Wrapper() {
      const [showFirst, setShowFirst] = useState(true);
      unmountOne = () => setShowFirst(false);
      return createElement('div', null, [
        showFirst ? createElement(Probe, { key: 1, onRender: () => {} }) : null,
        createElement(Probe, { key: 2, onRender: () => {} }),
      ]);
    }

    render(createElement(Wrapper));
    const observer = FakeIntersectionObserver.instances[0];
    expect(observer.observed.size).toBe(2);

    act(() => {
      unmountOne();
    });

    expect(observer.observed.size).toBe(1);
    expect(observer.disconnected).toBe(false);
  });

  it('globalThis.IntersectionObserver가 없으면 visible이 true다', () => {
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;

    const seen: boolean[] = [];
    render(createElement(Probe, { onRender: (v) => seen.push(v) }));

    expect(seen.at(-1)).toBe(true);
  });

  it('IntersectionObserver 유무와 무관하게 첫 렌더는 false다 (SSR과 hydration 첫 렌더 일치)', () => {
    // 서버에는 IntersectionObserver가 없다 — 첫 렌더 값이 환경에 따라 달라지면 hydration 불일치가 난다
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;

    const seen: boolean[] = [];
    render(createElement(Probe, { onRender: (v) => seen.push(v) }));

    expect(seen[0]).toBe(false);
    expect(seen.at(-1)).toBe(true); // 폴백은 마운트 후(effect)에 켜진다
  });
});
