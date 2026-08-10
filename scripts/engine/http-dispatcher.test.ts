// engineFetch가 본문을 온전히 보내는지 검증한다 (D19).
//
// 여기서 잡으려는 사고: undici 패키지의 fetch는 Node **전역** FormData를 자기 클래스로 인식하지 못하고,
// 인식하지 못하면 조용히 `String(body)` — 문자열 "[object FormData]" — 를 text/plain으로 보낸다.
// 요청은 200/400으로 성립하므로 예외가 나지 않는다. 2026-08-10 실전에서 텔레그램 슬라이드 발송이
// `Bad Request: parameter "media" is required`로 전부 실패한 원인이 이것이었고,
// JSON 본문만 확인했던 탓에 검증을 통과해버렸다. 그래서 **실제 전송 바이트**를 본다.
import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { engineFetch } from './http-dispatcher';

interface Captured {
  contentType: string;
  body: string;
}

const servers: http.Server[] = [];

afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

/** 요청을 받아 원문 바이트를 그대로 돌려주는 일회용 서버 */
async function capture(send: (url: string) => Promise<unknown>): Promise<Captured> {
  let resolveCaptured: (c: Captured) => void;
  const captured = new Promise<Captured>((r) => {
    resolveCaptured = r;
  });

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      resolveCaptured({
        contentType: String(req.headers['content-type'] ?? ''),
        body: Buffer.concat(chunks).toString('utf8'),
      });
      res.end('ok');
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };

  await send(`http://127.0.0.1:${port}/`);
  return captured;
}

describe('engineFetch', () => {
  it('FormData를 multipart로 보낸다 — 필드가 사라지지 않는다', async () => {
    const form = new FormData();
    form.append('chat_id', '999');
    form.append('photo0', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }), '01.webp');
    form.append('media', JSON.stringify([{ type: 'photo', media: 'attach://photo0' }]));

    const { contentType, body } = await capture((url) => engineFetch(url, { method: 'POST', body: form }));

    expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
    // "[object FormData]"로 떨어지면 아래가 전부 깨진다
    expect(body).toContain('name="chat_id"');
    expect(body).toContain('name="media"');
    expect(body).toContain('name="photo0"');
    expect(body).toContain('attach://photo0');
  });

  it('첨부 파일명을 유지한다 — 확장자로 MIME을 정하는 쪽이 이걸 본다', async () => {
    const form = new FormData();
    form.append('photo', new Blob([new Uint8Array([1])], { type: 'image/webp' }), '07.webp');

    const { body } = await capture((url) => engineFetch(url, { method: 'POST', body: form }));

    expect(body).toContain('filename="07.webp"');
  });

  it('JSON 본문은 그대로 통과시킨다', async () => {
    const { contentType, body } = await capture((url) =>
      engineFetch(url, {
        method: 'POST',
        body: JSON.stringify({ chat_id: '999', text: '안녕' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(contentType).toBe('application/json');
    expect(JSON.parse(body)).toEqual({ chat_id: '999', text: '안녕' });
  });

  it('본문이 없는 요청도 보낸다', async () => {
    const { body } = await capture((url) => engineFetch(url, { method: 'POST' }));
    expect(body).toBe('');
  });
});
