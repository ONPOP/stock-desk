// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react';
import { createElement } from 'react';
import { StockGradeDialog, type GradeTarget } from './stock-grade-dialog';

const target: GradeTarget = { stockId: 's1', name: 'SK하이닉스', current: null };

/** 테스트가 저장 응답 시점을 직접 정하도록 onSave를 대기 상태로 둔다 */
function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(onSave: () => Promise<void>) {
  const onClose = vi.fn();
  const utils = render(
    createElement(StockGradeDialog, { target, onClose, onSave, onClear: vi.fn(async () => {}) }),
  );
  const backdrop = utils.container.querySelector('[role="presentation"]') as HTMLElement;
  return { onClose, backdrop };
}

async function startSave() {
  fireEvent.click(screen.getByRole('radio', { name: 'A' }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
  });
}

afterEach(() => cleanup());

describe('StockGradeDialog 닫기', () => {
  it('저장 중이 아니면 Esc로 닫힌다', () => {
    const { onClose } = setup(vi.fn(async () => {}));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('저장 중 Esc는 무시하고, 응답이 오면 한 번만 닫힌다', async () => {
    const d = deferred();
    const { onClose } = setup(() => d.promise);
    await startSave();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      d.resolve();
      await d.promise;
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('저장 중 배경 클릭은 무시한다', async () => {
    const d = deferred();
    const { onClose, backdrop } = setup(() => d.promise);
    await startSave();

    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      d.resolve();
      await d.promise;
    });
  });

  it('저장이 실패하면 닫지 않고 다시 저장할 수 있다', async () => {
    const d = deferred();
    const { onClose } = setup(() => d.promise);
    await startSave();

    await act(async () => {
      d.reject(new Error('fail'));
      await d.promise.catch(() => {});
    });
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
