import { useRef, useState, useEffect } from 'react';
import { X, BrainCircuit, ChevronLeft, ChevronRight, AlertCircle, Loader2, CheckCircle2, LayoutGrid } from 'lucide-react';
import { Button } from '../ui/button';
import type { Session } from '../../hooks/useSessions';
import type { SessionNotification } from '../../types/sessionState';

export interface KanbanTab {
  projectPath: string;
  projectName: string;
}

// Helper to check if a tab ID is a kanban tab
export function isKanbanTabId(tabId: string): boolean {
  return tabId.startsWith('kanban:');
}

// Helper to extract project path from kanban tab ID
export function getProjectPathFromTabId(tabId: string): string {
  return tabId.replace('kanban:', '');
}

// Helper to create kanban tab ID from project path
export function createKanbanTabId(projectPath: string): string {
  return `kanban:${projectPath}`;
}

interface SessionTabsProps {
  sessions: Session[];
  openTabIds: string[];
  activeTabId: string | null;
  kanbanTabs: Map<string, KanbanTab>; // tabId -> kanban info
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  notifications?: SessionNotification[];
}

export function SessionTabs({
  sessions,
  openTabIds,
  activeTabId,
  kanbanTabs,
  onSelectTab,
  onCloseTab,
  notifications = [],
}: SessionTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(false);

  // Check scroll state
  const updateScrollButtons = () => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeftScroll(el.scrollLeft > 0);
    setShowRightScroll(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  };

  useEffect(() => {
    updateScrollButtons();
    const el = scrollRef.current;
    if (!el) return undefined;

    el.addEventListener('scroll', updateScrollButtons);
    window.addEventListener('resize', updateScrollButtons);
    return () => {
      el.removeEventListener('scroll', updateScrollButtons);
      window.removeEventListener('resize', updateScrollButtons);
    };
  }, [openTabIds]);

  const scrollLeft = () => {
    scrollRef.current?.scrollBy({ left: -150, behavior: 'smooth' });
  };

  const scrollRight = () => {
    scrollRef.current?.scrollBy({ left: 150, behavior: 'smooth' });
  };

  const handleMouseDown = (e: React.MouseEvent, tabId: string) => {
    // Middle click to close
    if (e.button === 1) {
      e.preventDefault();
      onCloseTab(tabId);
    }
  };

  if (openTabIds.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
      {/* Left scroll button */}
      {showLeftScroll && (
        <Button
          variant="ghost"
          size="sm"
          onClick={scrollLeft}
          className="h-9 w-6 flex-shrink-0 rounded-none p-0 hover:bg-gray-200 dark:hover:bg-gray-800"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}

      {/* Tabs container */}
      <div
        ref={scrollRef}
        className="flex flex-1 overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {openTabIds.map((tabId) => {
          const isKanban = isKanbanTabId(tabId);
          const isActive = tabId === activeTabId;

          if (isKanban) {
            const kanbanInfo = kanbanTabs.get(tabId);
            if (!kanbanInfo) return null;

            return (
              <div
                key={tabId}
                className={`group flex min-w-[120px] max-w-[200px] cursor-pointer items-center gap-2 border-r border-gray-200 px-3 py-2 dark:border-gray-700 ${
                  isActive
                    ? 'bg-white text-gray-900 dark:bg-gray-800 dark:text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-200'
                }`}
                onClick={() => onSelectTab(tabId)}
                onMouseDown={(e) => handleMouseDown(e, tabId)}
              >
                <LayoutGrid className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-blue-600'}`} />
                <span className="flex-1 truncate text-sm">{kanbanInfo.projectName}</span>
                <button
                  className={`flex-shrink-0 rounded p-0.5 hover:bg-gray-300 dark:hover:bg-gray-600 ${
                    isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tabId);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          }

          // Session tab
          const session = sessions.find(s => s.id === tabId);
          if (!session) return null;

          const notification = notifications.find(n => n.sessionId === session.id);
          const hasPendingPermission = notification?.hasPendingPermission && !isActive;
          const isThinking = notification?.isThinking && !isActive;
          const hasError = notification?.hasError && !isActive;
          const isDone = notification?.isDone && !isActive;

          return (
            <div
              key={session.id}
              className={`group flex min-w-[120px] max-w-[200px] cursor-pointer items-center gap-2 border-r border-gray-200 px-3 py-2 dark:border-gray-700 ${
                isActive
                  ? 'bg-white text-gray-900 dark:bg-gray-800 dark:text-white'
                  : hasPendingPermission
                  ? 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:hover:bg-orange-900/50'
                  : isDone
                  ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-200'
              }`}
              onClick={() => onSelectTab(session.id)}
              onMouseDown={(e) => handleMouseDown(e, session.id)}
            >
              {/* Icon with notification indicator */}
              <div className="relative flex-shrink-0">
                <BrainCircuit className={`h-4 w-4 ${isActive ? 'text-purple-400' : 'text-purple-600'}`} />
                {hasPendingPermission && (
                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                )}
                {isThinking && !hasPendingPermission && (
                  <Loader2 className="absolute -right-1 -top-1 h-2.5 w-2.5 text-blue-400 animate-spin" />
                )}
                {isDone && !hasPendingPermission && !isThinking && (
                  <CheckCircle2 className="absolute -right-1 -top-1 h-2.5 w-2.5 text-green-500" />
                )}
                {hasError && !hasPendingPermission && !isThinking && !isDone && (
                  <AlertCircle className="absolute -right-1 -top-1 h-2.5 w-2.5 text-red-500" />
                )}
              </div>
              <span className="flex-1 truncate text-sm">{session.name}</span>
              <button
                className={`flex-shrink-0 rounded p-0.5 hover:bg-gray-300 dark:hover:bg-gray-600 ${
                  isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(session.id);
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Right scroll button */}
      {showRightScroll && (
        <Button
          variant="ghost"
          size="sm"
          onClick={scrollRight}
          className="h-9 w-6 flex-shrink-0 rounded-none p-0 hover:bg-gray-200 dark:hover:bg-gray-800"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
