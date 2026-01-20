import { useMemo } from 'react';
import { BrainCircuit, MousePointerClick } from 'lucide-react';
import { ClaudePaneView } from '../claude/ClaudePaneView';
import { TaskListView } from './TaskListView';
import { isKanbanTabId, type KanbanTab } from './SessionTabs';
import type { Session } from '../../hooks/useSessions';
import type { SessionManagerResult } from '../../types/sessionState';

interface SessionPanelProps {
  sessions: Session[];
  openTabIds: string[];
  activeTabId: string | null;
  kanbanTabs: Map<string, KanbanTab>;
  onCloseTab: (tabId: string) => void;
  onDelete?: (sessionId: string, cleanupWorktree: boolean) => void;
  onFork?: (newSessionId: string) => void;
  onCreateSessionFromTask?: (name: string, workingDir: string, initialPrompt?: string, taskId?: string, attachments?: { name: string; type: string; size: number; data: string }[], worktree?: { branch: string }) => Promise<string | undefined>;
  onOpenSession?: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
  sessionManager: SessionManagerResult;
}

export function SessionPanel({
  sessions,
  openTabIds,
  activeTabId,
  kanbanTabs,
  onCloseTab: _onCloseTab,
  onDelete,
  onFork,
  onCreateSessionFromTask,
  onOpenSession,
  onDeleteSession,
  sessionManager,
}: SessionPanelProps) {
  // Separate session tabs from kanban tabs
  const sessionTabIds = openTabIds.filter(id => !isKanbanTabId(id));
  const kanbanTabIds = openTabIds.filter(id => isKanbanTabId(id));

  // Get session data for open session tabs
  const openSessions = sessionTabIds
    .map(id => sessions.find(s => s.id === id))
    .filter((s): s is Session => s !== undefined);

  // Create a set of valid session IDs for task validation
  const validSessionIds = useMemo(() => new Set(sessions.map(s => s.id)), [sessions]);

  if (openTabIds.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-gray-100 text-gray-500 dark:bg-gray-900">
        <BrainCircuit className="mb-4 h-16 w-16 text-gray-400 dark:text-gray-700" />
        <p className="text-lg">No session selected</p>
        <p className="mt-2 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-600">
          <MousePointerClick className="h-4 w-4" />
          Select a session from the sidebar or open a tab
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full bg-gray-100 dark:bg-gray-900">
      {/* Render task list tabs */}
      {kanbanTabIds.map((tabId) => {
        const isActive = tabId === activeTabId;
        const kanbanInfo = kanbanTabs.get(tabId);

        if (!kanbanInfo) return null;

        return (
          <div
            key={tabId}
            className={`absolute inset-0 ${isActive ? '' : 'hidden'}`}
          >
            <TaskListView
              projectPath={kanbanInfo.projectPath}
              projectName={kanbanInfo.projectName}
              validSessionIds={validSessionIds}
              sessionManager={sessionManager}
              onCreateSession={onCreateSessionFromTask}
              onOpenSession={onOpenSession}
              onDeleteSession={onDeleteSession}
            />
          </div>
        );
      })}

      {/* Render session tabs */}
      {openSessions.map((session) => {
        const isActive = session.id === activeTabId;
        const state = sessionManager.sessionStates.get(session.id);
        const actions = sessionManager.getSessionActions(session.id);

        // Skip if no state/actions yet (still initializing)
        if (!state || !actions) {
          return (
            <div
              key={session.id}
              className={`absolute inset-0 flex items-center justify-center ${isActive ? '' : 'hidden'}`}
            >
              <div className="text-gray-500">Loading session...</div>
            </div>
          );
        }

        return (
          <div
            key={session.id}
            className={`absolute inset-0 ${isActive ? '' : 'invisible'}`}
          >
            <ClaudePaneView
              sessionId={session.id}
              sessionName={session.name}
              workingDir={session.claudeMetadata?.workingDir}
              worktreePath={session.claudeMetadata?.worktreePath}
              state={state}
              actions={actions}
              globalAllowedTools={sessionManager.globalState.globalAllowedTools}
              socket={sessionManager.socket}
              onDelete={onDelete}
              onFork={onFork}
              showHeader={true}
              className="h-full"
              sessions={sessions}
            />
          </div>
        );
      })}
    </div>
  );
}
