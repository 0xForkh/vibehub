import { useState, useRef, useEffect, useCallback } from 'react';
import { Paperclip, File, Loader2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { useFileAttachments, type FileAttachment } from '../../../hooks/useFileAttachments';
import { FileAttachmentArea } from '../../shared/FileAttachmentArea';
import { useFileMention, parseFileMentions } from '../../../hooks/useFileMention';

interface TaskAddFormProps {
  onSubmit: (title: string, description?: string, attachments?: FileAttachment[]) => Promise<void>;
  onCancel: () => void;
  workingDir?: string;
}

export function TaskAddForm({ onSubmit, onCancel, workingDir }: TaskAddFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const fileMentionMenuRef = useRef<HTMLDivElement>(null);

  // File mention hook for description field
  const fileMention = useFileMention({
    workingDir,
    enabled: !!workingDir,
  });

  const {
    attachments,
    isDragging,
    fileInputRef,
    dropZoneRef,
    handleFileInputChange,
    handlePaste,
    removeAttachment,
    clearAttachments,
    openFilePicker,
    dragProps,
    acceptedTypes,
  } = useFileAttachments();

  // Handle file mention selection
  const selectFileMention = useCallback((file: { name: string; path: string }) => {
    const { newValue, newCursorPosition } = fileMention.selectSuggestion(file);
    setDescription(newValue);
    // Set cursor position after React updates
    setTimeout(() => {
      if (descriptionRef.current) {
        descriptionRef.current.selectionStart = newCursorPosition;
        descriptionRef.current.selectionEnd = newCursorPosition;
        descriptionRef.current.focus();
      }
    }, 0);
  }, [fileMention]);

  // Close menu when clicking outside
  useEffect(() => {
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
  }, [fileMention]);

  const handleSubmit = async () => {
    if (!title.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      // Parse file mentions to convert @[name](path) to full path
      const processedDescription = description.trim() ? parseFileMentions(description.trim()) : undefined;
      await onSubmit(
        title.trim(),
        processedDescription,
        attachments.length > 0 ? attachments : undefined
      );
      setTitle('');
      setDescription('');
      clearAttachments();
      fileMention.resetState();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      ref={dropZoneRef}
      {...dragProps}
      className={`rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800 ${
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
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title..."
        className="mb-2"
        autoFocus
        disabled={isSubmitting}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !isSubmitting) onCancel();
          if (e.key === 'Enter' && !e.shiftKey && title.trim() && !isSubmitting) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        onPaste={handlePaste}
      />
      <div className="relative mb-2">
        <textarea
          ref={descriptionRef}
          value={description}
          disabled={isSubmitting}
          onChange={(e) => {
            const value = e.target.value;
            const cursorPosition = e.target.selectionStart || 0;
            setDescription(value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
            // Handle file mention
            fileMention.handleInputChange(value, cursorPosition);
          }}
          placeholder="Description (optional)... Use @ to mention files"
          className="w-full resize-none rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (fileMention.showMenu) {
                e.preventDefault();
                fileMention.closeMenu();
                return;
              }
              if (!isSubmitting) onCancel();
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
        <Button size="sm" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              Adding...
            </>
          ) : (
            'Add Task'
          )}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <button
          type="button"
          onClick={openFilePicker}
          disabled={isSubmitting}
          className="ml-auto p-1 text-gray-400 transition-colors hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-500 dark:hover:text-gray-300"
          title="Attach files"
        >
          <Paperclip className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
