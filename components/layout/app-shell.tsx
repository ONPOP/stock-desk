'use client';

// PC 사이드바 / 모바일 하단 탭 — lg(1024px) 분기 (D2, PRD 7장)
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';

// PC 사이드바 (노트 포함 6개)
const NAV_ITEMS = [
  { href: '/', label: '대시보드', icon: '⌂' },
  { href: '/calendar', label: '캘린더', icon: '📅' },
  { href: '/stocks', label: '내 종목', icon: '📈' },
  { href: '/compare', label: '비교', icon: '⚖' },
  { href: '/notes', label: '노트', icon: '📝' },
  { href: '/paper', label: '모의투자', icon: '💼' },
  { href: '/settings', label: '설정', icon: '⚙' },
] as const;

// 모바일 하단 탭은 PRD 7장 고정 5개 (비교·노트 제외 — 사이드바·종목상세에서 접근)
const HIDDEN_ON_MOBILE = new Set(['/notes', '/compare']);
const BOTTOM_TABS = NAV_ITEMS.filter((i) => !HIDDEN_ON_MOBILE.has(i.href));

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // 로그인 화면은 내비게이션 없이 렌더
  if (pathname.startsWith('/login')) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      {/* PC 사이드바 */}
      <aside className="hidden lg:flex lg:w-56 lg:flex-col lg:border-r lg:bg-sidebar">
        <div className="px-5 py-5">
          <Link href="/" className="text-lg font-bold tracking-tight">
            Stock Desk
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="주 메뉴">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive(pathname, item.href)
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
              )}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* 본문 — 모바일은 하단 탭 높이만큼 패딩 */}
      <main className="flex-1 pb-16 lg:pb-0">{children}</main>

      {/* 모바일 하단 탭 */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 flex border-t bg-background lg:hidden"
        aria-label="하단 메뉴"
      >
        {BOTTOM_TABS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(pathname, item.href) ? 'page' : undefined}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]',
              isActive(pathname, item.href) ? 'font-semibold text-foreground' : 'text-muted-foreground',
            )}
          >
            <span aria-hidden className="text-base leading-none">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
