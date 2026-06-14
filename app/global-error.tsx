'use client';

// 루트 레이아웃 에러 바운더리 (html/body 포함). 최후 방어선.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', textAlign: 'center' }}>
        <h2>문제가 발생했습니다</h2>
        <p>잠시 후 다시 시도해주세요.</p>
        <button onClick={reset} style={{ marginTop: '1rem', padding: '0.5rem 1rem', cursor: 'pointer' }}>
          다시 시도
        </button>
      </body>
    </html>
  );
}
