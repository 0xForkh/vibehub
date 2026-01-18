import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { TaskCard } from './tasks/TaskCard';
import { TaskAddForm } from './tasks/TaskAddForm';
import { useTaskList } from './tasks/useTaskList';
import { getTaskStatus, type Task } from './tasks/types';

interface TaskListViewProps {
  projectPath: string;
  projectName: string;
  validSessionIds?: Set<string>;
  onCreateSession?: (name: string, workingDir: string, initialPrompt?: string, taskId?: string) => void;
  onOpenSession?: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
}

export function TaskListView({
  projectPath,
  projectName,
  validSessionIds,
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

  const handleEditSubmit = async (taskId: string) => {
    if (editingTitle.trim()) {
      await updateTask(taskId, {
        title: editingTitle.trim(),
        description: editingDescription.trim() || undefined,
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
      onEditStart={() => {
        setEditingTask(task.id);
        setEditingTitle(task.title);
        setEditingDescription(task.description || '');
      }}
      onEditCancel={handleCancelEdit}
      onEditSubmit={() => handleEditSubmit(task.id)}
      onEditTitleChange={setEditingTitle}
      onEditDescriptionChange={setEditingDescription}
      onCreateSession={onCreateSession}
      onOpenSession={onOpenSession}
      onMarkDone={() => markDone(task)}
      onDelete={() => deleteTask(task.id)}
      onMoveToReview={column === 'left' ? () => updateTask(task.id, { column: 'review' }) : undefined}
      onMoveToTodo={column === 'right' ? () => updateTask(task.id, { column: 'todo' }) : undefined}
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
              onClick={() => setIsAdding(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-2">
            {isAdding && (
              <TaskAddForm
                onSubmit={async (title, description) => {
                  await createTask(title, description);
                  setIsAdding(false);
                }}
                onCancel={() => setIsAdding(false)}
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
