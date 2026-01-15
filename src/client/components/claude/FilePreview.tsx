import { Copy, Check, Loader2, FileWarning } from 'lucide-react';
import { useState, useEffect } from 'react';
import { copyToClipboard } from '../../utils/clipboard';
import type { Socket } from 'socket.io-client';

interface FilePreviewProps {
  sessionId: string;
  socket: Socket | null;
  path: string | null;
  isImage?: boolean;
}

interface FileContent {
  content: string;
  size: number;
  binary: boolean;
  language: string;
}

export function FilePreview({ sessionId, socket, path, isImage }: FilePreviewProps) {
  const [content, setContent] = useState<FileContent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Skip fetching content for images - we'll show them directly
    if (!socket || !path || isImage) {
      setContent(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const handleResult = (data: {
      path: string;
      content?: string;
      size?: number;
      binary?: boolean;
      language?: string;
      error?: string;
    }) => {
      if (data.path === path) {
        socket.off('claude:fs_read_result', handleResult);
        setIsLoading(false);

        if (data.error) {
          setError(data.error);
          setContent(null);
        } else {
          setContent({
            content: data.content || '',
            size: data.size || 0,
            binary: data.binary || false,
            language: data.language || 'plaintext',
          });
        }
      }
    };

    socket.on('claude:fs_read_result', handleResult);
    socket.emit('claude:fs_read', { sessionId, path });

    return () => {
      socket.off('claude:fs_read_result', handleResult);
    };
  }, [socket, sessionId, path, isImage]);

  const handleCopy = async () => {
    if (!content?.content) return;

    const success = await copyToClipboard(content.content);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!path) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        <div className="text-center">
          <FileWarning className="mx-auto mb-2 h-8 w-8 text-gray-400" />
          <p className="text-sm">Select a file to preview</p>
        </div>
      </div>
    );
  }

  // Image preview
  if (isImage) {
    const imageUrl = `/api/sessions/files/${sessionId}/${encodeURIComponent(path)}`;
    return (
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800">
          <span className="truncate text-xs text-gray-600 dark:text-gray-400">{path}</span>
        </div>

        {/* Image */}
        <div className="flex flex-1 items-center justify-center overflow-auto bg-gray-100 p-4 dark:bg-gray-800">
          <img
            src={imageUrl}
            alt={path}
            className="max-h-full max-w-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              setError('Failed to load image');
            }}
          />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-red-500">
        <div className="text-center">
          <FileWarning className="mx-auto mb-2 h-8 w-8" />
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!content) {
    return null;
  }

  if (content.binary) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        <div className="text-center">
          <FileWarning className="mx-auto mb-2 h-8 w-8 text-gray-400" />
          <p className="text-sm">Binary file ({formatSize(content.size)})</p>
          <p className="text-xs text-gray-400">Cannot preview binary files</p>
        </div>
      </div>
    );
  }

  // Split content into lines for line numbers
  const lines = content.content.split('\n');

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800">
        <span className="truncate text-xs text-gray-600 dark:text-gray-400">{path}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{formatSize(content.size)}</span>
          <button
            onClick={handleCopy}
            className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700"
            title={copied ? 'Copied!' : 'Copy content'}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-gray-500" />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-gray-900 font-mono text-xs">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="hover:bg-gray-800">
                <td className="select-none border-r border-gray-700 px-2 py-0 text-right text-gray-500">
                  {idx + 1}
                </td>
                <td className="whitespace-pre px-2 py-0 text-gray-100">
                  {line || ' '}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
