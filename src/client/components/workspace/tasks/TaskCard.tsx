import { Plus, Check, MoreVertical, Trash2, Play, ExternalLink, ArrowRight, ArrowLeft, Paperclip, File, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { getTaskStatus, type Task, type TaskStatus, type TaskAttachment, type SessionStatusInfo } from './types';
import { AttachmentDisplay, FileAttachmentArea } from '../../shared/FileAttachmentArea';
import { useFileAttachments, type FileAttachment } from '../../../hooks/useFileAttachments';
import { useFileMention, parseFileMentions } from '../../../hooks/useFileMention';
import { useEffect, useRef, useCallback } from 'react';

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

/**
 * Shows real-time session status for tasks with active sessions
 * - Thinking: blue pulsing dot
 * - Waiting for permission: orange dot with alert
 * - Done/Idle: green dot
 */
function SessionStatusIndicator({ sessionStatus }: { sessionStatus: SessionStatusInfo }) {
  if (!sessionStatus.isConnected) {
    // Session not connected - show gray dot
    return (
      <span className="relative flex h-2.5 w-2.5 shrink-0" title="Session disconnected">
        <span className="h-2.5 w-2.5 rounded-full bg-gray-400" />
      </span>
    );
  }

  if (sessionStatus.hasPendingPermission) {
    // Waiting for permission - orange with alert icon
    return (
      <span className="relative flex h-3 w-3 shrink-0" title="Waiting for permission">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
        <AlertCircle className="relative h-3 w-3 text-orange-500" />
      </span>
    );
  }

  if (sessionStatus.isThinking) {
    // Thinking - blue pulsing dot
    return (
      <span className="relative flex h-2.5 w-2.5 shrink-0" title="Claude is thinking">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
      </span>
    );
  }

  if (sessionStatus.isDone) {
    // Done/Idle - green dot
    return (
      <span className="relative flex h-2.5 w-2.5 shrink-0" title="Claude finished">
        <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
      </span>
    );
  }

  // Connected but idle (no activity yet)
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0" title="Session ready">
      <span className="h-2.5 w-2.5 rounded-full bg-gray-400" />
    </span>
  );
}

interface TaskCardProps {
  task: Task;
  isEditing: boolean;
  editingTitle: string;
  editingDescription: string;
  validSessionIds?: Set<string>;
  sessionStatus?: SessionStatusInfo;
  onEditStart: () => void;
  onEditCancel: () => void;
  onEditSubmit: (attachments?: TaskAttachment[]) => void;
  onEditTitleChange: (value: string) => void;
  onEditDescriptionChange: (value: string) => void;
  onStartSession?: () => void;
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
  sessionStatus,
  onEditStart,
  onEditCancel,
  onEditSubmit,
  onEditTitleChange,
  onEditDescriptionChange,
  onStartSession,
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

  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const fileMentionMenuRef = useRef<HTMLDivElement>(null);

  // File mention hook for description field
  const fileMention = useFileMention({
    workingDir: projectPath,
    enabled: isEditing && !!projectPath,
  });

  // Handle file mention selection
  const selectFileMention = useCallback((file: { name: string; path: string }) => {
    const { newValue, newCursorPosition } = fileMention.selectSuggestion(file);
    onEditDescriptionChange(newValue);
    // Set cursor position after React updates
    setTimeout(() => {
      if (descriptionRef.current) {
        descriptionRef.current.selectionStart = newCursorPosition;
        descriptionRef.current.selectionEnd = newCursorPosition;
        descriptionRef.current.focus();
      }
    }, 0);
  }, [fileMention, onEditDescriptionChange]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        fileMentionMenuRef.current &&
        !fileMentionMenuRef.current.contains(target) &&
        descriptionRef.current &&
        !descriptionRef.current.contains(target)
      ) {
        fileMention.closeMenu();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditing, fileMention]);

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
    // Parse file mentions before saving
    const processedDescription = editingDescription ? parseFileMentions(editingDescription) : editingDescription;
    if (processedDescription !== editingDescription) {
      onEditDescriptionChange(processedDescription);
    }
    const taskAttachments: TaskAttachment[] = attachments.map(a => ({
      name: a.name,
      type: a.type,
      size: a.size,
      data: a.data,
    }));
    fileMention.resetState();
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
        <div className="relative mb-2">
          <textarea
            ref={(el) => {
              if (el) {
                el.style.height = 'auto';
                el.style.height = `${el.scrollHeight}px`;
                // Also assign to our ref for file mention cursor positioning
                (descriptionRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
              }
            }}
            value={editingDescription}
            onChange={(e) => {
              const value = e.target.value;
              const cursorPosition = e.target.selectionStart || 0;
              onEditDescriptionChange(value);
              e.target.style.height = 'auto';
              e.target.style.height = `${e.target.scrollHeight}px`;
              // Handle file mention
              fileMention.handleInputChange(value, cursorPosition);
            }}
            placeholder="Description (optional)... Use @ to mention files"
            className="w-full resize-none rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (fileMention.showMenu) {
                  e.preventDefault();
                  fileMention.closeMenu();
                  return;
                }
                onEditCancel();
              }
              // Handle file mention menu navigation
              if (fileMention.showMenu && fileMention.suggestions.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  fileMention.navigateDown();
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  fileMention.navigateUp();
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  selectFileMention(fileMention.suggestions[fileMention.selectedIndex]);
                  return;
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            onPaste={handlePaste}
          />

          {/* File mention dropdown menu */}
          {fileMention.showMenu && (
            <div
              ref={fileMentionMenuRef}
              className="absolute bottom-full left-0 mb-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
            >
              {fileMention.loading && (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Searching...</span>
                </div>
              )}
              {!fileMention.loading && fileMention.suggestions.length === 0 && fileMention.searchQuery.length >= 2 && (
                <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  No files found
                </div>
              )}
              {!fileMention.loading && fileMention.searchQuery.length < 2 && (
                <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  Type at least 2 characters...
                </div>
              )}
              {fileMention.suggestions.map((file, idx) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => selectFileMention(file)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                    idx === fileMention.selectedIndex
                      ? 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                >
                  <File className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{file.name}</span>
                    <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                      {file.path}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

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
      {/* Header row: title + status chip + session indicator + actions */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 cursor-text" onClick={onEditStart}>
          <div className="flex items-center gap-2">
            <span className="text-base font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 truncate">
              {task.title}
            </span>
            <StatusBadge status={status} />
            {sessionStatus && <SessionStatusIndicator sessionStatus={sessionStatus} />}
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
          ) : onStartSession && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-100 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/30"
              onClick={onStartSession}
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
