// 슬롯 단계 실행 헬퍼 — 자식 프로세스를 돌리고 성공 여부와(선택) 출력을 돌려준다.
//
// 기본은 stdio 상속이다(로그 파일에 그대로 흘러가야 한다). capture를 켜면 stdout/stderr를
// 파이프로 받아 **흘려보내면서 동시에** 꼬리를 모은다. 상속만 쓰면 부모가 자식의 출력을
// 볼 수 없어서, 실패 원인이 인증 만료인지 프롬프트 오류인지 구분할 수 없다.
//
// server-only를 import하지 않는다 — tsx로 직접 실행되는 경로다.
import { spawn } from 'node:child_process';

export interface StepResult {
  ok: boolean;
  reason?: string;
  /** capture를 켰을 때만 채워진다. 상한을 넘으면 뒤쪽(꼬리)만 남는다. */
  output?: string;
}

export interface RunStepOptions {
  capture?: boolean;
  /** 모아둘 출력 상한(바이트 아닌 문자 수). 기본 32KB. */
  maxCapture?: number;
}

const DEFAULT_MAX_CAPTURE = 32 * 1024;

export function runStep(
  cmd: string,
  args: string[],
  label: string,
  opts: RunStepOptions = {},
): Promise<StepResult> {
  const { capture = false, maxCapture = DEFAULT_MAX_CAPTURE } = opts;

  return new Promise((resolve) => {
    console.log(`\n▶ ${label}\n  $ ${cmd} ${args.map((a) => (a.includes(' ') ? '"…"' : a)).join(' ')}`);

    const child = spawn(cmd, args, {
      stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
      env: process.env,
    });

    let buf = '';
    if (capture) {
      const tee = (stream: NodeJS.ReadableStream | null, sink: NodeJS.WriteStream) => {
        stream?.on('data', (chunk: Buffer) => {
          sink.write(chunk);
          buf += chunk.toString('utf8');
          if (buf.length > maxCapture) buf = buf.slice(-maxCapture);
        });
      };
      tee(child.stdout, process.stdout);
      tee(child.stderr, process.stderr);
    }

    child.on('error', (err) => resolve({ ok: false, reason: `${label} 실행 불가: ${err.message}` }));
    // 'exit'이 아니라 'close'를 기다린다 — 파이프가 닫힌 뒤여야 출력이 다 모인다.
    child.on('close', (code) =>
      resolve(
        code === 0
          ? { ok: true, output: capture ? buf : undefined }
          : { ok: false, reason: `${label} 실패 (exit ${code})`, output: capture ? buf : undefined },
      ),
    );
  });
}
