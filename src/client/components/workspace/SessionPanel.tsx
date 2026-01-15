import { BrainCircuit, MousePointerClick } from 'lucide-react';
import { ClaudePaneView } from '../claude/ClaudePaneView';
import type { Session } from '../../hooks/useSessions';
import type { SessionManagerResult } from '../../types/sessionState';

interface SessionPanelProps {
  sessions: Session[];
  openTabIds: string[];
  activeSessionId: string | null;
  onCloseTab: (sessionId: string) => void;
  onFork?: (newSessionId: string) => void;
  sessionManager: SessionManagerResult;
}

export function SessionPanel({
  sessions,
  openTabIds,
  activeSessionId,
  onCloseTab,
  onFork,
  sessionManager,
}: SessionPanelProps) {
  // Render all open sessions but only show the active one
  // This keeps background sessions connected and receiving events
  const openSessions = openTabIds
    .map(id => sessions.find(s => s.id === id))
    .filter((s): s is Session => s !== undefined);

  if (openSessions.length === 0) {
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
      {openSessions.map((session) => {
        const isActive = session.id === activeSessionId;
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
              state={state}
              actions={actions}
              globalAllowedTools={sessionManager.globalState.globalAllowedTools}
              socket={sessionManager.socket}
              onClose={() => onCloseTab(session.id)}
              onFork={onFork}
              showHeader={true}
              className="h-full"
            />
          </div>
        );
      })}
    </div>
  );
}
