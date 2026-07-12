'use client';

// 워치리스트 탭 바 — 기본 탭(맨 앞 고정) + 사용자 탭. 활성 탭이 사용자 탭이면 이름변경/삭제 인라인 노출.
import { Plus, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { WatchlistTab } from '@/types';

interface WatchlistTabsProps {
  tabs: WatchlistTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (tab: WatchlistTab) => void;
  onDelete: (tab: WatchlistTab) => void;
}

export function WatchlistTabs({ tabs, activeId, onSelect, onCreate, onRename, onDelete }: WatchlistTabsProps) {
  return (
    <div className="flex items-center gap-1 border-b">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <div
              key={tab.id}
              className={cn(
                'flex items-center border-b-2 pl-1',
                active ? 'border-primary' : 'border-transparent',
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(tab.id)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'max-w-[180px] truncate whitespace-nowrap px-2 py-2.5 text-sm font-medium transition-colors',
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.name}
              </button>
              {active && !tab.isDefault && (
                <span className="flex items-center gap-0.5 pr-1">
                  <button
                    type="button"
                    aria-label={`${tab.name} 이름 변경`}
                    onClick={() => onRename(tab)}
                    className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`${tab.name} 삭제`}
                    onClick={() => onDelete(tab)}
                    className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="관심목록 추가" onClick={onCreate}>
        <Plus className="size-4" />
      </Button>
    </div>
  );
}
