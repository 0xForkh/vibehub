import { useState, useMemo, useEffect } from 'react';
import { Plus, FolderOpen, GitCommitHorizontal } from 'lucide-react';
import { Button } from '../ui/button';
import { TaskCard } from './tasks/TaskCard';
import { TaskAddForm } from './tasks/TaskAddForm';
import { useTaskList } from './tasks/useTaskList';
import { getTaskStatus, type Task, type TaskAttachment, type SessionStatusInfo } from './tasks/types';
import { FileBrowser } from '../claude/FileBrowser';
import { GitPanel } from '../claude/GitPanel';
import { StartSessionDialog } from './StartSessionDialog';
import { SessionPreviewDrawer } from './SessionPreviewDrawer';
import { useIsMobile } from '../../hooks/useIsMobile';
import type { SessionManagerResult } from '../../types/sessionState';

interface TaskListViewProps {
  projectPath: string;
  projectName: string;
  validSessionIds?: Set<string>;
  sessionManager?: SessionManagerResult;
  onCreateSession?: (name: string, workingDir: string, initialPrompt?: string, taskId?: string, attachments?: TaskAttachment[], worktree?: { branch: string }) => Promise<string | undefined>;
  onOpenSession?: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
}

export function TaskListView({
  projectPath,
  projectName,
  validSessionIds,
  sessionManager,
  onCreateSession,
  onOpenSession,
  onDeleteSession,
}: TaskListViewProps) {
  const { tasks, loading, createTask, updateTask, deleteTask, markDone } = useTaskList({
    projectPath,
    onDeleteSession,
  });

  const [isAdding, setIsAdding] = useState(false);
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [showGitPanel, setShowGitPanel] = useState(false);
  const [startSessionTask, setStartSessionTask] = useState<Task | null>(null);
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'todo' | 'review'>('todo');
  const isMobile = useIsMobile();

  // Subscribe to the preview session when it changes
  useEffect(() => {
    if (previewSessionId && sessionManager) {
      sessionManager.subscribeToSession(previewSessionId);
    }
  }, [previewSessionId, sessionManager]);

  // Build a map of session statuses for tasks with linked sessions
  const sessionStatusMap = useMemo((): Map<string, SessionStatusInfo> => {
    const map = new Map<string, SessionStatusInfo>();
    if (!sessionManager) return map;

    tasks.forEach(task => {
      if (task.sessionId) {
        const state = sessionManager.sessionStates.get(task.sessionId);
        if (state) {
          map.set(task.sessionId, {
            isThinking: state.thinking,
            hasPendingPermission: state.pendingRequest !== null,
            isDone: state.isDone,
            isConnected: state.isConnected,
          });
        }
      }
    });
    return map;
  }, [sessionManager, tasks]);

  const handleEditSubmit = async (taskId: string, attachments?: TaskAttachment[]) => {
    if (editingTitle.trim()) {
      await updateTask(taskId, {
        title: editingTitle.trim(),
        description: editingDescription.trim() || undefined,
        attachments,
      });
    }
    setEditingTask(null);
    setEditingTitle('');
    setEditingDescription('');
  };

  const handleCancelEdit = () => {
    setEditingTask(null);
    setEditingTitle('');
    setEditingDescription('');
  };

  const handleStartSession = (task: Task) => {
    setStartSessionTask(task);
  };

  const handleStartSessionConfirm = async (
    name: string,
    workingDir: string,
    initialPrompt?: string,
    taskId?: string,
    attachments?: TaskAttachment[],
    worktree?: { branch: string }
  ) => {
    const sessionId = await onCreateSession?.(name, workingDir, initialPrompt, taskId, attachments, worktree);
    setStartSessionTask(null);
    // Open the session preview drawer instead of navigating to the session tab
    if (sessionId) {
      setPreviewSessionId(sessionId);
    }
  };

  // Split tasks: left = pending + doing, right = review
  // Sort by createdAt descending (newest first), with "doing" tasks at the bottom
  const sortByNewest = (a: Task, b: Task) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

  const sortLeftTasks = (a: Task, b: Task) => {
    const aStatus = getTaskStatus(a, validSessionIds);
    const bStatus = getTaskStatus(b, validSessionIds);
    if (aStatus === 'doing' && bStatus !== 'doing') return 1;
    if (bStatus === 'doing' && aStatus !== 'doing') return -1;
    return sortByNewest(a, b);
  };

  const leftTasks = tasks.filter(t => getTaskStatus(t, validSessionIds) !== 'review').sort(sortLeftTasks);
  const rightTasks = tasks.filter(t => getTaskStatus(t, validSessionIds) === 'review').sort(sortByNewest);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">Loading tasks...</div>
      </div>
    );
  }

  const renderTaskCard = (task: Task, column: 'left' | 'right') => (
    <TaskCard
      key={task.id}
      task={task}
      isEditing={editingTask === task.id}
      editingTitle={editingTitle}
      editingDescription={editingDescription}
      validSessionIds={validSessionIds}
      sessionStatus={task.sessionId ? sessionStatusMap.get(task.sessionId) : undefined}
      onEditStart={() => {
        setEditingTask(task.id);
        setEditingTitle(task.title);
        setEditingDescription(task.description || '');
      }}
      onEditCancel={handleCancelEdit}
      onEditSubmit={(attachments) => handleEditSubmit(task.id, attachments)}
      onEditTitleChange={setEditingTitle}
      onEditDescriptionChange={setEditingDescription}
      onStartSession={onCreateSession ? () => handleStartSession(task) : undefined}
      onOpenSession={onOpenSession}
      onPreviewSession={sessionManager ? setPreviewSessionId : undefined}
      onMarkDone={() => markDone(task)}
      onDelete={() => deleteTask(task.id)}
      onMoveToReview={column === 'left' ? () => updateTask(task.id, { column: 'review' }) : undefined}
      onMoveToTodo={column === 'right' ? () => updateTask(task.id, { column: 'todo' }) : undefined}
      projectPath={projectPath}
    />
  );

  return (
    <div className="flex h-full flex-col bg-gray-100 dark:bg-gray-900">
      {/* Header - merged with tabs on mobile */}
      {isMobile ? (
        <div className="flex items-center border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <button
            onClick={() => setMobileTab('todo')}
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              mobileTab === 'todo'
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Todo
            <span className="ml-1 text-xs">({leftTasks.length})</span>
          </button>
          <button
            onClick={() => setMobileTab('review')}
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              mobileTab === 'review'
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Review
            <span className="ml-1 text-xs">({rightTasks.length})</span>
          </button>
          <div className="flex shrink-0 items-center px-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsAdding(true)}
              className="h-7 w-7 p-0"
              title="Add task"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFileBrowser(true)}
              className="h-7 w-7 p-0"
              title="Browse files"
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowGitPanel(true)}
              className="h-7 w-7 p-0"
              title="Git status"
            >
              <GitCommitHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800">
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
            {projectName}
          </h1>
          <div className="flex shrink-0 items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFileBrowser(true)}
              className="h-7 w-7 p-0"
              title="Browse files"
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowGitPanel(true)}
              className="h-7 w-7 p-0"
              title="Git status"
            >
              <GitCommitHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Mobile: Single column with tabs / Desktop: Two columns side by side */}
      <div className="flex flex-1 flex-col gap-4 overflow-hidden p-2 md:flex-row md:p-4">
        {/* Left column: Todo / In Progress */}
        <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-800 ${isMobile && mobileTab !== 'todo' ? 'hidden' : ''}`}>
          {/* Desktop header */}
          <div className="hidden items-center justify-between px-3 py-2 md:flex">
            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Todo / In Progress
              <span className="ml-2 text-xs text-gray-500">({leftTasks.length})</span>
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setIsAdding(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-2">
            {isAdding && (
              <TaskAddForm
                onSubmit={async (title, description, attachments) => {
                  await createTask(title, description, attachments);
                  setIsAdding(false);
                }}
                onCancel={() => setIsAdding(false)}
                workingDir={projectPath}
              />
            )}
            {leftTasks.map(task => renderTaskCard(task, 'left'))}
            {leftTasks.length === 0 && !isAdding && (
              <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                No tasks yet
              </div>
            )}
          </div>
        </div>

        {/* Right column: To Review */}
        <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-800 ${isMobile && mobileTab !== 'review' ? 'hidden' : ''}`}>
          {/* Desktop header */}
          <div className="hidden items-center justify-between px-3 py-2 md:flex">
            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              To Review
              <span className="ml-2 text-xs text-gray-500">({rightTasks.length})</span>
            </h2>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-2">
            {rightTasks.map(task => renderTaskCard(task, 'right'))}
            {rightTasks.length === 0 && (
              <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                No tasks ready for review
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <FileBrowser
        mode="api"
        workingDir={projectPath}
        isOpen={showFileBrowser}
        onClose={() => setShowFileBrowser(false)}
      />
      <GitPanel
        workingDir={projectPath}
        isOpen={showGitPanel}
        onClose={() => setShowGitPanel(false)}
      />
      <StartSessionDialog
        taskTitle={startSessionTask?.title || null}
        taskDescription={startSessionTask?.description}
        taskId={startSessionTask?.id}
        attachments={startSessionTask?.attachments}
        projectPath={projectPath}
        open={!!startSessionTask}
        onOpenChange={(open) => !open && setStartSessionTask(null)}
        onConfirm={handleStartSessionConfirm}
      />
      <SessionPreviewDrawer
        isOpen={!!previewSessionId}
        onClose={() => setPreviewSessionId(null)}
        sessionId={previewSessionId}
        sessionState={previewSessionId ? sessionManager?.sessionStates.get(previewSessionId) : undefined}
        onOpenSession={onOpenSession}
      />
    </div>
  );
}
