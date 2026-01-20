import { Square, Paperclip, X, FileText, Image as ImageIcon, File, Loader2, MessageCircle } from 'lucide-react';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import type { FileAttachment } from '../../types/claude';
import { DictationButton } from './DictationButton';
import { useMention, parseMentions, type MentionItem } from '../../hooks/useMention';

interface SessionInfo {
  id: string;
  name: string;
  type: string;
}

interface ClaudeInputBarProps {
  onSendMessage: (message: string, attachments?: FileAttachment[]) => void;
  onAbort?: () => void;
  disabled?: boolean;
  placeholder?: string;
  showAbort?: boolean;
  slashCommands?: string[];
  socket?: Socket | null;
  workingDir?: string;
  sessions?: SessionInfo[];
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

export function ClaudeInputBar({
  onSendMessage,
  onAbort,
  disabled = false,
  placeholder = 'Ask Claude Code...',
  showAbort = false,
  slashCommands = [],
  socket = null,
  workingDir,
  sessions = [],
}: ClaudeInputBarProps) {
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const mentionMenuRef = useRef<HTMLDivElement>(null);

  // Mention hook (files + sessions)
  const mention = useMention({
    workingDir,
    sessions,
    enabled: !disabled,
  });

  // Filter slash commands based on current input
  const filteredSlashCommands = slashCommands.filter((cmd) =>
    cmd.toLowerCase().includes(slashFilter.toLowerCase())
  );

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        slashMenuRef.current &&
        !slashMenuRef.current.contains(target) &&
        textareaRef.current &&
        !textareaRef.current.contains(target)
      ) {
        setShowSlashMenu(false);
      }
      if (
        mentionMenuRef.current &&
        !mentionMenuRef.current.contains(target) &&
        textareaRef.current &&
        !textareaRef.current.contains(target)
      ) {
        mention.closeMenu();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mention]);

  // Reset selected index when filter changes
  useEffect(() => {
    setSelectedSlashIndex(0);
  }, [slashFilter]);

  // Convert file to FileAttachment
  const processFile = useCallback(async (file: File): Promise<FileAttachment | null> => {
    if (file.size > MAX_FILE_SIZE) {
      console.warn(`File ${file.name} exceeds 10MB limit`);
      return null;
    }

    // Determine file type - clipboard images may have empty type
    let fileType = file.type;
    if (!fileType && file.name) {
      // Try to infer from extension
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'png') fileType = 'image/png';
      else if (ext === 'jpg' || ext === 'jpeg') fileType = 'image/jpeg';
      else if (ext === 'gif') fileType = 'image/gif';
      else if (ext === 'webp') fileType = 'image/webp';
      else if (ext === 'pdf') fileType = 'application/pdf';
    }
    // Clipboard paste often creates files with 'image/png' but no name
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

        // For images, use data URL for preview (works everywhere)
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

  // Handle files from any source
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const processed = await Promise.all(fileArray.map(processFile));
    const valid = processed.filter((f): f is FileAttachment => f !== null);

    if (valid.length > 0) {
      setAttachments((prev) => [...prev, ...valid]);
    }
  }, [processFile]);

  // File input change handler
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = ''; // Reset input
    }
  }, [handleFiles]);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're leaving the drop zone entirely
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

  // Clipboard paste handler
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

  // Remove attachment
  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Handle slash command selection
  const selectSlashCommand = useCallback((command: string) => {
    // Replace the slash and filter with the full command
    const slashPrefix = message.match(/^\/\S*$/);
    if (slashPrefix) {
      setMessage(`/${command} `);
    } else {
      setMessage(`/${command} `);
    }
    setShowSlashMenu(false);
    setSlashFilter('');
    textareaRef.current?.focus();
  }, [message]);

  // Handle message input change
  const handleMessageChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPosition = e.target.selectionStart || 0;
    setMessage(value);

    // Check if we should show slash menu
    // Show menu if message starts with / and is only a slash command (no spaces yet)
    const slashMatch = value.match(/^\/(\S*)$/);
    if (slashMatch && slashCommands.length > 0) {
      setSlashFilter(slashMatch[1]);
      setShowSlashMenu(true);
      mention.closeMenu();
    } else {
      setShowSlashMenu(false);
      setSlashFilter('');
      // Handle mention (files + sessions)
      mention.handleInputChange(value, cursorPosition);
    }
  }, [slashCommands, mention]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((message.trim() || attachments.length > 0) && !disabled) {
      // Parse mentions to convert @[name](type:value) to appropriate format
      const processedMessage = parseMentions(message.trim());
      onSendMessage(processedMessage, attachments.length > 0 ? attachments : undefined);
      setMessage('');
      setAttachments([]);
      mention.resetState();
    }
  };

  // Handle mention selection (files or sessions)
  const selectMention = useCallback((item: MentionItem) => {
    const { newValue, newCursorPosition } = mention.selectSuggestion(item);
    setMessage(newValue);
    // Set cursor position after React updates
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = newCursorPosition;
        textareaRef.current.selectionEnd = newCursorPosition;
        textareaRef.current.focus();
      }
    }, 0);
  }, [mention]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle ESC to abort or close menus
    if (e.key === 'Escape') {
      if (showSlashMenu) {
        e.preventDefault();
        setShowSlashMenu(false);
        return;
      }
      if (mention.showMenu) {
        e.preventDefault();
        mention.closeMenu();
        return;
      }
      if (showAbort && onAbort) {
        e.preventDefault();
        onAbort();
        return;
      }
    }

    // Handle slash menu navigation
    if (showSlashMenu && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSlashIndex((prev) =>
          prev < filteredSlashCommands.length - 1 ? prev + 1 : prev
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSlashIndex((prev) => (prev > 0 ? prev - 1 : 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectSlashCommand(filteredSlashCommands[selectedSlashIndex]);
        return;
      }
    }

    // Handle mention menu navigation (files + sessions)
    if (mention.showMenu && mention.suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        mention.navigateDown();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        mention.navigateUp();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectMention(mention.suggestions[mention.selectedIndex]);
        return;
      }
    }

    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
    >
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachments.map((attachment, index) => (
            <div
              key={index}
              className="group relative flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
            >
              {attachment.preview && (
                <img
                  src={attachment.preview}
                  alt={attachment.name}
                  className="h-10 w-10 rounded object-cover"
                />
              )}
              {!attachment.preview && attachment.type === 'application/pdf' && (
                <FileText className="h-10 w-10 text-red-500" />
              )}
              {!attachment.preview && attachment.type !== 'application/pdf' && (
                <ImageIcon className="h-10 w-10 text-blue-500" />
              )}
              <div className="flex flex-col">
                <span className="max-w-[150px] truncate text-sm font-medium text-gray-700 dark:text-gray-200">
                  {attachment.name}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatFileSize(attachment.size)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeAttachment(index)}
                className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white shadow-md hover:bg-red-600"
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
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`relative rounded-lg transition-all ${
          isDragging
            ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-800'
            : ''
        }`}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
            <div className="text-center">
              <Paperclip className="mx-auto h-8 w-8 text-blue-500" />
              <p className="mt-2 text-sm font-medium text-blue-600 dark:text-blue-400">
                Drop files here
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {/* File input (hidden) */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_TYPES.join(',')}
            onChange={handleFileInputChange}
            className="hidden"
          />

          {/* Dictation button */}
          <DictationButton
            socket={socket}
            disabled={disabled}
            streaming={true}
            onResult={(text) => setMessage((prev) => prev + (prev ? ' ' : '') + text)}
            onSend={() => {
              // Trigger send after dictation completes
              const currentMessage = textareaRef.current?.value?.trim();
              if (currentMessage || attachments.length > 0) {
                onSendMessage(currentMessage || '', attachments.length > 0 ? attachments : undefined);
                setMessage('');
                setAttachments([]);
              }
            }}
          />

          <div className="relative min-w-0 flex-1">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleMessageChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              disabled={disabled}
              placeholder={placeholder}
              rows={1}
              className="w-full resize-none rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-blue-400 dark:disabled:bg-gray-800"
              style={{ maxHeight: '200px' }}
            />

            {/* Attachment button - inside textarea */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 transition-colors hover:text-gray-600 disabled:opacity-50 dark:text-gray-500 dark:hover:text-gray-300"
              title="Attach files (images, PDFs)"
            >
              <Paperclip className="h-5 w-5" />
            </button>

            {/* Slash command dropdown menu */}
            {showSlashMenu && filteredSlashCommands.length > 0 && (
              <div
                ref={slashMenuRef}
                className="absolute bottom-full left-0 mb-2 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
              >
                {filteredSlashCommands.map((cmd, idx) => (
                  <button
                    key={cmd}
                    type="button"
                    onClick={() => selectSlashCommand(cmd)}
                    className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${
                      idx === selectedSlashIndex
                        ? 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="font-mono text-blue-600 dark:text-blue-400">/{cmd}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Mention dropdown menu (files + sessions) */}
            {mention.showMenu && (
              <div
                ref={mentionMenuRef}
                className="absolute bottom-full left-0 mb-2 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
              >
                {mention.loading && (
                  <div className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Searching...</span>
                  </div>
                )}
                {!mention.loading && mention.suggestions.length === 0 && mention.searchQuery.length >= 2 && (
                  <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                    No files or sessions found matching &quot;{mention.searchQuery}&quot;
                  </div>
                )}
                {!mention.loading && mention.searchQuery.length < 2 && mention.suggestions.length === 0 && (
                  <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                    Type to search files or sessions...
                  </div>
                )}
                {mention.suggestions.map((item, idx) => (
                  <button
                    key={`${item.type}-${item.value}`}
                    type="button"
                    onClick={() => selectMention(item)}
                    className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${
                      idx === mention.selectedIndex
                        ? 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    {item.type === 'session' ? (
                      <MessageCircle className="h-4 w-4 flex-shrink-0 text-purple-500" />
                    ) : (
                      <File className="h-4 w-4 flex-shrink-0 text-gray-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{item.name}</span>
                      {item.description && (
                        <span className="ml-2 truncate text-xs text-gray-500 dark:text-gray-400">
                          {item.description}
                        </span>
                      )}
                    </div>
                    {item.type === 'session' && (
                      <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                        session
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          {showAbort && onAbort ? (
            <button
              type="button"
              onClick={onAbort}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600 text-white transition-colors hover:bg-red-700"
              title="Stop generation (ESC)"
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={disabled || (!message.trim() && attachments.length === 0)}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:bg-gray-300 disabled:opacity-50 sm:w-auto sm:px-6 dark:disabled:bg-gray-600"
              title="Send message"
            >
              <span className="hidden sm:inline">Send</span>
              <svg className="h-5 w-5 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
