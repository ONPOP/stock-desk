'use client';

// PC 사이드바 / 좁은 화면 하단 탭 — lg(1024px) 분기 (D2, PRD 7장)
// D21: 하단 탭 = 대시보드·캘린더·내 종목·투자 기록 + [더보기]. 나머지 메뉴는 더보기 시트에서 연다
// (이전에는 하단 탭 5개 밖의 메뉴가 lg 미만에서 들어갈 방법이 없었다).
// 실시간(/live)은 메뉴에서만 뺐다 — 모의계좌 자동매매(D15) tick이 이 화면에서 돌므로 주소로 직접 들어가면 계속 쓸 수 있다.
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, CalendarDays, TrendingUp, NotebookTabs, Ellipsis,
  NotebookPen, Briefcase, Settings, Images, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LogoutButton } from '@/components/auth/logout-button';
import { FloatingTools } from '@/components/layout/floating-tools';

type NavItem = { href: string; label: string; icon: LucideIcon };

// 하단 탭에 바로 두는 주 메뉴
const PRIMARY_ITEMS: NavItem[] = [
  { href: '/', label: '대시보드', icon: LayoutDashboard },
  { href: '/calendar', label: '캘린더', icon: CalendarDays },
  { href: '/stocks', label: '내 종목', icon: TrendingUp },
  { href: '/journal', label: '투자 기록', icon: NotebookTabs },
];
// 좁은 화면에서는 [더보기] 시트로 여는 메뉴
const MORE_ITEMS: NavItem[] = [
  { href: '/reports', label: '분석 리포트', icon: Images },
  { href: '/notes', label: '노트', icon: NotebookPen },
  { href: '/paper', label: '모의투자', icon: Briefcase },
  { href: '/settings', label: '설정', icon: Settings },
];
const NAV_ITEMS: NavItem[] = [...PRIMARY_ITEMS, ...MORE_ITEMS];

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_ITEMS.some((i) => isActive(pathname, i.href));

  // 이동하면 시트를 닫고, Esc로도 닫는다
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

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

      {/* 좁은 화면: 더보기 시트 */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="더보기 메뉴">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label="더보기 닫기"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t bg-background px-3 pt-3 pb-[calc(76px+env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" aria-hidden />
            <nav className="grid grid-cols-4 gap-1" aria-label="더보기 메뉴">
              {MORE_ITEMS.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-xl py-3 text-xs',
                      active ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <Icon className="size-5" />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* 좁은 화면 하단 탭 */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 flex border-t bg-background/85 px-1 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden"
        aria-label="하단 메뉴"
      >
        {PRIMARY_ITEMS.map(({ href, label, icon: Icon }) => {
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
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          className={cn(
            'flex flex-1 flex-col items-center gap-1 py-1.5 text-[10.5px]',
            moreActive || moreOpen ? 'font-semibold text-sidebar-accent-foreground' : 'text-muted-foreground',
          )}
        >
          <Ellipsis className="size-5" />
          더보기
        </button>
      </nav>

      <FloatingTools />
    </div>
  );
}
