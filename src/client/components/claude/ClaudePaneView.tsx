import { Trash2, Circle, ChevronDown, ChevronRight, ListTodo, CheckCircle2, Clock, GitBranch, GitCommitHorizontal, Terminal, FolderOpen, Settings, Shield, ShieldCheck, ShieldOff, FileEdit } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { TerminalPane } from '../terminal/TerminalPane';
import { ClaudeConversationView } from './ClaudeConversationView';
import { ClaudeInputBar } from './ClaudeInputBar';
import { FileBrowser } from './FileBrowser';
import { GitPanel } from './GitPanel';
import { AllowedToolsSettings } from './AllowedToolsSettings';
import { ForkSessionDialog } from '../workspace/ForkSessionDialog';
import type { SessionState, SessionActions, PermissionMode } from '../../types/sessionState';
import type { FileAttachment } from '../../types/claude';
import type { Socket } from 'socket.io-client';

interface ClaudePaneViewProps {
  sessionId: string;
  sessionName?: string;
  workingDir?: string;
  worktreePath?: string;
  state: SessionState;
  actions: SessionActions;
  globalAllowedTools: string[];
  socket: Socket | null;
  onDelete?: (sessionId: string, cleanupWorktree: boolean) => void;
  onFork?: (newSessionId: string) => void;
  showHeader?: boolean;
  className?: string;
}

export function ClaudePaneView({
  sessionId,
  sessionName,
  workingDir,
  worktreePath,
  state,
  actions,
  globalAllowedTools,
  socket,
  onDelete,
  onFork,
  showHeader = true,
  className = '',
}: ClaudePaneViewProps) {
  const [isTodoExpanded, setIsTodoExpanded] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [showGitPanel, setShowGitPanel] = useState(false);
  const [showAllowedTools, setShowAllowedTools] = useState(false);
  const [showPermissionModeMenu, setShowPermissionModeMenu] = useState(false);
  const [showForkDialog, setShowForkDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const {
    isConnected,
    messages,
    todos,
    thinking,
    pendingRequest,
    error,
    toolResults,
    slashCommands,
    allowedTools,
    permissionMode,
  } = state;

  const permissionModeConfig: Record<PermissionMode, { label: string; icon: typeof Shield; color: string; description: string }> = {
    default: { label: 'Default', icon: Shield, color: 'text-gray-500', description: 'Normal permission checks' },
    acceptEdits: { label: 'Accept Edits', icon: FileEdit, color: 'text-blue-500', description: 'Auto-approve file edits' },
    bypassPermissions: { label: 'Bypass', icon: ShieldOff, color: 'text-red-500', description: 'No permission prompts' },
    plan: { label: 'Plan', icon: ShieldCheck, color: 'text-green-500', description: 'Read-only planning mode' },
  };

  const handlePermissionModeChange = (mode: PermissionMode) => {
    actions.updatePermissionMode(mode);
    setShowPermissionModeMenu(false);
  };

  const handleSendMessage = (content: string, attachments?: FileAttachment[]) => {
    if (!isConnected) return;

    // If there's a pending request, treat message as rejection with context
    if (pendingRequest) {
      actions.respondToPermission(pendingRequest.requestId, 'deny', { message: content });
      return;
    }

    actions.sendMessage(
      content,
      attachments?.map(a => ({
        name: a.name,
        type: a.type,
        size: a.size,
        data: a.data,
      }))
    );
  };

  const handleApproveRequest = (requestId: string, remember = false, global = false) => {
    actions.respondToPermission(requestId, 'allow', { remember, global });
  };

  const handleApproveAndRememberRequest = (requestId: string) => {
    handleApproveRequest(requestId, true, false);
  };

  const handleApproveAndRememberGlobalRequest = (requestId: string) => {
    handleApproveRequest(requestId, true, true);
  };

  const handleApproveAndSwitchToAcceptEdits = (requestId: string) => {
    handleApproveRequest(requestId);
    actions.updatePermissionMode('acceptEdits');
  };

  const handleApproveAndSwitchToBypass = (requestId: string) => {
    handleApproveRequest(requestId);
    actions.updatePermissionMode('bypassPermissions');
  };

  const handleDenyRequest = (requestId: string) => {
    actions.respondToPermission(requestId, 'deny');
  };

  const handleAbort = () => {
    actions.abort();
  };

  const handleFork = () => {
    setShowForkDialog(true);
  };

  const handleForkConfirm = (name: string) => {
    actions.fork(name);
  };

  const handleUpdateAllowedTools = (tools: string[]) => {
    actions.updateAllowedTools(tools);
  };

  const handleUpdateGlobalAllowedTools = (tools: string[]) => {
    actions.updateGlobalAllowedTools(tools);
  };

  const inProgressCount = todos.filter(t => t.status === 'in_progress').length;
  const completedCount = todos.filter(t => t.status === 'completed').length;

  // Keyboard shortcut for terminal (Ctrl+`)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        setShowTerminal(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className={`flex h-full flex-col ${className}`}>
      <ForkSessionDialog
        sessionName={sessionName || null}
        open={showForkDialog}
        onOpenChange={setShowForkDialog}
        onConfirm={handleForkConfirm}
      />
      {showAllowedTools && (
        <AllowedToolsSettings
          sessionTools={allowedTools}
          globalTools={globalAllowedTools}
          onUpdateSession={handleUpdateAllowedTools}
          onUpdateGlobal={handleUpdateGlobalAllowedTools}
          onClose={() => setShowAllowedTools(false)}
        />
      )}
      {showHeader && (
        <div className="flex flex-col border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 sm:px-3 sm:py-2">
            {/* Left: Status indicators */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              <Badge variant={isConnected ? 'default' : 'secondary'} className="text-xs">
                <Circle className={`mr-1 h-2 w-2 fill-current ${isConnected ? 'text-green-500' : 'text-gray-400'}`} />
                <span className="hidden md:inline">{isConnected ? 'Connected' : 'Disconnected'}</span>
              </Badge>
              {thinking && (
                <Badge variant="secondary" className="bg-blue-100 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                  <span className="mr-1">🤔</span>
                  <span className="hidden md:inline">Thinking...</span>
                </Badge>
              )}
              {todos.length > 0 && (
                <button
                  onClick={() => setIsTodoExpanded(!isTodoExpanded)}
                  className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {isTodoExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
                  )}
                  <ListTodo className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="text-gray-700 dark:text-gray-300">
                    {completedCount}/{todos.length}
                  </span>
                  {inProgressCount > 0 && (
                    <Circle className="h-2.5 w-2.5 animate-pulse fill-current text-blue-600 dark:text-blue-400" />
                  )}
                </button>
              )}
            </div>

            {/* Right: Action buttons */}
            <div className="flex items-center gap-0.5 sm:gap-1">
              {/* Panel toggles */}
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFileBrowser(prev => !prev)}
                  disabled={!isConnected}
                  className={`h-7 w-7 flex-shrink-0 p-0 sm:h-8 sm:w-8 ${showFileBrowser ? 'bg-gray-200 dark:bg-gray-600' : ''}`}
                  title="File browser"
                >
                  <FolderOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowGitPanel(prev => !prev)}
                  disabled={!isConnected}
                  className={`h-7 w-7 flex-shrink-0 p-0 sm:h-8 sm:w-8 ${showGitPanel ? 'bg-gray-200 dark:bg-gray-600' : ''}`}
                  title="Git status"
                >
                  <GitCommitHorizontal className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowTerminal(prev => !prev)}
                  disabled={!isConnected}
                  className={`h-7 w-7 flex-shrink-0 p-0 sm:h-8 sm:w-8 ${showTerminal ? 'bg-gray-200 dark:bg-gray-600' : ''}`}
                  title="Terminal (Ctrl+`)"
                >
                  <Terminal className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
              </div>

              {/* Separator */}
              <div className="mx-1 hidden h-4 w-px bg-gray-300 dark:bg-gray-600 sm:block" />

              {/* Settings */}
              <div className="flex items-center">
                {/* Permission Mode Dropdown */}
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPermissionModeMenu(prev => !prev)}
                    disabled={!isConnected}
                    className={`flex h-7 flex-shrink-0 items-center gap-1 px-1.5 sm:h-8 sm:gap-1.5 sm:px-2 ${showPermissionModeMenu ? 'bg-gray-200 dark:bg-gray-600' : ''}`}
                    title={`Permission mode: ${permissionModeConfig[permissionMode].description}`}
                  >
                    {(() => {
                      const ModeIcon = permissionModeConfig[permissionMode].icon;
                      return <ModeIcon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${permissionModeConfig[permissionMode].color}`} />;
                    })()}
                    <span className="hidden text-xs md:inline">{permissionModeConfig[permissionMode].label}</span>
                    <ChevronDown className="hidden h-3 w-3 text-gray-400 md:block" />
                  </Button>
                  {showPermissionModeMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowPermissionModeMenu(false)}
                      />
                      <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                        {(Object.keys(permissionModeConfig) as PermissionMode[]).map((mode) => {
                          const config = permissionModeConfig[mode];
                          const ModeIcon = config.icon;
                          const isActive = mode === permissionMode;
                          return (
                            <button
                              key={mode}
                              onClick={() => handlePermissionModeChange(mode)}
                              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                                isActive ? 'bg-gray-100 dark:bg-gray-700' : ''
                              }`}
                            >
                              <ModeIcon className={`h-4 w-4 ${config.color}`} />
                              <div className="flex-1">
                                <div className="font-medium text-gray-900 dark:text-white">{config.label}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">{config.description}</div>
                              </div>
                              {isActive && (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllowedTools(true)}
                  disabled={!isConnected}
                  className="h-7 w-7 flex-shrink-0 p-0 sm:h-8 sm:w-8"
                  title="Allowed tools settings"
                >
                  <Settings className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
              </div>

              {/* Session actions */}
              {(onFork || onDelete) && (
                <>
                  <div className="mx-1 hidden h-4 w-px bg-gray-300 dark:bg-gray-600 sm:block" />
                  <div className="hidden items-center sm:flex">
                    {onFork && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleFork}
                        disabled={!isConnected}
                        className="h-7 w-7 flex-shrink-0 p-0 sm:h-8 sm:w-8"
                        title="Fork session"
                      >
                        <GitBranch className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                    )}
                    {onDelete && (
                      <div className="relative">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowDeleteConfirm(true)}
                          className="h-7 w-7 flex-shrink-0 p-0 text-gray-500 hover:text-red-500 sm:h-8 sm:w-8"
                          title="Delete session"
                        >
                          <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </Button>
                        {showDeleteConfirm && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => setShowDeleteConfirm(false)}
                            />
                            <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-md border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                              <p className="mb-3 text-sm text-gray-700 dark:text-gray-300">
                                Delete "{sessionName || 'this session'}"?
                              </p>
                              {worktreePath && (
                                <p className="mb-3 text-xs text-yellow-600 dark:text-yellow-400">
                                  This will also remove the git worktree.
                                </p>
                              )}
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setShowDeleteConfirm(false)}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => {
                                    onDelete(sessionId, !!worktreePath);
                                    setShowDeleteConfirm(false);
                                  }}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Delete
                                </Button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Expanded Todo List */}
          {isTodoExpanded && todos.length > 0 && (
            <div className="space-y-1 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
              {todos.map((todo, idx) => {
                let Icon = Circle;
                if (todo.status === 'completed') {
                  Icon = CheckCircle2;
                } else if (todo.status === 'in_progress') {
                  Icon = Clock;
                }

                let iconColor = 'text-gray-400 dark:text-gray-500';
                if (todo.status === 'completed') {
                  iconColor = 'text-green-600 dark:text-green-400';
                } else if (todo.status === 'in_progress') {
                  iconColor = 'text-blue-600 dark:text-blue-400';
                }

                const textColor = todo.status === 'completed'
                  ? 'text-gray-500 dark:text-gray-400 line-through'
                  : 'text-gray-700 dark:text-gray-300';

                return (
                  <div key={idx} className="flex items-start gap-2 py-1">
                    <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${iconColor} ${todo.status === 'in_progress' ? 'animate-pulse' : ''}`} />
                    <span className={`text-sm ${textColor}`}>
                      {todo.status === 'in_progress' ? todo.activeForm : todo.content}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          Error: {error}
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <ClaudeConversationView
          messages={messages}
          thinking={thinking}
          pendingRequest={pendingRequest}
          onApproveRequest={handleApproveRequest}
          onApproveAndRememberRequest={handleApproveAndRememberRequest}
          onApproveAndRememberGlobalRequest={handleApproveAndRememberGlobalRequest}
          onApproveAndSwitchToAcceptEdits={handleApproveAndSwitchToAcceptEdits}
          onApproveAndSwitchToBypass={handleApproveAndSwitchToBypass}
          onDenyRequest={handleDenyRequest}
          toolResults={toolResults}
          sessionId={sessionId}
        />
        <ClaudeInputBar
          onSendMessage={handleSendMessage}
          onAbort={handleAbort}
          disabled={!isConnected}
          showAbort={thinking}
          slashCommands={slashCommands}
          socket={socket}
          workingDir={workingDir}
          placeholder={(() => {
            if (!isConnected) return 'Connecting...';
            if (pendingRequest) return 'Type to deny with message, or use buttons above...';
            if (thinking) return 'Waiting for Claude...';
            return 'Ask Claude Code...';
          })()}
        />
        <FileBrowser
          mode="socket"
          sessionId={sessionId}
          socket={socket}
          isOpen={showFileBrowser}
          onClose={() => setShowFileBrowser(false)}
        />
        <GitPanel
          workingDir={workingDir}
          isOpen={showGitPanel}
          onClose={() => setShowGitPanel(false)}
        />
        <TerminalPane
          sessionId={sessionId}
          isOpen={showTerminal}
          onClose={() => setShowTerminal(false)}
        />
      </div>
    </div>
  );
}
