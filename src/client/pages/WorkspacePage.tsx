import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useSessions } from '../hooks/useSessions';
import { useSessionManager } from '../hooks/useSessionManager';
import { useVisualViewport } from '../hooks/useVisualViewport';
import { SessionSidebar } from '../components/workspace/SessionSidebar';
import { SessionTabs, createKanbanTabId, isKanbanTabId, type KanbanTab } from '../components/workspace/SessionTabs';
import { SessionPanel } from '../components/workspace/SessionPanel';
import { Sheet, SheetContent } from '../components/ui/sheet';
import { Button } from '../components/ui/button';
import { useIsMobile } from '../hooks/useIsMobile';
import { api } from '../lib/api';

const STORAGE_KEY = 'workspace-state';
const KANBAN_TABS_KEY = 'workspace-kanban-tabs';

interface WorkspaceState {
  openTabIds: string[];
  activeTabId: string | null;
  sidebarOpen: boolean;
  sidebarWidth: number;
}

const DEFAULT_STATE: WorkspaceState = {
  openTabIds: [],
  activeTabId: null,
  sidebarOpen: true,
  sidebarWidth: 240,
};

function loadState(): WorkspaceState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_STATE, ...JSON.parse(saved) };
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_STATE;
}

function saveState(state: WorkspaceState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

function loadKanbanTabs(): Map<string, KanbanTab> {
  try {
    const saved = localStorage.getItem(KANBAN_TABS_KEY);
    if (saved) {
      const entries = JSON.parse(saved) as [string, KanbanTab][];
      return new Map(entries);
    }
  } catch {
    // Ignore parse errors
  }
  return new Map();
}

function saveKanbanTabs(tabs: Map<string, KanbanTab>) {
  try {
    localStorage.setItem(KANBAN_TABS_KEY, JSON.stringify(Array.from(tabs.entries())));
  } catch {
    // Ignore storage errors
  }
}

export function WorkspacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { sessions, loading, createClaudeSession, renameSession, deleteSession, refresh: refreshSessions } = useSessions();
  const isMobile = useIsMobile();
  const viewportHeight = useVisualViewport();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Track a pending session ID that we're waiting to appear in the sessions list
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);

  // Track pending initial prompts for sessions created from kanban tasks
  const [pendingInitialPrompts, setPendingInitialPrompts] = useState<Map<string, string>>(new Map());

  // Kanban tabs state
  const [kanbanTabs, setKanbanTabs] = useState<Map<string, KanbanTab>>(() => loadKanbanTabs());

  // Use refs to store functions for use in session manager callback
  const setStateRef = useRef<React.Dispatch<React.SetStateAction<WorkspaceState>> | null>(null);
  const refreshSessionsRef = useRef(refreshSessions);
  const setPendingSessionIdRef = useRef(setPendingSessionId);

  // Initialize state from localStorage
  const [state, setState] = useState<WorkspaceState>(() => {
    const saved = loadState();

    // Check URL params for initial state
    const urlActive = searchParams.get('active');
    const urlOpen = searchParams.get('open');

    if (urlActive || urlOpen) {
      const openIds = urlOpen ? urlOpen.split(',') : [];
      if (urlActive && !openIds.includes(urlActive)) {
        openIds.push(urlActive);
      }
      return {
        ...saved,
        openTabIds: openIds,
        activeTabId: urlActive || openIds[0] || null,
      };
    }

    return saved;
  });

  // Store refs for use in session manager callback
  setStateRef.current = setState;
  refreshSessionsRef.current = refreshSessions;
  setPendingSessionIdRef.current = setPendingSessionId;

  // Callback for when a session is forked via socket event
  const handleForkCallback = useCallback((newSessionId: string) => {
    // Refresh sessions list to include the new forked session
    refreshSessionsRef.current();
    // Set pending session ID - will be activated when it appears in sessions list
    setPendingSessionIdRef.current(newSessionId);
  }, []);

  // Memoize session manager options to prevent unnecessary re-renders
  const sessionManagerOptions = useMemo(() => ({
    onFork: handleForkCallback,
  }), [handleForkCallback]);

  const sessionManager = useSessionManager(sessionManagerOptions);

  // Persist state changes
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Persist kanban tabs
  useEffect(() => {
    saveKanbanTabs(kanbanTabs);
  }, [kanbanTabs]);

  // When a pending session appears in the sessions list, open and activate it
  useEffect(() => {
    if (!pendingSessionId) return;

    const sessionExists = sessions.some(s => s.id === pendingSessionId);
    if (sessionExists) {
      setState(prev => {
        const newOpenTabs = prev.openTabIds.includes(pendingSessionId)
          ? prev.openTabIds
          : [...prev.openTabIds, pendingSessionId];
        return {
          ...prev,
          openTabIds: newOpenTabs,
          activeTabId: pendingSessionId,
        };
      });
      setPendingSessionId(null);
    }
  }, [sessions, pendingSessionId]);

  // Send pending initial prompts when session becomes connected
  useEffect(() => {
    if (pendingInitialPrompts.size === 0) return;

    pendingInitialPrompts.forEach((prompt, sessionId) => {
      const sessionState = sessionManager.sessionStates.get(sessionId);
      // Only send when session is connected
      if (sessionState?.isConnected) {
        const actions = sessionManager.getSessionActions(sessionId);
        if (actions) {
          actions.sendMessage(prompt);
          setPendingInitialPrompts(prev => {
            const next = new Map(prev);
            next.delete(sessionId);
            return next;
          });
        }
      }
    });
  }, [pendingInitialPrompts, sessionManager.sessionStates, sessionManager.getSessionActions]);

  // Sync URL with state
  useEffect(() => {
    const params: Record<string, string> = {};
    if (state.activeTabId) {
      params.active = state.activeTabId;
    }
    if (state.openTabIds.length > 0) {
      params.open = state.openTabIds.join(',');
    }

    const newSearch = new URLSearchParams(params).toString();
    const currentSearch = searchParams.toString();

    if (newSearch !== currentSearch) {
      setSearchParams(params, { replace: true });
    }
  }, [state.activeTabId, state.openTabIds, searchParams, setSearchParams]);

  // Clean up tabs for deleted sessions (only after sessions have loaded)
  // Keep kanban tabs as they don't depend on sessions
  useEffect(() => {
    if (loading) return; // Don't clean up while sessions are still loading

    const validIds = sessions.map(s => s.id);
    const invalidTabs = state.openTabIds.filter(id =>
      !isKanbanTabId(id) && !validIds.includes(id)
    );

    if (invalidTabs.length > 0) {
      setState(prev => {
        const newOpenTabs = prev.openTabIds.filter(id =>
          isKanbanTabId(id) || validIds.includes(id)
        );
        const newActiveTab = prev.activeTabId && (isKanbanTabId(prev.activeTabId) || validIds.includes(prev.activeTabId))
          ? prev.activeTabId
          : newOpenTabs[0] || null;

        return {
          ...prev,
          openTabIds: newOpenTabs,
          activeTabId: newActiveTab,
        };
      });
    }
  }, [sessions, loading, state.openTabIds]);

  // Subscribe to open sessions in the session manager (skip kanban tabs)
  useEffect(() => {
    state.openTabIds.forEach(tabId => {
      if (!isKanbanTabId(tabId)) {
        sessionManager.subscribeToSession(tabId);
      }
    });
  }, [state.openTabIds, sessionManager.subscribeToSession]);

  const handleSelectSession = useCallback((sessionId: string) => {
    setState(prev => {
      const newOpenTabs = prev.openTabIds.includes(sessionId)
        ? prev.openTabIds
        : [...prev.openTabIds, sessionId];

      return {
        ...prev,
        openTabIds: newOpenTabs,
        activeTabId: sessionId,
      };
    });
    // Clear done state when viewing the session
    sessionManager.getSessionActions(sessionId)?.clearDone();
    // Close drawer on mobile after selecting
    setMobileDrawerOpen(false);
  }, [sessionManager]);

  const handleSelectProject = useCallback((projectPath: string, projectName: string) => {
    const tabId = createKanbanTabId(projectPath);

    // Add to kanban tabs if not already there
    setKanbanTabs(prev => {
      if (!prev.has(tabId)) {
        const next = new Map(prev);
        next.set(tabId, { projectPath, projectName });
        return next;
      }
      return prev;
    });

    setState(prev => {
      const newOpenTabs = prev.openTabIds.includes(tabId)
        ? prev.openTabIds
        : [...prev.openTabIds, tabId];

      return {
        ...prev,
        openTabIds: newOpenTabs,
        activeTabId: tabId,
      };
    });

    // Close drawer on mobile after selecting
    setMobileDrawerOpen(false);
  }, []);

  const handleSelectTab = useCallback((tabId: string) => {
    setState(prev => ({
      ...prev,
      activeTabId: tabId,
    }));
    // Clear done state when viewing a session tab
    if (!isKanbanTabId(tabId)) {
      sessionManager.getSessionActions(tabId)?.clearDone();
    }
  }, [sessionManager]);

  const handleCloseTab = useCallback((tabId: string) => {
    setState(prev => {
      const newOpenTabs = prev.openTabIds.filter(id => id !== tabId);
      let newActiveTab = prev.activeTabId;

      if (prev.activeTabId === tabId) {
        const closedIndex = prev.openTabIds.indexOf(tabId);
        newActiveTab = newOpenTabs[closedIndex] || newOpenTabs[closedIndex - 1] || null;
      }

      return {
        ...prev,
        openTabIds: newOpenTabs,
        activeTabId: newActiveTab,
      };
    });

    // Clean up kanban tab data if it was a kanban tab
    if (isKanbanTabId(tabId)) {
      setKanbanTabs(prev => {
        const next = new Map(prev);
        next.delete(tabId);
        return next;
      });
    }
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setState(prev => ({
      ...prev,
      sidebarOpen: !prev.sidebarOpen,
    }));
  }, []);

  const handleSidebarWidthChange = useCallback((width: number) => {
    setState(prev => ({
      ...prev,
      sidebarWidth: width,
    }));
  }, []);

  const handleCreateSession = useCallback(async (
    name: string,
    workingDir: string,
    worktree?: { branch: string; path?: string }
  ) => {
    try {
      const session = await createClaudeSession(name, workingDir, undefined, worktree);
      if (session) {
        handleSelectSession(session.id);
      }
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  }, [createClaudeSession, handleSelectSession]);

  const handleRenameSession = useCallback(async (sessionId: string, name: string) => {
    try {
      await renameSession(sessionId, name);
    } catch (err) {
      console.error('Failed to rename session:', err);
    }
  }, [renameSession]);

  const handleDeleteSession = useCallback(async (sessionId: string, cleanupWorktree = false) => {
    try {
      // Close tab if open
      handleCloseTab(sessionId);
      await deleteSession(sessionId, cleanupWorktree);
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  }, [deleteSession, handleCloseTab]);

  // Simple session delete for task completion (no worktree cleanup)
  const handleDeleteSessionSimple = useCallback(async (sessionId: string) => {
    try {
      handleCloseTab(sessionId);
      await deleteSession(sessionId, false);
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  }, [deleteSession, handleCloseTab]);

  const handleFork = useCallback((newSessionId: string) => {
    handleSelectSession(newSessionId);
  }, [handleSelectSession]);

  const handleForkSession = useCallback((sessionId: string, name: string) => {
    const actions = sessionManager.getSessionActions(sessionId);
    if (actions) {
      actions.fork(name);
    }
  }, [sessionManager]);

  const handleCreateSessionFromTask = useCallback(async (
    name: string,
    workingDir: string,
    initialPrompt?: string,
    taskId?: string
  ) => {
    try {
      const session = await createClaudeSession(name, workingDir);
      if (session) {
        handleSelectSession(session.id);
        // Store the initial prompt to be sent when the session is ready
        const formattedPrompt = initialPrompt
          ? `# Task: ${name}

${initialPrompt}

---
When you have completed this task, use the \`mcp__kanban-tools__update_task_status\` tool to move the task to the "review" column.`
          : `# Task: ${name}

---
When you have completed this task, use the \`mcp__kanban-tools__update_task_status\` tool to move the task to the "review" column.`;
        setPendingInitialPrompts(prev => {
          const next = new Map(prev);
          next.set(session.id, formattedPrompt);
          return next;
        });
        // Link the task to the newly created session
        if (taskId) {
          try {
            await api.patch(`/api/tasks/${taskId}`, { sessionId: session.id });
          } catch (err) {
            console.error('Failed to link task to session:', err);
          }
        }
      }
    } catch (err) {
      console.error('Failed to create session from task:', err);
    }
  }, [createClaudeSession, handleSelectSession]);

  const sidebarContent = (
    <SessionSidebar
      sessions={sessions}
      activeSessionId={state.activeTabId}
      openTabIds={state.openTabIds}
      isOpen={isMobile || state.sidebarOpen}
      width={isMobile ? 280 : state.sidebarWidth}
      onToggle={isMobile ? () => setMobileDrawerOpen(false) : handleToggleSidebar}
      onWidthChange={handleSidebarWidthChange}
      onSelectSession={handleSelectSession}
      onSelectProject={handleSelectProject}
      onCreateSession={handleCreateSession}
      onRenameSession={handleRenameSession}
      onDeleteSession={handleDeleteSession}
      onForkSession={handleForkSession}
      notifications={sessionManager.getNotifications()}
    />
  );

  // Use visual viewport height on mobile to prevent keyboard from scrolling the page
  const containerStyle = isMobile && viewportHeight.height
    ? { height: `${viewportHeight.height}px`, top: `${viewportHeight.offsetTop}px` }
    : undefined;

  const containerClasses = isMobile && viewportHeight.height
    ? "fixed inset-x-0 flex bg-gray-100 dark:bg-gray-900"
    : "flex h-dvh bg-gray-100 dark:bg-gray-900";

  return (
    <div className={containerClasses} style={containerStyle}>
      {/* Desktop Sidebar */}
      {!isMobile && sidebarContent}

      {/* Mobile Drawer */}
      {isMobile && (
        <Sheet open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
          <SheetContent open={mobileDrawerOpen} onClose={() => setMobileDrawerOpen(false)} side="left">
            {sidebarContent}
          </SheetContent>
        </Sheet>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header with hamburger menu on mobile */}
        <div className="flex items-center border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          {isMobile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileDrawerOpen(true)}
              className="m-1 h-9 w-9 p-0"
              aria-label="Open sessions menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          {/* Tabs */}
          <div className="flex-1 overflow-hidden">
            <SessionTabs
              sessions={sessions}
              openTabIds={state.openTabIds}
              activeTabId={state.activeTabId}
              kanbanTabs={kanbanTabs}
              onSelectTab={handleSelectTab}
              onCloseTab={handleCloseTab}
              notifications={sessionManager.getNotifications()}
            />
          </div>
        </div>

        {/* Session panel */}
        <div className="flex-1 overflow-hidden">
          <SessionPanel
            sessions={sessions}
            openTabIds={state.openTabIds}
            activeTabId={state.activeTabId}
            kanbanTabs={kanbanTabs}
            onCloseTab={handleCloseTab}
            onDelete={handleDeleteSession}
            onFork={handleFork}
            onCreateSessionFromTask={handleCreateSessionFromTask}
            onOpenSession={handleSelectSession}
            onDeleteSession={handleDeleteSessionSimple}
            sessionManager={sessionManager}
          />
        </div>
      </div>
    </div>
  );
}
