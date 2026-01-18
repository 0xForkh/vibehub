import { Paperclip, X, FileText, Image as ImageIcon } from 'lucide-react';
import React from 'react';
import type { FileAttachment } from '../../hooks/useFileAttachments';
import { formatFileSize } from '../../hooks/useFileAttachments';

interface FileAttachmentAreaProps {
  attachments: FileAttachment[];
  onRemove: (index: number) => void;
  isDragging: boolean;
  dropZoneRef: React.RefObject<HTMLDivElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  dragProps: {
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  acceptedTypes: string;
  compact?: boolean;
}

export function FileAttachmentArea({
  attachments,
  onRemove,
  isDragging,
  dropZoneRef,
  fileInputRef,
  onFileInputChange,
  dragProps,
  acceptedTypes,
  compact = false,
}: FileAttachmentAreaProps) {
  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={acceptedTypes}
        onChange={onFileInputChange}
        className="hidden"
      />

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className={`flex flex-wrap gap-2 ${compact ? 'mb-2' : 'mb-3'}`}>
          {attachments.map((attachment, index) => (
            <div
              key={index}
              className="group relative flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-600 dark:bg-gray-700"
            >
              {attachment.preview ? (
                <img
                  src={attachment.preview}
                  alt={attachment.name}
                  className="h-8 w-8 rounded object-cover"
                />
              ) : attachment.type === 'application/pdf' ? (
                <FileText className="h-8 w-8 text-red-500" />
              ) : (
                <ImageIcon className="h-8 w-8 text-blue-500" />
              )}
              <div className="flex flex-col">
                <span className="max-w-[120px] truncate text-xs font-medium text-gray-700 dark:text-gray-200">
                  {attachment.name}
                </span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  {formatFileSize(attachment.size)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 p-0.5 text-white shadow-md hover:bg-red-600"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone wrapper */}
      <div
        ref={dropZoneRef}
        {...dragProps}
        className={`relative rounded-lg transition-all ${
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
      </div>
    </>
  );
}

interface AttachButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function AttachButton({ onClick, disabled }: AttachButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="p-1 text-gray-400 transition-colors hover:text-gray-600 disabled:opacity-50 dark:text-gray-500 dark:hover:text-gray-300"
      title="Attach files (images, PDFs)"
    >
      <Paperclip className="h-4 w-4" />
    </button>
  );
}

interface AttachmentDisplayProps {
  attachments: FileAttachment[];
  compact?: boolean;
}

export function AttachmentDisplay({ attachments, compact = false }: AttachmentDisplayProps) {
  if (attachments.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? 'mt-1' : 'mt-2'}`}>
      {attachments.map((attachment, index) => (
        <div
          key={index}
          className="flex items-center gap-1.5 rounded border border-gray-200 bg-gray-50 px-1.5 py-1 dark:border-gray-600 dark:bg-gray-700"
        >
          {attachment.preview || attachment.dataUrl ? (
            <img
              src={attachment.preview || attachment.dataUrl}
              alt={attachment.name}
              className="h-6 w-6 rounded object-cover"
            />
          ) : attachment.type === 'application/pdf' ? (
            <FileText className="h-4 w-4 text-red-500" />
          ) : (
            <ImageIcon className="h-4 w-4 text-blue-500" />
          )}
          <span className="max-w-[100px] truncate text-xs text-gray-600 dark:text-gray-300">
            {attachment.name}
          </span>
        </div>
      ))}
    </div>
  );
}
