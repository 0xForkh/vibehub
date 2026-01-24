import { useState } from 'react';
import { Image, Pencil, ChevronDown, ChevronRight, Download, ExternalLink } from 'lucide-react';
import { ToolCard } from './ToolCard';

interface ImageGenerateInput {
  prompt: string;
  filename?: string;
  size?: string;
  quality?: string;
  background?: string;
  output_format?: string;
}

interface ImageEditInput {
  prompt: string;
  source_image: string;
  filename?: string;
  size?: string;
  quality?: string;
  output_format?: string;
}

interface ImageToolResult {
  success: boolean;
  path?: string;
  relativePath?: string;
  filename?: string;
  format?: string;
  size?: number;
  sourceImage?: string;
  error?: string;
}

interface ImageToolUseProps {
  toolName: 'generate_image' | 'edit_image';
  input: ImageGenerateInput | ImageEditInput;
  output?: ImageToolResult;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImageToolUse({ toolName, input, output }: ImageToolUseProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const isEdit = toolName === 'edit_image';
  const editInput = input as ImageEditInput;

  // Build API URL for image preview
  const imageUrl = output?.success && output.path
    ? `/api/files/raw?path=${encodeURIComponent(output.path)}`
    : null;

  const handleDownload = () => {
    if (imageUrl && output?.filename) {
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = output.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleOpenInNewTab = () => {
    if (imageUrl) {
      window.open(imageUrl, '_blank');
    }
  };

  return (
    <ToolCard
      icon={isEdit ? Pencil : Image}
      color="purple"
      title={
        <span className="flex items-center gap-2">
          {isEdit ? 'Edit Image' : 'Generate Image'}
          {output?.filename && (
            <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs dark:bg-purple-900">
              {output.filename}
            </span>
          )}
        </span>
      }
      badge={output?.size ? formatFileSize(output.size) : undefined}
    >
      {/* Prompt (collapsible) */}
      <div className="mt-2">
        <button
          onClick={() => setShowPrompt(!showPrompt)}
          className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
        >
          {showPrompt ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Prompt
        </button>
        {showPrompt && (
          <div className="mt-1 rounded bg-purple-100/50 p-2 text-xs text-purple-800 dark:bg-purple-900/50 dark:text-purple-200">
            {input.prompt}
          </div>
        )}
      </div>

      {/* Source image for edit */}
      {isEdit && editInput.source_image && (
        <div className="mt-2 text-xs text-purple-600 dark:text-purple-400">
          Source: <span className="font-mono">{editInput.source_image}</span>
        </div>
      )}

      {/* Image result */}
      {output && (
        <div className="mt-3">
          {output.success && imageUrl ? (
            <div className="space-y-2">
              {/* Image preview */}
              <div className="relative overflow-hidden rounded-md border border-purple-200 bg-white dark:border-purple-700 dark:bg-gray-900">
                <img
                  src={imageUrl}
                  alt={input.prompt}
                  className="max-h-96 w-full object-contain"
                  loading="lazy"
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1 rounded bg-purple-100 px-2 py-1 text-xs text-purple-700 hover:bg-purple-200 dark:bg-purple-900 dark:text-purple-300 dark:hover:bg-purple-800"
                >
                  <Download className="h-3 w-3" />
                  Download
                </button>
                <button
                  onClick={handleOpenInNewTab}
                  className="flex items-center gap-1 rounded bg-purple-100 px-2 py-1 text-xs text-purple-700 hover:bg-purple-200 dark:bg-purple-900 dark:text-purple-300 dark:hover:bg-purple-800"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open
                </button>
              </div>

              {/* File path */}
              <div className="text-xs text-purple-600 dark:text-purple-400">
                Saved to: <span className="font-mono">{output.relativePath || output.path}</span>
              </div>
            </div>
          ) : output.error ? (
            <div className="rounded bg-red-100 p-2 text-xs text-red-700 dark:bg-red-900/50 dark:text-red-300">
              Error: {output.error}
            </div>
          ) : (
            <div className="text-xs text-purple-500 dark:text-purple-400">
              Generating image...
            </div>
          )}
        </div>
      )}
    </ToolCard>
  );
}
