'use client';

// PC 사이드바 / 모바일 하단 탭 — lg(1024px) 분기 (D2, PRD 7장)
// [재설계] 비주얼만 변경: lucide 아이콘 + 인디고 액티브 pill + 브랜드 마크.
// [보존] 라우트 목록·isActive 판정·HIDDEN_ON_MOBILE·lg 분기 그대로.
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, CalendarDays, TrendingUp, Scale, LineChart,
  NotebookPen, Briefcase, Settings, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LogoutButton } from '@/components/auth/logout-button';
import { CalculatorFab } from '@/components/calculator/calculator-fab';
import { StockPet } from '@/components/mascot/stock-pet';

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/', label: '대시보드', icon: LayoutDashboard },
  { href: '/calendar', label: '캘린더', icon: CalendarDays },
  { href: '/stocks', label: '내 종목', icon: TrendingUp },
  { href: '/performance', label: '기간별 수익률', icon: LineChart },
  { href: '/compare', label: '비교', icon: Scale },
  { href: '/notes', label: '노트', icon: NotebookPen },
  { href: '/paper', label: '모의투자', icon: Briefcase },
  { href: '/settings', label: '설정', icon: Settings },
];

// 모바일 하단 탭은 PRD 7장 고정 5개 (비교·노트·수익률 제외 — 사이드바에서 접근)
const HIDDEN_ON_MOBILE = new Set(['/notes', '/compare', '/performance']);
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
      <aside className="sticky top-0 hidden h-screen w-58 shrink-0 flex-col border-r bg-sidebar px-3.5 py-4.5 lg:flex">
        <Link href="/" className="mb-3 flex items-center gap-2.5 px-2 py-1">
          <span className="flex size-9 items-center justify-center rounded-[10px] bg-ink text-ink-foreground shadow-lg">
            <TrendingUp className="size-5" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-base font-semibold tracking-tight">Stock Desk</span>
            <span className="truncate text-[11px] text-muted-foreground">1인용 주식 워크스페이스</span>
          </span>
        </Link>
        <p className="px-2.5 pt-2 pb-1.5 text-[10.5px] font-semibold tracking-wider text-muted-foreground/80 uppercase">메뉴</p>
        <nav className="flex flex-1 flex-col gap-0.5" aria-label="주 메뉴">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-[11px] px-3 py-2 text-[13.5px] font-medium transition-colors',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="size-[18px] shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto pt-3">
          <div className="flex items-center gap-2.5 rounded-xl border bg-secondary/60 p-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-fuchsia-500 text-xs font-semibold text-white">
              나
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-semibold">내 워크스페이스</span>
              <span className="truncate text-[11px] text-muted-foreground">라이트 · KIS 연동</span>
            </span>
            <LogoutButton className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" />
          </div>
        </div>
      </aside>

      {/* 본문 — 모바일은 하단 탭 높이만큼 패딩 */}
      <main className="min-w-0 flex-1 pb-20 lg:pb-0">{children}</main>

      {/* 모바일 하단 탭 */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 flex border-t bg-background/85 px-1 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden"
        aria-label="하단 메뉴"
      >
        {BOTTOM_TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-1.5 text-[10.5px]',
                active ? 'font-semibold text-sidebar-accent-foreground' : 'text-muted-foreground',
              )}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          );
        })}
      </nav>

      <CalculatorFab />
      <StockPet />
    </div>
  );
}
