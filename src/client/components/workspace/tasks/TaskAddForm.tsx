import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { useFileAttachments, type FileAttachment } from '../../../hooks/useFileAttachments';
import { FileAttachmentArea } from '../../shared/FileAttachmentArea';

interface TaskAddFormProps {
  onSubmit: (title: string, description?: string, attachments?: FileAttachment[]) => Promise<void>;
  onCancel: () => void;
}

export function TaskAddForm({ onSubmit, onCancel }: TaskAddFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

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

  const handleSubmit = async () => {
    if (!title.trim()) return;
    await onSubmit(
      title.trim(),
      description.trim() || undefined,
      attachments.length > 0 ? attachments : undefined
    );
    setTitle('');
    setDescription('');
    clearAttachments();
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
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && !e.shiftKey && title.trim()) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        onPaste={handlePaste}
      />
      <textarea
        value={description}
        onChange={(e) => {
          setDescription(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        placeholder="Description (optional)..."
        className="mb-2 w-full resize-none rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500"
        rows={2}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
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
          Add Task
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
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
