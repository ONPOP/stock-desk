'use client';

// 실시간 메모장 — 세로 긴 노트. Bold/Italic/Underline + 글자 크기(S/M/L) 서식.
// 내용은 localStorage에 즉시 저장(새로고침·재접속에도 유지). 폰트: Pretendard medium·검정·28px 기준.
import { useEffect, useRef, type ReactNode } from 'react';
import { Bold, Italic, Underline } from 'lucide-react';

const STORAGE_KEY = 'stockdesk:memo';
const SIZES = [
  { label: 'S', px: 20 },
  { label: 'M', px: 28 },
  { label: 'L', px: 40 },
] as const;

export function MemoPanel() {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = editorRef.current;
    if (el) el.innerHTML = localStorage.getItem(STORAGE_KEY) ?? '';
  }, []);

  function save() {
    const el = editorRef.current;
    if (el) localStorage.setItem(STORAGE_KEY, el.innerHTML);
  }

  // ponytail: execCommand는 deprecated지만 라이브러리 없이 리치텍스트 서식을 얻는 가장 짧은 길. 한계 오면 tiptap 등으로 교체.
  function cmd(command: string) {
    document.execCommand(command);
    editorRef.current?.focus();
    save();
  }

  function setSize(px: number) {
    document.execCommand('fontSize', false, '7'); // <font size=7> 로 감싼 뒤 inline px 로 치환
    editorRef.current?.querySelectorAll('font[size="7"]').forEach((f) => {
      const s = f as HTMLElement;
      s.removeAttribute('size');
      s.style.fontSize = `${px}px`;
    });
    editorRef.current?.focus();
    save();
  }

  return (
    <div className="flex h-[72vh] w-[320px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl">
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <ToolBtn onClick={() => cmd('bold')} label="굵게"><Bold className="size-4" /></ToolBtn>
        <ToolBtn onClick={() => cmd('italic')} label="기울임"><Italic className="size-4" /></ToolBtn>
        <ToolBtn onClick={() => cmd('underline')} label="밑줄"><Underline className="size-4" /></ToolBtn>
        <span className="mx-1 h-5 w-px bg-border" />
        {SIZES.map(({ label, px }) => (
          <ToolBtn key={label} onClick={() => setSize(px)} label={`글자 크기 ${label}`}>
            <span className="text-[13px] font-bold">{label}</span>
          </ToolBtn>
        ))}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={save}
        data-placeholder="메모를 입력하세요…"
        aria-label="실시간 메모"
        className="memo-editor flex-1 overflow-y-auto px-4 py-3 text-[28px] leading-snug font-medium text-black outline-none"
        style={{ fontFamily: '"Pretendard Variable", Pretendard, var(--font-sans), sans-serif' }}
      />
    </div>
  );
}

function ToolBtn({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()} // 에디터 선택 영역 유지
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}
