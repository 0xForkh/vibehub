import { useState, useCallback, useRef } from 'react';

export interface FileAttachment {
  name: string;
  type: string;
  size: number;
  data: string;
  preview?: string;
  dataUrl?: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
];

export function useFileAttachments(initialAttachments: FileAttachment[] = []) {
  const [attachments, setAttachments] = useState<FileAttachment[]>(initialAttachments);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const processFile = useCallback(async (file: File): Promise<FileAttachment | null> => {
    if (file.size > MAX_FILE_SIZE) {
      console.warn(`File ${file.name} exceeds 10MB limit`);
      return null;
    }

    let fileType = file.type;
    if (!fileType && file.name) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'png') fileType = 'image/png';
      else if (ext === 'jpg' || ext === 'jpeg') fileType = 'image/jpeg';
      else if (ext === 'gif') fileType = 'image/gif';
      else if (ext === 'webp') fileType = 'image/webp';
      else if (ext === 'pdf') fileType = 'application/pdf';
    }
    if (!file.name || file.name === 'image.png') {
      fileType = fileType || 'image/png';
    }

    if (!ACCEPTED_TYPES.includes(fileType) && !fileType.startsWith('image/')) {
      console.warn(`File type ${fileType} not supported`);
      return null;
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1];

        const attachment: FileAttachment = {
          name: file.name || `pasted-image-${Date.now()}.png`,
          type: fileType,
          size: file.size,
          data: base64,
        };

        if (fileType.startsWith('image/')) {
          attachment.preview = dataUrl;
          attachment.dataUrl = dataUrl;
        }

        resolve(attachment);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const processed = await Promise.all(fileArray.map(processFile));
    const valid = processed.filter((f): f is FileAttachment => f !== null);

    if (valid.length > 0) {
      setAttachments((prev) => [...prev, ...valid]);
    }
  }, [processFile]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = '';
    }
  }, [handleFiles]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const { items } = e.clipboardData;
    const files: File[] = [];

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      handleFiles(files);
    }
  }, [handleFiles]);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const dragProps = {
    onDragEnter: handleDragEnter,
    onDragLeave: handleDragLeave,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
  };

  return {
    attachments,
    setAttachments,
    isDragging,
    fileInputRef,
    dropZoneRef,
    handleFileInputChange,
    handlePaste,
    removeAttachment,
    clearAttachments,
    openFilePicker,
    dragProps,
    acceptedTypes: ACCEPTED_TYPES.join(','),
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
