import { Plus, Check, MoreVertical, Trash2, Play, ExternalLink, ArrowRight, ArrowLeft, Paperclip } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { getTaskStatus, type Task, type TaskStatus, type TaskAttachment } from './types';
import { AttachmentDisplay, FileAttachmentArea } from '../../shared/FileAttachmentArea';
import { useFileAttachments, type FileAttachment } from '../../../hooks/useFileAttachments';
import { useEffect } from 'react';

// Suppress unused import warning - Plus is re-exported for TaskAddForm
void Plus;

function StatusBadge({ status }: { status: TaskStatus }) {
  const variants: Record<TaskStatus, { variant: 'secondary' | 'default' | 'warning'; label: string }> = {
    pending: { variant: 'secondary', label: 'Pending' },
    doing: { variant: 'default', label: 'In Progress' },
    review: { variant: 'warning', label: 'Review' },
  };

  const { variant, label } = variants[status];

  return (
    <Badge variant={variant} className="shrink-0 whitespace-nowrap">
      {label}
    </Badge>
  );
}

interface TaskCardProps {
  task: Task;
  isEditing: boolean;
  editingTitle: string;
  editingDescription: string;
  validSessionIds?: Set<string>;
  onEditStart: () => void;
  onEditCancel: () => void;
  onEditSubmit: (attachments?: TaskAttachment[]) => void;
  onEditTitleChange: (value: string) => void;
  onEditDescriptionChange: (value: string) => void;
  onCreateSession?: (name: string, workingDir: string, initialPrompt?: string, taskId?: string, attachments?: TaskAttachment[]) => void;
  onOpenSession?: (sessionId: string) => void;
  onMarkDone: () => void;
  onDelete: () => void;
  onMoveToReview?: () => void;
  onMoveToTodo?: () => void;
  projectPath: string;
}

export function TaskCard({
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

  const {
    attachments,
    setAttachments,
    isDragging,
    fileInputRef,
    dropZoneRef,
    handleFileInputChange,
    handlePaste,
    removeAttachment,
    openFilePicker,
    dragProps,
    acceptedTypes,
  } = useFileAttachments([]);

  // Convert TaskAttachment to FileAttachment for display
  const displayAttachments: FileAttachment[] = (task.attachments || []).map(a => ({
    name: a.name,
    type: a.type,
    size: a.size,
    data: a.data,
    preview: a.type.startsWith('image/') ? `data:${a.type};base64,${a.data}` : undefined,
    dataUrl: a.type.startsWith('image/') ? `data:${a.type};base64,${a.data}` : undefined,
  }));

  // Reset attachments when editing starts - load from task
  useEffect(() => {
    if (isEditing) {
      const taskAttachments: FileAttachment[] = (task.attachments || []).map(a => ({
        name: a.name,
        type: a.type,
        size: a.size,
        data: a.data,
        preview: a.type.startsWith('image/') ? `data:${a.type};base64,${a.data}` : undefined,
        dataUrl: a.type.startsWith('image/') ? `data:${a.type};base64,${a.data}` : undefined,
      }));
      setAttachments(taskAttachments);
    }
  }, [isEditing, task.id, setAttachments]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = () => {
    const taskAttachments: TaskAttachment[] = attachments.map(a => ({
      name: a.name,
      type: a.type,
      size: a.size,
      data: a.data,
    }));
    onEditSubmit(taskAttachments.length > 0 ? taskAttachments : undefined);
  };

  if (isEditing) {
    return (
      <div
        ref={dropZoneRef}
        {...dragProps}
        className={`relative rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800 ${
          isDragging ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-800' : ''
        }`}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
            <div className="text-center">
              <Paperclip className="mx-auto h-6 w-6 text-blue-500" />
              <p className="mt-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                Drop files here
              </p>
            </div>
          </div>
        )}

        <Input
          value={editingTitle}
          onChange={(e) => onEditTitleChange(e.target.value)}
          className="mb-2"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Escape') onEditCancel();
            if (e.key === 'Enter') handleSubmit();
          }}
          onPaste={handlePaste}
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
          className="mb-2 w-full resize-none rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onEditCancel();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          onPaste={handlePaste}
        />

        {/* File attachments */}
        <FileAttachmentArea
          attachments={attachments}
          onRemove={removeAttachment}
          isDragging={false}
          dropZoneRef={{ current: null }}
          fileInputRef={fileInputRef}
          onFileInputChange={handleFileInputChange}
          dragProps={{ onDragEnter: () => {}, onDragLeave: () => {}, onDragOver: () => {}, onDrop: () => {} }}
          acceptedTypes={acceptedTypes}
          compact
        />

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleSubmit}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={onEditCancel}>
            Cancel
          </Button>
          <button
            type="button"
            onClick={openFilePicker}
            className="ml-auto p-1 text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            title="Attach files"
          >
            <Paperclip className="h-4 w-4" />
          </button>
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
            <StatusBadge status={status} />
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
              onClick={() => onCreateSession(task.title, projectPath, task.description, task.id, task.attachments)}
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
      {/* Attachments display */}
      {task.attachments && task.attachments.length > 0 && (
        <div onClick={onEditStart} className="cursor-text">
          <AttachmentDisplay attachments={displayAttachments} compact />
        </div>
      )}
    </div>
  );
}
