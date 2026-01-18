import { useState, useEffect, useCallback } from 'react';
import { Plus, Check, MoreVertical, Trash2, Play, ExternalLink, ArrowRight, ArrowLeft } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { api } from '../../lib/api';

// Placeholder for future attachment support
type FileAttachment = unknown;

interface TaskAttachment {
  name: string;
  type: string;
  size: number;
  data: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  column: 'backlog' | 'todo' | 'review';
  projectPath: string;
  sessionId?: string;
  attachments?: TaskAttachment[];
  createdAt: string;
  updatedAt: string;
}

type TaskStatus = 'pending' | 'doing' | 'review';

interface TaskListViewProps {
  projectPath: string;
  projectName: string;
  validSessionIds?: Set<string>;
  onCreateSession?: (name: string, workingDir: string, initialPrompt?: string, taskId?: string) => void;
  onOpenSession?: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
}

function getTaskStatus(task: Task, validSessionIds?: Set<string>): TaskStatus {
  if (task.column === 'review') return 'review';
  // Only consider session valid if it still exists
  if (task.sessionId && (!validSessionIds || validSessionIds.has(task.sessionId))) return 'doing';
  return 'pending';
}

function StatusChip({ status }: { status: TaskStatus }) {
  const styles = {
    pending: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    doing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  };

  const labels = {
    pending: 'Pending',
    doing: 'In Progress',
    review: 'Review',
  };

  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

interface TaskCardProps {
  task: Task;
  isEditing: boolean;
  editingTitle: string;
  editingDescription: string;
  editingAttachments: FileAttachment[];
  validSessionIds?: Set<string>;
  onEditStart: () => void;
  onEditCancel: () => void;
  onEditSubmit: () => void;
  onEditTitleChange: (value: string) => void;
  onEditDescriptionChange: (value: string) => void;
  onEditAttachmentsChange: (attachments: FileAttachment[]) => void;
  onCreateSession?: (name: string, workingDir: string, initialPrompt?: string, taskId?: string) => void;
  onOpenSession?: (sessionId: string) => void;
  onMarkDone: () => void;
  onDelete: () => void;
  onMoveToReview?: () => void;
  onMoveToTodo?: () => void;
  projectPath: string;
}

function TaskCard({
  task,
  isEditing,
  editingTitle,
  editingDescription,
  validSessionIds,
  onEditStart,
  onEditCancel,
  onEditSubmit,
  onEditTitleChange,
  onEditDescriptionChange,
  onCreateSession,
  onOpenSession,
  onMarkDone,
  onDelete,
  onMoveToReview,
  onMoveToTodo,
  projectPath,
}: TaskCardProps) {
  const status = getTaskStatus(task, validSessionIds);
  const hasValidSession = task.sessionId && (!validSessionIds || validSessionIds.has(task.sessionId));

  if (isEditing) {
    return (
      <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
        <Input
          value={editingTitle}
          onChange={(e) => onEditTitleChange(e.target.value)}
          className="mb-2"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Escape') onEditCancel();
            if (e.key === 'Enter') onEditSubmit();
          }}
        />
        <textarea
          ref={(el) => {
            if (el) {
              el.style.height = 'auto';
              el.style.height = `${el.scrollHeight}px`;
            }
          }}
          value={editingDescription}
          onChange={(e) => {
            onEditDescriptionChange(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          placeholder="Description (optional)..."
          className="mb-3 w-full resize-none rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onEditCancel();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onEditSubmit();
            }
          }}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={onEditSubmit}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={onEditCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const ringClass = status === 'review'
    ? 'ring-2 ring-amber-400 dark:ring-amber-500'
    : status === 'doing'
    ? 'ring-2 ring-blue-400 dark:ring-blue-500'
    : '';

  return (
    <div
      className={`group rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800 ${ringClass}`}
    >
      {/* Header row: title + status chip + actions */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 cursor-text" onClick={onEditStart}>
          <div className="flex items-center gap-2">
            <span className="text-base font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 truncate">
              {task.title}
            </span>
            <StatusChip status={status} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {hasValidSession && onOpenSession ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-100 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/30"
              onClick={() => onOpenSession(task.sessionId!)}
              title="Open session"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          ) : onCreateSession && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-100 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/30"
              onClick={() => onCreateSession(task.title, projectPath, task.description, task.id)}
              title="Start session"
            >
              <Play className="h-4 w-4" />
            </Button>
          )}
          {onMoveToReview && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-amber-600 hover:bg-amber-100 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/30"
              onClick={onMoveToReview}
              title="Move to review"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {onMoveToTodo && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-gray-600 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700"
              onClick={onMoveToTodo}
              title="Move back to todo"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-green-600 hover:bg-green-100 hover:text-green-700 dark:text-green-400 dark:hover:bg-green-900/30"
            onClick={onMarkDone}
            title="Mark as done"
          >
            <Check className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-red-500 focus:text-red-500"
                onClick={onDelete}
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {/* Description on its own row */}
      {task.description && (
        <div
          className="mt-2 text-sm text-gray-500 dark:text-gray-400 whitespace-pre-wrap cursor-text hover:text-gray-700 dark:hover:text-gray-300"
          onClick={onEditStart}
        >
          {task.description}
        </div>
      )}
    </div>
  );
}

export function TaskListView({ projectPath, projectName, validSessionIds, onCreateSession, onOpenSession, onDeleteSession }: TaskListViewProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState<'left' | 'right' | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [editingAttachments, setEditingAttachments] = useState<FileAttachment[]>([]);

  const fetchTasks = useCallback(async () => {
    try {
      const response = await api.get(`/api/tasks?project=${encodeURIComponent(projectPath)}`);
      setTasks(response.data.tasks || []);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    fetchTasks();
    // Poll for updates (e.g., when Claude moves task to review)
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) return;

    try {
      const response = await api.post('/api/tasks', {
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim() || undefined,
        column: 'backlog',
        projectPath,
      });
      setTasks(prev => [...prev, response.data.task]);
      setNewTaskTitle('');
      setNewTaskDescription('');
      setIsAdding(null);
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  const handleUpdateTask = async (taskId: string, updates: Partial<Task>) => {
    try {
      const response = await api.patch(`/api/tasks/${taskId}`, updates);
      setTasks(prev => prev.map(t => t.id === taskId ? response.data.task : t));
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await api.delete(`/api/tasks/${taskId}`);
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  const handleMarkDone = async (task: Task) => {
    // Delete the task
    await handleDeleteTask(task.id);
    // Optionally delete the associated session
    if (task.sessionId && onDeleteSession) {
      onDeleteSession(task.sessionId);
    }
  };

  const handleEditSubmit = async (taskId: string) => {
    if (editingTitle.trim()) {
      await handleUpdateTask(taskId, {
        title: editingTitle.trim(),
        description: editingDescription.trim() || undefined,
      });
    }
    setEditingTask(null);
    setEditingTitle('');
    setEditingDescription('');
  };

  const handleCancelAdd = () => {
    setIsAdding(null);
    setNewTaskTitle('');
    setNewTaskDescription('');
  };

  const handleCancelEdit = () => {
    setEditingTask(null);
    setEditingTitle('');
    setEditingDescription('');
  };

  // Split tasks: left = pending + doing, right = review
  // Sort by createdAt descending (newest first), with "doing" tasks at the bottom
  const sortByNewest = (a: Task, b: Task) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

  const sortLeftTasks = (a: Task, b: Task) => {
    const aStatus = getTaskStatus(a, validSessionIds);
    const bStatus = getTaskStatus(b, validSessionIds);
    // "doing" tasks go to the bottom
    if (aStatus === 'doing' && bStatus !== 'doing') return 1;
    if (bStatus === 'doing' && aStatus !== 'doing') return -1;
    // Within same status, sort by newest first
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

  const renderAddForm = () => (
    <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
      <Input
        value={newTaskTitle}
        onChange={(e) => setNewTaskTitle(e.target.value)}
        placeholder="Task title..."
        className="mb-2"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Escape') handleCancelAdd();
          if (e.key === 'Enter' && !e.shiftKey && newTaskTitle.trim()) {
            e.preventDefault();
            handleCreateTask();
          }
        }}
      />
      <textarea
        value={newTaskDescription}
        onChange={(e) => {
          setNewTaskDescription(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        placeholder="Description (optional)..."
        className="mb-3 w-full resize-none rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500"
        rows={2}
        onKeyDown={(e) => {
          if (e.key === 'Escape') handleCancelAdd();
        }}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={handleCreateTask}>
          Add Task
        </Button>
        <Button size="sm" variant="ghost" onClick={handleCancelAdd}>
          Cancel
        </Button>
      </div>
    </div>
  );

  const renderTaskCard = (task: Task, column: 'left' | 'right') => (
    <TaskCard
      key={task.id}
      task={task}
      isEditing={editingTask === task.id}
      editingTitle={editingTitle}
      editingDescription={editingDescription}
      editingAttachments={editingAttachments}
      validSessionIds={validSessionIds}
      onEditStart={() => {
        setEditingTask(task.id);
        setEditingTitle(task.title);
        setEditingDescription(task.description || '');
        setEditingAttachments([]);
      }}
      onEditCancel={handleCancelEdit}
      onEditSubmit={() => handleEditSubmit(task.id)}
      onEditTitleChange={setEditingTitle}
      onEditDescriptionChange={setEditingDescription}
      onEditAttachmentsChange={setEditingAttachments}
      onCreateSession={onCreateSession}
      onOpenSession={onOpenSession}
      onMarkDone={() => handleMarkDone(task)}
      onDelete={() => handleDeleteTask(task.id)}
      onMoveToReview={column === 'left' ? () => handleUpdateTask(task.id, { column: 'review' }) : undefined}
      onMoveToTodo={column === 'right' ? () => handleUpdateTask(task.id, { column: 'todo' }) : undefined}
      projectPath={projectPath}
    />
  );

  return (
    <div className="flex h-full flex-col bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
          {projectName}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{projectPath}</p>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-1 gap-4 overflow-hidden p-4">
        {/* Left column: Todo / In Progress */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-800">
          <div className="flex items-center justify-between px-3 py-2">
            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Todo / In Progress
              <span className="ml-2 text-xs text-gray-500">({leftTasks.length})</span>
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setIsAdding('left')}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-2">
            {isAdding === 'left' && renderAddForm()}
            {leftTasks.map(task => renderTaskCard(task, 'left'))}
            {leftTasks.length === 0 && isAdding !== 'left' && (
              <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                No tasks yet
              </div>
            )}
          </div>
        </div>

        {/* Right column: To Review */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-800">
          <div className="flex items-center justify-between px-3 py-2">
            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              To Review
              <span className="ml-2 text-xs text-gray-500">({rightTasks.length})</span>
            </h2>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-2">
            {rightTasks.map(task => renderTaskCard(task, 'right'))}
            {rightTasks.length === 0 && (
              <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                No tasks ready for review
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
