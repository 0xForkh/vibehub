import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useSessions } from '../hooks/useSessions';
import { useSessionManager } from '../hooks/useSessionManager';
import { useVisualViewport } from '../hooks/useVisualViewport';
import { SessionSidebar } from '../components/workspace/SessionSidebar';
import { SessionTabs } from '../components/workspace/SessionTabs';
import { SessionPanel } from '../components/workspace/SessionPanel';
import { Sheet, SheetContent } from '../components/ui/sheet';
import { Button } from '../components/ui/button';
import { useIsMobile } from '../hooks/useIsMobile';

const STORAGE_KEY = 'workspace-state';

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

export function WorkspacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { sessions, loading, createClaudeSession, renameSession, deleteSession, refresh: refreshSessions } = useSessions();
  const isMobile = useIsMobile();
  const viewportHeight = useVisualViewport();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Track a pending session ID that we're waiting to appear in the sessions list
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);

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
  useEffect(() => {
    if (loading) return; // Don't clean up while sessions are still loading

    const validIds = sessions.map(s => s.id);
    const invalidTabs = state.openTabIds.filter(id => !validIds.includes(id));

    if (invalidTabs.length > 0) {
      setState(prev => {
        const newOpenTabs = prev.openTabIds.filter(id => validIds.includes(id));
        const newActiveTab = prev.activeTabId && validIds.includes(prev.activeTabId)
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

  // Subscribe to open sessions in the session manager
  useEffect(() => {
    state.openTabIds.forEach(sessionId => {
      sessionManager.subscribeToSession(sessionId);
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
    // Close drawer on mobile after selecting
    setMobileDrawerOpen(false);
  }, []);

  const handleSelectTab = useCallback((sessionId: string) => {
    setState(prev => ({
      ...prev,
      activeTabId: sessionId,
    }));
  }, []);

  const handleCloseTab = useCallback((sessionId: string) => {
    setState(prev => {
      const newOpenTabs = prev.openTabIds.filter(id => id !== sessionId);
      let newActiveTab = prev.activeTabId;

      if (prev.activeTabId === sessionId) {
        const closedIndex = prev.openTabIds.indexOf(sessionId);
        newActiveTab = newOpenTabs[closedIndex] || newOpenTabs[closedIndex - 1] || null;
      }

      return {
        ...prev,
        openTabIds: newOpenTabs,
        activeTabId: newActiveTab,
      };
    });
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

  const handleFork = useCallback((newSessionId: string) => {
    handleSelectSession(newSessionId);
  }, [handleSelectSession]);

  const handleForkSession = useCallback((sessionId: string, name: string) => {
    const actions = sessionManager.getSessionActions(sessionId);
    if (actions) {
      actions.fork(name);
    }
  }, [sessionManager]);

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
            activeSessionId={state.activeTabId}
            onCloseTab={handleCloseTab}
            onFork={handleFork}
            sessionManager={sessionManager}
          />
        </div>
      </div>
    </div>
  );
}
