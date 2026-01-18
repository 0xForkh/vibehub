import { useState, useMemo, useEffect, useRef } from 'react';
import { BrainCircuit, Plus, ChevronLeft, ChevronRight, ChevronDown, MoreVertical, Pencil, Trash2, FolderOpen, Folder, GitBranch, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { DeleteSessionDialog } from './DeleteSessionDialog';
import { ForkSessionDialog } from './ForkSessionDialog';
import { api } from '../../lib/api';
import type { Session } from '../../hooks/useSessions';
import type { SessionNotification } from '../../types/sessionState';

interface WorktreeOptions {
  branch: string;
  path?: string;
}

interface SessionSidebarProps {
  sessions: Session[];
  activeSessionId: string | null;
  openTabIds: string[];
  isOpen: boolean;
  width: number;
  onToggle: () => void;
  onWidthChange: (width: number) => void;
  onSelectSession: (sessionId: string) => void;
  onSelectProject: (projectPath: string, projectName: string) => void;
  onCreateSession: (name: string, workingDir: string, worktree?: WorktreeOptions) => void;
  onRenameSession: (sessionId: string, name: string) => void;
  onDeleteSession: (sessionId: string, cleanupWorktree?: boolean) => void;
  onForkSession: (sessionId: string, name: string) => void;
  notifications?: SessionNotification[];
}

interface FolderGroup {
  path: string;
  displayName: string;
  sessions: Session[];
}

/**
 * Extract the main project path from a worktree path.
 * Worktree paths are like: /project/.worktrees/branch-name
 * This returns /project for worktrees, or the original path otherwise.
 */
function getProjectPath(workingDir: string): string {
  const worktreeMatch = workingDir.match(/^(.+)\/\.worktrees\/[^/]+$/);
  if (worktreeMatch) {
    return worktreeMatch[1];
  }
  return workingDir;
}

export function SessionSidebar({
  sessions,
  activeSessionId,
  openTabIds,
  isOpen,
  width,
  onToggle,
  onWidthChange,
  onSelectSession,
  onSelectProject,
  onCreateSession,
  onRenameSession,
  onDeleteSession,
  onForkSession,
  notifications = [],
}: SessionSidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [createForFolder, setCreateForFolder] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newWorkingDir, setNewWorkingDir] = useState('~');
  const [useWorktree, setUseWorktree] = useState(false);
  const [worktreeBranch, setWorktreeBranch] = useState('');
  const [dirSuggestions, setDirSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameCancelled, setRenameCancelled] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [deleteDialogSessionId, setDeleteDialogSessionId] = useState<string | null>(null);
  const [forkDialogSessionId, setForkDialogSessionId] = useState<string | null>(null);

  // Get the session being deleted for the dialog
  const sessionToDelete = deleteDialogSessionId
    ? sessions.find(s => s.id === deleteDialogSessionId)
    : null;

  // Get the session being forked for the dialog
  const sessionToFork = forkDialogSessionId
    ? sessions.find(s => s.id === forkDialogSessionId)
    : null;

  // Fetch directory suggestions
  useEffect(() => {
    if (!isCreating || !newWorkingDir) {
      setDirSuggestions([]);
      return;
    }

    const fetchSuggestions = async () => {
      try {
        const response = await api.get(`/api/sessions/directories?path=${encodeURIComponent(newWorkingDir)}`);
        setDirSuggestions(response.data.directories || []);
        setSelectedSuggestionIndex(-1);
      } catch {
        setDirSuggestions([]);
      }
    };

    const debounce = setTimeout(fetchSuggestions, 150);
    return () => clearTimeout(debounce);
  }, [newWorkingDir, isCreating]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        dirInputRef.current &&
        !dirInputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectSuggestion = (path: string) => {
    setNewWorkingDir(path);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    dirInputRef.current?.focus();
  };

  const handleDirKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || dirSuggestions.length === 0) {
      if (e.key === 'Enter') handleCreate();
      if (e.key === 'Escape') setIsCreating(false);
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestionIndex(prev =>
          prev < dirSuggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestionIndex(prev =>
          prev > 0 ? prev - 1 : dirSuggestions.length - 1
        );
        break;
      case 'Tab':
      case 'Enter':
        e.preventDefault();
        if (selectedSuggestionIndex >= 0) {
          handleSelectSuggestion(dirSuggestions[selectedSuggestionIndex]);
        } else if (dirSuggestions.length > 0) {
          handleSelectSuggestion(dirSuggestions[0]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedSuggestionIndex(-1);
        break;
    }
  };

  // Normalize path: remove trailing slashes, handle ~ consistently
  const normalizePath = (path: string): string => {
    let normalized = path.trim();
    // Remove trailing slashes (except for root "/")
    while (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  };

  // Group Claude sessions by working directory (worktrees grouped with main project)
  const folderGroups = useMemo(() => {
    const claudeSessions = sessions.filter(s => s.type === 'claude');
    const groups = new Map<string, Session[]>();

    for (const session of claudeSessions) {
      const rawWorkingDir = normalizePath(session.claudeMetadata?.workingDir || '~');
      // Group worktree sessions with their main project
      const projectPath = getProjectPath(rawWorkingDir);
      if (!groups.has(projectPath)) {
        groups.set(projectPath, []);
      }
      groups.get(projectPath)!.push(session);
    }

    // Convert to array, sort folders alphabetically, sort sessions within each folder
    const result: FolderGroup[] = [];
    for (const [path, folderSessions] of groups) {
      // Get display name (last part of path)
      const displayName = path.split('/').filter(Boolean).pop() || path;
      result.push({
        path,
        displayName,
        sessions: folderSessions.sort((a, b) => a.name.localeCompare(b.name)),
      });
    }

    return result.sort((a, b) => a.path.localeCompare(b.path));
  }, [sessions]);

  const toggleFolder = (path: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleCreate = () => {
    if (newName.trim()) {
      const worktree = useWorktree && worktreeBranch.trim()
        ? { branch: worktreeBranch.trim() }
        : undefined;
      onCreateSession(newName.trim(), newWorkingDir.trim() || '~', worktree);
      setNewName('');
      setNewWorkingDir('~');
      setUseWorktree(false);
      setWorktreeBranch('');
      setIsCreating(false);
      setCreateForFolder(null);
    }
  };

  const handleCreateInFolder = (folderPath: string) => {
    setCreateForFolder(folderPath);
    setNewWorkingDir(folderPath);
    setIsCreating(true);
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    setCreateForFolder(null);
    setNewName('');
    setNewWorkingDir('~');
    setUseWorktree(false);
    setWorktreeBranch('');
  };

  const handleRename = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      setRenamingId(sessionId);
      setRenameValue(session.name);
      setRenameCancelled(false);
    }
  };

  const handleRenameSubmit = (sessionId: string) => {
    // Guard against double submit (Enter + onBlur both fire)
    if (renamingId !== sessionId) return;
    if (renameCancelled) {
      setRenameCancelled(false);
      setRenamingId(null);
      return;
    }
    const trimmedName = renameValue.trim();
    setRenamingId(null); // Clear first to prevent double submit
    if (trimmedName) {
      onRenameSession(sessionId, trimmedName);
    }
  };

  const handleRenameCancel = () => {
    setRenameCancelled(true);
    setRenamingId(null);
  };

  const handleDelete = (sessionId: string) => {
    // Check if session has worktree - if so, show dialog
    const session = sessions.find(s => s.id === sessionId);
    if (session?.claudeMetadata?.worktreePath) {
      setDeleteDialogSessionId(sessionId);
    } else {
      onDeleteSession(sessionId);
    }
  };

  const handleDeleteConfirm = (sessionId: string, cleanupWorktree: boolean) => {
    onDeleteSession(sessionId, cleanupWorktree);
    setDeleteDialogSessionId(null);
  };

  const handleFork = (sessionId: string) => {
    setForkDialogSessionId(sessionId);
  };

  const handleForkConfirm = (name: string) => {
    if (forkDialogSessionId) {
      onForkSession(forkDialogSessionId, name);
      setForkDialogSessionId(null);
    }
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      const newWidth = Math.max(180, Math.min(400, startWidth + delta));
      onWidthChange(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  if (!isOpen) {
    return (
      <div className="hidden h-full w-10 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900 md:flex">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="m-1 h-8 w-8 p-0"
          title="Open sidebar"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <div
        className="relative flex h-full flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900"
        style={{ width }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Sessions</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCreating(true)}
              className="h-7 w-7 p-0"
              title="New session"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="h-7 w-7 p-0"
              title="Close sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Create form */}
        {isCreating && (
          <div className="border-b border-gray-200 p-3 space-y-2 dark:border-gray-700">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Session name"
              className="h-8 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') handleCancelCreate();
              }}
            />
            {/* Only show folder picker if not creating for a specific folder */}
            {!createForFolder && (
              <div className="relative">
                <div className="flex items-center gap-1">
                  <FolderOpen className="h-4 w-4 text-gray-500 flex-shrink-0" />
                  <Input
                    ref={dirInputRef}
                    value={newWorkingDir}
                    onChange={(e) => {
                      setNewWorkingDir(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder="Working directory"
                    className="h-8 text-sm"
                    onKeyDown={handleDirKeyDown}
                  />
                </div>
                {/* Autocomplete suggestions */}
                {showSuggestions && dirSuggestions.length > 0 && (
                  <div
                    ref={suggestionsRef}
                    className="absolute left-5 right-0 top-full z-50 mt-1 max-h-40 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
                  >
                    {dirSuggestions.map((dir, index) => (
                      <button
                        key={dir}
                        className={`flex w-full items-center gap-2 px-2 py-1 text-left text-sm ${
                          index === selectedSuggestionIndex
                            ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white'
                            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                        }`}
                        onClick={() => handleSelectSuggestion(dir)}
                      >
                        <Folder className="h-3 w-3 flex-shrink-0 text-yellow-600" />
                        <span className="truncate">{dir}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {createForFolder && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Folder className="h-3 w-3 text-yellow-600" />
                <span className="truncate">{createForFolder}</span>
              </div>
            )}
            {/* Worktree option */}
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useWorktree}
                  onChange={(e) => setUseWorktree(e.target.checked)}
                  className="h-3 w-3 rounded border-gray-600 bg-gray-800"
                />
                <GitBranch className="h-3 w-3" />
                <span>Git worktree</span>
              </label>
            </div>
            {useWorktree && (
              <div className="flex items-center gap-1">
                <GitBranch className="h-4 w-4 text-gray-500 flex-shrink-0" />
                <Input
                  value={worktreeBranch}
                  onChange={(e) => setWorktreeBranch(e.target.value)}
                  placeholder="Branch name (e.g., feature/auth)"
                  className="h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') handleCancelCreate();
                  }}
                />
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} className="flex-1 h-7">
                Create
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancelCreate} className="h-7">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Session list grouped by folder */}
        <div className="flex-1 overflow-y-auto">
          {folderGroups.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">
              No sessions yet
            </div>
          ) : (
            <div className="py-1">
              {folderGroups.map((group) => {
                const isCollapsed = collapsedFolders.has(group.path);

                return (
                  <div key={group.path}>
                    {/* Folder header */}
                    <div
                      className="group/folder flex items-center gap-1 px-2 py-1.5 text-gray-600 dark:text-gray-400"
                      title={group.path}
                    >
                      <button
                        className="flex-shrink-0 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                        onClick={() => toggleFolder(group.path)}
                      >
                        {isCollapsed ? (
                          <ChevronRight className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        className="flex flex-1 items-center gap-1 truncate hover:text-gray-900 dark:hover:text-gray-200"
                        onClick={() => onSelectProject(group.path, group.displayName)}
                      >
                        <Folder className="h-4 w-4 flex-shrink-0 text-yellow-600" />
                        <span className="truncate text-sm font-medium">{group.displayName}</span>
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 opacity-0 group-hover/folder:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCreateInFolder(group.path);
                        }}
                        title="New session in this folder"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <span className="text-xs text-gray-500">{group.sessions.length}</span>
                    </div>

                    {/* Sessions in folder */}
                    {!isCollapsed && group.sessions.map((session) => {
                      const isActive = session.id === activeSessionId;
                      const isTabOpen = openTabIds.includes(session.id);
                      const isRenaming = renamingId === session.id;
                      const isWorktree = session.claudeMetadata?.worktreePath != null;
                      const notification = notifications.find(n => n.sessionId === session.id);
                      const hasPendingPermission = notification?.hasPendingPermission && !isActive;
                      const isThinking = notification?.isThinking && !isActive;
                      const hasError = notification?.hasError && !isActive;
                      const isDone = notification?.isDone && !isActive;

                      return (
                        <div
                          key={session.id}
                          className={`group flex items-center gap-2 py-1.5 pl-7 pr-3 cursor-pointer ${
                            isActive
                              ? 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-white'
                              : hasPendingPermission
                              ? 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:hover:bg-orange-900/50'
                              : isDone
                              ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50'
                              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
                          }`}
                          onClick={() => !isRenaming && onSelectSession(session.id)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleRename(session.id);
                          }}
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

                          {isRenaming ? (
                            <Input
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              className="h-6 text-sm flex-1"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Enter') handleRenameSubmit(session.id);
                                if (e.key === 'Escape') handleRenameCancel();
                              }}
                              onBlur={() => handleRenameSubmit(session.id)}
                            />
                          ) : (
                            <span className="flex-1 truncate text-sm flex items-center gap-1">
                              {session.name}
                              {isWorktree && (
                                <span title="Worktree session">
                                  <GitBranch className="h-3 w-3 text-green-500 flex-shrink-0" />
                                </span>
                              )}
                            </span>
                          )}

                          {isTabOpen && !isRenaming && (
                            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                              open
                            </Badge>
                          )}

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 touch:opacity-100"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleRename(session.id)}>
                                <Pencil className="h-3 w-3" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleFork(session.id)}>
                                <GitBranch className="h-3 w-3" />
                                Fork
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-500 focus:text-red-500 dark:text-red-400 dark:focus:text-red-400"
                                onClick={() => handleDelete(session.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Resize handle */}
        <div
          className={`absolute top-0 -right-1 h-full w-2 cursor-col-resize transition-colors hover:bg-blue-500/50 ${
            isResizing ? 'bg-blue-500' : ''
          }`}
          onMouseDown={handleResizeStart}
        />
      </div>

      {/* Delete session dialog (for sessions with worktrees) */}
      <DeleteSessionDialog
        session={sessionToDelete || null}
        open={!!deleteDialogSessionId}
        onOpenChange={(open) => !open && setDeleteDialogSessionId(null)}
        onConfirm={handleDeleteConfirm}
      />

      {/* Fork session dialog */}
      <ForkSessionDialog
        sessionName={sessionToFork?.name || null}
        open={!!forkDialogSessionId}
        onOpenChange={(open) => !open && setForkDialogSessionId(null)}
        onConfirm={handleForkConfirm}
      />
    </>
  );
}
