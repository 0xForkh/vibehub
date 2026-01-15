import { FileEdit } from 'lucide-react';
import { useState } from 'react';
import { ToolCard } from './ToolCard';

interface EditToolUseProps {
  input: {
    file_path?: string;
    old_string?: string;
    new_string?: string;
  };
}

export function EditToolUse({ input }: EditToolUseProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate line counts for both old and new strings
  const oldLines = input.old_string?.split('\n') || [];
  const newLines = input.new_string?.split('\n') || [];

  // Truncate content for preview
  const previewLines = 5;
  const oldTruncated = oldLines.slice(0, previewLines).join('\n');
  const newTruncated = newLines.slice(0, previewLines).join('\n');
  const hasMore = oldLines.length > previewLines || newLines.length > previewLines;

  return (
    <ToolCard
      icon={FileEdit}
      color="orange"
      title={<>Edit: {input.file_path || 'file'}</>}
      badge={<>{isExpanded ? '▼' : '▶'} {oldLines.length} → {newLines.length} lines</>}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="mt-2 space-y-2">
        <div className="rounded bg-red-100 p-2 dark:bg-red-950">
          <div className="mb-1 text-xs font-semibold text-red-700 dark:text-red-300">
            - Removed
          </div>
          <pre className="overflow-x-auto text-xs text-red-800 dark:text-red-200">
            {isExpanded ? input.old_string : oldTruncated}
            {!isExpanded && hasMore && oldLines.length > previewLines && (
              <div className="mt-1 text-red-600 dark:text-red-400">
                ... ({oldLines.length - previewLines} more lines)
              </div>
            )}
          </pre>
        </div>
        <div className="rounded bg-green-100 p-2 dark:bg-green-950">
          <div className="mb-1 text-xs font-semibold text-green-700 dark:text-green-300">
            + Added
          </div>
          <pre className="overflow-x-auto text-xs text-green-800 dark:text-green-200">
            {isExpanded ? input.new_string : newTruncated}
            {!isExpanded && hasMore && newLines.length > previewLines && (
              <div className="mt-1 text-green-600 dark:text-green-400">
                ... ({newLines.length - previewLines} more lines)
              </div>
            )}
          </pre>
        </div>
      </div>
    </ToolCard>
  );
}
