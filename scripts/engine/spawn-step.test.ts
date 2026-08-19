import { describe, expect, it, vi } from 'vitest';
import { runStep } from './spawn-step';

const node = (code: string) => ['-e', code];

describe('runStep', () => {
  it('성공하면 ok', async () => {
    const r = await runStep('node', node('process.stdout.write("hi")'), 'ok-step');
    expect(r.ok).toBe(true);
  });

  it('실패하면 exit 코드를 사유에 담는다', async () => {
    const r = await runStep('node', node('process.exit(3)'), 'bad-step');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('exit 3');
    expect(r.reason).toContain('bad-step');
  });

  it('capture 시 stdout·stderr를 모두 모은다', async () => {
    const r = await runStep(
      'node',
      node('process.stdout.write("OUT\\n");process.stderr.write("ERRTEXT\\n");process.exit(1)'),
      'cap',
      { capture: true },
    );
    expect(r.output).toContain('OUT');
    expect(r.output).toContain('ERRTEXT');
  });

  it('capture 해도 출력을 그대로 흘려보낸다 (로그가 비면 원인 추적이 불가능해진다)', async () => {
    const seen: string[] = [];
    const out = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
      seen.push(String(c));
      return true;
    });
    const err = vi.spyOn(process.stderr, 'write').mockImplementation((c: unknown) => {
      seen.push(String(c));
      return true;
    });
    try {
      await runStep('node', node('process.stdout.write("PASSOUT");process.stderr.write("PASSERR")'), 'tee', {
        capture: true,
      });
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
    const joined = seen.join('');
    expect(joined).toContain('PASSOUT');
    expect(joined).toContain('PASSERR');
  });

  it('capture 버퍼는 상한이 있고 꼬리를 남긴다', async () => {
    const r = await runStep(
      'node',
      node('process.stdout.write("x".repeat(200000));process.stdout.write("TAILMARK")'),
      'big',
      { capture: true, maxCapture: 4096 },
    );
    expect(r.output!.length).toBeLessThanOrEqual(4096);
    expect(r.output).toContain('TAILMARK');
  });

  it('실행 불가한 명령은 사유를 준다', async () => {
    const r = await runStep('this-command-does-not-exist-xyz', [], 'missing');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('실행 불가');
  });
});
